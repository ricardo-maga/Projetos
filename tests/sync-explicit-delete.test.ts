import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('explicit deletion checks permissions and uses a single id with ownership predicate', () => {
  const code=read('app/api/supabase/sync/entity/route.ts');
  expect(code).toContain('Object.hasOwn(targets, body.entity)');
  expect(code.indexOf('if (!(await can(target.permission)))')).toBeLessThan(code.indexOf('.delete().eq'));
  expect(code).toContain("deletion.eq('user_id', user.id)");
  expect(code).toContain("await can('admin:access')");
  expect(code).toContain('if (!data?.length)');
});
test('UI deletes only after authoritative confirmation and never writes a filtered snapshot', () => {
  const hook=read('hooks/useERP.ts');
  const helper=hook.slice(hook.indexOf('const deleteSyncedEntity'),hook.indexOf('// ==================== ABSENCES CRUD'));
  expect(helper).toContain("method: 'DELETE'");
  expect(helper.indexOf('if (!response.ok || !result.success)')).toBeLessThan(helper.indexOf('setState('));
  expect(helper).not.toContain('saveState(');
  for(const name of ['deleteComment','deleteAbsence','deleteSpecialDay','deleteDefaultTask']) {
    expect(hook).toMatch(new RegExp(`const ${name} = \\(id: string\\) => deleteSyncedEntity`));
  }
});
