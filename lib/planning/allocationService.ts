/**
 * ============================================================================
 * FASE 65 — PLANNING PERSISTENCE BOUNDARY & ALLOCATION SERVICE
 * ============================================================================
 * 
 * Regra Arquitetural:
 * - PostgreSQL é a única fonte de verdade persistente para o domínio Planning.
 * - Este serviço constitui a Boundary canónica de persistência para o agregado
 *   planning_allocations.
 * - As operações de escrita são atómicas e validam invariantes, OCC e estados.
 * - Tasks e Projects são as fontes únicas de verdade das tarefas e projetos.
 * ============================================================================
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { logAuditEvent } from '@/lib/audit';
import {
  validatePlanningAllocation,
  parseTimeToMinutes,
} from './validationEngine';
import type {
  PlanningAllocationStatus,
  PlanningAllocationDTO,
  PlanningAllocationCreateInput,
  PlanningAllocationUpdateInput,
  PlanningAllocationFilters,
  PlanningWarning,
} from './types';

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  warnings?: PlanningWarning[];
  error?: {
    httpStatus: number;
    errorCode: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedAllocationsResult {
  allocations: PlanningAllocationDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Maps a raw database row from planning_allocations into a PlanningAllocationDTO.
 */
export function mapRowToDTO(
  row: any,
  tasksMap: Record<string, { id: string; title: string; projectId?: string }> = {},
  resourcesMap: Record<string, { id: string; name: string; email: string }> = {}
): PlanningAllocationDTO {
  const startMin = parseTimeToMinutes(row.start_time);
  const endMin = parseTimeToMinutes(row.end_time);
  const durationMinutes = Math.max(0, endMin - startMin);

  return {
    id: row.id,
    taskId: row.task_id,
    resourceId: row.resource_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status as PlanningAllocationStatus,
    version: row.version || 1,
    durationMinutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    task: tasksMap[row.task_id] || null,
    resource: resourcesMap[row.resource_id] || null,
  };
}

/**
 * Queries planning allocations with filtering, ordering and pagination.
 */
