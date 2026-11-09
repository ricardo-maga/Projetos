import type { Dispatch, SetStateAction } from 'react';
import type { ERPState } from '@/lib/types';

export type LegacySyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
export type LegacySaveState = (
  updater: ERPState | ((previous: ERPState) => ERPState)
) => Promise<{ success: boolean; message?: string }>;

export interface LegacyActionContext {
  state: ERPState | null;
  setState: Dispatch<SetStateAction<ERPState | null>>;
  setSyncStatus: Dispatch<SetStateAction<LegacySyncStatus>>;
  setSyncError: Dispatch<SetStateAction<string | null>>;
  isDbConfigured: boolean;
  saveState: LegacySaveState;
  deleteSyncedEntity: (entity: 'comments' | 'userAbsences' | 'specialDays' | 'defaultTasks', id: string) => Promise<{ success: boolean; message?: string }>;
  refreshFromDatabase: () => Promise<boolean>;
  loadDefaultTasks: () => Promise<void>;
  matchId: (left?: string | null, right?: string | null) => boolean;
  genId: (prefix: string) => string;
  logAudit: (action: string, entityType: string, entityId?: string, entityName?: string, details?: string) => unknown;
  getApiErrorMessage: (result: any, fallback: string) => string;
}
