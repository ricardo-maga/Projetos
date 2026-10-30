export interface GroupPermissions {
  // 1. PROJETOS
  projects_read: boolean;
  projects_write: boolean;
  projects_delete: boolean;

  // 2. TAREFAS
  tasks_read: boolean;
  tasks_write: boolean;
  tasks_delete: boolean;

  // Pedidos e tarefas de desenho mecânico
  mechanical_design_read: boolean;
  mechanical_design_create: boolean;
  mechanical_design_manage: boolean;
  mechanical_design_execute: boolean;
  mechanical_design_coordinate: boolean;

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

  reports_read?: boolean;

  // Outras permissões existentes no sistema
  materials_read?: boolean;
  materials_write?: boolean;
  materials_delete?: boolean;
  project_materials_read?: boolean;
  project_materials_write?: boolean;
  project_materials_delete?: boolean;
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

export const EMPTY_PERMISSIONS: GroupPermissions = {
  projects_read: false,
  projects_write: false,
  projects_delete: false,
  tasks_read: false,
  tasks_write: false,
  tasks_delete: false,
  mechanical_design_read: false,
  mechanical_design_create: false,
  mechanical_design_manage: false,
  mechanical_design_execute: false,
  mechanical_design_coordinate: false,
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
  reports_read: false,
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
  return ROLE_UUID_MAP[trimmed] || null;
}

/**
 * Helper de apresentação para a camada de visualização UI (botões, tabs, menus).
 * AVISO: NÃO é uma boundary de segurança de backend. A autorização runtime
 * é efetuada no PostgreSQL (has_permission / RPC / RLS).
 */
export function hasPermission(
  user: { roleId?: string; role_id?: string | null; roleIds?: string[]; role_ids?: string[]; type?: string; isAdmin?: boolean; is_admin?: boolean; permissions?: unknown } | null | undefined,
  permissionKey: keyof GroupPermissions
): boolean {
  if (!user || user.type === 'External' || !Array.isArray(user.permissions)) return false;
  const roleIds = user.roleIds || user.role_ids;
  if (Array.isArray(roleIds) && roleIds.length === 0) return false;
  if (!Array.isArray(roleIds) && !user.roleId && !user.role_id) return false;

  if ((permissionKey === 'config_read' || permissionKey === 'config_write') &&
      (user.isAdmin || user.is_admin)) return true;

  const canonical = String(permissionKey).replace(/_([^_]+)$/, '.$1');
  const alternatives = canonical.endsWith('.write')
    ? [canonical, canonical.replace(/\.write$/, '.create'), canonical.replace(/\.write$/, '.update')]
    : [canonical];
  return user.permissions.some((code: unknown) => typeof code === 'string' && alternatives.includes(code));
}
