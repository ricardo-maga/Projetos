export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createTaskSchema, queryTaskSchema } from '@/lib/validations/task';
import { validationError, badRequest, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { listTasksServer, createTaskServer } from '@/lib/tasks/taskService';

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

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

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
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    // 1. Validate associated project ONLY if provided
    if (t.projectId) {
      const { data: targetProject, error: projError } = await sb
        .from('projects')
        .select('id, deleted')
        .eq('id', t.projectId)
        .maybeSingle();

      if (projError) {
        return internalServerError(`Erro ao verificar projeto associado: ${projError.message}`, requestId);
      }

      if (!targetProject || targetProject.deleted) {
        return badRequest('O projeto especificado não existe ou foi eliminado.', requestId);
      }
    }

    // 2. Validate assigned user IDs if provided
    if (t.assignedUserIds && t.assignedUserIds.length > 0) {
      const { data: dbUsers, error: usersError } = await sb
        .from('users')
        .select('id, deleted')
        .in('id', t.assignedUserIds);

      if (usersError) {
        return internalServerError(`Erro ao verificar utilizadores responsáveis: ${usersError.message}`, requestId);
      }

      const activeUserIds = new Set((dbUsers || []).filter((u: any) => !u.deleted).map((u: any) => u.id));
      const invalidUsers = t.assignedUserIds.filter((uid) => !activeUserIds.has(uid));

      if (invalidUsers.length > 0) {
        return badRequest(`Um ou mais utilizadores responsáveis especificados (${invalidUsers.join(', ')}) não existem ou estão inativos.`, requestId);
      }
    }

    // 3. Delegate atomic creation to taskService
    const createRes = await createTaskServer(sb, {
      ...t,
      userId: user.id,
    });

    if (!createRes.success || !createRes.data) {
      if (createRes.statusCode === 400) {
        return badRequest(createRes.error || 'Erro ao criar tarefa.', requestId);
      }
      return internalServerError(createRes.error || 'Erro ao criar tarefa.', requestId);
    }

    await logAuditEvent({
      action: 'TASK_CREATED',
      userId: user.id,
      entity: 'tasks',
      entityId: createRes.data.id,
      details: { title: t.title, projectId: t.projectId },
    });

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
