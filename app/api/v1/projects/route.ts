import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createProjectSchema, queryProjectSchema } from '@/lib/validations/project';
import { validationError, badRequest, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';
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
  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  const parseResult = queryProjectSchema.safeParse(rawParams);
  if (!parseResult.success) {
    return validationError('Parâmetros de consulta inválidos.', requestId, parseResult.error.flatten());
  }

  const { page, pageSize, search, statusId, categoryId, managerId, clientId, statusGroup } = parseResult.data;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const sb = (await createClient()) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    let query = sb
      .from('projects')
      .select('*', { count: 'exact' })
      .eq('deleted', false);

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(`project_title.ilike.${q},install_project_no.ilike.${q},project_description.ilike.${q}`);
    }
    if (statusId) {
      query = query.eq('status_id', statusId);
    } else if (statusGroup && statusGroup !== 'all') {
      const { data: statusRows } = await sb.from('project_status').select('id, scale');
      if (statusRows && statusRows.length > 0) {
        let targetIds: string[] = [];
        if (statusGroup === 'active') {
          targetIds = statusRows.filter((s: any) => s.scale >= 1 && s.scale <= 4).map((s: any) => s.id);
        } else if (statusGroup === 'implementation') {
          targetIds = statusRows.filter((s: any) => s.scale === 4).map((s: any) => s.id);
        } else if (statusGroup === 'completed') {
          targetIds = statusRows.filter((s: any) => s.scale >= 5).map((s: any) => s.id);
        }
        if (targetIds.length > 0) {
          query = query.in('status_id', targetIds);
        }
      }
    }
    if (categoryId) query = query.eq('category_id', categoryId);
    if (managerId) query = query.eq('project_manager_id', managerId);
    if (clientId) query = query.eq('client_id', clientId);

    const { data: rows, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[API PROJECTS GET ERROR]', error);
      return internalServerError(`Erro ao consultar projetos: ${error.message}`, requestId);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);

    // Map database snake_case to domain model
    const mappedProjects = (rows || []).map((row: any) => {
      const pCategoryIds = parseCommaSeparated(row.category_ids);
      const categoryIds = pCategoryIds.length > 0 ? pCategoryIds : (row.category_id ? [row.category_id] : []);
      const teamsInvolvedIds = parseCommaSeparated(row.teams_involved_ids);
      const partnersIds = parseCommaSeparated(row.partners_ids);

      return {
        id: row.id,
        title: row.project_title || row.title,
        clientId: row.client_id || row.clientId || '',
        installProjectNo: row.install_project_no || row.installProjectNo || '',
        sfOpportunityNo: row.sf_opportunity_no || row.sfOpportunityNo || '',
        description: row.project_description || row.description || '',
        statusId: row.status_id || row.statusId || 'ps-1',
        categoryId: row.category_id || row.categoryId || 'pc-1',
        categoryIds,
        priorityId: row.priority_id || row.priorityId || 'pp-1',
        riskId: row.risk_id || row.riskId || 'pr-1',
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
        documents: row.documents || [],
        clientContactName: row.client_contact_name || row.clientContactName || '',
        clientContactEmail: row.client_contact_email || row.clientContactEmail || '',
        clientContactPhone: row.client_contact_phone || row.clientContactPhone || '',
        color: row.color || '',
        notes: row.notes || '',
        version: row.version || 1,
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
    const sb = (await createClient()) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const effectiveTeams = Array.from(new Set([...(p.teamsInvolvedIds || []), ...(p.teamIds || [])]));
    const effectivePartners = Array.from(new Set([...(p.partnersIds || []), ...(p.partnerIds || [])]));
    const effectiveCategories = Array.from(new Set([...(p.categoryIds || []), ...(p.categoryId ? [p.categoryId] : [])]));

    const insertPayload: Record<string, any> = {
      id: newId,
      project_title: p.title,
      client_id: p.clientId || null,
      project_description: p.description || '',
      install_project_no: p.installProjectNo || '',
      sf_opportunity_no: p.sfOpportunityNo || '',
      status_id: p.statusId || 'ps-1',
      category_id: p.categoryId || (effectiveCategories[0]) || 'pc-1',
      category_ids: effectiveCategories.length > 0 ? effectiveCategories.join(',') : null,
      priority_id: p.priorityId || 'pp-1',
      risk_id: p.riskId || 'pr-1',
      project_manager_id: p.projectManagerId || null,
      field_manager_id: p.fieldManagerId || null,
      sales_rep_id: p.salesRepId || null,
      teams_involved_ids: effectiveTeams.length > 0 ? effectiveTeams.join(',') : null,
      partners_ids: effectivePartners.length > 0 ? effectivePartners.join(',') : null,
      start_date: p.startDate || null,
      delivery_date: p.deliveryDate || null,
      estimated_date: p.estimatedDate || null,
      scheduled_date: p.scheduledDate || null,
      completed_date: p.completedDate || null,
      budget_value: Number(p.budgetValue || 0),
      is_urgent: Boolean(p.isUrgent),
      demo: Boolean(p.demo),
      documents: p.documents || [],
      client_contact_name: p.clientContactName || '',
      client_contact_email: p.clientContactEmail || '',
      client_contact_phone: p.clientContactPhone || '',
      color: p.color || null,
      notes: p.notes || null,
      deleted: false,
      version: 1,
      created_by: user.id,
      updated_by: user.id,
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await sb.from('projects').insert([insertPayload]);
    if (insertError) {
      console.error('[API PROJECT INSERT ERROR]', insertError);
      return badRequest(`Erro ao inserir projeto na base de dados: ${insertError.message}`, requestId);
    }

    // Insert relational links if provided, and check for errors
    if (effectiveTeams.length > 0) {
      const teamLinks = effectiveTeams.map((tid) => ({ project_id: newId, team_id: tid }));
      const { error: teamLinkError } = await sb.from('project_teams_link').insert(teamLinks);
      if (teamLinkError) {
        console.error('[API PROJECT INSERT TEAMS ERROR]', teamLinkError);
        return badRequest(`Erro ao associar equipas ao projeto: ${teamLinkError.message}`, requestId);
      }
    }
    if (effectivePartners.length > 0) {
      const partnerLinks = effectivePartners.map((pid) => ({ project_id: newId, partner_id: pid }));
      const { error: partnerLinkError } = await sb.from('project_partners_link').insert(partnerLinks);
      if (partnerLinkError) {
        console.error('[API PROJECT INSERT PARTNERS ERROR]', partnerLinkError);
        return badRequest(`Erro ao associar parceiros ao projeto: ${partnerLinkError.message}`, requestId);
      }
    }
    if (effectiveCategories.length > 0) {
      const categoryLinks = effectiveCategories.map((cid) => ({ project_id: newId, category_id: cid }));
      const { error: categoryLinkError } = await sb.from('project_category_link').insert(categoryLinks);
      if (categoryLinkError) {
        console.error('[API PROJECT INSERT CATEGORIES ERROR]', categoryLinkError);
        return badRequest(`Erro ao associar categorias ao projeto: ${categoryLinkError.message}`, requestId);
      }
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
