import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { unauthorized, forbidden } from '@/lib/apiErrors';
import { GroupPermissions, hasPermission as checkPermissionLegacy, DEFAULT_PERMISSIONS } from '@/lib/permissions';
import { verifySession as verifyLegacySession } from '@/lib/serverAuth';
import { supabase as fallbackSupabase } from '@/lib/supabaseClient';

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
 * Checks Supabase Auth SSR session first, with transitional migration support for legacy tokens.
 */
export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

  try {
    const supabase = await createServerClient();
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    if (authUser && authUser.email) {
      // User is authenticated via Supabase Auth SSR!
      // Fetch user profile from database
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .or(`id.eq.${authUser.id},email.ilike.${authUser.email}`)
        .limit(1)
        .maybeSingle();

      if (profileError) {
        console.error('[AUTH ERROR] Error fetching user profile:', profileError);
      }

      if (profile && profile.deleted) {
        return {
          success: false,
          response: unauthorized('A sua conta foi desativada.', requestId),
        };
      }

      if (profile && profile.approved === false) {
        return {
          success: false,
          response: unauthorized('A sua conta aguarda aprovação por um administrador.', requestId),
        };
      }

      const isAdmin = profile ? !!profile.is_admin : (authUser.app_metadata?.role === 'admin' || authUser.app_metadata?.role === 'SUPER_ADMIN');
      const isSuperAdmin = isAdmin; // Admins have root privileges
      const roleId = profile?.role_id || (isAdmin ? 'ug-1' : 'ug-5');

      const permissions = (DEFAULT_PERMISSIONS as any)[roleId] || DEFAULT_PERMISSIONS['ug-5'];

      const user: AuthenticatedUser = {
        id: profile?.id || authUser.id,
        email: authUser.email,
        name: profile?.name || authUser.user_metadata?.name || authUser.email.split('@')[0],
        roleId,
        isAdmin,
        isSuperAdmin,
        approved: profile ? profile.approved : true,
        permissions,
      };

      return { success: true, user, requestId };
    }

    // Transitional migration layer: support verifying existing verified sessions during migration
    // without permitting hardcoded or weak credentials.
    const legacySession = verifyLegacySession(req);
    if (legacySession) {
      const sb = fallbackSupabase;
      let isStillActive = true;

      if (sb) {
        const { data: dbUser } = await sb.from('users').select('id, approved, deleted').eq('id', legacySession.id).maybeSingle();
        if (dbUser && (dbUser.deleted || !dbUser.approved)) {
          isStillActive = false;
        }
      }

      if (isStillActive) {
        const permissions = (DEFAULT_PERMISSIONS as any)[legacySession.roleId] || (legacySession.isAdmin ? DEFAULT_PERMISSIONS['ug-1'] : DEFAULT_PERMISSIONS['ug-5']);
        const user: AuthenticatedUser = {
          id: legacySession.id,
          email: legacySession.email,
          name: legacySession.name,
          roleId: legacySession.roleId,
          isAdmin: !!legacySession.isAdmin,
          isSuperAdmin: !!legacySession.isAdmin,
          approved: true,
          permissions,
        };

        return { success: true, user, requestId };
      }
    }

    return {
      success: false,
      response: unauthorized('Sessão inválida ou expirada. Faça login novamente.', requestId),
    };
  } catch (error: any) {
    console.error('[AUTH EXCEPTION] Error in requireAuth:', error);
    return {
      success: false,
      response: unauthorized('Falha na validação de sessão.', requestId),
    };
  }
}

/**
 * Validates that the request has an active session AND the user possesses the required permission.
 */
export async function requirePermission(
  req: NextRequest,
  permissionCode: keyof GroupPermissions | string
): Promise<AuthResult> {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult;
  }

  const { user, requestId } = authResult;

  // Admins and Super Admins bypass permission checks
  if (user.isAdmin || user.isSuperAdmin) {
    return authResult;
  }

  // Check specific permission
  const userPerms = user.permissions || {};
  if ((userPerms as any)[permissionCode] !== true) {
    return {
      success: false,
      response: forbidden(`Sem permissão para realizar esta operação (${permissionCode}).`, requestId),
    };
  }

  return authResult;
}

/**
 * Validates that the request has an active session AND the user has Admin or Super Admin role.
 */
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
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
export async function authenticateRequest(req: NextRequest): Promise<{ authenticated: boolean; user?: AuthenticatedUser; requestId: string }> {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    return { authenticated: false, requestId };
  }
  return { authenticated: true, user: authResult.user, requestId: authResult.requestId };
}