export async function queryPlanningAllocations(
  sb: SupabaseClient,
  filters: PlanningAllocationFilters
): Promise<ServiceResult<PaginatedAllocationsResult>> {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = sb
    .from('planning_allocations')
    .select('*', { count: 'exact' });

  if (filters.taskId) query = query.eq('task_id', filters.taskId);
  if (filters.resourceId) query = query.eq('resource_id', filters.resourceId);
  if (filters.date) query = query.eq('date', filters.date);
  if (filters.dateFrom) query = query.gte('date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('date', filters.dateTo);
  if (filters.status) query = query.eq('status', filters.status);

  const { data: rows, count, error } = await query
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .range(from, to);

  if (error) {
    console.error('[AllocationService.queryPlanningAllocations ERROR]', error);
    return {
      success: false,
      error: {
        httpStatus: 500,
        errorCode: 'DATABASE_ERROR',
        message: `Erro ao consultar alocações de planeamento: ${error.message}`,
      },
    };
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Enrich with task and user resource metadata
  const taskIds = Array.from(new Set((rows || []).map((r: any) => r.task_id).filter(Boolean)));
  const resourceIds = Array.from(new Set((rows || []).map((r: any) => r.resource_id).filter(Boolean)));

  const tasksMap: Record<string, any> = {};
  if (taskIds.length > 0) {
    const { data: tasksData } = await sb
      .from('tasks')
      .select('id, task_title, project_id')
      .in('id', taskIds);
    (tasksData || []).forEach((t: any) => {
      tasksMap[t.id] = {
        id: t.id,
        title: t.task_title,
        projectId: t.project_id,
      };
    });
  }

  const resourcesMap: Record<string, any> = {};
  if (resourceIds.length > 0) {
    const { data: usersData } = await sb
      .from('users')
      .select('id, name, email')
      .in('id', resourceIds);
    (usersData || []).forEach((u: any) => {
      resourcesMap[u.id] = {
        id: u.id,
        name: u.name,
        email: u.email,
      };
    });
  }

  const allocations = (rows || []).map((row: any) => mapRowToDTO(row, tasksMap, resourcesMap));

  return {
    success: true,
    data: {
      allocations,
      total,
      page,
      pageSize,
      totalPages,
    },
  };
}

/**
 * Gets a single planning allocation by its ID with enriched Task and Resource metadata.
 */
export async function getPlanningAllocationById(
  sb: SupabaseClient,
  id: string
): Promise<ServiceResult<PlanningAllocationDTO>> {
  const { data: row, error } = await sb
    .from('planning_allocations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[AllocationService.getPlanningAllocationById ERROR]', error);
    return {
      success: false,
      error: {
        httpStatus: 500,
        errorCode: 'DATABASE_ERROR',
        message: `Erro ao ler alocação de planeamento: ${error.message}`,
      },
    };
  }

  if (!row) {
    return {
      success: false,
      error: {
        httpStatus: 404,
        errorCode: 'NOT_FOUND',
        message: 'Alocação de planeamento não encontrada.',
      },
    };
  }

  // Enrich with task & resource metadata
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

  const tasksMap: Record<string, any> = {};
  if (task) {
    tasksMap[task.id] = {
      id: task.id,
      title: task.task_title,
      projectId: task.project_id,
    };
  }

  const resourcesMap: Record<string, any> = {};
  if (resUser) {
    resourcesMap[resUser.id] = {
      id: resUser.id,
      name: resUser.name,
      email: resUser.email,
    };
  }

  return {
    success: true,
    data: mapRowToDTO(row, tasksMap, resourcesMap),
  };
}

/**
 * Creates a new planning allocation following business, temporal, schedule, and capacity validation.
 */
export async function createPlanningAllocation(
  sb: SupabaseClient,
  payload: PlanningAllocationCreateInput,
  user: { id: string; isAdmin?: boolean }
): Promise<ServiceResult<PlanningAllocationDTO>> {
  // 1. Run domain business validation
  const validation = await validatePlanningAllocation(sb, {
    taskId: payload.taskId,
    resourceId: payload.resourceId,
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    status: payload.status || 'CONFIRMED',
    overrideWorkSchedule: payload.overrideWorkSchedule,
    isAdmin: Boolean(user.isAdmin),
  });

  if (!validation.isValid) {
    return {
      success: false,
      error: {
        httpStatus: validation.httpStatus,
        errorCode: validation.errorCode,
        message: validation.message,
        details: validation.details,
      },
      warnings: validation.warnings,
    };
  }

  const now = new Date().toISOString();
  const insertPayload = {
    task_id: payload.taskId,
    resource_id: payload.resourceId,
    date: payload.date,
    start_time: payload.startTime,
    end_time: payload.endTime,
    status: payload.status || 'CONFIRMED',
    version: 1,
    created_at: now,
    updated_at: now,
  };

  // 2. Perform atomic single-table insert
  const { data: created, error: insertError } = await sb
    .from('planning_allocations')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) {
    // 23P01: exclusion_violation (PostgreSQL standard error code for EXCLUDE constraint)
    if (insertError.code === '23P01' || insertError.message?.includes('no_overlapping_confirmed_allocations')) {
      return {
        success: false,
        error: {
          httpStatus: 409,
          errorCode: 'PLANNING_ALLOCATION_OVERLAP',
          message: 'O recurso já possui uma alocação confirmada sobreposta neste intervalo temporal.',
          details: { code: insertError.code, error: insertError.message },
        },
      };
    }

    // 23514: check_violation (e.g., start_time >= end_time or invalid status)
    if (insertError.code === '23514' || insertError.message?.includes('chk_planning_allocations_start_before_end')) {
      return {
        success: false,
        error: {
          httpStatus: 400,
          errorCode: 'INVALID_TIME_RANGE',
          message: 'A hora de início deve ser anterior à hora de fim e o intervalo deve ser válido.',
          details: { code: insertError.code, error: insertError.message },
        },
      };
    }

    console.error('[AllocationService.createPlanningAllocation INSERT ERROR]', insertError);
    return {
      success: false,
      error: {
        httpStatus: 500,
        errorCode: 'DATABASE_ERROR',
        message: `Erro ao gravar alocação de planeamento: ${insertError.message}`,
      },
    };
  }

  // 3. Fetch related task and resource for DTO
  const { data: task } = await sb
    .from('tasks')
    .select('id, task_title, project_id')
    .eq('id', payload.taskId)
    .maybeSingle();

  const { data: resUser } = await sb
    .from('users')
    .select('id, name, email')
    .eq('id', payload.resourceId)
    .maybeSingle();

  const tasksMap: Record<string, any> = {};
  if (task) {
    tasksMap[task.id] = {
      id: task.id,
      title: task.task_title,
      projectId: task.project_id,
    };
  }

  const resourcesMap: Record<string, any> = {};
  if (resUser) {
    resourcesMap[resUser.id] = {
      id: resUser.id,
      name: resUser.name,
      email: resUser.email,
    };
  }

  const dto = mapRowToDTO(created, tasksMap, resourcesMap);

  // 4. Audit Log
  await logAuditEvent({
    action: 'PLANNING_ALLOCATION_CREATED',
    userId: user.id,
    entity: 'planning_allocations',
    entityId: created.id,
    details: {
      taskId: payload.taskId,
      resourceId: payload.resourceId,
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
      status: payload.status,
    },
  });

  return {
    success: true,
    data: dto,
    warnings: validation.warnings,
  };
}

