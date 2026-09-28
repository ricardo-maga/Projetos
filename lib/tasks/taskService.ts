import { SupabaseClient } from '@supabase/supabase-js';

export interface TaskDTO {
  id: string;
  projectId: string;
  title: string;
  description: string;
  statusId: string;
  taskTypeId: string;
  estimatedHours: number;
  actualHours: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  estimatedDate: string;
  completedDate: string;
  notes: string;
  assignedUserIds: string[];
  version: number;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface CreateTaskParams {
  id?: string;
  projectId: string;
  title: string;
  description?: string;
  statusId?: string;
  taskTypeId?: string | null;
  estimatedHours?: number;
  actualHours?: number;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  estimatedDate?: string | null;
  completedDate?: string | null;
  notes?: string | null;
  isMilestone?: boolean;
  assignedUserIds?: string[];
  userId: string;
}

export interface UpdateTaskParams {
  version?: number;
  projectId?: string;
  title?: string;
  description?: string;
  statusId?: string;
  taskTypeId?: string | null;
  estimatedHours?: number;
  actualHours?: number;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  estimatedDate?: string | null;
  completedDate?: string | null;
  notes?: string | null;
  isMilestone?: boolean;
  assignedUserIds?: string[];
  userId: string;
}

export interface ListTasksParams {
  page?: number;
  pageSize?: number;
  search?: string;
  projectId?: string;
  statusId?: string;
  taskTypeId?: string;
}

/**
 * Canonical helper to parse any interval/hours representation into decimal numeric hours.
 * Handles numbers, strings, HH:MM:SS, ISO durations, objects, and self-healing for corrupted values (e.g. 80000 -> 8).
 */
export function parseTaskHoursToNumber(val: any): number {
  if (val === null || val === undefined) return 0;

  const sanitizeCorrupted = (n: number): number => {
    if (isNaN(n) || !isFinite(n)) return 0;
    let clean = Math.max(0, n);
    if (clean >= 10000 && clean % 10000 === 0) {
      while (clean >= 10000 && clean % 10000 === 0) {
        clean = clean / 10000;
      }
    }
    return Math.round(clean * 100) / 100;
  };

  if (typeof val === 'number') {
    return sanitizeCorrupted(val);
  }

  if (typeof val === 'object') {
    const days = Number(val.days) || 0;
    const hours = Number(val.hours) || 0;
    const minutes = Number(val.minutes) || 0;
    const seconds = Number(val.seconds) || 0;
    const total = days * 8 + hours + minutes / 60 + seconds / 3600;
    return sanitizeCorrupted(total);
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return 0;

    // Standard HH:MM:SS or HH:MM format (e.g. "08:00:00", "08:30", "120:15:00")
    const timeMatch = trimmed.match(/^(\d+):(\d+)(?::(\d+))?$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const total = hours + minutes / 60 + seconds / 3600;
      return sanitizeCorrupted(total);
    }

    // ISO 8601 Duration (e.g. "PT8H30M", "P0DT8H")
    if (trimmed.startsWith('P')) {
      const hoursMatch = trimmed.match(/(\d+(?:\.\d+)?)H/i);
      const minsMatch = trimmed.match(/(\d+(?:\.\d+)?)M/i);
      const daysMatch = trimmed.match(/(\d+(?:\.\d+)?)D/i);
      let total = 0;
      if (daysMatch) total += parseFloat(daysMatch[1]) * 8;
      if (hoursMatch) total += parseFloat(hoursMatch[1]);
      if (minsMatch) total += parseFloat(minsMatch[1]) / 60;
      return sanitizeCorrupted(total);
    }

    // Match text like "8 hours", "8.5 hours", "8h 30m"
    let totalHours = 0;
    let matched = false;
    const hoursMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:hour|hours|hrs|h)\b/i);
    if (hoursMatch) {
      totalHours += parseFloat(hoursMatch[1]);
      matched = true;
    }
    const minsMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:minute|minutes|mins|m)\b/i);
    if (minsMatch) {
      totalHours += parseFloat(minsMatch[1]) / 60;
      matched = true;
    }
    if (matched) return sanitizeCorrupted(totalHours);

    // Fallback plain float parse (e.g. "8", "8.5", "8,5")
    const cleanNumberStr = trimmed.replace(',', '.');
    const num = parseFloat(cleanNumberStr);
    if (!isNaN(num)) {
      return sanitizeCorrupted(num);
    }
  }

  return 0;
}

