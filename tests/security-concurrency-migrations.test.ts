import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
test('legacy OCC migration is transactional, scoped and backend-only', () => {
  const sql = read('20261005160525_legacy_atomic_writes.sql');
  expect(sql).toContain('FOR UPDATE');
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain('expected_version');
  expect(sql).toContain('SECURITY INVOKER');
  expect(sql).toMatch(/REVOKE.*PUBLIC.*anon.*authenticated/);
  expect(sql).toContain('service_role');
});
test('functional conflicts use HTTP 409, never PostgREST serialization retries', () => {
  const sql = read('20261005162756_legacy_conflict_http_status.sql');
  expect(sql).toContain("'40001'");
  expect(sql).toContain("'PT409'");
  expect(sql).toContain('pg_get_functiondef');
});
test('canonical OCC adds row locks without replacing canonical update contracts', () => {
  const sql = read('20261005161953_security_function_hardening.sql');
  for (const name of ['update_project_transaction', 'delete_project_transaction', 'update_task_atomic', 'delete_task_atomic'])
    expect(sql).toContain(name);
  expect(sql).toContain('FOR UPDATE');
  expect(sql).toContain('pg_get_functiondef');
  expect(sql).not.toContain('DROP FUNCTION');
});
