import { NextRequest, NextResponse } from 'next/server';
import { authorizeRbac, rbacError } from '@/lib/rbac/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { db } = await authorizeRbac(req, 'roles.read');
    const [rolesResult, permissionsResult, grantsResult, usersResult, assignmentsResult] = await Promise.all([
      db.from('roles').select('id,code,name,description,is_system,is_active').order('name'),
      db.from('permissions').select('id,code,module,action,description,is_system').eq('is_active', true).order('module').order('action'),
      db.from('role_permissions').select('role_id,permission_id'),
      db.from('users').select('id,name,email,type,approved,deleted').eq('deleted', false).order('name'),
      db.from('user_roles').select('user_id,role_id'),
    ]);
    const error = rolesResult.error || permissionsResult.error || grantsResult.error || usersResult.error || assignmentsResult.error;
    if (error) throw new Error('Não foi possível carregar o catálogo de funções.');
    return NextResponse.json({ success: true, roles: rolesResult.data || [], permissions: permissionsResult.data || [],
      rolePermissions: grantsResult.data || [], users: usersResult.data || [], userRoles: assignmentsResult.data || [] });
  } catch (error) { return rbacError(error); }
}