/**
 * Updates an existing planning allocation with Optimistic Concurrency Control (OCC)
 * and strict status transition validation.
 */
export async function updatePlanningAllocation(
  sb: SupabaseClient,
  id: string,
  updates: PlanningAllocationUpdateInput,
  user: { id: string; isAdmin?: boolean }
): Promise<ServiceResult<PlanningAllocationDTO>> {
  // 1. Fetch current record
  const { data: current, error: fetchError } = await sb
    .from('planning_allocations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    return {
      success: false,
      error: {
        httpStatus: 500,
        errorCode: 'DATABASE_ERROR',
        message: `Erro ao ler versão atual da alocação: ${fetchError.message}`,
      },
    };
  }

  if (!current) {
    return {
      success: false,
      error: {
        httpStatus: 404,
        errorCode: 'NOT_FOUND',
        message: 'Alocação de planeamento não encontrada.',
      },
    };
  }

  // 2. Optimistic Concurrency Check (OCC)
  const currentVersion = current.version || 1;
  if (updates.version !== currentVersion) {
    return {
      success: false,
      error: {
        httpStatus: 409,
        errorCode: 'OCC_CONFLICT',
        message: `Conflito de concorrência. A alocação foi alterada por outro utilizador (versão atual: ${currentVersion}, versão submetida: ${updates.version}). Recarregue os dados antes de gravar.`,
        details: { currentVersion, submittedVersion: updates.version },
      },
    };
  }

  // 3. Status Transition Check: CANCELLED is immutable and cannot be reactivated
  const targetStatus = updates.status ?? current.status;
  if (current.status === 'CANCELLED') {
    return {
      success: false,
      error: {
        httpStatus: 400,
        errorCode: 'INVALID_STATUS_TRANSITION',
        message: 'Alocações canceladas permanecem para histórico e não podem ser alteradas nem reativadas.',
        details: {
          currentStatus: current.status,
          attemptedStatus: targetStatus,
        },
      },
    };
  }

  const targetDate = updates.date ?? current.date;
  const targetStartTime = updates.startTime ?? current.start_time;
  const targetEndTime = updates.endTime ?? current.end_time;

  // 4. Validate if target status is CONFIRMED or DRAFT
  let validationWarnings: PlanningWarning[] = [];
  if (targetStatus === 'CONFIRMED' || targetStatus === 'DRAFT') {
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
      return {
        success: false,
        error: {
          httpStatus: validation.httpStatus,
          errorCode: validation.errorCode,
          message: validation.message,
          details: validation.details,
        },
        warnings: validation.warnings,
      };
    }
    validationWarnings = validation.warnings;
  }

  // 5. Atomic Update with OCC condition in SQL
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
    // 23P01: exclusion_violation (PostgreSQL standard error code for EXCLUDE constraint)
    if (updateError.code === '23P01' || updateError.message?.includes('no_overlapping_confirmed_allocations')) {
      return {
        success: false,
        error: {
          httpStatus: 409,
          errorCode: 'PLANNING_ALLOCATION_OVERLAP',
          message: 'O recurso já possui uma alocação confirmada sobreposta neste intervalo temporal.',
          details: { code: updateError.code, error: updateError.message },
        },
      };
    }

    // 23514: check_violation (e.g., start_time >= end_time or invalid status)
    if (updateError.code === '23514' || updateError.message?.includes('chk_planning_allocations_start_before_end')) {
      return {
        success: false,
        error: {
          httpStatus: 400,
          errorCode: 'INVALID_TIME_RANGE',
          message: 'A hora de início deve ser anterior à hora de fim e o intervalo deve ser válido.',
          details: { code: updateError.code, error: updateError.message },
        },
      };
    }

    console.error('[AllocationService.updatePlanningAllocation UPDATE ERROR]', updateError);
    return {
      success: false,
      error: {
        httpStatus: 500,
        errorCode: 'DATABASE_ERROR',
        message: `Erro ao atualizar alocação de planeamento: ${updateError.message}`,
      },
    };
  }

  if (!updated) {
    return {
      success: false,
      error: {
        httpStatus: 409,
        errorCode: 'OCC_CONFLICT',
        message: `Conflito de concorrência. A alocação foi alterada simultaneamente por outro processo (versão esperada: ${currentVersion}). Recarregue os dados antes de gravar.`,
        details: { currentVersion, submittedVersion: updates.version },
      },
    };
  }

  // 6. Fetch related metadata for DTO
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

  const tasksMap: Record<string, any> = {};
  if (task) {
    tasksMap[task.id] = {
      id: task.id,
      title: task.task_title,
      projectId: task.project_id,
    };
  }

  const resourcesMap: Record<string, any> = {};
  if (resUser) {
    resourcesMap[resUser.id] = {
      id: resUser.id,
      name: resUser.name,
      email: resUser.email,
    };
  }

  const dto = mapRowToDTO(updated, tasksMap, resourcesMap);

  // 7. Audit Log
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

  return {
    success: true,
    data: dto,
    warnings: validationWarnings,
  };
}

