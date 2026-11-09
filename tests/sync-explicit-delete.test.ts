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
  const helper=hook.slice(hook.indexOf('const deleteSyncedEntity'),hook.indexOf('const { addComment'));
  expect(helper).toContain("method: 'DELETE'");
  expect(helper.indexOf('if (!response.ok || !result.success)')).toBeLessThan(helper.indexOf('setState('));
  expect(helper).not.toContain('saveState(');
  const actions = [
    'domains/projects/modules/commentActions.ts',
    'domains/absences/modules/absenceActions.ts',
    'domains/calendar/modules/specialDayActions.ts',
    'domains/tasks/modules/defaultTaskActions.ts',
  ];
  for (const [index, name] of ['deleteComment','deleteAbsence','deleteSpecialDay','deleteDefaultTask'].entries()) {
    expect(read(actions[index])).toMatch(new RegExp(`const ${name} = \\(id: string\\) => deleteSyncedEntity`));
  }
});
