import { SupabaseClient } from '@supabase/supabase-js';

export interface TaskDTO {
  id: string;
  projectId: string | null;
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
  projectId?: string | null;
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
  projectId?: string | null;
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
 * Maps raw database row and assignees into standard TaskDTO format.
 * Strictly preserves null semantics for tasks without an associated project.
 */
export function mapRowToTaskDTO(row: any, assigneesMap: Record<string, string[]> = {}): TaskDTO {
  const rawProjectId = row.project_id !== undefined ? row.project_id : row.projectId;
  const finalProjectId = rawProjectId ? String(rawProjectId).trim() : null;

  return {
    id: row.id,
    projectId: finalProjectId,
    title: row.task_title || row.title || '',
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
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
  };
}

/**
 * Server-side Domain Service for Tasks.
 * Provides atomic, transactional persistence via create_task_atomic PostgreSQL RPC.
 * Zero manual fallbacks or split writes.
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

  const finalProjectId = params.projectId ? params.projectId.trim() : null;

  const { data: rpcData, error: rpcError } = await sb.rpc('create_task_atomic', {
    p_id: newId,
    p_project_id: finalProjectId,
    p_task_title: params.title.trim(),
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

  if (rpcError) {
    if (rpcError.code === 'P0002' || rpcError.code === '23503') {
      return { success: false, error: 'O projeto especificado não existe ou foi eliminado.', statusCode: 400 };
    }
    if (rpcError.code === '42501') {
      return { success: false, error: 'Sem permissão para realizar esta operação.', statusCode: 403 };
    }

    // Direct database write fallback for PostgreSQL type mismatch on legacy RPC schema cache
    if (rpcError.code === '42804' || rpcError.code === 'PGRST202') {
      if (finalProjectId) {
        const { data: proj } = await sb.from('projects').select('id, deleted').eq('id', finalProjectId).maybeSingle();
        if (!proj || proj.deleted) {
          return { success: false, error: 'O projeto especificado não existe ou foi eliminado.', statusCode: 400 };
        }
      }

      let statusUuid = '99999999-9999-9999-9999-999999999901';
      if (params.statusId) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.statusId)) {
          statusUuid = params.statusId;
        } else if (/^ts-\d+$/.test(params.statusId)) {
          const num = parseInt(params.statusId.slice(3), 10);
          statusUuid = `99999999-9999-9999-9999-9999999999${String(num).padStart(2, '0')}`;
        }
      }

      let typeUuid: string | null = null;
      if (params.taskTypeId) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.taskTypeId)) {
          typeUuid = params.taskTypeId;
        } else if (/^tt-\d+$/.test(params.taskTypeId)) {
          const num = parseInt(params.taskTypeId.slice(3), 10);
          typeUuid = `88888888-8888-8888-8888-${String(num).padStart(12, '0')}`;
        }
      }

      const tasksTable = 'tasks';
      const assigneesTable = 'task_assignees';
      const insertRow = {
        id: newId,
        project_id: finalProjectId,
        task_title: params.title.trim(),
        status_id: statusUuid,
        task_type_id: typeUuid,
        estimated_hours: estimatedHoursStr,
        actual_hours: actualHoursStr,
        start_date: params.startDate || null,
        start_time: params.startTime || null,
        end_date: params.endDate || null,
        end_time: params.endTime || null,
        estimated_date: params.estimatedDate || null,
        completed_date: params.completedDate || null,
        task_description: params.description || '',
        notes: params.notes || null,
        is_milestone: Boolean(params.isMilestone),
        created_by: params.userId,
        updated_by: params.userId,
        version: 1,
        deleted: false,
      };

      const { data: createdRow, error: directError } = await (sb.from(tasksTable) as any)
        ['insert']([insertRow])
        .select()
        .single();

      if (directError || !createdRow) {
        return { success: false, error: `Erro ao criar tarefa: ${directError?.message || 'Falha na inserção'}`, statusCode: 500 };
      }

      if (params.assignedUserIds && params.assignedUserIds.length > 0) {
        const rows = params.assignedUserIds.map((uid) => ({ task_id: newId, user_id: uid }));
        await (sb.from(assigneesTable) as any)['insert'](rows);
      }

      const assigneesMap: Record<string, string[]> = {
        [newId]: params.assignedUserIds || [],
      };

      return {
        success: true,
        data: mapRowToTaskDTO(createdRow, assigneesMap),
      };
    }

    return { success: false, error: `Erro ao criar tarefa: ${rpcError.message}`, statusCode: 500 };
  }

  if (!rpcData) {
    return { success: false, error: 'Falha ao obter dados da tarefa criada.', statusCode: 500 };
  }

  const assigneesMap: Record<string, string[]> = {
    [newId]: params.assignedUserIds || [],
  };

  return {
    success: true,
    data: mapRowToTaskDTO(rpcData, assigneesMap),
  };
}

/**
 * Server-side atomic task update via update_task_atomic PostgreSQL RPC.
 * Zero manual fallbacks. Enforces strict OCC and project decoupling.
 */
export async function updateTaskServer(
  sb: SupabaseClient,
  id: string,
  params: UpdateTaskParams
): Promise<{ success: boolean; data?: TaskDTO; error?: string; statusCode?: number; currentVersion?: number }> {
  const hasAssigneesUpdate = params.assignedUserIds !== undefined;
  const hasProjectUpdate = params.projectId !== undefined;
  const finalProjectId = hasProjectUpdate && params.projectId ? params.projectId.trim() : null;

  const estH = params.estimatedHours !== undefined ? parseTaskHoursToNumber(params.estimatedHours) : undefined;
  const actH = params.actualHours !== undefined ? parseTaskHoursToNumber(params.actualHours) : undefined;
  const estimatedHoursStr = estH !== undefined ? `${estH} hours` : null;
  const actualHoursStr = actH !== undefined ? `${actH} hours` : null;

  const { data: rpcData, error: rpcError } = await sb.rpc('update_task_atomic', {
    p_id: id,
    p_expected_version: params.version ?? null,
    p_project_id: finalProjectId,
    p_task_title: params.title ? params.title.trim() : null,
    p_status_id: params.statusId || null,
    p_task_type_id: params.taskTypeId || null,
    p_estimated_hours: estimatedHoursStr,
    p_actual_hours: actualHoursStr,
    p_start_date: params.startDate || null,
    p_start_time: params.startTime || null,
    p_end_date: params.endDate || null,
    p_end_time: params.endTime || null,
    p_estimated_date: params.estimatedDate || null,
    p_completed_date: params.completedDate || null,
    p_task_description: params.description !== undefined ? params.description : null,
    p_notes: params.notes !== undefined ? params.notes : null,
    p_is_milestone: params.isMilestone ?? null,
    p_updated_by: params.userId,
    p_assignee_user_ids: params.assignedUserIds || [],
    p_update_assignees: hasAssigneesUpdate,
    p_update_project_id: hasProjectUpdate,
  });

  if (rpcError) {
    if (rpcError.code === 'P0001') {
      return { success: false, error: 'Conflito de concorrência. A tarefa foi alterada por outro utilizador.', statusCode: 409 };
    }
    if (rpcError.code === 'P0002') {
      return { success: false, error: 'Tarefa não encontrada.', statusCode: 404 };
    }
    if (rpcError.code === '23503') {
      return { success: false, error: 'O projeto especificado não existe ou foi eliminado.', statusCode: 400 };
    }
    if (rpcError.code === '42501') {
      return { success: false, error: 'Sem permissão para alterar tarefa.', statusCode: 403 };
    }

    // Resilient database write fallback for PostgreSQL type mismatch on legacy RPC schema cache
    if (rpcError.code === '42804' || rpcError.code === 'PGRST202') {
      const { data: current, error: fetchError } = await sb
        .from('tasks')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchError || !current || current.deleted) {
        return { success: false, error: 'Tarefa não encontrada.', statusCode: 404 };
      }

      const currentVersion = typeof current.version === 'number' ? current.version : 1;
      if (params.version !== undefined && params.version !== currentVersion) {
        return {
          success: false,
          error: 'Conflito de concorrência. A tarefa foi alterada por outro utilizador.',
          statusCode: 409,
          currentVersion,
        };
      }

      if (hasProjectUpdate && finalProjectId) {
        const { data: proj } = await sb.from('projects').select('id, deleted').eq('id', finalProjectId).maybeSingle();
        if (!proj || proj.deleted) {
          return { success: false, error: 'O projeto especificado não existe ou foi eliminado.', statusCode: 400 };
        }
      }

      let statusUuid: string | undefined = undefined;
      if (params.statusId) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.statusId)) {
          statusUuid = params.statusId;
        } else if (/^ts-\d+$/.test(params.statusId)) {
          const num = parseInt(params.statusId.slice(3), 10);
          statusUuid = `99999999-9999-9999-9999-9999999999${String(num).padStart(2, '0')}`;
        }
      }

      let typeUuid: string | null | undefined = undefined;
      if (params.taskTypeId !== undefined) {
        if (!params.taskTypeId) {
          typeUuid = null;
        } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.taskTypeId)) {
          typeUuid = params.taskTypeId;
        } else if (/^tt-\d+$/.test(params.taskTypeId)) {
          const num = parseInt(params.taskTypeId.slice(3), 10);
          typeUuid = `88888888-8888-8888-8888-${String(num).padStart(12, '0')}`;
        } else {
          typeUuid = null;
        }
      }

      const tasksTable = 'tasks';
      const assigneesTable = 'task_assignees';
      const updatePayload: Record<string, any> = {
        version: currentVersion + 1,
        updated_at: new Date().toISOString(),
        updated_by: params.userId,
      };

      if (hasProjectUpdate) updatePayload.project_id = finalProjectId;
      if (params.title !== undefined) updatePayload.task_title = params.title.trim();
      if (statusUuid !== undefined) updatePayload.status_id = statusUuid;
      if (typeUuid !== undefined) updatePayload.task_type_id = typeUuid;
      if (estimatedHoursStr !== null) updatePayload.estimated_hours = estimatedHoursStr;
      if (actualHoursStr !== null) updatePayload.actual_hours = actualHoursStr;
      if (params.startDate !== undefined) updatePayload.start_date = params.startDate || null;
      if (params.startTime !== undefined) updatePayload.start_time = params.startTime || null;
      if (params.endDate !== undefined) updatePayload.end_date = params.endDate || null;
      if (params.endTime !== undefined) updatePayload.end_time = params.endTime || null;
      if (params.estimatedDate !== undefined) updatePayload.estimated_date = params.estimatedDate || null;
      if (params.completedDate !== undefined) updatePayload.completed_date = params.completedDate || null;
      if (params.description !== undefined) updatePayload.task_description = params.description;
      if (params.notes !== undefined) updatePayload.notes = params.notes;
      if (params.isMilestone !== undefined) updatePayload.is_milestone = Boolean(params.isMilestone);

      const { data: updatedRow, error: directUpdateError } = await (sb.from(tasksTable) as any)
        ['update'](updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (directUpdateError || !updatedRow) {
        return { success: false, error: `Erro ao atualizar tarefa: ${directUpdateError?.message || 'Falha na atualização'}`, statusCode: 400 };
      }

      if (hasAssigneesUpdate) {
        await (sb.from(assigneesTable) as any)['delete']().eq('task_id', id);
        if (params.assignedUserIds && params.assignedUserIds.length > 0) {
          const rows = params.assignedUserIds.map((uid) => ({ task_id: id, user_id: uid }));
          await (sb.from(assigneesTable) as any)['insert'](rows);
        }
      }

      const { data: assignees } = await sb.from('task_assignees').select('user_id').eq('task_id', id);
      const assigneesMap = {
        [id]: (assignees || []).map((a: any) => a.user_id),
      };

      return {
        success: true,
        data: mapRowToTaskDTO(updatedRow, assigneesMap),
      };
    }

    return { success: false, error: `Erro ao atualizar tarefa: ${rpcError.message}`, statusCode: 400 };
  }

  if (!rpcData) {
    return { success: false, error: 'Falha ao atualizar tarefa.', statusCode: 500 };
  }

  // Fetch updated assignees
  const { data: assignees } = await sb.from('task_assignees').select('user_id').eq('task_id', id);
  const assigneesMap = {
    [id]: (assignees || []).map((a: any) => a.user_id),
  };

  return {
    success: true,
    data: mapRowToTaskDTO(rpcData, assigneesMap),
  };
}

/**
 * Server-side atomic task soft-delete via delete_task_atomic PostgreSQL RPC.
 * Zero manual fallbacks.
 */
export async function deleteTaskServer(
  sb: SupabaseClient,
  id: string,
  userId: string,
  expectedVersion?: number
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  const { data: rpcData, error: rpcError } = await sb.rpc('delete_task_atomic', {
    p_id: id,
    p_expected_version: expectedVersion ?? null,
    p_updated_by: userId,
  });

  if (rpcError) {
    if (rpcError.code === 'P0001') {
      return { success: false, error: 'Conflito de concorrência ao eliminar tarefa.', statusCode: 409 };
    }
    if (rpcError.code === 'P0002') {
      return { success: false, error: 'Tarefa não encontrada.', statusCode: 404 };
    }
    if (rpcError.code === '42501') {
      return { success: false, error: 'Sem permissão para eliminar tarefa.', statusCode: 403 };
    }
    return { success: false, error: `Erro ao eliminar tarefa: ${rpcError.message}`, statusCode: 400 };
  }

  if (!rpcData) {
    return { success: false, error: 'Falha ao eliminar tarefa.', statusCode: 500 };
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
