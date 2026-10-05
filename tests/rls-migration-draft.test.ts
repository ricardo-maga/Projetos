import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/security-drafts/20261005_backend_only_rls.sql', import.meta.url), 'utf8');
describe('backend-only RLS proposal static safeguards (not a PostgreSQL execution test)', () => {
  test('mutation RPC proposal preserves bodies and permission helpers', () => {
    const rpc = readFileSync(new URL('../supabase/security-drafts/20261005_backend_rpc_access.sql', import.meta.url), 'utf8');
    const array = rpc.match(/names constant text\[\] := ARRAY\[([\s\S]*?)\];/)![1];
    const names = [...array.matchAll(/'([^']+)'/g)].map(match => match[1]);
    expect(names.length).toBe(6);
    expect(names).toContain('update_task_atomic');
    expect(names).not.toContain('has_permission');
    expect(rpc).toContain("IS DISTINCT FROM 'on'");
    expect(rpc).toContain('FROM PUBLIC, anon, authenticated');
    expect(rpc).toContain('GRANT EXECUTE ON FUNCTION');
    expect(rpc).not.toMatch(/CREATE OR REPLACE FUNCTION|DROP FUNCTION/i);
  });
  test('explicit scope contains the 40 reported tables without public branding', () => {
    const array = sql.match(/targets constant text\[\] := ARRAY\[([\s\S]*?)\];/)![1];
    const names = [...array.matchAll(/'([^']+)'/g)].map(match => match[1]);
    expect(names.length).toBe(40);
    expect(new Set(names).size).toBe(40);
    expect(names).toContain('users');
    expect(names).toContain('audit_logs');
    expect(names).toContain('erp_tasks');
    expect(names).not.toContain('app_configuration');
  });
  test('transaction and manual approval fail closed', () => {
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
    expect(sql).toContain("IS DISTINCT FROM 'on'");
    expect(sql).toContain('Privilégios herdados residuais');
  });
  test('table and column grants are revoked and permissive policies cannot override deny', () => {
    expect(sql).toContain('FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s)');
    expect(sql).toContain('AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE');
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|DISABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY/i);
  });
});
