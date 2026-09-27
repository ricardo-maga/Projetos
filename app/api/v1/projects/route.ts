export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createProjectSchema, queryProjectSchema } from '@/lib/validations/project';
import { validateProjectRelations } from '@/lib/validations/projectRelations';
import { validationError, badRequest, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { getProjectsServerData } from '@/lib/projects/projectService';

function parseCommaSeparated(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(',').filter(Boolean);
  return [];
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_read');
  if (!auth.success) return auth.response;

  const { requestId } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const queryResult = queryProjectSchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!queryResult.success) {
      return validationError('Parâmetros de consulta inválidos.', requestId, queryResult.error.flatten());
    }

    const { page, pageSize, search, statusId, categoryId, managerId, clientId, statusGroup } = queryResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;

    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const result = await getProjectsServerData(sb, {
      page,
      pageSize,
      search,
      statusId,
      categoryId,
      managerId,
      clientId,
      statusGroup,
      includeDeleted: false,
    });

    return NextResponse.json({
      success: true,
      count: result.data.length,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      data: result.data,
    });
  } catch (error: any) {
    console.error('[API PROJECTS GET EXCEPTION]', error);
    return internalServerError('Falha inesperada ao obter projetos.', requestId);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;

  try {
    const rawBody = await req.json();
    const parseResult = createProjectSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para criação do projeto.', requestId, parseResult.error.flatten());
    }

    const p = parseResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const effectiveTeams = Array.from(new Set([...(p.teamsInvolvedIds || []), ...(p.teamIds || [])]));
    const effectivePartners = Array.from(new Set([...(p.partnersIds || []), ...(p.partnerIds || [])]));
    const effectiveCategories = Array.from(new Set([...(p.categoryIds || []), ...(p.categoryId ? [p.categoryId] : [])]));

    // Strict validation of all foreign keys & relational IDs before database modification
    const validation = await validateProjectRelations(
      sb,
      {
        clientId: p.clientId,
        statusId: p.statusId,
        categoryId: p.categoryId,
        categoryIds: effectiveCategories,
        projectManagerId: p.projectManagerId,
        fieldManagerId: p.fieldManagerId,
        salesRepId: p.salesRepId,
        teamsInvolvedIds: effectiveTeams,
        partnersIds: effectivePartners,
        priorityId: p.priorityId,
        riskId: p.riskId,
      },
      true
    );

    if (!validation.valid) {
      return badRequest(validation.message || 'Dados relacionais de projeto inválidos.', requestId);
    }

    const finalStatusId = validation.resolvedStatusId || p.statusId || '';
    const finalCategoryId = validation.resolvedCategoryId || p.categoryId || (effectiveCategories[0] || '');
    const finalPriorityId = validation.resolvedPriorityId || p.priorityId || '';
    const finalRiskId = p.riskId || '';

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const docString = Array.isArray(p.documents) ? p.documents.join(',') : (p.documents || '');

    const coreInsertPayload: Record<string, any> = {
      id: newId,
      project_title: p.title,
      client_id: p.clientId?.trim() || null,
      project_description: p.description || '',
      install_project_no: p.installProjectNo || '',
      sf_opportunity_no: p.sfOpportunityNo || '',
      status_id: finalStatusId || null,
      category_id: finalCategoryId || null,
      project_manager_id: p.projectManagerId?.trim() || null,
      field_manager_id: p.fieldManagerId?.trim() || null,
      sales_rep_id: p.salesRepId?.trim() || null,
      start_date: p.startDate || null,
      delivery_date: p.deliveryDate || null,
      estimated_date: p.estimatedDate || null,
      scheduled_date: p.scheduledDate || null,
      budget_value: Number(p.budgetValue || 0),
      demo: Boolean(p.demo),
      documents: docString,
      client_contact_name: p.clientContactName || '',
      client_contact_email: p.clientContactEmail || '',
      client_contact_phone: p.clientContactPhone || '',
      deleted: false,
      version: 1,
      created_by: user.id,
      updated_by: user.id,
      created_at: now,
      updated_at: now,
    };

    const canonicalInsertPayload: Record<string, any> = {
      ...coreInsertPayload,
      completed_date: p.completedDate || null,
      is_urgent: Boolean(p.isUrgent),
      color: p.color || null,
      notes: p.notes || null,
    };

    const { error: insertError } = await sb.from('projects').insert([canonicalInsertPayload]);

    if (insertError) {
      console.error('[API PROJECT INSERT ERROR]', insertError);
      return badRequest(`Erro ao inserir projeto na base de dados: ${insertError.message}`, requestId);
    }

    // Insert relational links with error handling and cleanup if any relation insertion fails
    try {
      if (finalPriorityId) {
        const { error: prioErr } = await sb.from('project_priority_link').insert([{ project_id: newId, priority_id: finalPriorityId }]);
        if (prioErr) {
          console.error('[API PROJECT LINK PRIORITY ERROR]', prioErr);
          await sb.from('projects').delete().eq('id', newId);
          return internalServerError('Não foi possível criar todas as relações do projeto.', requestId);
        }
      }

      if (finalRiskId) {
        const { error: riskErr } = await sb.from('project_risk_link').insert([{ project_id: newId, risk_id: finalRiskId }]);
        if (riskErr) {
          console.error('[API PROJECT LINK RISK ERROR]', riskErr);
          await sb.from('projects').delete().eq('id', newId);
          return internalServerError('Não foi possível criar todas as relações do projeto.', requestId);
        }
      }

      if (effectiveTeams.length > 0) {
        const teamLinks = effectiveTeams.map((tid) => ({ project_id: newId, team_id: tid }));
        const { error: teamErr } = await sb.from('project_teams_link').insert(teamLinks);
        if (teamErr) {
          console.error('[API PROJECT LINK TEAMS ERROR]', teamErr);
          await sb.from('projects').delete().eq('id', newId);
          return internalServerError('Não foi possível criar todas as relações do projeto.', requestId);
        }
      }

      if (effectivePartners.length > 0) {
        const partnerLinks = effectivePartners.map((pid) => ({ project_id: newId, partner_id: pid }));
        const { error: partErr } = await sb.from('project_partners_link').insert(partnerLinks);
        if (partErr) {
          console.error('[API PROJECT LINK PARTNERS ERROR]', partErr);
          await sb.from('projects').delete().eq('id', newId);
          return internalServerError('Não foi possível criar todas as relações do projeto.', requestId);
        }
      }

      if (effectiveCategories.length > 0) {
        const categoryLinks = effectiveCategories.map((cid) => ({ project_id: newId, category_id: cid }));
        const { error: catErr } = await sb.from('project_category_link').insert(categoryLinks);
        if (catErr) {
          console.error('[API PROJECT LINK CATEGORIES ERROR]', catErr);
          await sb.from('projects').delete().eq('id', newId);
          return internalServerError('Não foi possível criar todas as relações do projeto.', requestId);
        }
      }
    } catch (linkErr) {
      console.error('[API PROJECT LINK INSERTION EXCEPTION]', linkErr);
      await sb.from('projects').delete().eq('id', newId);
      return internalServerError('Não foi possível criar todas as relações do projeto.', requestId);
    }

    await logAuditEvent({
      action: 'PROJECT_CREATED',
      userId: user.id,
      entity: 'projects',
      entityId: newId,
      details: { title: p.title, clientId: p.clientId },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Projeto criado com sucesso.',
        data: {
          id: newId,
          ...p,
          statusId: finalStatusId,
          categoryId: finalCategoryId,
          categoryIds: effectiveCategories,
          priorityId: finalPriorityId,
          riskId: finalRiskId,
          teamsInvolvedIds: effectiveTeams,
          partnersIds: effectivePartners,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API PROJECT POST EXCEPTION]', error);
    return internalServerError('Erro inesperado na criação do projeto.', requestId);
  }
}
