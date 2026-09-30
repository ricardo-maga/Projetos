export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updateTaskSchema } from '@/lib/validations/task';
import { notFound, conflict, validationError, internalServerError, badRequest } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { getTaskServer, updateTaskServer, deleteTaskServer } from '@/lib/tasks/taskService';

async function getIdFromParams(input: any): Promise<string> {
  if (!input) return '';
  const resolved = typeof input.then === 'function' ? await input : input;
  if (typeof resolved === 'string') return resolved;
  if (resolved?.params) {
    const paramsResolved = typeof resolved.params.then === 'function' ? await resolved.params : resolved.params;
    return paramsResolved?.id || '';
  }
  return resolved?.id || '';
}

export async function GET(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'tasks_read');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  const { requestId } = auth;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const result = await getTaskServer(sb, id);
    if (!result.success || !result.data) {
      if (result.statusCode === 404) return notFound(result.error || 'Tarefa não encontrada.', requestId);
      return internalServerError(result.error || 'Erro ao consultar tarefa.', requestId);
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    return internalServerError('Falha inesperada ao consultar tarefa.', requestId);
  }
}

export async function PATCH(req: NextRequest, ctx: any) {
  return handleUpdate(req, ctx);
}

export async function PUT(req: NextRequest, ctx: any) {
  return handleUpdate(req, ctx);
}

