import { expect, test } from 'bun:test';
import { CANONICAL_ROLE_IDS } from '../lib/permissions';
import { configuredRoleIds, userHasAnyRole } from '../lib/roleAssociations';
import { getAbsenceVisibility } from '../lib/absenceVisibility';
import { projectSyncRead } from '../lib/supabase/syncReadProjection';
import type { ERPState } from '../lib/types';

test('associations accept active custom roles and normalize known legacy IDs', () => {
  expect(configuredRoleIds(['ug-3', CANONICAL_ROLE_IDS.TECHNICIAN, 'custom-role']))
    .toEqual([CANONICAL_ROLE_IDS.TECHNICIAN, 'custom-role']);
  expect(configuredRoleIds(undefined, 'ug-3,custom-role')).toEqual([CANONICAL_ROLE_IDS.TECHNICIAN, 'custom-role']);
  expect(configuredRoleIds(undefined, '00000000-0000-0000-0000-000000000002,a158a7b3-88ce-46d1-a779-cd6d73363d3c'))
    .toEqual([CANONICAL_ROLE_IDS.PROJECT_MANAGER, CANONICAL_ROLE_IDS.SOLUTIONS]);
  expect(configuredRoleIds([], 'ug-3')).toEqual([]);
});

test('operational eligibility uses active multi-role assignments, including a secondary role', () => {
  const user = { roleId: CANONICAL_ROLE_IDS.TECHNICIAN, roleIds: [CANONICAL_ROLE_IDS.TECHNICIAN, 'custom-role'] };
  expect(userHasAnyRole(user, ['custom-role'])).toBe(true);
  expect(userHasAnyRole({ ...user, roleIds: [] }, [CANONICAL_ROLE_IDS.TECHNICIAN])).toBe(false);
  expect(userHasAnyRole(user, [])).toBe(false);
});

test('absence visibility applies configured current roles to secondary memberships', () => {
  const groups = [{ id: 'custom-role', name: 'Equipa' }];
  const users = [{ id: 'one', name: 'Ana', roleId: CANONICAL_ROLE_IDS.TECHNICIAN, roleIds: ['custom-role'] }];
  expect(getAbsenceVisibility(users, groups, { taskAssigneeGroupIds: ['custom-role'] }).users.map(user => user.id)).toEqual(['one']);
});

test('minimal user directory retains role memberships needed for task selection', () => {
  const state = { users: [
    { id: 'self', name: 'Eu', roleId: 'primary', roleIds: ['primary'] },
    { id: 'other', name: 'Outra', roleId: 'primary', roleIds: ['primary', 'custom-role'], email: 'private@example.com' },
  ] } as unknown as ERPState;
  const projected = projectSyncRead(state, 'self', new Map());
  expect(projected.users[1].roleIds).toEqual(['primary', 'custom-role']);
  expect(projected.users[1].email).toBe('');
});
