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
  reports_read?: boolean;

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
  roles_read?: boolean;
  roles_manage?: boolean;
  app_access?: boolean;
}

export const CANONICAL_ROLE_IDS = {
  SUPER_ADMIN: '10000000-0000-0000-0000-000000000001',
  ADMIN: '10000000-0000-0000-0000-000000000002',
  PROJECT_MANAGER: '10000000-0000-0000-0000-000000000003',
  TECHNICIAN: '10000000-0000-0000-0000-000000000004',
  COMMERCIAL: '10000000-0000-0000-0000-000000000005',
  SOLUTIONS: '10000000-0000-0000-0000-000000000006',
  VIEWER: '10000000-0000-0000-0000-000000000007',
} as const;

export const ROLE_UUID_MAP: Record<string, string> = {
  // Canonical series 10000000
  '10000000-0000-0000-0000-000000000001': '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002': '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003': '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004': '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005': '10000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000006': '10000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000007': '10000000-0000-0000-0000-000000000007',

  // Legacy UUIDs
  '00000000-0000-0000-0000-000000000001': '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002': '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000003': '10000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000004': '10000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005': '10000000-0000-0000-0000-000000000007',
  '52616954-8b59-4459-a00b-963f1b29a91c': '10000000-0000-0000-0000-000000000005',
  'a158a7b3-88ce-46d1-a779-cd6d73363d3c': '10000000-0000-0000-0000-000000000006',
  '9de391f6-46fa-45f6-b32d-25c11e1dd533': '10000000-0000-0000-0000-000000000007',

  // Legacy string group IDs
  'ug-1': '10000000-0000-0000-0000-000000000001',
  'ug-2': '10000000-0000-0000-0000-000000000003',
  'ug-3': '10000000-0000-0000-0000-000000000004',
  'ug-4': '10000000-0000-0000-0000-000000000007',
};

const ALL_TRUE_PERMISSIONS: GroupPermissions = {
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
  reports_read: true,
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
};

