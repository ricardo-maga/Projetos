import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createProjectSchema, queryProjectSchema } from '@/lib/validations/project';
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

async function resolveClientId(sb: any, clientId?: string | null, fallbackName?: string | null): Promise<string | null> {
  if (!clientId || typeof clientId !== 'string' || !clientId.trim()) return null;
  const cleaned = clientId.trim();
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned);

  if (isUUID) {
    const { data: clientExists } = await sb
      .from('clients')
      .select('id')
      .eq('id', cleaned)
      .maybeSingle();
    if (clientExists) return clientExists.id;
  }

  // Fallback: match by code or name
  const { data: matchByProp } = await sb
    .from('clients')
    .select('id')
    .or(`code.eq.${cleaned},name.ilike.${cleaned}`)
    .eq('deleted', false)
    .limit(1)
    .maybeSingle();

  if (matchByProp) return matchByProp.id;

  // If valid UUID and fallbackName was passed, auto-provision client record so FK succeeds
  if (isUUID && fallbackName && fallbackName.trim()) {
    const now = new Date().toISOString();
    const { data: inserted } = await sb
      .from('clients')
      .insert([{
        id: cleaned,
        name: fallbackName.trim(),
        deleted: false,
        created_at: now,
        updated_at: now
      }])
      .select('id')
      .maybeSingle();
    if (inserted) return inserted.id;
  }

  return null;
}

async function resolveUserId(sb: any, userId?: string | null): Promise<string | null> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) return null;
  const cleaned = userId.trim();
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned);
  if (isUUID) {
    const { data: userExists } = await sb
      .from('users')
      .select('id')
      .eq('id', cleaned)
      .maybeSingle();
    if (userExists) return userExists.id;
  }
  return null;
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
    const sb = (await getServerDbClient(req)) || defaultSupabase;
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
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const effectiveTeams = Array.from(new Set([...(p.teamsInvolvedIds || []), ...(p.teamIds || [])]));
    const effectivePartners = Array.from(new Set([...(p.partnersIds || []), ...(p.partnerIds || [])]));
    const effectiveCategories = Array.from(new Set([...(p.categoryIds || []), ...(p.categoryId ? [p.categoryId] : [])]));

    const docString = Array.isArray(p.documents) ? p.documents.join(',') : (p.documents || '');

    const [resolvedClientId, resolvedProjectManagerId, resolvedFieldManagerId, resolvedSalesRepId] = await Promise.all([
      resolveClientId(sb, p.clientId, p.clientContactName),
      resolveUserId(sb, p.projectManagerId),
      resolveUserId(sb, p.fieldManagerId),
      resolveUserId(sb, p.salesRepId),
    ]);

    const coreInsertPayload: Record<string, any> = {
      id: newId,
      project_title: p.title,
      client_id: resolvedClientId,
      project_description: p.description || '',
      install_project_no: p.installProjectNo || '',
      sf_opportunity_no: p.sfOpportunityNo || '',
      status_id: p.statusId || 'ps-1',
      category_id: p.categoryId || (effectiveCategories[0]) || 'pc-1',
      project_manager_id: resolvedProjectManagerId,
      field_manager_id: resolvedFieldManagerId,
      sales_rep_id: resolvedSalesRepId,
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
      priority_id: p.priorityId || 'pp-1',
      risk_id: p.riskId || 'pr-1',
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

    // Insert relational links
    if (p.priorityId) {
      await sb.from('project_priority_link').insert([{ project_id: newId, priority_id: p.priorityId }]);
    }
    if (p.riskId) {
      await sb.from('project_risk_link').insert([{ project_id: newId, risk_id: p.riskId }]);
    }

    if (effectiveTeams.length > 0) {
      const teamLinks = effectiveTeams.map((tid) => ({ project_id: newId, team_id: tid }));
      await sb.from('project_teams_link').insert(teamLinks);
    }
    if (effectivePartners.length > 0) {
      const partnerLinks = effectivePartners.map((pid) => ({ project_id: newId, partner_id: pid }));
      await sb.from('project_partners_link').insert(partnerLinks);
    }
    if (effectiveCategories.length > 0) {
      const categoryLinks = effectiveCategories.map((cid) => ({ project_id: newId, category_id: cid }));
      await sb.from('project_category_link').insert(categoryLinks);
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
