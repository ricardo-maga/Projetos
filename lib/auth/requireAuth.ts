import { createClient } from '@/lib/supabase/server';
import { GroupPermissions, getGroupPermissions } from '@/lib/permissions';

export interface AuthenticatedUser {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  role_id: string;
  is_admin: boolean;
  type: string;
}

export class AuthError extends Error {
  public statusCode: number;

  constructor(message: string = 'Sessão inválida ou expirada.', statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export class ForbiddenError extends Error {
  public statusCode: number;

  constructor(message: string = 'Sem permissão para realizar esta operação.', statusCode: number = 403) {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = statusCode;
  }
}

/**
 * Função central para verificar se um utilizador está autenticado através do Supabase Auth.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const supabase = await createClient();

  const { data, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !data?.claims || !data.claims.sub) {
    throw new AuthError('Sessão inválida ou expirada.');
  }

  const authUserId = data.claims.sub as string;

  let { data: dbUser } = await supabase
    .from('users')
    .select('id, auth_user_id, name, email, role_id, is_admin, type, deleted')
    .eq('auth_user_id', authUserId)
    .eq('deleted', false)
    .maybeSingle();

  if (!dbUser) {
    const { data: fallbackUser } = await supabase
      .from('users')
      .select('id, auth_user_id, name, email, role_id, is_admin, type, deleted')
      .eq('id', authUserId)
      .eq('deleted', false)
      .maybeSingle();
    dbUser = fallbackUser;
  }

  if (!dbUser || dbUser.deleted) {
    throw new AuthError('Utilizador não encontrado ou inativo.');
  }

  return {
    id: dbUser.id,
    auth_user_id: dbUser.auth_user_id || authUserId,
    name: dbUser.name || '',
    email: dbUser.email || (data.claims.email as string) || '',
    role_id: dbUser.role_id || 'ug-5',
    is_admin: !!dbUser.is_admin,
    type: dbUser.type || 'standard',
  };
}

/**
 * Função central para validar autenticação e permissão via Supabase Auth e matriz de grupos.
 */
export async function requirePermission(
  permissionCode: keyof GroupPermissions
): Promise<AuthenticatedUser> {
  const user = await requireAuth();

  // 1. Administrador tem acesso irrestrito
  if (user.is_admin === true || user.role_id === 'ug-1') {
    return user;
  }

  // 2. Obter permissões do grupo do utilizador
  const permissions = getGroupPermissions(user.role_id);

  // 3. Verificar permissão solicitada
  if (!permissions[permissionCode]) {
    throw new ForbiddenError('Sem permissão para realizar esta operação.');
  }

  return user;
}

