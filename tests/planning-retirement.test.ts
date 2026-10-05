import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { deleteTaskServer } from '../lib/tasks/taskService';

const routes = ['planning-allocations/route.ts', 'planning-allocations/[id]/route.ts', 'planning/capacity/route.ts', 'planning/resource-load/route.ts', 'planning/availability/route.ts'];
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function handler(authResult: any) {
  const url = new URL('../lib/planning/retired.ts', import.meta.url);
  const js = ts.transpileModule(read('../lib/planning/retired.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports: any = {};
  const requireActual = createRequire(url);
  new Function('require', 'exports', js)((id: string) => id === '../auth/authorization'
    ? { requirePermission: async (_req: any, permission: string) => { expect(['calendar_read', 'calendar_write']).toContain(permission); return authResult; } }
    : requireActual(id), exports);
  return exports.retiredPlanning;
}

describe('Retirement of allocation backend', () => {
  it('returns 410 to authorized callers for reads and writes without a database client', async () => {
    const run = handler({ success: true, requestId: 'test-request' });
    for (const permission of ['calendar_read', 'calendar_write']) {
      const response = await run({}, permission);
      expect(response.status).toBe(410);
      expect((await response.json()).error.code).toBe('PLANNING_RETIRED');
    }
  });
  it('preserves authentication and permission rejection', async () => {
    for (const status of [401, 403]) {
      const denied = new Response('Denied', { status });
      expect(await handler({ success: false, response: denied })({}, 'calendar_read')).toBe(denied);
    }
  });
  it('all old routes delegate to retirement and no longer import allocation writers', () => {
    for (const path of routes) {
      const source = read('../app/api/v1/' + path);
      expect(source).toContain('retiredPlanning');
      expect(source).not.toContain('allocationService');
      expect(source).not.toContain('capacityService');
      expect(source).not.toContain('getServerDbClient');
    }
  });
  it('new migration changes only the obsolete guard, retaining authorization, OCC and grants', () => {
    const old = read('../supabase/migrations/20261001000000_harden_delete_task_planning_allocations_check.sql');
    const sql = read('../supabase/migrations/20261005000000_retire_task_allocation_delete_guard.sql');
    const strip = (s: string) => s.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').replace(/\s+/g, ' ').trim();
    const functionStart = old.indexOf('CREATE OR REPLACE FUNCTION');
    const guardStart = old.indexOf('  -- 3. Hardening Invariant');
    const guardEnd = old.indexOf('  -- 4. Soft-delete');
    expect(strip(sql)).toBe(strip(old.slice(functionStart, guardStart) + old.slice(guardEnd)));
    expect(sql).not.toContain('FROM public.planning_allocations');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DELETE FROM');
    expect(read('../app/api/v1/tasks/[id]/route.ts')).not.toContain(".from('planning_allocations')");
  });
  it('task deletion continues to use the atomic RPC with expected version', async () => {
    const calls: any[] = [];
    const result = await deleteTaskServer({ rpc: async (name: string, args: any) => { calls.push([name, args]); return { data: { id: 'task', deleted: true }, error: null }; } } as any, 'task', 'actor', 3);
    expect(result.success).toBe(true);
    expect(calls).toEqual([['delete_task_atomic', { p_id: 'task', p_expected_version: 3, p_updated_by: 'actor' }]]);
  });
});
