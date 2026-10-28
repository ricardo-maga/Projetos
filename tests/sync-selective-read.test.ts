import { expect, test } from 'bun:test';
import { getActiveStateFromSupabase } from '../lib/supabaseSync';

function fakeDatabase() {
  const calls: Array<{ table: string; columns: string }> = [];
  const own = { id: 'self', name: 'Self', type: 'Internal', email: 'self@example.com',
    role_id: 'role', approved: true, deleted: false, created_at: '2026-01-01' };
  const directory = [{ ...own }, { id: 'other', name: 'Other', type: 'Internal', role_id: 'role',
    approved: true, deleted: false, created_at: '2026-01-01' }];
  const rows = (table: string, columns: string) => {
    if (table === 'users') return columns === '*' ? directory : directory.map(({ email, ...user }) => user);
    if (table === 'app_configuration') return [{ app_name: 'Test' }];
    if (table === 'clients') return [{ id: 'client', client_name: 'Visible client' }];
    return [];
  };
  const db = { from(table: string) {
    let columns = '*';
    const query = {
      select(value: string) { columns = value; calls.push({ table, columns }); return this; },
      order() { return this; }, eq() { return this; }, limit() { return this; },
      maybeSingle() { return Promise.resolve({ data: table === 'users' ? own : null, error: null }); },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: rows(table, columns), error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { db, calls };
}

test('sync read avoids unauthorized operational tables and keeps a minimal user directory', async () => {
  const { db, calls } = fakeDatabase();
  const result = await getActiveStateFromSupabase(db, {
    readableDomains: new Set(), userId: 'self', skipNotifications: true,
  });
  expect(result.success).toBe(true);
  expect(result.data?.users.find(user => user.id === 'self')?.email).toBe('self@example.com');
  expect(result.data?.users.find(user => user.id === 'other')?.email).toBe('');
  expect(result.data?.clients).toEqual([]);
  expect(result.data?.projects).toEqual([]);
  expect(result.data?.tasks).toEqual([]);
  const tables = new Set(calls.map(call => call.table));
  for (const table of ['clients', 'projects', 'tasks', 'comments', 'user_absences', 'equipment',
    'project_risk_items', 'project_materials', 'notifications', 'automation_rules', 'default_tasks']) {
    expect(tables.has(table)).toBe(false);
  }
  expect(calls.find(call => call.table === 'users' && call.columns !== '*')?.columns)
    .toBe('id,type,name,role_id,approved,deleted,created_at,sync_version');
});

test('sync read fetches an authorized domain without reading unrelated domains', async () => {
  const { db, calls } = fakeDatabase();
  const result = await getActiveStateFromSupabase(db, {
    readableDomains: new Set(['clients']), userId: 'self', skipNotifications: true,
  });
  expect(result.success).toBe(true);
  expect(result.data?.clients.map(client => client.id)).toEqual(['client']);
  const tables = new Set(calls.map(call => call.table));
  expect(tables.has('clients')).toBe(true);
  expect(tables.has('tasks')).toBe(false);
  expect(tables.has('project_materials')).toBe(false);
});
