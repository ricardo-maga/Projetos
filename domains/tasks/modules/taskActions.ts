import type { Task } from '@/lib/types';
import { clearClientSession } from '@/lib/clientAuth';
import { getDefaultTaskStatusId, matchTaskStatusId } from '@/lib/utils';
import { apiCreateTask, apiUpdateTask, apiDeleteTask, parseTaskHoursToFloat } from '@/domains/tasks/modules/taskOperations';
import type { Dispatch, SetStateAction } from 'react';
import type { ERPState } from '@/lib/types';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface ActionContext {
  isDbConfigured: boolean;
  state: ERPState | null;
  setState: Dispatch<SetStateAction<ERPState | null>>;
  setSyncStatus: Dispatch<SetStateAction<SyncStatus>>;
  setSyncError: Dispatch<SetStateAction<string | null>>;
  logAudit: (action: string, entityType: string, entityId?: string, entityName?: string, details?: string) => unknown;
  refreshFromDatabase: () => Promise<boolean>;
  getApiErrorMessage: (result: any, fallback: string) => string;
}

export function createTaskActions({
  isDbConfigured, state, setState, setSyncStatus, setSyncError, logAudit, refreshFromDatabase, getApiErrorMessage,
}: ActionContext) {
  // ==================== TASKS CRUD ====================
  const parseHoursToFloat = (hoursStr: any): number => {
    return parseTaskHoursToFloat(hoursStr);
  };

  const addTask = async (task: Omit<Task, 'id' | 'deleted' | 'createdDate'>) => {
    const now = new Date().toISOString();

    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada.';
      setSyncStatus('error');
      setSyncError(msg);
      throw new Error(msg);
    }

    const resolvedStatusId = (() => {
      if (task.statusId && task.statusId !== 'ts-1') {
        const match = (state?.taskStatuses || []).find(s => s.id === task.statusId || matchTaskStatusId(s.id, task.statusId));
        if (match) return match.id;
        return task.statusId;
      }
      return getDefaultTaskStatusId(state?.taskStatuses || []);
    })();

    try {
      setSyncStatus('syncing');
      setSyncError(null);

      const opResult = await apiCreateTask({
        projectId: task.projectId,
        title: task.title,
        description: task.description || '',
        statusId: resolvedStatusId,
        taskTypeId: task.taskTypeId || undefined,
        priorityId: task.priorityId || null,
        estimatedHours: task.estimatedHours,
        actualHours: task.actualHours,
        startDate: task.startDate || undefined,
        startTime: task.startTime || undefined,
        endDate: task.endDate || undefined,
        endTime: task.endTime || undefined,
        estimatedDate: task.estimatedDate || undefined,
        notes: task.notes || undefined,
        assigneeIds: task.assigneeIds || [],
      });

      if (opResult.success && opResult.data) {
        const newTask: Task = opResult.data;

        logAudit('CREATE', 'TASK', newTask.id, newTask.title, `Criada a tarefa "${newTask.title}"`);

        setState(prev => {
          if (!prev) return prev;
          let newTasks = [newTask, ...prev.tasks];
          let newProjects = prev.projects;

          return {
            ...prev,
            tasks: newTasks,
            projects: newProjects,
          };
        });
        await refreshFromDatabase();

        setSyncStatus('synced');
        return newTask;
      } else {
        const errMsg = opResult.error || `A base de dados rejeitou a criação da tarefa.`;
        console.error('Erro na criação da tarefa:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        if (opResult.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message: errMsg } }));
          }
        }
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção na criação da tarefa:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de tarefas.';
      setSyncStatus('error');
      setSyncError(errMsg);
      throw err;
    }
  };

  const addTasks = async (tasksList: Omit<Task, 'id' | 'deleted' | 'createdDate'>[]) => {
    const results: Task[] = [];
    for (const t of tasksList) {
      const created = await addTask(t);
      results.push(created);
    }
    return results;
  };

  const updateTask = async (id: string, updates: Partial<Omit<Task, 'id' | 'createdDate'>>) => {
    const now = new Date().toISOString();

    const existingTask = state?.tasks?.find(t => t.id === id);
    if (!existingTask) {
      throw new Error(`Tarefa ${id} não encontrada localmente.`);
    }

    const currentVersion = (existingTask as any).version || 1;
    const taskTitle = updates.title || existingTask.title || id;

    try {
      setSyncStatus('syncing');
      setSyncError(null);

      const opResult = await apiUpdateTask(id, {
        version: currentVersion,
        projectId: updates.projectId,
        title: updates.title,
        description: updates.description,
        statusId: updates.statusId,
        taskTypeId: updates.taskTypeId,
        priorityId: updates.priorityId,
        estimatedHours: updates.estimatedHours,
        actualHours: updates.actualHours,
        startDate: updates.startDate,
        startTime: updates.startTime,
        endDate: updates.endDate,
        endTime: updates.endTime,
        estimatedDate: updates.estimatedDate,
        completedDate: updates.completedDate,
        notes: updates.notes,
        assigneeIds: updates.assigneeIds,
      });

      if (opResult.status === 409 || !opResult.success || !opResult.data) {
        const errMsg = opResult.error || 'Conflito de concorrência ou erro ao atualizar tarefa.';
        setSyncStatus('error');
        setSyncError(errMsg);
        if (opResult.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message: errMsg } }));
          }
        }
        throw new Error(errMsg);
      }

      const updatedTask = opResult.data;
      const nextVersion = updatedTask.version || (currentVersion + 1);

      let detailMsg = `Atualizada tarefa "${taskTitle}"`;
      if (updates.statusId && updates.statusId !== existingTask.statusId) {
        const oldStatus = state?.taskStatuses?.find(s => s.id === existingTask.statusId || matchTaskStatusId(s.id, existingTask.statusId))?.name || existingTask.statusId;
        const newStatus = state?.taskStatuses?.find(s => s.id === updates.statusId || matchTaskStatusId(s.id, updates.statusId))?.name || updates.statusId;
        detailMsg = `Estado da tarefa "${taskTitle}" alterado de "${oldStatus}" para "${newStatus}"`;
      } else if (updates.title && updates.title !== existingTask.title) {
        detailMsg = `Título da tarefa alterado de "${existingTask.title}" para "${updates.title}"`;
      }
      logAudit('UPDATE', 'TASK', id, taskTitle, detailMsg);

      setState(prev => {
        if (!prev) return prev;
        let newTasks = prev.tasks.map(t => {
          if (t.id === id) {
            return updatedTask;
          }
          return t;
        });
        let newProjects = prev.projects;

        return {
          ...prev,
          tasks: newTasks,
          projects: newProjects,
        };
      });

      await refreshFromDatabase();
      setSyncStatus('synced');
      return true;
    } catch (err: any) {
      console.error('Exceção na atualização da tarefa:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de tarefas.';
      setSyncStatus('error');
      setSyncError(errMsg);
      throw err;
    }
  };

  const deleteTask = async (id: string) => {
    const existingTask = state?.tasks?.find(t => t.id === id);
    if (!existingTask) return;

    try {
      setSyncStatus('syncing');
      setSyncError(null);

      const opResult = await apiDeleteTask(id);

      if (opResult.success) {
        logAudit('DELETE', 'TASK', id, existingTask?.title, `Eliminada a tarefa "${existingTask?.title || id}"`);
        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map(t => t.id === id ? { ...t, deleted: true } : t)
          };
        });
        setSyncStatus('synced');
        return true;
      } else {
        const errMsg = opResult.error || `A base de dados rejeitou a eliminação da tarefa.`;
        console.error('Erro ao eliminar tarefa:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        if (opResult.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message: errMsg } }));
          }
        }
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção ao eliminar tarefa:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de tarefas.';
      setSyncStatus('error');
      setSyncError(errMsg);
      throw err;
    }
  };

  return { addTask, addTasks, updateTask, deleteTask };
}