export const DEFAULT_PERMISSIONS: Record<string, GroupPermissions> = {
  // SUPER_ADMIN (10000000-0000-0000-0000-000000000001) / ug-1
  '10000000-0000-0000-0000-000000000001': ALL_TRUE_PERMISSIONS,
  '00000000-0000-0000-0000-000000000001': ALL_TRUE_PERMISSIONS,
  'ug-1': ALL_TRUE_PERMISSIONS,

  // ADMIN (10000000-0000-0000-0000-000000000002)
  '10000000-0000-0000-0000-000000000002': ALL_TRUE_PERMISSIONS,
  '00000000-0000-0000-0000-000000000002': ALL_TRUE_PERMISSIONS,

  // PROJECT_MANAGER (10000000-0000-0000-0000-000000000003) / ug-2
  '10000000-0000-0000-0000-000000000003': {
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
    clients_delete: false,
    absences_read: true,
    absences_write: true,
    absences_delete: true,
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
  '00000000-0000-0000-0000-000000000003': {
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
    clients_delete: false,
    absences_read: true,
    absences_write: true,
    absences_delete: true,
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
  'ug-2': {
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
    clients_delete: false,
    absences_read: true,
    absences_write: true,
    absences_delete: true,
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

  // TECHNICIAN (10000000-0000-0000-0000-000000000004) / ug-3
  '10000000-0000-0000-0000-000000000004': {
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
  '00000000-0000-0000-0000-000000000004': {
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

  // COMMERCIAL (10000000-0000-0000-0000-000000000005)
  '10000000-0000-0000-0000-000000000005': {
    projects_read: true,
    projects_write: false,
    projects_delete: false,
    tasks_read: true,
    tasks_write: false, // DENY per principle of least privilege
    tasks_delete: false,
    calendar_read: true,
    calendar_write: false, // DENY
    clients_read: true,
    clients_write: true,
    clients_delete: false,
    absences_read: true,
    absences_write: true,
    absences_delete: false,
    config_read: false,
    config_write: false,
    tickets_read: false,
    tickets_write: false,
    tickets_delete: false,
    quotes_read: true,
    quotes_write: true,
    quotes_delete: false,
    materials_read: false,
    materials_write: false,
    materials_delete: false,
    equipment_read: false,
    equipment_write: false,
    equipment_delete: false,
    users_read: false,
    users_write: false,
    users_delete: false,
  },

  // SOLUTIONS (10000000-0000-0000-0000-000000000006)
  '10000000-0000-0000-0000-000000000006': {
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
    absences_read: false,
    absences_write: false,
    absences_delete: false,
    config_read: false,
    config_write: false,
    tickets_read: false,
    tickets_write: false,
    tickets_delete: false,
    quotes_read: true,
    quotes_write: true,
    quotes_delete: false,
    materials_read: true,
    materials_write: false,
    materials_delete: false,
    equipment_read: true,
    equipment_write: false,
    equipment_delete: false,
    users_read: true,
    users_write: false,
    users_delete: false,
  },

  // VIEWER (10000000-0000-0000-0000-000000000007) / ug-4
  '10000000-0000-0000-0000-000000000007': {
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
    quotes_read: true,
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
  '00000000-0000-0000-0000-000000000005': {
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
    quotes_read: true,
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
    quotes_read: true,
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

export const EMPTY_PERMISSIONS: GroupPermissions = {
  projects_read: false,
  projects_write: false,
  projects_delete: false,
  tasks_read: false,
  tasks_write: false,
  tasks_delete: false,
  calendar_read: false,
  calendar_write: false,
  clients_read: false,
  clients_write: false,
  clients_delete: false,
  absences_read: false,
  absences_write: false,
  absences_delete: false,
  config_read: false,
  config_write: false,
  tickets_read: false,
  tickets_write: false,
  tickets_delete: false,
  reports_read: false,
  quotes_read: false,
  quotes_write: false,
  quotes_delete: false,
  materials_read: false,
  materials_write: false,
  materials_delete: false,
  equipment_read: false,
  equipment_write: false,
  equipment_delete: false,
  users_read: false,
  users_write: false,
  users_delete: false,
};

export function normalizeRoleId(roleId?: string | null): string | null {
  if (!roleId || typeof roleId !== 'string' || !roleId.trim()) return null;
  const trimmed = roleId.trim();
  return ROLE_UUID_MAP[trimmed] || (DEFAULT_PERMISSIONS[trimmed] ? trimmed : null);
}

/**
 * Returns the resolved GroupPermissions object for a given roleId.
 * NOTA: Esta função serve para apresentação e estado visual de UI.
 * A autorização runtime e integridade de dados é garantida exclusivamente no PostgreSQL / RPC.
 * Roles desconhecidas ou vazias nunca recebem permissões por fallback.
 */
export function getGroupPermissions(roleId?: string | null, customGroups?: UserGroup[]): GroupPermissions {
  if (!roleId) return { ...EMPTY_PERMISSIONS };
  const normalizedRole = normalizeRoleId(roleId);
  if (!normalizedRole) return { ...EMPTY_PERMISSIONS };

  const base = DEFAULT_PERMISSIONS[normalizedRole] || DEFAULT_PERMISSIONS[roleId];
  if (!base) return { ...EMPTY_PERMISSIONS };
  
  if (customGroups) {
    const group = customGroups.find(g => g.id === roleId || g.id === normalizedRole);
    if (group && (group as any).permissions) {
      let parsedPerms = (group as any).permissions;
      if (typeof parsedPerms === 'string') {
        try {
          parsedPerms = JSON.parse(parsedPerms);
        } catch {
          parsedPerms = {};
        }
      }
      return { ...base, ...parsedPerms };
    }
  }
  
  return base;
}

/**
 * Helper de apresentação para a camada de visualização UI (botões, tabs, menus).
 * AVISO: NÃO é uma boundary de segurança de backend. A autorização runtime
 * é efetuada no PostgreSQL (has_permission / RPC / RLS).
 */
export function hasPermission(
  userOrRoleId: string | { roleId?: string; role_id?: string; type?: string; isAdmin?: boolean; is_admin?: boolean; isSuperAdmin?: boolean; permissions?: unknown; [key: string]: any } | null | undefined,
  permissionKey: keyof GroupPermissions,
  customGroups?: UserGroup[]
): boolean {
  if (!userOrRoleId) return false;
  
  let roleId = '';
  let isAdminUser = false;
  
  if (typeof userOrRoleId === 'string') {
    roleId = userOrRoleId.trim();
    if (
      roleId === 'ug-1' ||
      roleId === CANONICAL_ROLE_IDS.SUPER_ADMIN ||
      roleId === '00000000-0000-0000-0000-000000000001' ||
      roleId === 'admin'
    ) {
      isAdminUser = true;
    }
  } else if (typeof userOrRoleId === 'object') {
    roleId = (userOrRoleId.roleId || userOrRoleId.role_id || userOrRoleId.type || '').trim();
    if (userOrRoleId.type === 'External') return false;
    if (userOrRoleId.isSuperAdmin) return true;

    // Session permissions are the server-calculated union across active roles.
    // An empty array is authoritative and must not fall back to hard-coded roles.
    if (Array.isArray(userOrRoleId.permissions)) {
      const requested = String(permissionKey);
      const canonical = requested.replace(/^([^_]+)_/, '$1.');
      const alternatives = canonical.endsWith('.write')
        ? [canonical, canonical.replace(/\.write$/, '.create'), canonical.replace(/\.write$/, '.update')]
        : [canonical];
      return userOrRoleId.permissions.some((code: unknown) => typeof code === 'string' && alternatives.includes(code));
    }
    isAdminUser = !!(
      userOrRoleId.isSuperAdmin ||
      roleId === 'ug-1' ||
      roleId === CANONICAL_ROLE_IDS.SUPER_ADMIN ||
      roleId === '00000000-0000-0000-0000-000000000001' ||
      roleId === 'admin'
    );
  }
  
  if (isAdminUser) return true;
  if (!roleId) return false;
  
  const perms = getGroupPermissions(roleId, customGroups);
  return !!perms[permissionKey];
}
