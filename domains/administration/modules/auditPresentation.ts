/** Categories for presentation only; persisted audit events keep their exact names. */
export function auditActionCategory(action: string): string {
  const name = action.toUpperCase();
  if (name.endsWith('_CREATED')) return 'CREATE';
  if (name.endsWith('_UPDATED') || name.endsWith('_STATUS_CHANGED') || name.endsWith('_RESTORED')) return 'UPDATE';
  if (name.endsWith('_DELETED')) return 'DELETE';
  return name;
}

export function auditEntityCategory(entity: string): string {
  const name = entity.toUpperCase();
  return ({ PROJECTS: 'PROJECT', TASKS: 'TASK', CLIENTS: 'CLIENT', USERS: 'USER', PROJECT_RISK_ITEMS: 'RISK' } as Record<string, string>)[name] || name;
}
