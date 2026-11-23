import { createApiHandler } from '@/lib/apiErrors';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createTaskSchema, queryTaskSchema } from '@/lib/validations/task';
import { validationError, badRequest, internalServerError, serviceUnavailable } from '@/lib/apiErrors';
import { auditRequestHeaders, createAdminClient, getServerDbClient } from '@/lib/supabase/server';
import { listTasksServer, createTaskServer } from '@/domains/tasks/modules/taskService';
import { getIdempotentEntityId, withUserIdempotency } from '@/lib/apiIdempotency';

async function handleGet(req: NextRequest) {
  const auth = await requirePermission(req, 'tasks_read');
  if (!auth.success) return auth.response;

  const { requestId } = auth;
  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  const parseResult = queryTaskSchema.safeParse(rawParams);
  if (!parseResult.success) {
    return validationError('Parâmetros de consulta inválidos.', requestId, parseResult.error.flatten());
  }

  try {
    const sb = await getServerDbClient(req, auth.user);
    if (!sb) return serviceUnavailable('Base de dados Supabase não disponível.', requestId);

    const result = await listTasksServer(sb, parseResult.data);
    if (!result.success) {
      return internalServerError(result.error || 'Erro ao consultar tarefas.', requestId);
    }

    return NextResponse.json({
      success: true,
      count: result.data?.length || 0,
      total: result.total || 0,
      page: result.page || 1,
      pageSize: result.pageSize || 20,
      totalPages: result.totalPages || 0,
      data: result.data || [],
    });
  } catch (error: any) {
    console.error('[API TASKS GET EXCEPTION]', error);
    return internalServerError('Falha inesperada ao obter tarefas.', requestId);
  }
}

async function createTaskHandler(req: NextRequest) {
  const auth = await requirePermission(req, 'tasks_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;

  try {
    let rawBody: unknown;
    try { rawBody = await req.json(); }
    catch { return badRequest('Corpo JSON inválido.', requestId); }
    const parseResult = createTaskSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para criação da tarefa.', requestId, parseResult.error.flatten());
    }

    const t = parseResult.data;
    const sb = await getServerDbClient(req, auth.user);
    if (!sb) return serviceUnavailable('Base de dados Supabase não disponível.', requestId);

    // 1. Validate associated project ONLY if provided
    if (t.projectId) {
      const { data: targetProject, error: projError } = await sb
        .from('projects')
        .select('id, deleted')
        .eq('id', t.projectId)
        .maybeSingle();

      if (projError) {
        console.error('[API TASK PROJECT VALIDATION]', projError);
        return internalServerError('Erro ao verificar projeto associado.', requestId);
      }

      if (!targetProject || targetProject.deleted) {
        return badRequest('O projeto especificado não existe ou foi eliminado.', requestId);
      }
    }

    let mutationClient = sb;
    if (t.copiedFromTaskId) {
      const readAccess = await requirePermission(req, 'tasks_read');
      if (!readAccess.success) return readAccess.response;
      const { data: original, error } = await sb.from('tasks').select('project_id')
        .eq('id', t.copiedFromTaskId).eq('deleted', false).maybeSingle();
      if (error) return internalServerError('Erro ao verificar a tarefa de origem.', requestId);
      if (!original || (original.project_id && original.project_id !== t.projectId)) {
        return badRequest('A tarefa de origem não está disponível para este projeto.', requestId);
      }
      const auditedClient = createAdminClient({ ...auditRequestHeaders(user), 'x-projetos-audit-task-source': t.copiedFromTaskId });
      if (!auditedClient) return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
      mutationClient = auditedClient;
    }

    // 2. Validate assigned user IDs if provided
    if (t.assignedUserIds && t.assignedUserIds.length > 0) {
      const { data: dbUsers, error: usersError } = await sb
        .from('users')
        .select('id, deleted')
        .in('id', t.assignedUserIds);

      if (usersError) {
        console.error('[API TASK ASSIGNEE VALIDATION]', usersError);
        return internalServerError('Erro ao verificar utilizadores responsáveis.', requestId);
      }

      const activeUserIds = new Set((dbUsers || []).filter((u: any) => !u.deleted).map((u: any) => u.id));
      const invalidUsers = t.assignedUserIds.filter((uid) => !activeUserIds.has(uid));

      if (invalidUsers.length > 0) {
        return badRequest(`Um ou mais utilizadores responsáveis especificados (${invalidUsers.join(', ')}) não existem ou estão inativos.`, requestId);
      }
    }

    // 3. Delegate atomic creation to taskService
    const createRes = await createTaskServer(mutationClient, {
      ...t,
      ...(getIdempotentEntityId(req) ? { id: getIdempotentEntityId(req)! } : {}),
      userId: user.id,
    });

    if (!createRes.success || !createRes.data) {
      if (createRes.statusCode === 400) {
        return badRequest(createRes.error || 'Erro ao criar tarefa.', requestId);
      }
      return internalServerError('Erro ao criar tarefa.', requestId);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Tarefa criada com sucesso.',
        data: createRes.data,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API TASK POST EXCEPTION]', error);
    return internalServerError('Erro inesperado na criação da tarefa.', requestId);
  }
}

export const POST = withUserIdempotency(createTaskHandler, 'tasks:create', 'tasks_write');

export const GET = createApiHandler(handleGet);
