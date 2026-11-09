import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createConfigActions({ saveState, genId }: Pick<LegacyActionContext, 'saveState' | 'genId'>) {
  // ==================== APP CONFIGURATION ====================
  const updateConfig = (updates: Record<string, any>) => {
    return saveState(prev => ({
      ...prev,
      appConfig: { ...prev.appConfig, ...updates }
    }));
  };

  // ==================== AUX TABLES CRUD ====================
  type AuxTableName = 'projectStatuses' | 'projectCategories' | 'projectRisks' | 'projectPriorities' | 'projectTeams' | 'projectPartners' | 'userGroups' | 'taskStatuses' | 'taskTypes' | 'riskCategories' | 'riskStatuses' | 'riskPriorities';

  const addAuxRecord = (tableName: AuxTableName, name: string, extra?: { scale?: number }) => {
    const isUUIDTable = ['taskTypes', 'taskStatuses', 'userGroups', 'projectCategories', 'projectStatuses', 'projectRisks', 'projectPriorities', 'projectTeams', 'projectPartners', 'riskCategories', 'riskStatuses', 'riskPriorities'].includes(tableName);
    const prefix = tableName === 'taskTypes' ? 'tt' : tableName === 'taskStatuses' ? 'ts' : tableName.slice(0, 3);
    const id = isUUIDTable ? crypto.randomUUID() : genId(prefix);

    saveState(prev => {
      const newRecord = {
        id,
        name,
        deleted: false,
        sort_order: (prev[tableName] as any[] || []).length,
        ...(extra || {})
      };
      return {
        ...prev,
        [tableName]: [...(prev[tableName] as any[] || []), newRecord]
      };
    });
  };

  const updateAuxRecord = (tableName: AuxTableName, id: string, updates: any) => {
    saveState(prev => ({
      ...prev,
      [tableName]: (prev[tableName] as any[] || []).map(item => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  const deleteAuxRecord = (tableName: AuxTableName, id: string) => {
    saveState(prev => ({
      ...prev,
      [tableName]: (prev[tableName] as any[] || []).map(item => item.id === id ? { ...item, deleted: true } : item)
    }));
  };

  const reorderAuxRecords = (tableName: AuxTableName, newItems: any[]) => {
    saveState(prev => ({
      ...prev,
      [tableName]: newItems.map((item, index) => ({ ...item, sort_order: index }))
    }));
  };

  return { updateConfig, addAuxRecord, updateAuxRecord, deleteAuxRecord, reorderAuxRecords };
}
