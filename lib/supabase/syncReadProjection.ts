import type { ERPState } from '../types';

export const SYNC_READ_PERMISSIONS = {
  projects: 'projects:read', comments: 'projects:read', projectRiskItems: 'projects:read',
  tasks: 'tasks:read', clients: 'clients:read', materials: 'materials:read',
  projectMaterials: 'materials:read', quotes: 'quotes:read', billOfMaterials: 'quotes:read',
  equipmentList: 'equipment:read', userAbsences: 'absences:read', tickets: 'tickets:read',
  defaultTasks: 'config:read', automationRules: 'admin:access', auditLogs: 'admin:access',
  notificationSettings: 'admin:access',
} as const;

// Configuration labels/colors and a minimal assignee directory are supporting
// UI data, not permission to expose the corresponding operational collections.
export function projectSyncRead(state: ERPState, userId: string, can: ReadonlyMap<string, boolean>): ERPState {
  const projected = { ...state };
  for (const [field, code] of Object.entries(SYNC_READ_PERMISSIONS)) {
    if (can.get(code) !== true) (projected as any)[field] = [];
  }
  projected.users = (state.users || []).map(user => {
    if (can.get('users:read') === true || user.id === userId) {
      const { password, ...safe } = user;
      return safe;
    }
    return { id:user.id, name:user.name, type:user.type, roleId:user.roleId,
      approved:user.approved, deleted:user.deleted, email:'', createdDate:'' };
  });
  // Notifications are recipient-scoped even for admins. Administrative viewing
  // should be a separate, explicitly authorized operation.
  projected.notifications = (state.notifications || []).filter(row => row.userId === userId || row.userId === 'all');
  return projected;
}
