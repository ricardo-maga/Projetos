import type { AppConfiguration } from './types';
import { configuredRoleIds, roleKey, userHasRole } from './roleAssociations';

type AbsenceGroup = { id: string; name: string; deleted?: boolean };
type AbsenceUser = { id: string; name: string; roleId?: string; roleIds?: string[]; deleted?: boolean };
const alphabetically = (a: { name: string }, b: { name: string }) =>
  (a.name || '').localeCompare(b.name || '', 'pt-PT', { sensitivity: 'base' });

// Absences use the same configured groups as task assignees, without an all-users fallback.
export function getAbsenceVisibility<T extends AbsenceUser>(users: T[], groups: AbsenceGroup[], config?: Pick<AppConfiguration, 'taskAssigneeGroupIds' | 'taskAssigneeGroupId'>) {
  const allowed = new Set(configuredRoleIds(config?.taskAssigneeGroupIds, config?.taskAssigneeGroupId));
  const visibleGroups = groups.filter(group => !group.deleted && allowed.has(roleKey(group.id))).sort(alphabetically);
  const visibleRoles = new Set(visibleGroups.map(group => roleKey(group.id)));
  const visibleUsers = users.filter(user => !user.deleted && [...visibleRoles].some(id => userHasRole(user, id))).sort(alphabetically);
  return { groups: visibleGroups, users: visibleUsers };
}
