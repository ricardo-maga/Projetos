import { NextRequest, NextResponse } from 'next/server';
import { unauthorized, forbidden } from '@/lib/apiErrors';
import { GroupPermissions, getGroupPermissions } from '@/lib/permissions';
import {
  requireAuth as requireCentralAuth,
  requirePermission as requireCentralPermission,
  AuthError,
  ForbiddenError,
  AuthenticatedUser as CentralUser,
} from './requireAuth';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  type?: string;
  roleId: string;
  roleName?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  approved: boolean;
  permissions?: GroupPermissions;
}

export type AuthResult = 
  | { success: true; user: AuthenticatedUser; requestId: string }
  | { success: false; response: NextResponse };

/**
 * Validates whether the incoming request has an authenticated and active user session.
 * Delegates to central requireAuth() in lib/auth/requireAuth.ts (Supabase Auth SSR).
 */
export async function requireAuth(req?: NextRequest): Promise<AuthResult> {
  const requestId = req?.headers?.get('x-request-id') || crypto.randomUUID();

  try {
    const centralUser = await requireCentralAuth();
    const permissions = getGroupPermissions(centralUser.role_id);

    const user: AuthenticatedUser = {
      id: centralUser.id,
      email: centralUser.email,
      name: centralUser.name,
      type: centralUser.type,
      roleId: centralUser.role_id,
      isAdmin: centralUser.is_admin,
      isSuperAdmin: centralUser.is_admin,
      approved: true,
      permissions,
    };

    return { success: true, user, requestId };
  } catch (error: any) {
    const message = error instanceof AuthError ? error.message : 'Sessão inválida ou expirada. Faça login novamente.';
    return {
      success: false,
      response: unauthorized(message, requestId),
    };
  }
}

/**
 * Validates that the request has an active session AND the user possesses the required permission.
 * Uses central requireAuth() / requirePermission() from lib/auth/requireAuth.ts.
 */
export async function requirePermission(
  permissionCode: keyof GroupPermissions
): Promise<CentralUser>;
export async function requirePermission(
  req: NextRequest,
  permissionCode: keyof GroupPermissions | string
): Promise<AuthResult>;
export async function requirePermission(
  reqOrPermissionCode: NextRequest | keyof GroupPermissions,
  permissionCode?: keyof GroupPermissions | string
): Promise<AuthResult | CentralUser> {
  if (typeof reqOrPermissionCode === 'string') {
    return requireCentralPermission(reqOrPermissionCode as keyof GroupPermissions);
  }

  const req = reqOrPermissionCode as NextRequest;
  const permCode = permissionCode as keyof GroupPermissions;
  const requestId = req?.headers?.get('x-request-id') || crypto.randomUUID();

  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult;
  }

  const { user } = authResult;

  if (user.isAdmin || user.isSuperAdmin || user.roleId === 'ug-1') {
    return authResult;
  }

  const userPerms = user.permissions || getGroupPermissions(user.roleId);
  if (!userPerms[permCode]) {
    return {
      success: false,
      response: forbidden('Sem permissão para realizar esta operação.', requestId),
    };
  }

  return authResult;
}

/**
 * Validates that the request has an active session AND the user has Admin or Super Admin role.
 */
export async function requireAdmin(req?: NextRequest): Promise<AuthResult> {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult;
  }

  if (!authResult.user.isAdmin && !authResult.user.isSuperAdmin) {
    return {
      success: false,
      response: forbidden('Operação reservada exclusivamente a Administradores.', authResult.requestId),
    };
  }

  return authResult;
}

/**
 * Convenience helper to authenticate request
 */
export async function authenticateRequest(req?: NextRequest): Promise<{ authenticated: boolean; user?: AuthenticatedUser; requestId: string }> {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    const requestId = req?.headers?.get('x-request-id') || crypto.randomUUID();
    return { authenticated: false, requestId };
  }
  return { authenticated: true, user: authResult.user, requestId: authResult.requestId };
}