/**
 * Maps raw database row and assignees into standard TaskDTO format
 */
export function mapRowToTaskDTO(row: any, assigneesMap: Record<string, string[]> = {}): TaskDTO {
  return {
    id: row.id,
    projectId: row.project_id || row.projectId,
    title: row.task_title || row.title,
    description: row.task_description || row.description || '',
    statusId: row.status_id || row.statusId || 'ts-1',
    taskTypeId: row.task_type_id || row.taskTypeId || '',
    estimatedHours: parseTaskHoursToNumber(row.estimated_hours ?? row.estimatedHours),
    actualHours: parseTaskHoursToNumber(row.actual_hours ?? row.actualHours),
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
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
  };
}

/**
 * Server-side Domain Service for Tasks.
 * Provides atomic, transactional persistence and DTO mapping.
 */
export async function createTaskServer(
  sb: SupabaseClient,
  params: CreateTaskParams
): Promise<{ success: boolean; data?: TaskDTO; error?: string; statusCode?: number }> {
  const newId = params.id || crypto.randomUUID();
  const estH = parseTaskHoursToNumber(params.estimatedHours);
  const actH = parseTaskHoursToNumber(params.actualHours);
  const estimatedHoursStr = `${estH} hours`;
  const actualHoursStr = `${actH} hours`;

  // 1. Try atomic RPC
  try {
    const { data: rpcData, error: rpcError } = await sb.rpc('create_task_atomic', {
      p_id: newId,
      p_project_id: params.projectId,
      p_task_title: params.title,
      p_status_id: params.statusId || 'ts-1',
      p_task_type_id: params.taskTypeId || null,
      p_estimated_hours: estimatedHoursStr,
      p_actual_hours: actualHoursStr,
      p_start_date: params.startDate || null,
      p_start_time: params.startTime || null,
      p_end_date: params.endDate || null,
      p_end_time: params.endTime || null,
      p_estimated_date: params.estimatedDate || null,
      p_completed_date: params.completedDate || null,
      p_task_description: params.description || '',
      p_notes: params.notes || null,
      p_is_milestone: Boolean(params.isMilestone),
      p_created_by: params.userId,
      p_assignee_user_ids: params.assignedUserIds || [],
    });

    if (!rpcError && rpcData) {
      const assigneesMap: Record<string, string[]> = {
        [newId]: params.assignedUserIds || [],
      };
      return {
        success: true,
        data: mapRowToTaskDTO(rpcData, assigneesMap),
      };
    }

    if (rpcError && rpcError.message.includes('Projeto associado não existe')) {
      return { success: false, error: 'O projeto especificado não existe ou foi eliminado.', statusCode: 400 };
    }
  } catch (err) {
    // Fallback to transactional pattern if RPC is not available in test/dev mock env
  }

  // Fallback transactional create with rollback
  const now = new Date().toISOString();
  const insertPayload = {
    id: newId,
    project_id: params.projectId,
    task_title: params.title,
    task_description: params.description || '',
    status_id: params.statusId || 'ts-1',
    task_type_id: params.taskTypeId || null,
    estimated_hours: estimatedHoursStr,
    actual_hours: actualHoursStr,
    start_date: params.startDate || null,
    start_time: params.startTime || null,
    end_date: params.endDate || null,
    end_time: params.endTime || null,
    estimated_date: params.estimatedDate || null,
    completed_date: params.completedDate || null,
    notes: params.notes || null,
    deleted: false,
    version: 1,
    created_by: params.userId,
    updated_by: params.userId,
    created_at: now,
    updated_at: now,
  };

  const { error: insertError } = await sb.from('tasks').insert([insertPayload]);
  if (insertError) {
    return { success: false, error: `Erro ao inserir tarefa: ${insertError.message}`, statusCode: 400 };
  }

  if (params.assignedUserIds && params.assignedUserIds.length > 0) {
    const assigneeRows = params.assignedUserIds.map((uid) => ({ task_id: newId, user_id: uid }));
    const { error: assigneeError } = await sb.from('task_assignees').insert(assigneeRows);
    if (assigneeError) {
      await sb.from('tasks').delete().eq('id', newId);
      return { success: false, error: `Erro ao associar responsáveis: ${assigneeError.message}`, statusCode: 500 };
    }
  }

  return {
    success: true,
    data: {
      id: newId,
      projectId: params.projectId,
      title: params.title,
      description: params.description || '',
      statusId: params.statusId || 'ts-1',
      taskTypeId: params.taskTypeId || '',
      estimatedHours: params.estimatedHours || 0,
      actualHours: params.actualHours || 0,
      startDate: params.startDate || '',
      startTime: params.startTime || '',
      endDate: params.endDate || '',
      endTime: params.endTime || '',
      estimatedDate: params.estimatedDate || '',
      completedDate: params.completedDate || '',
      notes: params.notes || '',
      assignedUserIds: params.assignedUserIds || [],
      version: 1,
      deleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: params.userId,
      updatedBy: params.userId,
    },
  };
}

