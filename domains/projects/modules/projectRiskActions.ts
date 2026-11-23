import { authenticatedRequest, getAuthHeaders } from '@/lib/clientAuth';
import type { ProjectRiskItem } from '@/lib/types';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createProjectRiskActions({ state, setState, matchId, refreshFromDatabase }: Pick<LegacyActionContext, 'state' | 'setState' | 'matchId' | 'refreshFromDatabase'>) {
  const request = async (url: string, method: 'POST' | 'PATCH' | 'DELETE', payload: unknown) => {
    try {
      const response = await authenticatedRequest(url, {
        method, headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        if (response.status === 409) void refreshFromDatabase();
        return { success: false, message: result.message || 'Não foi possível guardar o risco.' };
      }
      if (method === 'POST') setState(prev => prev ? ({ ...prev, projectRiskItems: [result.data as ProjectRiskItem, ...(prev.projectRiskItems || [])] }) : prev);
      else if (method === 'PATCH') setState(prev => prev ? ({ ...prev, projectRiskItems: (prev.projectRiskItems || []).map(item => item.id === result.data.id ? result.data as ProjectRiskItem : item) }) : prev);
      else setState(prev => prev ? ({ ...prev, projectRiskItems: (prev.projectRiskItems || []).map(item => item.id === result.id ? { ...item, deleted: true } : item) }) : prev);
      return { success: true };
    } catch { return { success: false, message: 'Falha de comunicação ao guardar o risco.' }; }
  };
  const addProjectRiskItem = (risk: Omit<ProjectRiskItem, 'id' | 'deleted' | 'createdDate'>) =>
    request('/api/v1/projects/risks', 'POST', risk);
  const updateProjectRiskItem = (id: string, updates: Partial<Omit<ProjectRiskItem, 'id' | 'createdDate'>>) => {
    const current = state?.projectRiskItems?.find(item => matchId(item.id, id));
    if (!current?.syncVersion) return Promise.resolve({ success: false, message: 'Recarregue os riscos antes de alterar.' });
    return request(`/api/v1/projects/risks/${encodeURIComponent(id)}`, 'PATCH', { ...current, ...updates, syncVersion: current.syncVersion });
  };
  const deleteProjectRiskItem = (id: string) => {
    const current = state?.projectRiskItems?.find(item => matchId(item.id, id));
    if (!current?.syncVersion) return Promise.resolve({ success: false, message: 'Recarregue os riscos antes de eliminar.' });
    return request(`/api/v1/projects/risks/${encodeURIComponent(id)}`, 'DELETE', { syncVersion: current.syncVersion });
  };
  return { addProjectRiskItem, updateProjectRiskItem, deleteProjectRiskItem };
}
