import type { UserAbsence } from '@/lib/types';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createAbsenceActions({ saveState, deleteSyncedEntity }: Pick<LegacyActionContext, 'saveState' | 'deleteSyncedEntity'>) {
  // ==================== ABSENCES CRUD ====================
  const addAbsence = async (absence: Omit<UserAbsence, 'id' | 'createdDate'>) => {
    const newAbsence: UserAbsence = {
      ...absence,
      id: crypto.randomUUID(),
      createdDate: new Date().toISOString()
    };
    return await saveState(prev => ({
      ...prev,
      userAbsences: [newAbsence, ...prev.userAbsences]
    }));
  };

  const deleteAbsence = (id: string) => deleteSyncedEntity('userAbsences', id);

  return { addAbsence, deleteAbsence };
}
