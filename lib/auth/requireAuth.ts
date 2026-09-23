import { createClient, createAdminClient } from '@/lib/supabase/server';
import { GroupPermissions, getGroupPermissions } from '@/lib/permissions';

export interface AuthenticatedUser { id: string; auth_user_id: string; name: string; email: string; role_id: string; is_admin: boolean; type: string; }
export class AuthError extends Error { constructor(message = 'Sessão inválida ou expirada.', public statusCode = 401) { super(message); } }
export class ForbiddenError extends AuthError { constructor(message = 'Sem permissão para realizar esta operação.', statusCode = 403) { super(message, statusCode); } }

/** Validates only a Supabase session and an approved linked profile. */
export async function requireAuth(req?: Request): Promise<AuthenticatedUser> {
  const header = req?.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  
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
  }

  if (!userAuth) {
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
    .or(`auth_user_id.eq.${userAuth.id},id.eq.${userAuth.id}`).maybeSingle();

  if (profileError || !profile || profile.deleted) throw new AuthError('Utilizador não encontrado ou inativo.');
  if (!profile.approved) throw new ForbiddenError('A conta aguarda aprovação por um administrador.');

  return { id: profile.id, auth_user_id: userAuth.id, name: profile.name || '', email: profile.email || userAuth.email || '', role_id: profile.role_id, is_admin: Boolean(profile.is_admin), type: profile.type || 'Team' };
}
export async function requirePermission(reqOrCode: Request | keyof GroupPermissions, permissionCode?: keyof GroupPermissions): Promise<AuthenticatedUser> {
  const code = typeof reqOrCode === 'string' ? reqOrCode : permissionCode;
  if (!code) throw new ForbiddenError();
  const user = await requireAuth(typeof reqOrCode === 'string' ? undefined : reqOrCode);
  if (user.is_admin || user.role_id === 'ug-1' || user.role_id === '00000000-0000-0000-0000-000000000001') return user;
  if (!getGroupPermissions(user.role_id)[code]) throw new ForbiddenError();
  return user;
}
