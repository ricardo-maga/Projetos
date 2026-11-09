import { createProjectMaterial as apiCreateProjectMaterial, updateProjectMaterial as apiUpdateProjectMaterial, deleteProjectMaterial as apiDeleteProjectMaterial } from '@/lib/projectMaterials/client';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createProjectMaterialActions({ state, setState, matchId }: Pick<LegacyActionContext, 'state' | 'setState' | 'matchId'>) {
  // ==================== PROJECT MATERIALS CRUD ====================
  const addProjectMaterial = async (pm: Omit<import('@/lib/types').ProjectMaterial, 'id' | 'deleted' | 'createdDate'>) => {
    const created = await apiCreateProjectMaterial(pm);
    setState(prev => prev ? ({ ...prev, projectMaterials: [created, ...(prev.projectMaterials || [])] }) : prev);
    return created;
  };

  const updateProjectMaterial = async (id: string, updates: Partial<Omit<import('@/lib/types').ProjectMaterial, 'id' | 'createdDate'>>) => {
    const current = state?.projectMaterials?.find(p => matchId(p.id, id));
    const updated = await apiUpdateProjectMaterial(id, { ...updates, syncVersion: current?.syncVersion });
    setState(prev => prev ? ({ ...prev,
      projectMaterials: (prev.projectMaterials || []).map(p => matchId(p.id, id) ? updated : p),
    }) : prev);
    return updated;
  };

  const deleteProjectMaterial = async (id: string) => {
    await apiDeleteProjectMaterial(id);
    setState(prev => prev ? ({ ...prev,
      projectMaterials: (prev.projectMaterials || []).filter(p => !matchId(p.id, id)),
    }) : prev);
  };

  return { addProjectMaterial, updateProjectMaterial, deleteProjectMaterial };
}
