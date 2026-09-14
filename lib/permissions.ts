import { UserGroup } from './types';

export interface GroupPermissions {
  // 1. PROJETOS
  projects_read: boolean;
  projects_write: boolean;
  projects_delete: boolean;

  // 2. TAREFAS
  tasks_read: boolean;
  tasks_write: boolean;
  tasks_delete: boolean;

  // 3. CALENDARIO E AGENDAMENTO
  calendar_read: boolean;
  calendar_write: boolean;

  // 4. CLIENTES
  clients_read: boolean;
  clients_write: boolean;
  clients_delete: boolean;

  // 5. AUSENCIAS
  absences_read: boolean;
  absences_write: boolean;
  absences_delete: boolean;

  // 6. CONFIGURAÇÕES
  config_read: boolean;
  config_write: boolean;

  // 7. TICKETS & SUPORTE
  tickets_read?: boolean;
  tickets_write?: boolean;
  tickets_delete?: boolean;

  // Outras permissões existentes no sistema
  quotes_read?: boolean;
  quotes_write?: boolean;
  quotes_delete?: boolean;
  materials_read?: boolean;
  materials_write?: boolean;
  materials_delete?: boolean;
  equipment_read?: boolean;
  equipment_write?: boolean;
  equipment_delete?: boolean;
  users_read?: boolean;
  users_write?: boolean;
  users_delete?: boolean;
}

export const DEFAULT_PERMISSIONS: Record<string, GroupPermissions> = {
  // ug-1: Administrador
  'ug-1': {
    projects_read: true,
    projects_write: true,
    projects_delete: true,
    tasks_read: true,
    tasks_write: true,
    tasks_delete: true,
    calendar_read: true,
    calendar_write: true,
    clients_read: true,
    clients_write: true,
    clients_delete: true,
    absences_read: true,
    absences_write: true,
    absences_delete: true,
    config_read: true,
    config_write: true,
    tickets_read: true,
    tickets_write: true,
    tickets_delete: true,
    quotes_read: true,
    quotes_write: true,
    quotes_delete: true,
    materials_read: true,
    materials_write: true,
    materials_delete: true,
    equipment_read: true,
    equipment_write: true,
    equipment_delete: true,
    users_read: true,
    users_write: true,
    users_delete: true,
  },
  // ug-2: Project Leader
  'ug-2': {
    projects_read: true,
    projects_write: true,
    projects_delete: false,
    tasks_read: true,
    tasks_write: true,
    tasks_delete: true,
    calendar_read: true,
    calendar_write: true,
    clients_read: true,
    clients_write: true,
    clients_delete: false,
    absences_read: true,
    absences_write: true,
    absences_delete: false,
    config_read: true,
    config_write: false,
    tickets_read: true,
    tickets_write: true,
    tickets_delete: true,
    quotes_read: true,
    quotes_write: true,
    quotes_delete: false,
    materials_read: true,
    materials_write: true,
    materials_delete: false,
    equipment_read: true,
    equipment_write: true,
    equipment_delete: false,
    users_read: true,
    users_write: false,
    users_delete: false,
  },
  // ug-3: Técnico
  'ug-3': {
    projects_read: true,
    projects_write: false,
    projects_delete: false,
    tasks_read: true,
    tasks_write: true,
    tasks_delete: false,
    calendar_read: true,
    calendar_write: true,
    clients_read: true,
    clients_write: false,
    clients_delete: false,
    absences_read: true,
    absences_write: true,
    absences_delete: false,
    config_read: false,
    config_write: false,
    tickets_read: true,
    tickets_write: true,
    tickets_delete: false,
    quotes_read: false,
    quotes_write: false,
    quotes_delete: false,
    materials_read: true,
    materials_write: false,
    materials_delete: false,
    equipment_read: true,
    equipment_write: false,
    equipment_delete: false,
    users_read: false,
    users_write: false,
    users_delete: false,
  },
  // ug-4: Visualizador
  'ug-4': {
    projects_read: true,
    projects_write: false,
    projects_delete: false,
    tasks_read: true,
    tasks_write: false,
    tasks_delete: false,
    calendar_read: true,
    calendar_write: false,
    clients_read: true,
    clients_write: false,
    clients_delete: false,
    absences_read: true,
    absences_write: false,
    absences_delete: false,
    config_read: false,
    config_write: false,
    tickets_read: true,
    tickets_write: false,
    tickets_delete: false,
    quotes_read: false,
    quotes_write: false,
    quotes_delete: false,
    materials_read: true,
    materials_write: false,
    materials_delete: false,
    equipment_read: true,
    equipment_write: false,
    equipment_delete: false,
    users_read: false,
    users_write: false,
    users_delete: false,
  }
};

/**
 * Returns the resolved GroupPermissions object for a given roleId, merging customized settings if available
 */
export function getGroupPermissions(roleId: string, customGroups?: UserGroup[]): GroupPermissions {
  const fallback = DEFAULT_PERMISSIONS[roleId] || DEFAULT_PERMISSIONS['ug-4'];
  
  if (customGroups) {
    const group = customGroups.find(g => g.id === roleId);
    if (group && (group as any).permissions) {
      let parsedPerms = (group as any).permissions;
      if (typeof parsedPerms === 'string') {
        try {
          parsedPerms = JSON.parse(parsedPerms);
        } catch (e) {
          parsedPerms = {};
        }
      }
      return { ...fallback, ...parsedPerms };
    }
  }
  
  return fallback;
}

/**
 * Checks if a specific action is authorized for a user's roleId or user object
 */
export function hasPermission(
  userOrRoleId: string | { roleId?: string; role_id?: string; type?: string; isAdmin?: boolean; is_admin?: boolean; [key: string]: any } | null | undefined,
  permissionKey: keyof GroupPermissions,
  customGroups?: UserGroup[]
): boolean {
  if (!userOrRoleId) return false;
  
  let roleId = '';
  let isAdminUser = false;
  
  if (typeof userOrRoleId === 'string') {
    roleId = userOrRoleId;
    if (roleId === 'ug-1' || roleId === 'admin') {
      isAdminUser = true;
    }
  } else if (typeof userOrRoleId === 'object') {
    roleId = userOrRoleId.roleId || userOrRoleId.role_id || userOrRoleId.type || '';
    isAdminUser = !!(userOrRoleId.isAdmin || userOrRoleId.is_admin || roleId === 'ug-1' || roleId === 'admin');
  }
  
  if (isAdminUser) return true;
  if (!roleId) return false;
  
  const perms = getGroupPermissions(roleId, customGroups);
  return !!perms[permissionKey];
}

