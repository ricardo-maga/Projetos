import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createProjectRiskActions({ saveState, genId, matchId }: Pick<LegacyActionContext, 'saveState' | 'genId' | 'matchId'>) {
  // ==================== PROJECT RISK ITEMS CRUD ====================
  const addProjectRiskItem = (risk: Omit<import('@/lib/types').ProjectRiskItem, 'id' | 'deleted' | 'createdDate'>) => {
    const newRisk: import('@/lib/types').ProjectRiskItem = {
      ...risk,
      id: genId('pri'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    return saveState(prev => ({
      ...prev,
      projectRiskItems: [newRisk, ...(prev.projectRiskItems || [])]
    }));
  };

  const updateProjectRiskItem = (id: string, updates: Partial<Omit<import('@/lib/types').ProjectRiskItem, 'id' | 'createdDate'>>) => {
    return saveState(prev => ({
      ...prev,
      projectRiskItems: (prev.projectRiskItems || []).map(r => matchId(r.id, id) ? { ...r, ...updates } as import('@/lib/types').ProjectRiskItem : r)
    }));
  };

  const deleteProjectRiskItem = (id: string) => {
    return saveState(prev => ({
      ...prev,
      projectRiskItems: (prev.projectRiskItems || []).map(r => matchId(r.id, id) ? { ...r, deleted: true } : r)
    }));
  };

  return { addProjectRiskItem, updateProjectRiskItem, deleteProjectRiskItem };
}
