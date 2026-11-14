import { getAuthHeaders } from '@/lib/clientAuth';
import type { UserAbsence } from '@/lib/types';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createAbsenceActions({ setState, deleteSyncedEntity }: Pick<LegacyActionContext, 'setState' | 'deleteSyncedEntity'>) {
  // ==================== ABSENCES CRUD ====================
  const addAbsence = async (absence: Omit<UserAbsence, 'id' | 'createdDate'>) => {
    try {
      const response = await fetch('/api/v1/absences', {
        method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(absence),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || !result.data?.id)
        return { success: false, message: result.message || 'Não foi possível criar a ausência.' };
      setState(prev => prev ? { ...prev, userAbsences: [result.data as UserAbsence, ...prev.userAbsences] } : prev);
      return { success: true };
    } catch {
      return { success: false, message: 'Falha de comunicação ao criar a ausência.' };
    }
  };

  const deleteAbsence = (id: string) => deleteSyncedEntity('userAbsences', id);

  return { addAbsence, deleteAbsence };
}
