import { Task } from './types';
import { getAuthHeaders, getApiErrorMessage } from './clientAuth';
import { getTaskConflictWarnings, TaskConflictParams } from './taskConflicts';

export { getTaskConflictWarnings, type TaskConflictParams };

export interface TaskConflictCheckParams {
  taskId?: string;
  date?: string | null;
  hours?: number | string;
  assigneeIds?: string[];
}

/**
 * Checks if assigning a task with given hours and date causes an assignee to exceed 8h on that day
 */
export function checkTaskConflicts(
  params: TaskConflictCheckParams,
  existingTasks: Task[] = []
): { hasConflict: boolean; warnings: string[] } {
  const { taskId, date, hours = 0, assigneeIds = [] } = params;
  if (!date || !assigneeIds || assigneeIds.length === 0) {
    return { hasConflict: false, warnings: [] };
  }

  const newHours = parseTaskHoursToFloat(hours);
  const warnings: string[] = [];

  for (const userId of assigneeIds) {
    const dayTasks = existingTasks.filter(t => {
      if (t.deleted) return false;
      if (taskId && t.id === taskId) return false;
      if (t.estimatedDate !== date) return false;
      const ids: string[] = t.assigneeIds && t.assigneeIds.length > 0
        ? t.assigneeIds
        : ((t as any).assignedTo ? [(t as any).assignedTo] : []);
      return ids.includes(userId);
    });

    const currentTotalHours = dayTasks.reduce((acc, t) => {
      return acc + parseTaskHoursToFloat(t.estimatedHours);
    }, 0);

    const totalWithNew = currentTotalHours + newHours;
    if (totalWithNew > 8) {
      warnings.push(`Utilizador ultrapassa 8h no dia ${date} (Total: ${totalWithNew}h)`);
    }
  }

  return {
    hasConflict: warnings.length > 0,
    warnings,
  };
}

export interface TaskCreateInput {
  projectId: string;
  title: string;
  description?: string;
  statusId?: string;
  taskTypeId?: string | null;
  estimatedHours?: number | string;
  actualHours?: number | string;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  estimatedDate?: string | null;
  completedDate?: string | null;
  notes?: string;
  assigneeIds?: string[];
}

export interface TaskUpdateInput {
  projectId?: string;
  title?: string;
  description?: string;
  statusId?: string;
  taskTypeId?: string | null;
  estimatedHours?: number | string;
  actualHours?: number | string;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  estimatedDate?: string | null;
  completedDate?: string | null;
  notes?: string;
  assigneeIds?: string[];
  version?: number;
}

export interface TaskOperationResult<T = Task> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  isConflict?: boolean;
}

/**
 * Parses hours string (e.g. "08:00", "4.5", "4") to a non-negative float
 */