/**
 * Server-side atomic task update
 */
export async function updateTaskServer(
  sb: SupabaseClient,
  id: string,
  params: UpdateTaskParams
): Promise<{ success: boolean; data?: TaskDTO; error?: string; statusCode?: number; currentVersion?: number }> {
  const hasAssigneesUpdate = params.assignedUserIds !== undefined;
  const estH = params.estimatedHours !== undefined ? parseTaskHoursToNumber(params.estimatedHours) : undefined;
  const actH = params.actualHours !== undefined ? parseTaskHoursToNumber(params.actualHours) : undefined;
  const estimatedHoursStr = estH !== undefined ? `${estH} hours` : undefined;
  const actualHoursStr = actH !== undefined ? `${actH} hours` : undefined;

  try {
    const { data: rpcData, error: rpcError } = await sb.rpc('update_task_atomic', {
      p_id: id,
      p_expected_version: params.version ?? null,
      p_project_id: params.projectId || null,
      p_task_title: params.title || null,
      p_status_id: params.statusId || null,
      p_task_type_id: params.taskTypeId || null,
      p_estimated_hours: estimatedHoursStr || null,
      p_actual_hours: actualHoursStr || null,
      p_start_date: params.startDate || null,
      p_start_time: params.startTime || null,
      p_end_date: params.endDate || null,
      p_end_time: params.endTime || null,
      p_estimated_date: params.estimatedDate || null,
      p_completed_date: params.completedDate || null,
      p_task_description: params.description || null,
      p_notes: params.notes || null,
      p_is_milestone: params.isMilestone ?? null,
      p_updated_by: params.userId,
      p_assignee_user_ids: params.assignedUserIds || [],
      p_update_assignees: hasAssigneesUpdate,
    });

    if (!rpcError && rpcData) {
      const { data: assignees } = await sb.from('task_assignees').select('user_id').eq('task_id', id);
      const assigneesMap = {
        [id]: (assignees || []).map((a: any) => a.user_id),
      };
      return {
        success: true,
        data: mapRowToTaskDTO(rpcData, assigneesMap),
      };
    }

    if (rpcError) {
      if (rpcError.message.includes('Conflito de concorrência') || rpcError.code === 'P0001') {
        return { success: false, error: 'Conflito de concorrência. A tarefa foi alterada por outro utilizador.', statusCode: 409 };
      }
      if (rpcError.message.includes('não encontrada') || rpcError.code === 'P0002') {
        return { success: false, error: 'Tarefa não encontrada.', statusCode: 404 };
      }
    }
  } catch (err) {
    // Fallback
  }

  // Fallback update
  const { data: current, error: fetchError } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
  if (fetchError) return { success: false, error: `Erro ao ler tarefa: ${fetchError.message}`, statusCode: 500 };
  if (!current || current.deleted) return { success: false, error: 'Tarefa não encontrada.', statusCode: 404 };

  const currentVersion = current.version || 1;
  if (params.version !== undefined && params.version !== currentVersion) {
    return {
      success: false,
      error: `Conflito de concorrência. A tarefa foi alterada por outro utilizador (versão atual: ${currentVersion}, versão submetida: ${params.version}).`,
      statusCode: 409,
      currentVersion,
    };
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, any> = {
    updated_at: now,
    updated_by: params.userId,
    version: currentVersion + 1,
  };

  if (params.projectId !== undefined) updatePayload.project_id = params.projectId;
  if (params.title !== undefined) updatePayload.task_title = params.title;
  if (params.description !== undefined) updatePayload.task_description = params.description;
  if (params.statusId !== undefined) updatePayload.status_id = params.statusId;
  if (params.taskTypeId !== undefined) updatePayload.task_type_id = params.taskTypeId;
  if (params.estimatedHours !== undefined) updatePayload.estimated_hours = `${params.estimatedHours} hours`;
  if (params.actualHours !== undefined) updatePayload.actual_hours = `${params.actualHours} hours`;
  if (params.startDate !== undefined) updatePayload.start_date = params.startDate;
  if (params.startTime !== undefined) updatePayload.start_time = params.startTime;
  if (params.endDate !== undefined) updatePayload.end_date = params.endDate;
  if (params.endTime !== undefined) updatePayload.end_time = params.endTime;
  if (params.estimatedDate !== undefined) updatePayload.estimated_date = params.estimatedDate;
  if (params.completedDate !== undefined) updatePayload.completed_date = params.completedDate;
  if (params.notes !== undefined) updatePayload.notes = params.notes;

  const { data: updatedRows, error: updateError } = await sb
    .from('tasks')
    .update(updatePayload)
    .eq('id', id)
    .eq('version', currentVersion)
    .select('id');

  if (updateError) {
    return { success: false, error: `Erro ao atualizar tarefa: ${updateError.message}`, statusCode: 400 };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return {
      success: false,
      error: `Conflito de concorrência ao atualizar tarefa (versão esperada: ${currentVersion}).`,
      statusCode: 409,
      currentVersion,
    };
  }

  if (hasAssigneesUpdate) {
    await sb.from('task_assignees').delete().eq('task_id', id);
    if (params.assignedUserIds && params.assignedUserIds.length > 0) {
      const assigneeRows = params.assignedUserIds.map((uid) => ({ task_id: id, user_id: uid }));
      await sb.from('task_assignees').insert(assigneeRows);
    }
  }

  const { data: refreshedTask } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
  const { data: assignees } = await sb.from('task_assignees').select('user_id').eq('task_id', id);
  const assigneesMap = {
    [id]: (assignees || []).map((a: any) => a.user_id),
  };

  return {
    success: true,
    data: mapRowToTaskDTO(refreshedTask || { ...current, ...updatePayload }, assigneesMap),
  };
}

/**
 * Server-side atomic task soft-delete
 */
export async function deleteTaskServer(
  sb: SupabaseClient,
  id: string,
  userId: string,
  expectedVersion?: number
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  try {
    const { data: rpcData, error: rpcError } = await sb.rpc('delete_task_atomic', {
      p_id: id,
      p_expected_version: expectedVersion ?? null,
      p_updated_by: userId,
    });

    if (!rpcError && rpcData) {
      return { success: true };
    }

    if (rpcError) {
      if (rpcError.message.includes('Conflito de concorrência') || rpcError.code === 'P0001') {
        return { success: false, error: 'Conflito de concorrência ao eliminar tarefa.', statusCode: 409 };
      }
      if (rpcError.message.includes('não encontrada') || rpcError.code === 'P0002') {
        return { success: false, error: 'Tarefa não encontrada.', statusCode: 404 };
      }
    }
  } catch (err) {
    // Fallback
  }

  const { data: current, error: fetchErr } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
  if (fetchErr) return { success: false, error: `Erro ao ler tarefa: ${fetchErr.message}`, statusCode: 500 };
  if (!current || current.deleted) return { success: false, error: 'Tarefa não encontrada.', statusCode: 404 };

  const currentVersion = current.version || 1;
  const now = new Date().toISOString();

  let deleteQuery = sb.from('tasks').update({
    deleted: true,
    version: currentVersion + 1,
    updated_at: now,
    updated_by: userId,
  }).eq('id', id);

  if (expectedVersion !== undefined) {
    deleteQuery = deleteQuery.eq('version', expectedVersion);
  }

  const { data: updatedRows, error: deleteError } = await deleteQuery.select('id');
  if (deleteError) {
    return { success: false, error: `Erro ao eliminar tarefa: ${deleteError.message}`, statusCode: 400 };
  }

  if (expectedVersion !== undefined && (!updatedRows || updatedRows.length === 0)) {
    return { success: false, error: 'Conflito de concorrência ao eliminar tarefa.', statusCode: 409 };
  }

  return { success: true };
}

/**
 * Server-side task detail fetch
 */
export async function getTaskServer(
  sb: SupabaseClient,
  id: string
): Promise<{ success: boolean; data?: TaskDTO; error?: string; statusCode?: number }> {
  const { data: task, error } = await sb
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('deleted', false)
    .maybeSingle();

  if (error) return { success: false, error: `Erro ao consultar tarefa: ${error.message}`, statusCode: 500 };
  if (!task) return { success: false, error: 'Tarefa não encontrada.', statusCode: 404 };

  const { data: assignees } = await sb.from('task_assignees').select('user_id').eq('task_id', id);
  const assigneesMap = {
    [id]: (assignees || []).map((a: any) => a.user_id),
  };

  return {
    success: true,
    data: mapRowToTaskDTO(task, assigneesMap),
  };
}

/**
 * Server-side task listing with pagination, search, and filters
 */
export async function listTasksServer(
  sb: SupabaseClient,
  params: ListTasksParams
): Promise<{
  success: boolean;
  data?: TaskDTO[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  error?: string;
  statusCode?: number;
}> {
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = sb
    .from('tasks')
    .select('*', { count: 'exact' })
    .eq('deleted', false);

  if (params.projectId) query = query.eq('project_id', params.projectId);
  if (params.statusId) query = query.eq('status_id', params.statusId);
  if (params.taskTypeId) query = query.eq('task_type_id', params.taskTypeId);
  if (params.search && params.search.trim()) {
    const q = `%${params.search.trim()}%`;
    query = query.or(`task_title.ilike.${q},task_description.ilike.${q},notes.ilike.${q}`);
  }

  const { data: rows, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return { success: false, error: `Erro ao consultar tarefas: ${error.message}`, statusCode: 500 };
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / pageSize);

  const taskIds = (rows || []).map((t: any) => t.id);
  let assigneesMap: Record<string, string[]> = {};
  if (taskIds.length > 0) {
    const { data: assignees } = await sb.from('task_assignees').select('task_id, user_id').in('task_id', taskIds);
    (assignees || []).forEach((a: any) => {
      if (!assigneesMap[a.task_id]) assigneesMap[a.task_id] = [];
      assigneesMap[a.task_id].push(a.user_id);
    });
  }

  const mappedTasks = (rows || []).map((row: any) => mapRowToTaskDTO(row, assigneesMap));

  return {
    success: true,
    data: mappedTasks,
    total,
    page,
    pageSize,
    totalPages,
  };
}
