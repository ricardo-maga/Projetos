import { createClient, createAdminClient } from '@/lib/supabase/server';
import { GroupPermissions, getGroupPermissions } from '@/lib/permissions';
import { verifySession } from '@/lib/serverAuth';
import { cookies, headers } from 'next/headers';

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
 * Suporta cookies de sessão e Bearer tokens no cabeçalho Authorization (compatível com iframes).
 */
export async function requireAuth(req?: any): Promise<AuthenticatedUser> {
  let token: string | null = null;
  let cookieToken: string | null = null;

  // 1. Extrair token do objeto req (se fornecido)
  if (req) {
    if (typeof req === 'string') {
      token = req;
    } else if (req.headers) {
      const authHeader = typeof req.headers.get === 'function'
        ? req.headers.get('authorization')
        : (req.headers['authorization'] || req.headers['Authorization']);
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }
    if (req.cookies) {
      const c = typeof req.cookies.get === 'function'
        ? req.cookies.get('erp_session')?.value
        : req.cookies['erp_session'];
      if (c && typeof c === 'string') {
        cookieToken = c;
      }
    }
  }

  // 2. Extrair token do cabeçalho global Next.js se não encontrado no req
  if (!token) {
    try {
      const headerStore = await headers();
      const authHeader = headerStore.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    } catch {
      // headers() pode não estar disponível em todos os contextos
    }
  }

  // 3. Extrair cookie da store global Next.js
  if (!cookieToken) {
    try {
      const cookieStore = await cookies();
      cookieToken = cookieStore.get('erp_session')?.value || null;
    } catch {
      // cookies() pode não estar disponível em todos os contextos
    }
  }

  const supabase = await createClient(token || undefined);

  let authUser: any = null;

  // 4. Validar via Supabase Auth (token Bearer explícito)
  if (token) {
    try {
      const { data: tokenData } = await supabase.auth.getUser(token);
      if (tokenData?.user?.id) {
        authUser = tokenData.user;
      }
    } catch {
      // Token não é um JWT nativo do Supabase Auth (pode ser token assinado legacy)
    }
  }

  // 5. Validar via Supabase Auth (cookies)
  if (!authUser) {
    try {
      const { data: cookieData } = await supabase.auth.getUser();
      if (cookieData?.user?.id) {
        authUser = cookieData.user;
      }
    } catch {
      // Sem sessão Supabase nos cookies
    }
  }

  // 6. Se Supabase Auth não tiver sessão, verificar token assinado HMAC (legacy)
  let legacyPayload: any = null;
  if (!authUser) {
    if (token) {
      legacyPayload = verifySession(token);
    }
    if (!legacyPayload && cookieToken) {
      legacyPayload = verifySession(cookieToken);
    }
  }

  if (!authUser && !legacyPayload) {
    throw new AuthError('Sessão inválida ou expirada.');
  }

  const adminClient = createAdminClient();
  const dbClient = adminClient || supabase;

  let dbUser: any = null;

  if (authUser) {
    const authUserId = authUser.id;
    const userEmail = (authUser.email || '').trim().toLowerCase();

    // 1. Buscar por id exato
    try {
      const { data: byId } = await dbClient
        .from('users')
        .select('id, name, email, role_id, is_admin, type, deleted')
        .eq('id', authUserId)
        .eq('deleted', false)
        .maybeSingle();
      if (byId) dbUser = byId;
    } catch {
      // ignore
    }

    // 2. Buscar por email (case-insensitive)
    if (!dbUser && userEmail) {
      try {
        const { data: byEmail } = await dbClient
          .from('users')
          .select('id, name, email, role_id, is_admin, type, deleted')
          .ilike('email', userEmail)
          .eq('deleted', false)
          .maybeSingle();
        if (byEmail) dbUser = byEmail;
      } catch {
        // ignore
      }
    }

    // 3. Fallback especial para contas Ricardo (administrador do sistema)
    if (!dbUser && userEmail && (userEmail.includes('ricardo') || userEmail.endsWith('@domino-portugal.com'))) {
      try {
        const { data: ricardoUser } = await dbClient
          .from('users')
          .select('id, name, email, role_id, is_admin, type, deleted')
          .ilike('email', '%ricardo.magalhaes%')
          .eq('deleted', false)
          .limit(1);
        if (ricardoUser && ricardoUser.length > 0) {
          dbUser = ricardoUser[0];
        }
      } catch {
        // ignore
      }
    }

    // 4. Se o utilizador está autenticado no Supabase Auth mas ainda não tem perfil na tabela users, provisionar
    if (!dbUser && authUser) {
      try {
        const userName = authUser.user_metadata?.name || authUser.user_metadata?.full_name || (userEmail ? userEmail.split('@')[0] : 'Utilizador');
        const isAdmin = userEmail.includes('ricardo') || userEmail.endsWith('@domino-portugal.com');
        const roleId = isAdmin ? '00000000-0000-0000-0000-000000000002' : '00000000-0000-0000-0000-000000000004';

        const newRecord = {
          id: authUserId,
          name: userName,
          email: userEmail || `${authUserId}@user.local`,
          role_id: roleId,
          is_admin: isAdmin,
          approved: true,
          deleted: false,
          type: 'Team',
        };

        const { data: createdUser, error: createError } = await dbClient
          .from('users')
          .insert([newRecord])
          .select('id, name, email, role_id, is_admin, type, deleted')
          .maybeSingle();

        if (!createError && createdUser) {
          dbUser = createdUser;
        }
      } catch (provisionErr) {
        console.warn('Could not auto-provision user in requireAuth:', provisionErr);
      }
    }
  } else if (legacyPayload) {
    // 1. Buscar por id do payload legado
    try {
      const { data: byId } = await dbClient
        .from('users')
        .select('id, name, email, role_id, is_admin, type, deleted')
        .eq('id', legacyPayload.id)
        .eq('deleted', false)
        .maybeSingle();
      if (byId) dbUser = byId;
    } catch {
      // ignore
    }

    // 2. Buscar por email do payload legado
    if (!dbUser && legacyPayload.email) {
      try {
        const { data: byEmail } = await dbClient
          .from('users')
          .select('id, name, email, role_id, is_admin, type, deleted')
          .ilike('email', legacyPayload.email.trim().toLowerCase())
          .eq('deleted', false)
          .maybeSingle();
        if (byEmail) dbUser = byEmail;
      } catch {
        // ignore
      }
    }

    // 3. Fallback de dados do token legado caso a tabela esteja temporariamente indisponível
    if (!dbUser && legacyPayload.id) {
      dbUser = {
        id: legacyPayload.id,
        name: legacyPayload.name || 'Utilizador',
        email: legacyPayload.email || '',
        role_id: legacyPayload.roleId || '00000000-0000-0000-0000-000000000002',
        is_admin: !!legacyPayload.isAdmin,
        type: legacyPayload.type || 'Team',
        deleted: false,
      };
    }
  }

  if (!dbUser || dbUser.deleted) {
    throw new AuthError('Utilizador não encontrado ou inativo.');
  }

  return {
    id: dbUser.id,
    auth_user_id: authUser?.id || dbUser.id,
    name: dbUser.name || authUser?.user_metadata?.name || '',
    email: dbUser.email || authUser?.email || legacyPayload?.email || '',
    role_id: dbUser.role_id || '00000000-0000-0000-0000-000000000002',
    is_admin: !!dbUser.is_admin,
    type: dbUser.type || 'Team',
  };
}

/**
 * Função central para validar autenticação e permissão via Supabase Auth e matriz de grupos.
 */
export async function requirePermission(
  reqOrPermissionCode: any,
  permissionCode?: any
): Promise<AuthenticatedUser> {
  const code = typeof reqOrPermissionCode === 'string' ? reqOrPermissionCode : permissionCode;
  const user = await requireAuth(typeof reqOrPermissionCode === 'string' ? undefined : reqOrPermissionCode);

  // 1. Administrador tem acesso irrestrito
  if (user.is_admin === true || user.role_id === 'ug-1') {
    return user;
  }

  // 2. Obter permissões do grupo do utilizador
  const permissions = getGroupPermissions(user.role_id);

  // 3. Verificar permissão solicitada
  if (!permissions[code as keyof GroupPermissions]) {
    throw new ForbiddenError('Sem permissão para realizar esta operação.');
  }

  return user;
}

