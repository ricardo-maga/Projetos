import { expect, test, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/supabase/sync/route';
import * as authBoundary from '../lib/auth/requireAuth';
import * as dbBoundary from '../lib/supabase/requireServerDbClient';
import * as syncBoundary from '../lib/supabaseSync';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';
import { mergeSyncPartitions, SYNC_PARTITIONS, type SyncPartition } from '../lib/supabase/syncPartitions';
import { installLegacyRouteHarness } from './helpers/legacyRouteHarness';

test('a leitura inicial devolve apenas a partição pedida após autorização', async () => {
  const restoreHarness = installLegacyRouteHarness();
  const auth = spyOn(authBoundary, 'requireAuth').mockResolvedValue({
    id: 'self', auth_user_id: 'auth-self', name: 'Self', email: 'self@example.com',
    role_id: 'role', is_admin: false, type: 'Team',
  } as any);
  const db = spyOn(dbBoundary, 'requireServerDbClient').mockReturnValue({
    rpc: async () => ({ data: true, error: null }),
    from: () => ({ select: () => ({ or: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }),
  } as any);
  const read = spyOn(syncBoundary, 'getActiveStateFromSupabase').mockResolvedValue({
    success: true, data: { ...CLEAN_BASELINE_STATE, clients: [{ id: 'client-1' }] },
  } as any);
  try {
    const response = await GET(new NextRequest('http://localhost/api/supabase/sync?partition=work'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual([...SYNC_PARTITIONS.work].sort());
    expect(body.data.clients[0].id).toBe('client-1');
    expect(body.data.users).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
    const options = read.mock.calls[0][1];
    expect(options.readableDomains.has('clients')).toBe(true);
    expect(options.readableDomains.has('comments')).toBe(false);
  } finally {
    read.mockRestore(); db.mockRestore(); auth.mockRestore(); restoreHarness();
  }
});

test('a leitura integral antiga é recusada após autenticação', async () => {
  const restoreHarness = installLegacyRouteHarness();
  const auth = spyOn(authBoundary, 'requireAuth').mockResolvedValue({ id: 'self' } as any);
  const db = spyOn(dbBoundary, 'requireServerDbClient').mockReturnValue({} as any);
  try {
    const response = await GET(new NextRequest('http://localhost/api/supabase/sync'));
    expect(response.status).toBe(410);
    expect((await response.json()).data).toBeUndefined();
  } finally {
    db.mockRestore(); auth.mockRestore(); restoreHarness();
  }
});

test('a cache só é montada depois de receber todas as coleções obrigatórias', () => {
  const parts = Object.fromEntries(Object.entries(SYNC_PARTITIONS).map(([partition, fields]) => [
    partition,
    Object.fromEntries(fields.map(field => [field, field === 'appConfig' ? { appName: 'ERP' } : []])),
  ])) as Record<SyncPartition, unknown>;
  expect(mergeSyncPartitions(parts).appConfig.appName).toBe('ERP');
  delete (parts.work as Record<string, unknown>).tasks;
  expect(() => mergeSyncPartitions(parts)).toThrow('Campo obrigatório ausente: tasks.');
});
