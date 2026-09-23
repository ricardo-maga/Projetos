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

export { AuthError, ForbiddenError };

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
 * Reutiliza a função central de lib/auth/requireAuth.ts.
 * Converte o resultado para AuthResult (compatível com a camada HTTP de v1 APIs).
 */
export async function requireAuth(req?: NextRequest): Promise<AuthResult> {
  const requestId = req?.headers?.get('x-request-id') || crypto.randomUUID();

  try {
    const centralUser = await requireCentralAuth(req);
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
    if (error instanceof ForbiddenError) {
      return {
        success: false,
        response: forbidden(error.message, requestId),
      };
    }
    const message = error instanceof AuthError ? error.message : 'Sessão inválida ou expirada. Faça login novamente.';
    return {
      success: false,
      response: unauthorized(message, requestId),
    };
  }
}

/**
 * Reutiliza requirePermission() de lib/auth/requireAuth.ts.
 * Suporta ambas as assinaturas:
 *  - requirePermission('tickets_read') -> lança AuthError/ForbiddenError ou devolve CentralUser
 *  - requirePermission(req, 'projects_read') -> devolve AuthResult (HTTP Response em caso de erro)
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
  const permCode = (permissionCode || '') as keyof GroupPermissions;
  const requestId = req?.headers?.get('x-request-id') || crypto.randomUUID();

  try {
    const centralUser = await requireCentralPermission(req, permCode);
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
    if (error instanceof ForbiddenError) {
      return {
        success: false,
        response: forbidden(error.message, requestId),
      };
    }
    const message = error instanceof AuthError ? error.message : 'Sessão inválida ou expirada. Faça login novamente.';
    return {
      success: false,
      response: unauthorized(message, requestId),
    };
  }
}

/**
 * Valida se a requisição tem sessão ativa E se o utilizador é Administrador.
 * Reutiliza a requireAuth() central de lib/auth/requireAuth.ts.
 */
export async function requireAdmin(req?: NextRequest): Promise<AuthResult> {
  const requestId = req?.headers?.get('x-request-id') || crypto.randomUUID();

  try {
    const centralUser = await requireCentralAuth(req);
    if (!centralUser.is_admin && centralUser.role_id !== 'ug-1' && centralUser.role_id !== '00000000-0000-0000-0000-000000000001') {
      return {
        success: false,
        response: forbidden('Operação reservada exclusivamente a Administradores.', requestId),
      };
    }

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
    if (error instanceof ForbiddenError) {
      return {
        success: false,
        response: forbidden(error.message, requestId),
      };
    }
    const message = error instanceof AuthError ? error.message : 'Sessão inválida ou expirada. Faça login novamente.';
    return {
      success: false,
      response: unauthorized(message, requestId),
    };
  }
}

/**
 * Função utilitária para autenticar uma requisição.
 * Reutiliza a requireAuth() central de lib/auth/requireAuth.ts.
 */
export async function authenticateRequest(req?: NextRequest): Promise<{ authenticated: boolean; user?: AuthenticatedUser; requestId: string }> {
  const requestId = req?.headers?.get('x-request-id') || crypto.randomUUID();
  try {
    const centralUser = await requireCentralAuth(req);
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
    return { authenticated: true, user, requestId };
  } catch {
    return { authenticated: false, requestId };
  }
}

