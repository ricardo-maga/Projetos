// Global configuration is never writable through a non-administrative snapshot.
export const ADMIN_SYNC_FIELDS = [
  'users', 'userGroups', 'appConfig', 'ticketStatuses', 'automationRules',
  'projectStatuses', 'projectCategories', 'projectRisks', 'projectPriorities',
  'projectTeams', 'projectPartners', 'taskStatuses', 'taskTypes', 'riskCategories',
  'riskStatuses', 'riskPriorities', 'specialDays', 'defaultTasks',
] as const;

export function stripAdministrativeSyncFields(state: Record<string, unknown>) {
  for (const field of ADMIN_SYNC_FIELDS) delete state[field];
}

export const SYNC_DOMAIN_PERMISSIONS = {
  comments: ['projects:write', 'projects:delete'],
  projectRiskItems: ['projects:write', 'projects:delete'],
  projectMaterials: ['materials:write', 'materials:delete'],
  materials: ['materials:write', 'materials:delete'],
  quotes: ['quotes:write', 'quotes:delete'],
  billOfMaterials: ['quotes:write', 'quotes:delete'],
  equipmentList: ['equipment:write', 'equipment:delete'],
  userAbsences: ['absences:write', 'absences:delete'],
  tickets: ['tickets:write', 'tickets:delete'],
  notifications: ['config:write', 'config:write'],
} as const;

export function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => JSON.stringify(k) + ':' + stable(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}

// A snapshot is not a delete command. Compare records by id, not list ordering.
export function changedSyncRecords(incoming: unknown, current: unknown): Record<string, unknown>[] {
  if (!Array.isArray(incoming) || incoming.some(row => !row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string'))
    throw new Error('Coleção de sincronização inválida.');
  if (new Set(incoming.map(row => row.id)).size !== incoming.length) throw new Error('IDs duplicados na sincronização.');
  const existing = new Map((Array.isArray(current) ? current : []).map(row => [row.id, row]));
  return incoming.filter(row => stable(row) !== stable(existing.get(row.id)));
}

export function isOwnNotificationReadChange(row: Record<string, unknown>, current: unknown, userId: string): boolean {
  const old = (Array.isArray(current) ? current : []).find(item => item.id === row.id);
  return Boolean(old && old.userId === userId && row.userId === userId && typeof row.isRead === 'boolean'
    && stable({ ...row, isRead: old.isRead }) === stable(old));
}

// Compare with the client's prior cache to express intent, not with a newer
// server snapshot. Unrelated stale cache rows must not become writes.
export function buildLegacySyncPayload(previous: Record<string, any>, next: Record<string, any>) {
  const payload: Record<string, unknown> = {};
  for (const field of new Set<string>([...ADMIN_SYNC_FIELDS, ...Object.keys(SYNC_DOMAIN_PERMISSIONS)])) {
    if (next[field] === undefined) continue;
    if (field === 'appConfig') {
      if (stable(next[field]) !== stable(previous[field])) payload[field] = next[field];
    } else {
      const changes = changedSyncRecords(next[field], previous[field]);
      if (changes.length) payload[field] = changes;
    }
  }
  return payload;
}
