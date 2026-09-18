import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createTaskSchema, queryTaskSchema } from '@/lib/validations/task';
import { validationError, badRequest, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'tasks_read');
  if (!auth.success) return auth.response;

  const { requestId } = auth;
  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  const parseResult = queryTaskSchema.safeParse(rawParams);
  if (!parseResult.success) {
    return validationError('Parâmetros de consulta inválidos.', requestId, parseResult.error.flatten());
  }

  const { page, pageSize, search, projectId, statusId, taskTypeId } = parseResult.data;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const sb = (await createClient()) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    let query = sb
      .from('tasks')
      .select('*', { count: 'exact' })
      .eq('deleted', false);

    if (projectId) query = query.eq('project_id', projectId);
    if (statusId) query = query.eq('status_id', statusId);
    if (taskTypeId) query = query.eq('task_type_id', taskTypeId);
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(`task_title.ilike.${q},task_description.ilike.${q},notes.ilike.${q}`);
    }

    const { data: rows, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[API TASKS GET ERROR]', error);
      return internalServerError(`Erro ao consultar tarefas: ${error.message}`, requestId);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);

    // Fetch assignees for the page's tasks
    const taskIds = (rows || []).map((t: any) => t.id);
    let assigneesMap: Record<string, string[]> = {};
    if (taskIds.length > 0) {
      const { data: assignees } = await sb.from('task_assignees').select('task_id, user_id').in('task_id', taskIds);
      (assignees || []).forEach((a: any) => {
        if (!assigneesMap[a.task_id]) assigneesMap[a.task_id] = [];
        assigneesMap[a.task_id].push(a.user_id);
      });
    }

    const mappedTasks = (rows || []).map((row: any) => ({
      id: row.id,
      projectId: row.project_id || row.projectId,
      title: row.task_title || row.title,
      description: row.task_description || row.description || '',
      statusId: row.status_id || row.statusId || 'ts-1',
      taskTypeId: row.task_type_id || row.taskTypeId || '',
      estimatedHours: row.estimated_hours || 0,
      actualHours: row.actual_hours || 0,
      startDate: row.start_date || '',
      startTime: row.start_time || '',
      endDate: row.end_date || '',
      endTime: row.end_time || '',
      estimatedDate: row.estimated_date || '',
      completedDate: row.completed_date || '',
      notes: row.notes || '',
      assignedUserIds: assigneesMap[row.id] || [],
      version: row.version || 1,
      deleted: Boolean(row.deleted),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    }));

    return NextResponse.json({
      success: true,
      count: mappedTasks.length,
      total,
      page,
      pageSize,
      totalPages,
      data: mappedTasks,
    });
  } catch (error: any) {
    console.error('[API TASKS GET EXCEPTION]', error);
    return internalServerError('Falha inesperada ao obter tarefas.', requestId);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'tasks_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;

  try {
    const rawBody = await req.json();
    const parseResult = createTaskSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para criação da tarefa.', requestId, parseResult.error.flatten());
    }

    const t = parseResult.data;
    const sb = (await createClient()) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertPayload = {
      id: newId,
      project_id: t.projectId,
      task_title: t.title,
      task_description: t.description || '',
      status_id: t.statusId || 'ts-1',
      task_type_id: t.taskTypeId || null,
      estimated_hours: `${t.estimatedHours || 0} hours`,
      actual_hours: `${t.actualHours || 0} hours`,
      start_date: t.startDate || null,
      start_time: t.startTime || null,
      end_date: t.endDate || null,
      end_time: t.endTime || null,
      estimated_date: t.estimatedDate || null,
      completed_date: t.completedDate || null,
      notes: t.notes || null,
      deleted: false,
      version: 1,
      created_by: user.id,
      updated_by: user.id,
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await sb.from('tasks').insert([insertPayload]);
    if (insertError) {
      console.error('[API TASK INSERT ERROR]', insertError);
      return badRequest(`Erro ao inserir tarefa: ${insertError.message}`, requestId);
    }

    if (t.assignedUserIds && t.assignedUserIds.length > 0) {
      const assigneeRows = t.assignedUserIds.map((uid) => ({ task_id: newId, user_id: uid }));
      const { error: assigneeError } = await sb.from('task_assignees').insert(assigneeRows);
      if (assigneeError) {
        console.error('[API TASK INSERT ASSIGNEES ERROR]', assigneeError);
        return badRequest(`Erro ao associar responsáveis à tarefa: ${assigneeError.message}`, requestId);
      }
    }

    await logAuditEvent({
      action: 'TASK_CREATED',
      userId: user.id,
      entity: 'tasks',
      entityId: newId,
      details: { title: t.title, projectId: t.projectId },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Tarefa criada com sucesso.',
        data: {
          id: newId,
          ...t,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API TASK POST EXCEPTION]', error);
    return internalServerError('Erro inesperado na criação da tarefa.', requestId);
  }
}
