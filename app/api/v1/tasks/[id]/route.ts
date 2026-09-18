import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updateTaskSchema } from '@/lib/validations/task';
import { notFound, conflict, validationError, internalServerError, badRequest } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'tasks_read');
  if (!auth.success) return auth.response;

  const { id } = await params;
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdate(req, params);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdate(req, params);
}

async function handleUpdate(req: NextRequest, paramsPromise: Promise<{ id: string }>) {
  const auth = await requirePermission(req, 'tasks_write');
  if (!auth.success) return auth.response;

  const { id } = await paramsPromise;
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

    let updateQuery = sb.from('tasks').update(updatePayload).eq('id', id);
    if (hasVersion) {
      updateQuery = updateQuery.eq('version', currentVersion);
    }
    const { error: updateError } = await updateQuery;

    if (updateError) {
      return badRequest(`Erro ao atualizar tarefa: ${updateError.message}`, requestId);
    }

    // Update assignees if specified
    if (updates.assignedUserIds !== undefined) {
      const { error: deleteAssigneesError } = await sb.from('task_assignees').delete().eq('task_id', id);
      if (deleteAssigneesError) {
        console.error('[API TASK UPDATE ASSIGNEES DELETE ERROR]', deleteAssigneesError);
        return badRequest(`Erro ao remover responsáveis anteriores da tarefa: ${deleteAssigneesError.message}`, requestId);
      }
      const validUuids = updates.assignedUserIds.filter((uid) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)
      );
      if (validUuids.length > 0) {
        const assigneeRows = validUuids.map((uid) => ({ task_id: id, user_id: uid }));
        const { error: insertAssigneesError } = await sb.from('task_assignees').insert(assigneeRows);
        if (insertAssigneesError) {
          console.error('[API TASK UPDATE ASSIGNEES INSERT ERROR]', insertAssigneesError);
          return badRequest(`Erro ao associar novos responsáveis à tarefa: ${insertAssigneesError.message}`, requestId);
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

    return NextResponse.json({
      success: true,
      message: 'Tarefa atualizada com sucesso.',
      data: {
        id,
        ...updates,
        version: currentVersion + 1,
        updatedAt: now,
      },
    });
  } catch (error: any) {
    return internalServerError('Falha inesperada ao atualizar tarefa.', requestId);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'tasks_delete');
  if (!auth.success) return auth.response;

  const { id } = await params;
  const { user, requestId } = auth;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const { data: current } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
    if (!current || current.deleted) return notFound('Tarefa não encontrada.', requestId);

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

    let { error: deleteError } = await sb
      .from('tasks')
      .update(deletePayload)
      .eq('id', id);

    if (deleteError && (deleteError.code === '42703' || deleteError.message?.includes('column'))) {
      const fallbackRes = await sb.from('tasks').update({ deleted: true }).eq('id', id);
      deleteError = fallbackRes.error;
    }

    if (deleteError) return badRequest(`Erro ao eliminar tarefa: ${deleteError.message}`, requestId);

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
