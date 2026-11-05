import type { ERPState } from '../types';
import { CLEAN_BASELINE_STATE } from '../cleanDefaults';

// These are transport partitions for the presentation cache. Operational
// collections are loaded independently of the shared reference directory.
export const SYNC_PARTITIONS = {
  directory: [
    'userGroups', 'activeRoles', 'projectStatuses', 'projectCategories',
    'projectRisks', 'projectPriorities', 'projectTeams', 'projectPartners',
    'taskStatuses', 'taskTypes', 'users', 'appConfig', 'specialDays',
    'riskCategories', 'riskStatuses', 'riskPriorities',
  ],
  work: ['clients', 'projects', 'tasks'],
  activity: ['comments', 'userAbsences', 'projectRiskItems', 'notifications'],
} as const satisfies Record<string, readonly (keyof ERPState)[]>;

export type SyncPartition = keyof typeof SYNC_PARTITIONS;

export function isSyncPartition(value: string): value is SyncPartition {
  return Object.hasOwn(SYNC_PARTITIONS, value);
}

export function mergeSyncPartitions(parts: Record<SyncPartition, unknown>): ERPState {
  const combined: Record<string, unknown> = { ...CLEAN_BASELINE_STATE };
  for (const [partition, fields] of Object.entries(SYNC_PARTITIONS)) {
    const data = parts[partition as SyncPartition];
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error(`Resposta inválida da partição ${partition}.`);
    for (const field of fields) {
      if (!Object.hasOwn(data, field)) throw new Error(`Campo obrigatório ausente: ${field}.`);
      const value = (data as Record<string, unknown>)[field];
      if (field === 'appConfig') {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('Configuração da aplicação inválida.');
      } else if (!Array.isArray(value)) {
        throw new Error(`Coleção inválida: ${field}.`);
      }
      combined[field] = value;
    }
  }
  return combined as unknown as ERPState;
}
