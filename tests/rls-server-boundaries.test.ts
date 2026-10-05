import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isolateOperationalWrite, saveActiveStateToSupabase } from '../lib/supabaseSync';
import type { ERPState } from '../lib/types';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
describe('RLS server-only boundary safeguards', () => {
  test('missing injected client fails closed before attempting persistence', async () => {
    const result = await saveActiveStateToSupabase({} as ERPState);
    expect(result.success).toBe(false);
    expect(result.message).toContain('servidor indisponível');
  });
  test('sync persistence requires explicit server client', () => {
    const code = read('lib/supabaseSync.ts');
    expect(code).toContain('const supabase = databaseClient;');
    expect(code).toContain("typeof window !== 'undefined' || !supabase");
    expect(code.slice(code.indexOf('export async function logAuditEventToSupabase'))).not.toContain(".from('audit_logs')");
  });
  test('all legacy route writers inject server client into read and save', () => {
    for (const path of ['app/api/v1/tickets/route.ts','app/api/v1/tickets/[id]/route.ts',
      'app/api/v1/project-materials/route.ts','app/api/v1/project-materials/[id]/route.ts','app/api/tickets/inbound/route.ts']) {
      const code = read(path);
      expect(code).not.toContain('getActiveStateFromSupabase()');
      expect(code.match(/saveActiveStateToSupabase\([^,]*, databaseClient, /g)?.length).toBeGreaterThan(0);
    }
    expect(read('app/api/supabase/sync/route.ts')).toContain('saveActiveStateToSupabase(state, clientToUse)');
  });
  test('operational scope contains only changed rows, never unrelated snapshots or appConfig', () => {
    const original = { users: [{ id: 'user' }], tickets: [{ id: 'other' }],
      notifications: [{ id: 'old' }], projectMaterials: [{ id: 'material' }],
      comments: [{ id: 'comment' }], appConfig: { appName: 'protected' } } as unknown as ERPState;
    const scoped = isolateOperationalWrite(original, { tickets: [{ id: 'changed' }] as ERPState['tickets'] });
    expect(scoped.tickets).toEqual([{ id: 'changed' }]);
    expect(scoped.users).toEqual([]);
    expect(scoped.comments).toEqual([]);
    expect(scoped.projectMaterials).toEqual([]);
    expect(scoped.notifications).toEqual([]);
    expect(scoped.appConfig).toBeUndefined();
    expect(original.users).toEqual([{ id: 'user' }]);
  });
  test('scoped writer touches only the requested ticket table and row', async () => {
    const writes: { table: string; rows: any[] }[] = [];
    const client = { rpc: async (name: string, payload: any) => {
      expect(name).toBe('write_legacy_batch');
      for (const change of payload.p_changes) writes.push({ table: change.table_name, rows: [change.row] });
      return { error: null, data: [] };
    } };
    const snapshot = { users: [{ id: 'user' }], materials: [{ id: 'material' }],
      tickets: [{ id: 'old' }], comments: [{ id: 'comment' }],
      appConfig: { appName: 'protected' } } as unknown as ERPState;
    const result = await saveActiveStateToSupabase(snapshot, client as any, {
      tickets: [{ id: '92000000-0000-4000-8000-000000000010', title: 'Scoped test' }] as ERPState['tickets']
    });
    expect(result.success).toBe(true);
    expect(writes.map(write => write.table)).toEqual(['tickets']);
    expect(writes[0].rows).toHaveLength(1);
    expect(writes[0].rows[0].id).toBe('92000000-0000-4000-8000-000000000010');
  });
  test('audit read permission and actor derive from server; reports cannot impersonate authoritative actions', () => {
    const code = read('app/api/audit/route.ts');
    expect(code).toContain("p_permission_code: 'admin:access'");
    expect(code).toContain('if (permitted !== true)');
    expect(code).toContain('user_id: user.id');
    expect(code).toContain("action: 'CLIENT_EVENT'");
    expect(code).not.toContain('body.userId');
    expect(read('lib/audit.ts')).not.toContain('defaultSupabase');
  });
});