export function parseTaskHoursToFloat(hoursStr: string | number | undefined | null): number {
  if (hoursStr === undefined || hoursStr === null || hoursStr === '') return 0;
  if (typeof hoursStr === 'number') return Math.max(0, hoursStr);
  const trimmed = String(hoursStr).trim();
  if (trimmed.includes(':')) {
    const [h, m] = trimmed.split(':').map(Number);
    const val = (isNaN(h) ? 0 : h) + (isNaN(m) ? 0 : m / 60);
    return Math.max(0, Math.round(val * 100) / 100);
  }
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

/**
 * Alias for parseTaskHoursToFloat
 */
export const parseTaskHours = parseTaskHoursToFloat;

/**
 * Normalizes task hours for display (e.g. "08:00" -> "8" or "8.5")
 */
export function formatTaskHoursToString(hours: number | string | undefined | null): string {
  const num = parseTaskHoursToFloat(hours);
  return num === 0 ? '0' : String(num);
}

/**
 * Deterministically normalizes the server task API response into a Task object.
 * Strictly uses server-returned properties and avoids creating synthetic timestamps, versions or fallback values.
 */
export function normalizeTaskFromApiResponse(data: any): Task {
  if (!data || typeof data !== 'object') {
    throw new Error('Dados inválidos retornados pela API de tarefas.');
  }

  const assigneeIds: string[] = Array.isArray(data.assignedUserIds)
    ? data.assignedUserIds
    : (Array.isArray(data.assigneeIds) ? data.assigneeIds : []);

  return {
    id: data.id,
    projectId: data.projectId || data.project_id || '',
    title: data.title || data.task_title || '',
    description: data.description !== undefined ? data.description : (data.task_description || ''),
    statusId: data.statusId || data.status_id || '',
    taskTypeId: data.taskTypeId || data.task_type_id || undefined,
    estimatedHours: data.estimatedHours !== undefined ? String(data.estimatedHours) : (data.estimated_hours !== undefined ? String(data.estimated_hours) : '0'),
    actualHours: data.actualHours !== undefined ? String(data.actualHours) : (data.actual_hours !== undefined ? String(data.actual_hours) : '0'),
    startDate: data.startDate || data.start_date || undefined,
    startTime: data.startTime || data.start_time || undefined,
    endDate: data.endDate || data.end_date || undefined,
    endTime: data.endTime || data.end_time || undefined,
    estimatedDate: data.estimatedDate || data.estimated_date || undefined,
    completedDate: data.completedDate || data.completed_date || undefined,
    notes: data.notes !== undefined ? data.notes : undefined,
    assigneeIds,
    deleted: Boolean(data.deleted),
    version: typeof data.version === 'number' ? data.version : (Number(data.version) || 1),
    createdDate: data.createdAt || data.created_at || data.createdDate || '',
  };
}

/**
 * Centralized API call to fetch a task via /api/v1/tasks/:id
 */
export async function apiGetTask(id: string): Promise<TaskOperationResult<Task>> {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`/api/v1/tasks/${id}`, {
      method: 'GET',
      headers,
    });

    const result = await res.json().catch(() => ({
      success: false,
      message: 'Resposta inválida do servidor.',
    }));

    if (res.ok && result.success && result.data) {
      const task = normalizeTaskFromApiResponse(result.data);
      return { success: true, data: task, status: res.status };
    }

    const errMsg = getApiErrorMessage(result, `Erro ao obter tarefa (${res.status}).`);
    return { success: false, error: errMsg, status: res.status };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Falha de comunicação com a API de tarefas.',
      status: 500,
    };
  }
}

export interface TaskExecutionTimesInput {
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
}

/**
 * Validates execution dates and times:
 * - If both startDate and endDate are present, endDate cannot be before startDate
 * - If on the same date and both startTime and endTime are present, endTime must be strictly after startTime
 */
export function validateTaskExecutionTimes(
  inputOrStartTime?: TaskExecutionTimesInput | string | null,
  endTime?: string | null
): { valid: boolean; isValid: boolean; error?: string } {
  let startDate: string | undefined;
  let startTime: string | undefined;
  let endDate: string | undefined;
  let endT: string | undefined;

  if (typeof inputOrStartTime === 'object' && inputOrStartTime !== null) {
    startDate = inputOrStartTime.startDate?.trim() || undefined;
    startTime = inputOrStartTime.startTime?.trim() || undefined;
    endDate = inputOrStartTime.endDate?.trim() || undefined;
    endT = inputOrStartTime.endTime?.trim() || undefined;
  } else {
    startTime = typeof inputOrStartTime === 'string' ? inputOrStartTime.trim() : undefined;
    endT = typeof endTime === 'string' ? endTime.trim() : undefined;
  }

  // 1. Date comparison
  if (startDate && endDate) {
    if (endDate < startDate) {
      return {
        valid: false,
        isValid: false,
        error: 'A data de fim não pode ser anterior à data de início.',
      };
    }
  }

  // 2. Time comparison
  if (startTime && endT) {
    const isSameDay = !startDate || !endDate || startDate === endDate;
    if (isSameDay && endT <= startTime) {
      return {
        valid: false,
        isValid: false,
        error: 'A hora de fim deve ser estritamente posterior à hora de início.',
      };
    }
  }

  return { valid: true, isValid: true };
}

/**
 * Centralized API call to create a task via /api/v1/tasks
 */
