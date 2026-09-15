import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createProjectSchema, queryProjectSchema } from '@/lib/validations/project';
import { validationError, badRequest, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

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

  const { page, pageSize, search, statusId, categoryId, managerId, clientId } = parseResult.data;
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
      query = query.or(`project_title.ilike.${q},install_project_no.ilike.${q},description.ilike.${q}`);
    }
    if (statusId) query = query.eq('status_id', statusId);
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
    const mappedProjects = (rows || []).map((row: any) => ({
      id: row.id,
      title: row.project_title || row.title,
      clientId: row.client_id || row.clientId,
      installProjectNo: row.install_project_no || row.installProjectNo || '',
      description: row.description || '',
      statusId: row.status_id || row.statusId || 'ps-1',
      categoryId: row.category_id || row.categoryId || 'pc-1',
      priorityId: row.priority_id || row.priorityId || 'pp-1',
      riskId: row.risk_id || row.riskId || 'pr-1',
      projectManagerId: row.project_manager_id || row.projectManagerId || '',
      startDate: row.start_date || '',
      deliveryDate: row.delivery_date || '',
      scheduledDate: row.scheduled_date || '',
      completedDate: row.completed_date || '',
      isUrgent: Boolean(row.is_urgent),
      color: row.color || '',
      notes: row.notes || '',
      version: row.version || 1,
      deleted: Boolean(row.deleted),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    }));

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

    const insertPayload = {
      id: newId,
      project_title: p.title,
      client_id: p.clientId,
      description: p.description || '',
      install_project_no: p.installProjectNo || '',
      status_id: p.statusId || 'ps-1',
      category_id: p.categoryId || (p.categoryIds && p.categoryIds[0]) || 'pc-1',
      priority_id: p.priorityId || 'pp-1',
      risk_id: p.riskId || 'pr-1',
      project_manager_id: p.projectManagerId || null,
      start_date: p.startDate || null,
      delivery_date: p.deliveryDate || null,
      scheduled_date: p.scheduledDate || null,
      completed_date: p.completedDate || null,
      is_urgent: Boolean(p.isUrgent),
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

    // Insert relational links if provided
    if (p.teamIds && p.teamIds.length > 0) {
      const teamLinks = p.teamIds.map((tid) => ({ project_id: newId, team_id: tid }));
      try {
        await sb.from('project_teams_link').insert(teamLinks);
      } catch {}
    }
    if (p.partnerIds && p.partnerIds.length > 0) {
      const partnerLinks = p.partnerIds.map((pid) => ({ project_id: newId, partner_id: pid }));
      try {
        await sb.from('project_partners_link').insert(partnerLinks);
      } catch {}
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
