import { normalizeRoleId } from './permissions';

export const roleKey = (id: string): string => normalizeRoleId(id) || id.trim();

export function configuredRoleIds(ids?: string[] | null, legacyIds?: string | null): string[] {
  const source = Array.isArray(ids) ? ids : (legacyIds || '').split(',');
  return [...new Set(source.map(id => roleKey(id)).filter(Boolean))];
}

type RoleMember = { roleId?: string; roleIds?: string[] };

export function userHasRole(user: RoleMember, roleId: string): boolean {
  const roles = Array.isArray(user.roleIds) ? user.roleIds : [user.roleId];
  return roles.some(id => !!id && roleKey(id) === roleKey(roleId));
}

export function userHasAnyRole(user: RoleMember, roleIds: string[]): boolean {
  return roleIds.some(id => userHasRole(user, id));
}