/**
 * Deletes a planning allocation respecting business lifecycle constraints:
 * - DRAFT: May be hard-deleted.
 * - CONFIRMED: Cannot be deleted; must be set to CANCELLED via PATCH.
 * - CANCELLED: Cannot be deleted (retained for audit/history).
 */
export async function deletePlanningAllocation(
  sb: SupabaseClient,
  id: string,
  user: { id: string }
): Promise<ServiceResult<{ message: string }>> {
  // 1. Fetch current record
  const { data: current, error: fetchError } = await sb
    .from('planning_allocations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    return {
      success: false,
      error: {
        httpStatus: 500,
        errorCode: 'DATABASE_ERROR',
        message: `Erro ao consultar alocação para eliminação: ${fetchError.message}`,
      },
    };
  }

  if (!current) {
    return {
      success: false,
      error: {
        httpStatus: 404,
        errorCode: 'NOT_FOUND',
        message: 'Alocação de planeamento não encontrada.',
      },
    };
  }

  // 2. Validate Delete Rules
  if (current.status === 'CONFIRMED') {
    return {
      success: false,
      error: {
        httpStatus: 400,
        errorCode: 'CANNOT_DELETE_CONFIRMED',
        message: 'Alocações confirmadas não podem ser eliminadas. Altere o estado para CANCELLED para cancelar a reserva de capacidade.',
        details: { id: current.id, status: current.status },
      },
    };
  }

  if (current.status === 'CANCELLED') {
    return {
      success: false,
      error: {
        httpStatus: 400,
        errorCode: 'CANNOT_DELETE_CANCELLED',
        message: 'Alocações canceladas são preservadas para histórico e auditoria e não podem ser eliminadas.',
        details: { id: current.id, status: current.status },
      },
    };
  }

  // 3. Status is DRAFT: Perform atomic delete from database with status constraint
  const { data: deletedRows, error: deleteError } = await sb
    .from('planning_allocations')
    .delete()
    .eq('id', id)
    .eq('status', 'DRAFT')
    .select('id');

  if (deleteError) {
    console.error('[AllocationService.deletePlanningAllocation DELETE ERROR]', deleteError);
    return {
      success: false,
      error: {
        httpStatus: 500,
        errorCode: 'DATABASE_ERROR',
        message: `Erro ao eliminar alocação de planeamento: ${deleteError.message}`,
      },
    };
  }

  if (!deletedRows || deletedRows.length === 0) {
    return {
      success: false,
      error: {
        httpStatus: 409,
        errorCode: 'CONCURRENT_STATUS_CHANGE',
        message: 'A alocação de planeamento já não se encontra no estado DRAFT ou foi alterada concorrentemente.',
        details: { id },
      },
    };
  }

  // 4. Audit Log
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

  return {
    success: true,
    data: { message: 'Alocação de planeamento eliminada com sucesso.' },
  };
}
