import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updateTaskSchema } from '@/lib/validations/task';
import { notFound, conflict, validationError, internalServerError, badRequest } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

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

    const { data: task, error } = await sb
      .from('tasks')
      .select('*')
      .eq('id', id)
      .eq('deleted', false)
      .maybeSingle();

    if (error) return internalServerError(`Erro ao consultar tarefa: ${error.message}`, requestId);
    if (!task) return notFound('Tarefa não encontrada.', requestId);

    const { data: assignees } = await sb.from('task_assignees').select('user_id').eq('task_id', id);

    return NextResponse.json({
      success: true,
      data: {
        id: task.id,
        projectId: task.project_id || task.projectId,
        title: task.task_title || task.title,
        description: task.task_description || task.description || '',
        statusId: task.status_id || task.statusId || 'ts-1',
        taskTypeId: task.task_type_id || task.taskTypeId || '',
        estimatedHours: task.estimated_hours || 0,
        actualHours: task.actual_hours || 0,
        startDate: task.start_date || '',
        startTime: task.start_time || '',
        endDate: task.end_date || '',
        endTime: task.end_time || '',
        estimatedDate: task.estimated_date || '',
        completedDate: task.completed_date || '',
        notes: task.notes || '',
        assignedUserIds: (assignees || []).map((a: any) => a.user_id),
        version: task.version || 1,
        deleted: Boolean(task.deleted),
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        createdBy: task.created_by,
        updatedBy: task.updated_by,
      },
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

    // 1. Fetch current version for optimistic concurrency check
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

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      updated_at: now,
      updated_by: user.id,
    };
    if (hasVersion) {
      updatePayload.version = currentVersion + 1;
    }

    const cleanDateVal = (val?: string | null) => (val && typeof val === 'string' && val.trim() ? val.trim() : null);

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
      updatePayload.project_id = updates.projectId;
    }

    if (updates.title !== undefined) updatePayload.task_title = updates.title;
    if (updates.description !== undefined) updatePayload.task_description = updates.description;
    if (updates.statusId !== undefined) updatePayload.status_id = updates.statusId;
    if (updates.taskTypeId !== undefined) updatePayload.task_type_id = updates.taskTypeId;
    if (updates.estimatedHours !== undefined) updatePayload.estimated_hours = `${updates.estimatedHours} hours`;
    if (updates.actualHours !== undefined) updatePayload.actual_hours = `${updates.actualHours} hours`;
    if (updates.startDate !== undefined) updatePayload.start_date = cleanDateVal(updates.startDate);
    if (updates.startTime !== undefined) updatePayload.start_time = cleanDateVal(updates.startTime);
    if (updates.endDate !== undefined) updatePayload.end_date = cleanDateVal(updates.endDate);
    if (updates.endTime !== undefined) updatePayload.end_time = cleanDateVal(updates.endTime);
    if (updates.estimatedDate !== undefined) updatePayload.estimated_date = cleanDateVal(updates.estimatedDate);
    if (updates.completedDate !== undefined) updatePayload.completed_date = cleanDateVal(updates.completedDate);
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;

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

    let updateQuery = sb.from('tasks').update(updatePayload).eq('id', id);
    if (hasVersion) {
      updateQuery = updateQuery.eq('version', currentVersion);
    }
    const { data: updatedRows, error: updateError } = await updateQuery.select('id');

    if (updateError) {
      return badRequest(`Erro ao atualizar tarefa: ${updateError.message}`, requestId);
    }

    // Verify row actually updated
    if (hasVersion && (!updatedRows || updatedRows.length === 0)) {
      return conflict(
        `Conflito de concorrência. A tarefa foi alterada por outro utilizador (versão esperada: ${currentVersion}).`,
        requestId,
        { currentVersion, submittedVersion: updates.version }
      );
    }

    // Update assignees if specified
    if (rawBody.assignedUserIds !== undefined) {
      const { error: delAssigneesErr } = await sb.from('task_assignees').delete().eq('task_id', id);
      if (delAssigneesErr) {
        console.error('[API TASK ASSIGNEES DELETE ERROR]', delAssigneesErr);
        return badRequest(`Erro ao atualizar responsáveis da tarefa: ${delAssigneesErr.message}`, requestId);
      }

      const assignedUserIds = updates.assignedUserIds || [];
      if (assignedUserIds.length > 0) {
        const assigneeRows = assignedUserIds.map((uid: string) => ({ task_id: id, user_id: uid }));
        const { error: insAssigneesErr } = await sb.from('task_assignees').insert(assigneeRows);
        if (insAssigneesErr) {
          console.error('[API TASK ASSIGNEES INSERT ERROR]', insAssigneesErr);
          return badRequest(`Erro ao associar responsáveis à tarefa: ${insAssigneesErr.message}`, requestId);
        }
      }
    }

    const isStatusChange = updates.statusId && updates.statusId !== current.status_id;
    await logAuditEvent({
      action: isStatusChange ? 'TASK_STATUS_CHANGED' : 'TASK_UPDATED',
      userId: user.id,
      entity: 'tasks',
      entityId: id,
      details: {
        version: currentVersion + 1,
        ...(isStatusChange ? { oldStatus: current.status_id, newStatus: updates.statusId } : {}),
      },
    });

    // Server-authoritative: reload updated task and assignees from DB
    const { data: refreshedTask, error: refreshError } = await sb
      .from('tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (refreshError || !refreshedTask) {
      return internalServerError('Erro ao recarregar a tarefa atualizada a partir do servidor.', requestId);
    }

    const { data: assignees } = await sb
      .from('task_assignees')
      .select('user_id')
      .eq('task_id', id);

    const serverData = {
      id: refreshedTask.id,
      projectId: refreshedTask.project_id || refreshedTask.projectId,
      title: refreshedTask.task_title || refreshedTask.title,
      description: refreshedTask.task_description || refreshedTask.description || '',
      statusId: refreshedTask.status_id || refreshedTask.statusId || 'ts-1',
      taskTypeId: refreshedTask.task_type_id || refreshedTask.taskTypeId || '',
      estimatedHours: refreshedTask.estimated_hours || 0,
      actualHours: refreshedTask.actual_hours || 0,
      startDate: refreshedTask.start_date || '',
      startTime: refreshedTask.start_time || '',
      endDate: refreshedTask.end_date || '',
      endTime: refreshedTask.end_time || '',
      estimatedDate: refreshedTask.estimated_date || '',
      completedDate: refreshedTask.completed_date || '',
      notes: refreshedTask.notes || '',
      assignedUserIds: (assignees || []).map((a: any) => a.user_id),
      version: typeof refreshedTask.version === 'number' ? refreshedTask.version : (currentVersion + 1),
      deleted: Boolean(refreshedTask.deleted),
      createdAt: refreshedTask.created_at,
      updatedAt: refreshedTask.updated_at,
      createdBy: refreshedTask.created_by,
      updatedBy: refreshedTask.updated_by,
    };

    return NextResponse.json({
      success: true,
      message: 'Tarefa atualizada com sucesso.',
      data: serverData,
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

    const hasVersion = typeof current.version === 'number';
    const currentVersion = hasVersion ? current.version : 1;
    const now = new Date().toISOString();

    const deletePayload: Record<string, any> = {
      deleted: true,
      updated_at: now,
    };
    if (hasVersion) {
      deletePayload.version = currentVersion + 1;
      deletePayload.updated_by = user.id;
    }

    let deleteQuery = sb.from('tasks').update(deletePayload).eq('id', id);
    if (hasVersion) {
      deleteQuery = deleteQuery.eq('version', currentVersion);
    }

    const { data: updatedRows, error: deleteError } = await deleteQuery.select('id');

    if (deleteError) {
      return badRequest(`Erro ao eliminar tarefa: ${deleteError.message}`, requestId);
    }

    // Verify row was affected
    if (hasVersion && (!updatedRows || updatedRows.length === 0)) {
      return conflict(
        `Conflito de concorrência ao eliminar tarefa. A tarefa foi alterada por outro utilizador (versão esperada: ${currentVersion}).`,
        requestId,
        { currentVersion }
      );
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
