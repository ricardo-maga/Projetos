import type { ERPState } from '../types';

// Existing legacy domains only. Projects, Tasks and their links are never allowed.
export const LEGACY_TABLE_FIELDS = {
  user_groups: 'userGroups', project_status: 'projectStatuses', project_category: 'projectCategories',
  project_risk: 'projectRisks', project_priority: 'projectPriorities', project_teams: 'projectTeams',
  project_partners: 'projectPartners', task_status: 'taskStatuses', task_types: 'taskTypes',
  users: 'users', material: 'materials', app_configuration: 'appConfig',
  project_materials: 'projectMaterials', project_risk_items: 'projectRiskItems', comments: 'comments',
  user_absences: 'userAbsences', quotes: 'quotes', bill_of_materials: 'billOfMaterials',
  equipment: 'equipmentList', special_days: 'specialDays', default_tasks: 'defaultTasks',
  risk_categories: 'riskCategories', risk_statuses: 'riskStatuses', risk_priorities: 'riskPriorities',
  ticket_statuses: 'ticketStatuses', notifications: 'notifications', automation_rules: 'automationRules', tickets: 'tickets',
} as const;

export type LegacyVersions = Record<string, Record<string, number>>;

export function createLegacyWriteBatch(database: any, source: ERPState) {
  const changes = new Map<string, { table_name: string; row: Record<string, unknown>; expected_version: number | null }>();
  const client = {
    from(table: string) {
      // Validation SELECTs still use the real database. All writes are buffered.
      return new Proxy({}, { get(_target, method) {
        if (method !== 'upsert') return (...args: any[]) => database.from(table)[method](...args);
        return async (rows: Record<string, unknown>[]) => {
          const field = LEGACY_TABLE_FIELDS[table as keyof typeof LEGACY_TABLE_FIELDS];
          if (!field) throw new Error(`Tabela fora do boundary legado: ${table}`);
          const values = (source as any)[field];
          for (const row of rows) {
            const original = Array.isArray(values) ? values.find(item => item.id === row.id) : values;
            const version = original?.syncVersion;
            changes.set(`${table}:${row.id}`, { table_name: table, row,
              expected_version: Number.isSafeInteger(version) && version > 0 ? version : null });
          }
          return { error: null };
        };
      } });
    },
  };
  return {
    client,
    async commit() {
      if (!changes.size) return { success: true, versions: {} as LegacyVersions };
      const { data, error } = await database.rpc('write_legacy_batch', { p_changes: [...changes.values()] });
      if (error && error.code !== 'PT409') console.error('Legacy atomic write rejected:', error.code, error.message);
      if (error) return { success: false, status: error.code === 'PT409' ? 409 : 500,
        message: error.code === 'PT409' ? 'Os dados foram alterados entretanto. Atualize a página antes de repetir.' : 'A base de dados rejeitou a gravação atómica.' };
      const versions: LegacyVersions = {};
      for (const entry of data || []) {
        const field = LEGACY_TABLE_FIELDS[entry.table_name as keyof typeof LEGACY_TABLE_FIELDS];
        (versions[field] ||= {})[entry.id] = entry.sync_version;
      }
      return { success: true, versions };
    },
  };
}

export function applyLegacyVersions(state: ERPState, versions: LegacyVersions): ERPState {
  const next = { ...state };
  for (const [field, byId] of Object.entries(versions)) {
    const value = (next as any)[field];
    if (Array.isArray(value)) (next as any)[field] = value.map(row => byId[row.id] > (row.syncVersion || 0) ? { ...row, syncVersion: byId[row.id] } : row);
    else if (value && field === 'appConfig' && Object.values(byId)[0] > (value.syncVersion || 0))
      (next as any)[field] = { ...value, syncVersion: Object.values(byId)[0] };
  }
  return next;
}