async function handleUpdate(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'tasks_write');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  const { user, requestId } = auth;

  try {
    const rawBody = await req.json();
    const parseResult = updateTaskSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para atualização da tarefa.', requestId, parseResult.error.flatten());
    }

    const updates = parseResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    // 1. Fetch current version and dates for validation
    const { data: current, error: fetchError } = await sb
      .from('tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) return internalServerError(`Erro ao ler versão atual da tarefa: ${fetchError.message}`, requestId);
    if (!current || current.deleted) return notFound('Tarefa não encontrada.', requestId);

    const hasVersion = typeof current.version === 'number';
    const currentVersion = hasVersion ? current.version : (updates.version || 1);
    if (hasVersion && updates.version !== undefined && updates.version !== currentVersion) {
      return conflict(
        `Conflito de concorrência. A tarefa foi alterada por outro utilizador (versão atual: ${currentVersion}, versão submetida: ${updates.version}).`,
        requestId,
        { currentVersion, submittedVersion: updates.version }
      );
    }

    const cleanDateVal = (val?: string | null) => (val && typeof val === 'string' && val.trim() ? val.trim() : null);

    // Strict execution dates validation on merged state
    const mergedStartDate = updates.startDate !== undefined ? cleanDateVal(updates.startDate) : current.start_date;
    const mergedEndDate = updates.endDate !== undefined ? cleanDateVal(updates.endDate) : current.end_date;
    if (mergedStartDate) {
      if (!mergedEndDate) {
        return badRequest('A data de fim é obrigatória se a data de início estiver preenchida.', requestId);
      }
      if (mergedEndDate < mergedStartDate) {
        return badRequest('A data de fim não pode ser anterior à data de início.', requestId);
      }
    }

    if (updates.projectId !== undefined && updates.projectId) {
      const { data: targetProject, error: projError } = await sb
        .from('projects')
        .select('id, deleted')
        .eq('id', updates.projectId)
        .maybeSingle();

      if (projError) {
        return internalServerError(`Erro ao verificar projeto associado: ${projError.message}`, requestId);
      }

      if (!targetProject || targetProject.deleted) {
        return badRequest('O projeto especificado não existe ou foi eliminado.', requestId);
      }
    }

    // Validate assignees if updated
    if (rawBody.assignedUserIds !== undefined && Array.isArray(updates.assignedUserIds) && updates.assignedUserIds.length > 0) {
      const { data: dbUsers, error: usersError } = await sb
        .from('users')
        .select('id, deleted')
        .in('id', updates.assignedUserIds);

      if (usersError) {
        return internalServerError(`Erro ao verificar utilizadores responsáveis: ${usersError.message}`, requestId);
      }

      const activeUserIds = new Set((dbUsers || []).filter((u: any) => !u.deleted).map((u: any) => u.id));
      const invalidUsers = updates.assignedUserIds.filter((uid) => !activeUserIds.has(uid));

      if (invalidUsers.length > 0) {
        return badRequest(`Um ou mais utilizadores responsáveis especificados (${invalidUsers.join(', ')}) não existem ou estão inativos.`, requestId);
      }
    }

    // Delegate atomic update to taskService
    const updateRes = await updateTaskServer(sb, id, {
      ...updates,
      userId: user.id,
    });

    if (!updateRes.success || !updateRes.data) {
      if (updateRes.statusCode === 409) {
        return conflict(
          updateRes.error || `Conflito de concorrência. A tarefa foi alterada por outro utilizador.`,
          requestId,
          { currentVersion, submittedVersion: updates.version }
        );
      }
      if (updateRes.statusCode === 404) return notFound(updateRes.error || 'Tarefa não encontrada.', requestId);
      if (updateRes.statusCode === 400) return badRequest(updateRes.error || 'Erro ao atualizar tarefa.', requestId);
      return internalServerError(updateRes.error || 'Erro ao atualizar tarefa.', requestId);
    }

    const isStatusChange = updates.statusId && updates.statusId !== current.status_id;
    await logAuditEvent({
      action: isStatusChange ? 'TASK_STATUS_CHANGED' : 'TASK_UPDATED',
      userId: user.id,
      entity: 'tasks',
      entityId: id,
      details: {
        version: updateRes.data.version,
        ...(isStatusChange ? { oldStatus: current.status_id, newStatus: updates.statusId } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Tarefa atualizada com sucesso.',
      data: updateRes.data,
    });
  } catch (error: any) {
    return internalServerError('Falha inesperada ao atualizar tarefa.', requestId);
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'tasks_delete');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  const { user, requestId } = auth;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const { data: current, error: fetchErr } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
    if (fetchErr) return internalServerError(`Erro ao ler tarefa: ${fetchErr.message}`, requestId);
    if (!current || current.deleted) return notFound('Tarefa não encontrada.', requestId);

    // Check for active planning allocations dependent on this task
    const { data: allocations, error: allocErr } = await sb
      .from('planning_allocations')
      .select('id, status')
      .eq('task_id', id);

    if (allocErr) {
      return internalServerError(`Erro ao verificar alocações associadas à tarefa: ${allocErr.message}`, requestId);
    }

    if (allocations && allocations.length > 0) {
      const activeAllocations = allocations.filter((a: any) => a.status !== 'CANCELLED');
      if (activeAllocations.length > 0) {
        return conflict(
          `Não é possível eliminar a tarefa "${current.task_title || current.title || id}" porque existem ${activeAllocations.length} alocação(ões) de planeamento ativa(s) associada(s). Cancele ou remova primeiro as alocações.`,
          requestId,
          { activeAllocationsCount: activeAllocations.length }
        );
      }
    }

    const currentVersion = typeof current.version === 'number' ? current.version : undefined;

    // Delegate atomic delete to taskService
    const deleteRes = await deleteTaskServer(sb, id, user.id, currentVersion);
    if (!deleteRes.success) {
      if (deleteRes.statusCode === 409) return conflict(deleteRes.error || 'Conflito de concorrência ao eliminar tarefa.', requestId);
      if (deleteRes.statusCode === 404) return notFound('Tarefa não encontrada.', requestId);
      return badRequest(deleteRes.error || 'Erro ao eliminar tarefa.', requestId);
    }

    await logAuditEvent({
      action: 'TASK_UPDATED',
      userId: user.id,
      entity: 'tasks',
      entityId: id,
      details: { deleted: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Tarefa eliminada com sucesso.',
    });
  } catch (error: any) {
    return internalServerError('Falha inesperada ao eliminar tarefa.', requestId);
  }
}
