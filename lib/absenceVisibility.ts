import type { AppConfiguration } from './types';
import { normalizeRoleId } from './permissions';

type AbsenceGroup = { id: string; name: string; deleted?: boolean };
type AbsenceUser = { id: string; name: string; roleId?: string; deleted?: boolean };
const alphabetically = (a: { name: string }, b: { name: string }) =>
  (a.name || '').localeCompare(b.name || '', 'pt-PT', { sensitivity: 'base' });
const roleKey = (id: string) => normalizeRoleId(id) || id.trim();

// Absences use the same configured groups as task assignees, without an all-users fallback.
export function getAbsenceVisibility<T extends AbsenceUser>(users: T[], groups: AbsenceGroup[], config?: Pick<AppConfiguration, 'taskAssigneeGroupIds' | 'taskAssigneeGroupId'>) {
  const configured = Array.isArray(config?.taskAssigneeGroupIds)
    ? config.taskAssigneeGroupIds
    : (config?.taskAssigneeGroupId || '').split(',').map(id => id.trim()).filter(Boolean);
  const allowed = new Set(configured.filter(id => id.trim()).map(roleKey));
  const visibleGroups = groups.filter(group => !group.deleted && allowed.has(roleKey(group.id))).sort(alphabetically);
  const visibleRoles = new Set(visibleGroups.map(group => roleKey(group.id)));
  const visibleUsers = users.filter(user => !user.deleted && !!user.roleId && visibleRoles.has(roleKey(user.roleId))).sort(alphabetically);
  return { groups: visibleGroups, users: visibleUsers };
}
