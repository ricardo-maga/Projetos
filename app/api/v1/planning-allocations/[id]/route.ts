import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updatePlanningAllocationSchema } from '@/lib/validations/planningAllocation';
import {
  validationError,
  notFound,
  conflict,
  badRequest,
  internalServerError,
  createErrorResponse,
} from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import {
  validatePlanningAllocation,
  parseTimeToMinutes,
} from '@/lib/planning/validationEngine';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, 'calendar_read');
  if (!auth.success) return auth.response;

  const { requestId } = auth;
  const { id } = await params;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const { data: row, error } = await sb
      .from('planning_allocations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[API PLANNING ALLOCATION GET ERROR]', error);
      return internalServerError(
        `Erro ao ler alocação de planeamento: ${error.message}`,
        requestId
      );
    }

    if (!row) {
      return notFound('Alocação de planeamento não encontrada.', requestId);
    }

    // Enrich with task and resource info
    const { data: task } = await sb
      .from('tasks')
      .select('id, task_title, project_id')
      .eq('id', row.task_id)
      .maybeSingle();

    const { data: resUser } = await sb
      .from('users')
      .select('id, name, email')
      .eq('id', row.resource_id)
      .maybeSingle();

    const startMin = parseTimeToMinutes(row.start_time);
    const endMin = parseTimeToMinutes(row.end_time);

    const dto = {
      id: row.id,
      taskId: row.task_id,
      resourceId: row.resource_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      version: row.version || 1,
      durationMinutes: Math.max(0, endMin - startMin),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      task: task
        ? {
            id: task.id,
            title: task.task_title,
            projectId: task.project_id,
          }
        : null,
      resource: resUser
        ? {
            id: resUser.id,
            name: resUser.name,
            email: resUser.email,
          }
        : null,
    };

    return NextResponse.json({
      success: true,
      data: dto,
    });
  } catch (error: any) {
    console.error('[API PLANNING ALLOCATION GET EXCEPTION]', error);
    return internalServerError(
      'Falha inesperada ao consultar alocação de planeamento.',
      requestId
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, 'calendar_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;
  const { id } = await params;

  try {
    const rawBody = await req.json();
    const parseResult = updatePlanningAllocationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError(
        'Dados inválidos para atualização da alocação de planeamento.',
        requestId,
        parseResult.error.flatten()
      );
    }

    const updates = parseResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    // 1. Fetch current record
    const { data: current, error: fetchError } = await sb
      .from('planning_allocations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return internalServerError(
        `Erro ao ler versão atual da alocação: ${fetchError.message}`,
        requestId
      );
    }

    if (!current) {
      return notFound('Alocação de planeamento não encontrada.', requestId);
    }

    // 2. Optimistic Concurrency check
    const currentVersion = current.version || 1;
    if (updates.version !== currentVersion) {
      return conflict(
        `Conflito de concorrência. A alocação foi alterada por outro utilizador (versão atual: ${currentVersion}, versão submetida: ${updates.version}). Recarregue os dados antes de gravar.`,
        requestId,
        { currentVersion, submittedVersion: updates.version }
      );
    }

    // 3. Status Transition check
    const targetStatus = updates.status ?? current.status;
    if (current.status === 'CANCELLED') {
      return badRequest(
        'Alocações canceladas permanecem para histórico e não podem ser alteradas nem reativadas.',
        requestId,
        {
          errorCode: 'INVALID_STATUS_TRANSITION',
          currentStatus: current.status,
          attemptedStatus: targetStatus,
        }
      );
    }

    const targetDate = updates.date ?? current.date;
    const targetStartTime = updates.startTime ?? current.start_time;
    const targetEndTime = updates.endTime ?? current.end_time;

    // 4. Validate if target status is CONFIRMED, or if DRAFT requires structural checks
    let validationWarnings: any[] = [];
    if (targetStatus === 'CONFIRMED') {
      const validation = await validatePlanningAllocation(sb, {
        taskId: current.task_id,
        resourceId: current.resource_id,
        date: targetDate,
        startTime: targetStartTime,
        endTime: targetEndTime,
        status: targetStatus,
        currentAllocationId: current.id,
        overrideWorkSchedule: updates.overrideWorkSchedule,
        isAdmin: Boolean(user.isAdmin),
      });

      if (!validation.isValid) {
        return createErrorResponse(
          validation.httpStatus,
          validation.errorCode,
          validation.message,
          requestId,
          validation.details
        );
      }
      validationWarnings = validation.warnings;
    } else if (targetStatus === 'DRAFT') {
      const validation = await validatePlanningAllocation(sb, {
        taskId: current.task_id,
        resourceId: current.resource_id,
        date: targetDate,
        startTime: targetStartTime,
        endTime: targetEndTime,
        status: 'DRAFT',
        currentAllocationId: current.id,
        overrideWorkSchedule: updates.overrideWorkSchedule,
        isAdmin: Boolean(user.isAdmin),
      });
      if (!validation.isValid) {
        return createErrorResponse(
          validation.httpStatus,
          validation.errorCode,
          validation.message,
          requestId,
          validation.details
        );
      }
      validationWarnings = validation.warnings;
    }

    // 5. Update allocation
    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      version: currentVersion + 1,
      updated_at: now,
    };

    if (updates.date !== undefined) updatePayload.date = updates.date;
    if (updates.startTime !== undefined) updatePayload.start_time = updates.startTime;
    if (updates.endTime !== undefined) updatePayload.end_time = updates.endTime;
    if (updates.status !== undefined) updatePayload.status = updates.status;

    const { data: updated, error: updateError } = await sb
      .from('planning_allocations')
      .update(updatePayload)
      .eq('id', id)
      .eq('version', currentVersion)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('[API PLANNING ALLOCATION UPDATE ERROR]', updateError);
      return internalServerError(
        `Erro ao atualizar alocação de planeamento: ${updateError.message}`,
        requestId
      );
    }

    if (!updated) {
      return conflict(
        `Conflito de concorrência. A alocação foi alterada simultaneamente por outro processo (versão esperada: ${currentVersion}). Recarregue os dados antes de gravar.`,
        requestId,
        { currentVersion, submittedVersion: updates.version }
      );
    }

    // Fetch related task and resource for response
    const { data: task } = await sb
      .from('tasks')
      .select('id, task_title, project_id')
      .eq('id', updated.task_id)
      .maybeSingle();

    const { data: resUser } = await sb
      .from('users')
      .select('id, name, email')
      .eq('id', updated.resource_id)
      .maybeSingle();

    const startMin = parseTimeToMinutes(updated.start_time);
    const endMin = parseTimeToMinutes(updated.end_time);

    const dto = {
      id: updated.id,
      taskId: updated.task_id,
      resourceId: updated.resource_id,
      date: updated.date,
      startTime: updated.start_time,
      endTime: updated.end_time,
      status: updated.status,
      version: updated.version,
      durationMinutes: Math.max(0, endMin - startMin),
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      task: task
        ? {
            id: task.id,
            title: task.task_title,
            projectId: task.project_id,
          }
        : null,
      resource: resUser
        ? {
            id: resUser.id,
            name: resUser.name,
            email: resUser.email,
          }
        : null,
    };

    await logAuditEvent({
      action: 'PLANNING_ALLOCATION_UPDATED',
      userId: user.id,
      entity: 'planning_allocations',
      entityId: id,
      details: {
        previousVersion: currentVersion,
        newVersion: updated.version,
        changes: updatePayload,
      },
    });

    return NextResponse.json({
      success: true,
      data: dto,
      warnings: validationWarnings,
    });
  } catch (error: any) {
    console.error('[API PLANNING ALLOCATION UPDATE EXCEPTION]', error);
    return internalServerError(
      'Falha inesperada ao atualizar alocação de planeamento.',
      requestId
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, 'calendar_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;
  const { id } = await params;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const { data: current, error: fetchError } = await sb
      .from('planning_allocations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return internalServerError(
        `Erro ao consultar alocação para eliminação: ${fetchError.message}`,
        requestId
      );
    }

    if (!current) {
      return notFound('Alocação de planeamento não encontrada.', requestId);
    }

    // Apply strict DELETE business rules:
    // 1. DRAFT: May be hard-deleted.
    // 2. CONFIRMED: Cannot be deleted. Must be set to CANCELLED via PATCH.
    // 3. CANCELLED: Cannot be deleted (retained for audit/history).
    if (current.status === 'CONFIRMED') {
      return badRequest(
        'Alocações confirmadas não podem ser eliminadas. Altere o estado para CANCELLED para cancelar a reserva de capacidade.',
        requestId,
        {
          errorCode: 'CANNOT_DELETE_CONFIRMED',
          id: current.id,
          status: current.status,
        }
      );
    }

    if (current.status === 'CANCELLED') {
      return badRequest(
        'Alocações canceladas são preservadas para histórico e auditoria e não podem ser eliminadas.',
        requestId,
        {
          errorCode: 'CANNOT_DELETE_CANCELLED',
          id: current.id,
          status: current.status,
        }
      );
    }

    // Status is DRAFT: Delete from database
    const { error: deleteError } = await sb
      .from('planning_allocations')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[API PLANNING ALLOCATION DELETE ERROR]', deleteError);
      return internalServerError(
        `Erro ao eliminar alocação de planeamento: ${deleteError.message}`,
        requestId
      );
    }

    await logAuditEvent({
      action: 'PLANNING_ALLOCATION_DELETED',
      userId: user.id,
      entity: 'planning_allocations',
      entityId: id,
      details: {
        taskId: current.task_id,
        resourceId: current.resource_id,
        date: current.date,
        status: current.status,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Alocação de planeamento eliminada com sucesso.',
    });
  } catch (error: any) {
    console.error('[API PLANNING ALLOCATION DELETE EXCEPTION]', error);
    return internalServerError(
      'Falha inesperada ao eliminar alocação de planeamento.',
      requestId
    );
  }
}
