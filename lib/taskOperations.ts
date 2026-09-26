import { Task } from './types';
import { getAuthHeaders, getApiErrorMessage } from './clientAuth';
import { getTaskConflictWarnings, TaskConflictParams } from './taskConflicts';

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
  const trimmed = hoursStr.trim();
  if (trimmed.includes(':')) {
    const [h, m] = trimmed.split(':').map(Number);
    const val = (isNaN(h) ? 0 : h) + (isNaN(m) ? 0 : m / 60);
    return Math.max(0, Math.round(val * 100) / 100);
  }
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

/**
 * Validates execution times: if both startTime and endTime are present, endTime must be strictly after startTime
 */
export function validateTaskExecutionTimes(
  startTime?: string | null,
  endTime?: string | null
): { valid: boolean; error?: string } {
  const s = startTime?.trim();
  const e = endTime?.trim();
  if (s && e) {
    if (e <= s) {
      return {
        valid: false,
        error: 'A hora de fim deve ser estritamente posterior à hora de início.',
      };
    }
  }
  return { valid: true };
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
      const createdTask: Task = {
        id: result.data.id,
        projectId: result.data.projectId,
        title: result.data.title,
        description: result.data.description || '',
        statusId: result.data.statusId,
        taskTypeId: result.data.taskTypeId || undefined,
        estimatedHours: result.data.estimatedHours !== undefined ? String(result.data.estimatedHours) : '0',
        actualHours: result.data.actualHours !== undefined ? String(result.data.actualHours) : '0',
        startDate: result.data.startDate || undefined,
        startTime: result.data.startTime || undefined,
        endDate: result.data.endDate || undefined,
        endTime: result.data.endTime || undefined,
        estimatedDate: result.data.estimatedDate || undefined,
        completedDate: result.data.completedDate || undefined,
        notes: result.data.notes || undefined,
        assigneeIds: result.data.assignedUserIds || input.assigneeIds || [],
        deleted: false,
        version: result.data.version || 1,
        createdDate: result.data.createdAt || new Date().toISOString(),
      };
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
      const updatedTask: Task = {
        id: result.data.id,
        projectId: result.data.projectId,
        title: result.data.title,
        description: result.data.description || '',
        statusId: result.data.statusId,
        taskTypeId: result.data.taskTypeId || undefined,
        estimatedHours: result.data.estimatedHours !== undefined ? String(result.data.estimatedHours) : '0',
        actualHours: result.data.actualHours !== undefined ? String(result.data.actualHours) : '0',
        startDate: result.data.startDate || undefined,
        startTime: result.data.startTime || undefined,
        endDate: result.data.endDate || undefined,
        endTime: result.data.endTime || undefined,
        estimatedDate: result.data.estimatedDate || undefined,
        completedDate: result.data.completedDate || undefined,
        notes: result.data.notes || undefined,
        assigneeIds: result.data.assignedUserIds || updates.assigneeIds || [],
        deleted: false,
        version: result.data.version || ((updates.version || 1) + 1),
        createdDate: result.data.createdAt || new Date().toISOString(),
      };
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

/**
 * Centralized forwarder for conflict detection warnings
 */
export function checkTaskConflicts(params: TaskConflictParams): string[] {
  return getTaskConflictWarnings(params);
}