export async function apiCreateTask(input: TaskCreateInput): Promise<TaskOperationResult<Task>> {
  // Validate times
  const timeVal = validateTaskExecutionTimes(input.startTime, input.endTime);
  if (!timeVal.valid) {
    return { success: false, error: timeVal.error, status: 400 };
  }

  const payload = {
    projectId: input.projectId.trim(),
    title: input.title.trim(),
    description: input.description?.trim() || '',
    statusId: input.statusId || undefined,
    taskTypeId: input.taskTypeId || undefined,
    estimatedHours: parseTaskHoursToFloat(input.estimatedHours),
    actualHours: parseTaskHoursToFloat(input.actualHours),
    startDate: input.startDate || undefined,
    startTime: input.startTime || undefined,
    endDate: input.endDate || undefined,
    endTime: input.endTime || undefined,
    estimatedDate: input.estimatedDate || undefined,
    completedDate: input.completedDate || undefined,
    notes: input.notes || undefined,
    assignedUserIds: input.assigneeIds || [],
  };

  try {
    const headers = {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    };
    const res = await fetch('/api/v1/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await res.json().catch(() => ({
      success: false,
      message: 'Resposta inválida do servidor.',
    }));

    if (res.ok && result.success && result.data) {
      const createdTask = normalizeTaskFromApiResponse(result.data);
      return { success: true, data: createdTask, status: res.status };
    }

    const errMsg = getApiErrorMessage(result, `Erro ao criar tarefa (${res.status}).`);
    return { success: false, error: errMsg, status: res.status };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Falha de comunicação com a API de tarefas.',
      status: 500,
    };
  }
}

/**
 * Centralized API call to update a task via /api/v1/tasks/:id
 */
export async function apiUpdateTask(
  id: string,
  updates: TaskUpdateInput
): Promise<TaskOperationResult<Task>> {
  // Validate times if both are present in update or will be present
  const timeVal = validateTaskExecutionTimes(updates.startTime, updates.endTime);
  if (!timeVal.valid) {
    return { success: false, error: timeVal.error, status: 400 };
  }

  const patchPayload: Record<string, any> = {};
  if (updates.version !== undefined) patchPayload.version = updates.version;
  if (updates.projectId !== undefined) patchPayload.projectId = updates.projectId;
  if (updates.title !== undefined) patchPayload.title = updates.title.trim();
  if (updates.description !== undefined) patchPayload.description = updates.description;
  if (updates.statusId !== undefined) patchPayload.statusId = updates.statusId;
  if (updates.taskTypeId !== undefined) patchPayload.taskTypeId = updates.taskTypeId;
  if (updates.estimatedHours !== undefined) patchPayload.estimatedHours = parseTaskHoursToFloat(updates.estimatedHours);
  if (updates.actualHours !== undefined) patchPayload.actualHours = parseTaskHoursToFloat(updates.actualHours);
  if (updates.startDate !== undefined) patchPayload.startDate = updates.startDate;
  if (updates.startTime !== undefined) patchPayload.startTime = updates.startTime;
  if (updates.endDate !== undefined) patchPayload.endDate = updates.endDate;
  if (updates.endTime !== undefined) patchPayload.endTime = updates.endTime;
  if (updates.estimatedDate !== undefined) patchPayload.estimatedDate = updates.estimatedDate;
  if (updates.completedDate !== undefined) patchPayload.completedDate = updates.completedDate;
  if (updates.notes !== undefined) patchPayload.notes = updates.notes;
  if (updates.assigneeIds !== undefined) patchPayload.assignedUserIds = updates.assigneeIds;

  try {
    const headers = {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    };
    const res = await fetch(`/api/v1/tasks/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(patchPayload),
    });

    const result = await res.json().catch(() => ({
      success: false,
      message: 'Resposta inválida do servidor.',
    }));

    if (res.status === 409) {
      const errMsg = getApiErrorMessage(result, 'Conflito de concorrência ao atualizar tarefa (versão desfasada).');
      return { success: false, error: errMsg, status: 409, isConflict: true };
    }

    if (res.ok && result.success && result.data) {
      const updatedTask = normalizeTaskFromApiResponse(result.data);
      return { success: true, data: updatedTask, status: res.status };
    }

    const errMsg = getApiErrorMessage(result, `Erro ao atualizar tarefa (${res.status}).`);
    return { success: false, error: errMsg, status: res.status };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Falha de comunicação com a API de tarefas.',
      status: 500,
    };
  }
}

/**
 * Centralized API call to delete a task via /api/v1/tasks/:id
 */
export async function apiDeleteTask(id: string): Promise<TaskOperationResult<void>> {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`/api/v1/tasks/${id}`, {
      method: 'DELETE',
      headers,
    });

    const result = await res.json().catch(() => ({
      success: false,
      message: 'Resposta inválida do servidor.',
    }));

    if (res.ok && result.success) {
      return { success: true, status: res.status };
    }

    const errMsg = getApiErrorMessage(result, `Erro ao eliminar tarefa (${res.status}).`);
    return { success: false, error: errMsg, status: res.status };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Falha de comunicação com a API de tarefas.',
      status: 500,
    };
  }
}

