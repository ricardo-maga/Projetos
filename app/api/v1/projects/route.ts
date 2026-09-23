import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createProjectSchema, queryProjectSchema } from '@/lib/validations/project';
import { validateProjectRelations } from '@/lib/validations/projectRelations';
import { validationError, badRequest, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

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

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = sb
      .from('projects')
      .select('*', { count: 'exact' })
      .eq('deleted', false);

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(`project_title.ilike.${q},project_description.ilike.${q},install_project_no.ilike.${q},sf_opportunity_no.ilike.${q}`);
    }

    if (statusId) {
      query = query.eq('status_id', statusId);
    }

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (managerId) {
      query = query.or(`project_manager_id.eq.${managerId},field_manager_id.eq.${managerId},sales_rep_id.eq.${managerId}`);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data: projectsData, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[API PROJECTS GET ERROR]', error);
      return internalServerError(`Erro ao consultar projetos: ${error.message}`, requestId);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);
    const projectIds = (projectsData || []).map((p: any) => p.id);

    // Fetch link relations in parallel
    const [teamsRes, partnersRes, categoriesRes, priorityRes, riskRes] = await Promise.all([
      projectIds.length > 0 ? sb.from('project_teams_link').select('project_id, team_id').in('project_id', projectIds) : { data: [] },
      projectIds.length > 0 ? sb.from('project_partners_link').select('project_id, partner_id').in('project_id', projectIds) : { data: [] },
      projectIds.length > 0 ? sb.from('project_category_link').select('project_id, category_id').in('project_id', projectIds) : { data: [] },
      projectIds.length > 0 ? sb.from('project_priority_link').select('project_id, priority_id').in('project_id', projectIds) : { data: [] },
      projectIds.length > 0 ? sb.from('project_risk_link').select('project_id, risk_id').in('project_id', projectIds) : { data: [] },
    ]);

    const teamsByProject = new Map<string, string[]>();
    (teamsRes.data || []).forEach((row: any) => {
      const current = teamsByProject.get(row.project_id) || [];
      current.push(row.team_id);
      teamsByProject.set(row.project_id, current);
    });

    const partnersByProject = new Map<string, string[]>();
    (partnersRes.data || []).forEach((row: any) => {
      const current = partnersByProject.get(row.project_id) || [];
      current.push(row.partner_id);
      partnersByProject.set(row.project_id, current);
    });

    const categoriesByProject = new Map<string, string[]>();
    (categoriesRes.data || []).forEach((row: any) => {
      const current = categoriesByProject.get(row.project_id) || [];
      current.push(row.category_id);
      categoriesByProject.set(row.project_id, current);
    });

    const priorityByProject = new Map<string, string>();
    (priorityRes.data || []).forEach((row: any) => {
      priorityByProject.set(row.project_id, row.priority_id);
    });

    const riskByProject = new Map<string, string>();
    (riskRes.data || []).forEach((row: any) => {
      riskByProject.set(row.project_id, row.risk_id);
    });

    const mappedProjects = (projectsData || []).map((row: any) => {
      const directCatIds = parseCommaSeparated(row.category_ids || (row.category_id ? [row.category_id] : []));
      const linkCatIds = categoriesByProject.get(row.id) || [];
      const categoryIds = Array.from(new Set([...linkCatIds, ...directCatIds]));

      const directTeamIds = parseCommaSeparated(row.teams_involved_ids || row.teams_ids);
      const linkTeamIds = teamsByProject.get(row.id) || [];
      const teamsInvolvedIds = Array.from(new Set([...linkTeamIds, ...directTeamIds]));

      const directPartnerIds = parseCommaSeparated(row.partners_ids);
      const linkPartnerIds = partnersByProject.get(row.id) || [];
      const partnersIds = Array.from(new Set([...linkPartnerIds, ...directPartnerIds]));

      return {
        id: row.id,
        title: row.project_title || row.title || '',
        clientId: row.client_id || row.clientId || '',
        installProjectNo: row.install_project_no || row.installProjectNo || '',
        sfOpportunityNo: row.sf_opportunity_no || row.sfOpportunityNo || '',
        description: row.project_description || row.description || '',
        statusId: row.status_id || row.statusId || '',
        categoryId: row.category_id || row.categoryId || categoryIds[0] || '',
        categoryIds,
        priorityId: priorityByProject.get(row.id) || row.priority_id || row.priorityId || '',
        riskId: riskByProject.get(row.id) || row.risk_id || row.riskId || '',
        projectManagerId: row.project_manager_id || row.projectManagerId || '',
        fieldManagerId: row.field_manager_id || row.fieldManagerId || '',
        salesRepId: row.sales_rep_id || row.salesRepId || '',
        teamsInvolvedIds,
        partnersIds,
        startDate: row.start_date || '',
        deliveryDate: row.delivery_date || '',
        estimatedDate: row.estimated_date || '',
        scheduledDate: row.scheduled_date || '',
        completedDate: row.completed_date || '',
        budgetValue: Number(row.budget_value ?? row.budgetValue ?? 0),
        isUrgent: Boolean(row.is_urgent),
        demo: Boolean(row.demo),
        documents: parseCommaSeparated(row.documents),
        clientContactName: row.client_contact_name || row.clientContactName || '',
        clientContactEmail: row.client_contact_email || row.clientContactEmail || '',
        clientContactPhone: row.client_contact_phone || row.clientContactPhone || '',
        color: row.color || '',
        notes: row.notes || '',
        version: typeof row.version === 'number' ? row.version : 1,
        deleted: Boolean(row.deleted),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
      };
    });

    return NextResponse.json({
      success: true,
      count: mappedProjects.length,
      total,
      page,
      pageSize,
      totalPages,
      data: mappedProjects,
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

    const extendedInsertPayload: Record<string, any> = {
      ...coreInsertPayload,
      category_ids: effectiveCategories.length > 0 ? effectiveCategories.join(',') : null,
      priority_id: finalPriorityId || null,
      risk_id: finalRiskId || null,
      teams_involved_ids: effectiveTeams.length > 0 ? effectiveTeams.join(',') : null,
      partners_ids: effectivePartners.length > 0 ? effectivePartners.join(',') : null,
      completed_date: p.completedDate || null,
      is_urgent: Boolean(p.isUrgent),
      color: p.color || null,
      notes: p.notes || null,
    };

    let { error: insertError } = await sb.from('projects').insert([extendedInsertPayload]);
    if (insertError && (insertError.code === '42703' || insertError.message?.includes('column') || insertError.message?.includes('schema cache'))) {
      console.warn('[API PROJECT INSERT] Retrying with core columns due to schema notice:', insertError.message);
      const retryRes = await sb.from('projects').insert([coreInsertPayload]);
      insertError = retryRes.error;

      if (insertError && (insertError.code === '42703' || insertError.message?.includes('column') || insertError.message?.includes('schema cache'))) {
        const minimalPayload = { ...coreInsertPayload };
        delete minimalPayload.version;
        delete minimalPayload.updated_by;
        delete minimalPayload.created_by;
        const fallbackRes = await sb.from('projects').insert([minimalPayload]);
        insertError = fallbackRes.error;
      }
    }

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
