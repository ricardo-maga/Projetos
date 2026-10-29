import { createClient, createAdminClient } from '@/lib/supabase/server';
import { GroupPermissions } from '@/lib/permissions';
import { profileEligibility } from './profileEligibility';

export interface AuthenticatedUser {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  role_id: string | null;
  role_ids: string[];
  role_codes: string[];
  role_names: string[];
  permissions: string[];
  is_admin: boolean;
  is_super_admin: boolean;
  type: string;
}
export class AuthError extends Error { constructor(message = 'Sessão inválida ou expirada.', public statusCode = 401) { super(message); } }
export class ForbiddenError extends AuthError { constructor(message = 'Sem permissão para realizar esta operação.', statusCode = 403) { super(message, statusCode); } }

/** Validates only a Supabase session and an approved linked profile. */
export async function requireAuth(req?: Request, options: { includePermissions?: boolean } = {}): Promise<AuthenticatedUser> {
  const header = req?.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (header !== null && header !== undefined && !token) throw new AuthError('Credencial Bearer inválida.');
  
  let userAuth: any = null;
  let authError: any = null;

  if (token) {
    try {
      const supabase = await createClient(token);
      const { data, error } = await supabase.auth.getUser(token);
      if (data?.user) {
        userAuth = data.user;
      } else {
        authError = error;
      }
    } catch (e: any) {
      authError = e;
    }

    if (!userAuth) {
      try {
        const admin = createAdminClient();
        if (admin) {
          const { data, error } = await admin.auth.getUser(token);
          if (data?.user) {
            userAuth = data.user;
          } else if (!authError) {
            authError = error;
          }
        }
      } catch (e: any) {
        if (!authError) authError = e;
      }
    }
  }

  if (!userAuth && !token) {
    try {
      const supabaseCookie = await createClient();
      const { data, error } = await supabaseCookie.auth.getUser();
      if (data?.user) {
        userAuth = data.user;
      } else {
        if (!authError) authError = error;
      }
    } catch (e: any) {
      if (!authError) authError = e;
    }
  }

  if (!userAuth) throw new AuthError('Sessão inválida ou expirada.');

  const admin = createAdminClient();
  if (!admin) throw new AuthError('Serviço de autenticação não configurado.', 503);

  const { data: profile, error: profileError } = await admin.from('users')
    .select('id, auth_user_id, name, email, role_id, is_admin, type, approved, deleted')
    .eq('auth_user_id', userAuth.id).maybeSingle();

  if (profileError || !profile) throw new AuthError('Utilizador não encontrado ou inativo.');
  const eligibility = profileEligibility(profile);
  if (eligibility === 'deleted') throw new AuthError('Utilizador não encontrado ou inativo.');
  if (eligibility === 'pending') throw new ForbiddenError('A conta aguarda aprovação por um administrador.');
  if (eligibility === 'external') throw new ForbiddenError('Este utilizador não está autorizado a aceder ao sistema interno.');

  const { data: assignments, error: assignmentsError } = await admin.from('user_roles').select('role_id').eq('user_id', profile.id);
  if (assignmentsError) throw new AuthError('Não foi possível carregar as funções do utilizador.', 503);
  const roleIds = [...new Set((assignments || []).map((assignment: any) => assignment.role_id).filter(Boolean))];
  const { data: activeRoles, error: rolesError } = roleIds.length
    ? await admin.from('roles').select('id,code,name').eq('is_active', true).in('id', roleIds)
    : { data: [], error: null };
  if (rolesError) throw new AuthError('Não foi possível validar as funções do utilizador.', 503);
  const activeRoleIds = (activeRoles || []).map((role: any) => role.id);
  let permissionCodes: string[] = [];
  if (options.includePermissions !== false) {
    const { data: roleGrants, error: grantsError } = activeRoleIds.length
      ? await admin.from('role_permissions').select('permission_id').in('role_id', activeRoleIds)
      : { data: [], error: null };
    if (grantsError) throw new AuthError('Não foi possível carregar as permissões do utilizador.', 503);
    const permissionIds = [...new Set((roleGrants || []).map((grant: any) => grant.permission_id).filter(Boolean))];
    const { data: permissionRows, error: permissionsError } = permissionIds.length
      ? await admin.from('permissions').select('code').eq('is_active', true).in('id', permissionIds)
      : { data: [], error: null };
    if (permissionsError) throw new AuthError('Não foi possível carregar as permissões do utilizador.', 503);
    permissionCodes = [...new Set((permissionRows || []).map((permission: any) => permission.code))];
  }
  const roles = activeRoles || [];

  return {
    id: profile.id,
    auth_user_id: userAuth.id,
    name: profile.name || '',
    email: profile.email || userAuth.email || '',
    role_id: profile.role_id || null,
    role_ids: activeRoleIds,
    role_codes: roles.map((role: any) => role.code),
    role_names: roles.map((role: any) => role.name),
    permissions: permissionCodes,
    is_admin: Boolean(profile.is_admin),
    is_super_admin: roles.some((role: any) => role.code === 'SUPER_ADMIN'),
    type: profile.type || 'Team',
  };
}
export async function requirePermission(reqOrCode: Request | keyof GroupPermissions | string, permissionCode?: keyof GroupPermissions | string): Promise<AuthenticatedUser> {
  const code = typeof reqOrCode === 'string' ? reqOrCode : permissionCode;
  if (!code) throw new ForbiddenError();
  // The RPC is authoritative for this permission. Loading the entire permission
  // catalogue here would repeat two database reads on every protected request.
  const user = await requireAuth(typeof reqOrCode === 'string' ? undefined : reqOrCode,
    { includePermissions: false });
  
  if (!user.id || user.role_ids.length === 0) {
    throw new ForbiddenError('Utilizador sem role válida atribuída.');
  }

  // Boundary única de autorização: consulta a RPC PostgreSQL has_permission()
  const admin = createAdminClient();
  if (!admin) {
    throw new AuthError('Serviço de autorização indisponível.', 503);
  }

  const { data: hasPerm, error } = await admin.rpc('has_permission', {
    p_permission_code: code,
    p_user_id: user.auth_user_id,
  });

  if (error) {
    console.error('[AUTH RPC ERROR]', error);
    throw new AuthError('Erro de infraestrutura ao validar permissões no PostgreSQL.', 503);
  }

  if (hasPerm !== true) {
    throw new ForbiddenError('Sem permissão para realizar esta operação.');
  }

  return user;
}
