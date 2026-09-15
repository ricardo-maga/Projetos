import { createClient } from '@/lib/supabase/server';

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
