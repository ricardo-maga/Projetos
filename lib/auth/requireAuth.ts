import { createClient, createAdminClient } from '@/lib/supabase/server';
import { GroupPermissions, getGroupPermissions } from '@/lib/permissions';

export interface AuthenticatedUser { id: string; auth_user_id: string; name: string; email: string; role_id: string; is_admin: boolean; type: string; }
export class AuthError extends Error { constructor(message = 'Sessão inválida ou expirada.', public statusCode = 401) { super(message); } }
export class ForbiddenError extends Error { constructor(message = 'Sem permissão para realizar esta operação.', public statusCode = 403) { super(message); } }

/** Validates only a Supabase session and an approved linked profile. */
export async function requireAuth(req?: Request): Promise<AuthenticatedUser> {
  const header = req?.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const supabase = await createClient(token);
  const { data, error } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  if (error || !data.user) throw new AuthError();
  const admin = createAdminClient();
  if (!admin) throw new AuthError('Serviço de autenticação não configurado.', 503);
  const { data: profile, error: profileError } = await admin.from('users')
    .select('id, auth_user_id, name, email, role_id, is_admin, type, approved, deleted')
    .or(`auth_user_id.eq.${data.user.id},id.eq.${data.user.id}`).maybeSingle();
  if (profileError || !profile || profile.deleted) throw new AuthError('Utilizador não encontrado ou inativo.');
  if (!profile.approved) throw new ForbiddenError('A conta aguarda aprovação por um administrador.');
  return { id: profile.id, auth_user_id: data.user.id, name: profile.name || '', email: profile.email || data.user.email || '', role_id: profile.role_id, is_admin: Boolean(profile.is_admin), type: profile.type || 'Team' };
}
export async function requirePermission(reqOrCode: Request | keyof GroupPermissions, permissionCode?: keyof GroupPermissions): Promise<AuthenticatedUser> {
  const code = typeof reqOrCode === 'string' ? reqOrCode : permissionCode;
  if (!code) throw new ForbiddenError();
  const user = await requireAuth(typeof reqOrCode === 'string' ? undefined : reqOrCode);
  if (user.is_admin || user.role_id === 'ug-1') return user;
  if (!getGroupPermissions(user.role_id)[code]) throw new ForbiddenError();
  return user;
}
