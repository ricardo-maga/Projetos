import type { SpecialDay } from '@/lib/types';
import { getAuthHeaders, clearClientSession } from '@/lib/clientAuth';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createSpecialDayActions({ state, setState, setSyncStatus, setSyncError, isDbConfigured, deleteSyncedEntity, refreshFromDatabase, getApiErrorMessage }: Pick<LegacyActionContext, 'state' | 'setState' | 'setSyncStatus' | 'setSyncError' | 'isDbConfigured' | 'deleteSyncedEntity' | 'refreshFromDatabase' | 'getApiErrorMessage'>) {
  // ==================== SPECIAL DAYS ====================
  const writeSpecialDay = async (url: string, method: 'POST' | 'PATCH', payload: Record<string, unknown>) => {
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
        const message = getApiErrorMessage(result, 'Não foi possível guardar o dia especial.');
        if (response.status === 409) void refreshFromDatabase();
        if (response.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message } }));
        }
        setSyncStatus('error');
        setSyncError(message);
        return { success: false, message };
      }
      setState(prev => prev ? ({ ...prev, specialDays: method === 'POST'
        ? [...(prev.specialDays || []), result.data]
        : (prev.specialDays || []).map(day => day.id === result.data.id ? result.data : day) }) : prev);
      setSyncStatus('synced');
      return { success: true };
    } catch {
      const message = 'Falha de comunicação ao guardar o dia especial.';
      setSyncStatus('error');
      setSyncError(message);
      return { success: false, message };
    }
  };

  const addSpecialDay = (date: string, name: string) =>
    writeSpecialDay('/api/supabase/special-days', 'POST', { date, name });

  const updateSpecialDay = (id: string, updates: Partial<SpecialDay>) => {
    const current = state?.specialDays?.find(day => day.id === id);
    if (!current?.syncVersion) return Promise.resolve({ success: false, message: 'Recarregue os dias especiais antes de alterar.' });
    return writeSpecialDay(`/api/supabase/special-days/${id}`, 'PATCH', {
      date: updates.date, name: updates.name, syncVersion: current.syncVersion,
    });
  };

  const deleteSpecialDay = (id: string) => deleteSyncedEntity('specialDays', id);

  return { addSpecialDay, updateSpecialDay, deleteSpecialDay };
}
