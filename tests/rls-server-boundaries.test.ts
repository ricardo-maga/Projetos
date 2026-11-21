import { domainWriteSource } from './helpers/domainWriteSource';
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
    const code = read('lib/supabaseSync.ts') + domainWriteSource();
    expect(code).toContain('const supabase = databaseClient;');
    expect(code).toContain("typeof window !== 'undefined' || !supabase");
    expect(code).not.toContain(".from('audit_logs')");
    expect(code).not.toContain('logAuditEventToSupabase');
  });
  test('material routes inject the server client into domain writes', () => {
    for (const path of ['app/api/v1/project-materials/route.ts','app/api/v1/project-materials/[id]/route.ts']) {
      const code = read(path);
      expect(code).not.toContain('getActiveStateFromSupabase()');
      expect(code.match(/persistProjectMaterial\(databaseClient, /g)?.length).toBeGreaterThan(0);
    }
    expect(read('app/api/supabase/sync/route.ts')).toContain('saveActiveStateToSupabase(state, clientToUse)');
  });
  test('operational scope contains only changed rows, never unrelated snapshots or appConfig', () => {
    const original = { users: [{ id: 'user' }], projectMaterials: [{ id: 'other' }],
      notifications: [{ id: 'old' }],
      comments: [{ id: 'comment' }], appConfig: { appName: 'protected' } } as unknown as ERPState;
    const scoped = isolateOperationalWrite(original, { projectMaterials: [{ id: 'changed' }] as ERPState['projectMaterials'] });
    expect(scoped.projectMaterials).toEqual([{ id: 'changed' }]);
    expect(scoped.users).toEqual([]);
    expect(scoped.comments).toEqual([]);
    expect(scoped.notifications).toEqual([]);
    expect(scoped.appConfig).toBeUndefined();
    expect(original.users).toEqual([{ id: 'user' }]);
  });
  test('scoped writer touches only the requested material table and row', async () => {
    const writes: { table: string; rows: any[] }[] = [];
    const client = { rpc: async (name: string, payload: any) => {
      expect(name).toBe('write_legacy_batch');
      for (const change of payload.p_changes) writes.push({ table: change.table_name, rows: [change.row] });
      return { error: null, data: [] };
    } };
    const snapshot = { users: [{ id: 'user' }], materials: [{ id: 'material' }],
      projectMaterials: [{ id: 'old' }], comments: [{ id: 'comment' }],
      appConfig: { appName: 'protected' } } as unknown as ERPState;
    const result = await saveActiveStateToSupabase(snapshot, client as any, {
      projectMaterials: [{ id: '92000000-0000-4000-8000-000000000010', description: 'Scoped test' }] as ERPState['projectMaterials']
    });
    expect(result.success).toBe(true);
    expect(writes.map(write => write.table)).toEqual(['project_materials']);
    expect(writes[0].rows).toHaveLength(1);
    expect(writes[0].rows[0].id).toBe('92000000-0000-4000-8000-000000000010');
  });
  test('audit read permission and actor derive from server; reports cannot impersonate authoritative actions', () => {
    const code = read('domains/administration/modules/auditHttp.ts');
    expect(code).toContain("p_permission_code: 'admin:access'");
    expect(code).toContain('if (permitted !== true)');
    expect(code).toContain('user_id: user.id');
    expect(read('app/api/audit/route.ts')).not.toContain('export const POST');
    expect(read('app/api/audit/export/route.ts')).toContain('handleAudit(req, true)');
    expect(code).not.toContain('req.json()');
    expect(code).not.toContain('body.userId');
    expect(read('lib/audit.ts')).not.toContain('defaultSupabase');
  });
});
