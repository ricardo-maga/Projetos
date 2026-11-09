import { getAuthHeaders, clearClientSession } from '@/lib/clientAuth';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createDefaultTaskActions({ state, setState, setSyncStatus, setSyncError, isDbConfigured, deleteSyncedEntity, loadDefaultTasks, getApiErrorMessage }: Pick<LegacyActionContext, 'state' | 'setState' | 'setSyncStatus' | 'setSyncError' | 'isDbConfigured' | 'deleteSyncedEntity' | 'loadDefaultTasks' | 'getApiErrorMessage'>) {
  // ==================== DEFAULT TASKS ====================
  const writeDefaultTask = async (url: string, method: 'POST' | 'PATCH', payload: Record<string, unknown>) => {
    if (!isDbConfigured) return { success: false, message: 'A base de dados não está configurada.' };
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const response = await fetch(url, {
        method, headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true || !result.data?.id) {
        const message = getApiErrorMessage(result, 'Não foi possível guardar o template de tarefa.');
        if (response.status === 409) void loadDefaultTasks();
        if (response.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message } }));
        }
        setSyncStatus('error');
        setSyncError(message);
        return { success: false, message };
      }
      setState(prev => prev ? ({ ...prev, defaultTasks: method === 'POST'
        ? [...(prev.defaultTasks || []), result.data]
        : (prev.defaultTasks || []).map(task => task.id === result.data.id ? result.data : task) }) : prev);
      setSyncStatus('synced');
      return { success: true };
    } catch {
      const message = 'Falha de comunicação ao guardar o template de tarefa.';
      setSyncStatus('error');
      setSyncError(message);
      return { success: false, message };
    }
  };

  const addDefaultTask = (title: string, description: string, estimatedHours: string, taskTypeId?: string) =>
    writeDefaultTask('/api/supabase/default-tasks', 'POST', { title, description, estimatedHours, taskTypeId });

  const updateDefaultTask = (id: string, updates: Partial<{ title: string; description: string; estimatedHours: string; taskTypeId?: string }>) => {
    const current = state?.defaultTasks?.find(task => task.id === id);
    if (!current?.syncVersion) return Promise.resolve({ success: false, message: 'Recarregue os templates de tarefas antes de alterar.' });
    return writeDefaultTask(`/api/supabase/default-tasks/${id}`, 'PATCH', {
      ...updates,
      ...(Object.hasOwn(updates, 'taskTypeId') ? { taskTypeId: updates.taskTypeId ?? null } : {}),
      syncVersion: current.syncVersion,
    });
  };

  const deleteDefaultTask = (id: string) => deleteSyncedEntity('defaultTasks', id);

  return { addDefaultTask, updateDefaultTask, deleteDefaultTask };
}
