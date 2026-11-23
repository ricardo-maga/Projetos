import { createClient, createAdminClient } from '@/lib/supabase/server';
import { GroupPermissions } from '@/lib/permissions';
import { profileEligibility } from './profileEligibility';

export interface AuthenticatedUser {
  requestId?: string;
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

type SupabaseIdentity = { id: string; email?: string };
const authenticatedIdentities = new WeakMap<Request, Promise<SupabaseIdentity>>();

async function identify(req?: Request): Promise<SupabaseIdentity> {
  const header = req?.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (header != null && (!token || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)))
    throw new AuthError('Credencial Bearer inválida.');
  if (req && !token && !/(?:^|;\s*)sb-[^;=]+-auth-token(?:\.\d+)?=/.test(req.headers.get('cookie') || ''))
    throw new AuthError('Sessão inválida ou expirada.');
  try {
    const supabase = await createClient(token);
    const { data, error } = await supabase.auth.getUser(token);
    if (data.user) return data.user;
    if (error?.name === 'AuthRetryableFetchError' || (error?.status && error.status >= 500))
      throw new AuthError('Serviço de autenticação indisponível.', 503);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('Serviço de autenticação indisponível.', 503);
  }
  throw new AuthError('Sessão inválida ou expirada.');
}

function verifiedIdentity(req?: Request) {
  if (!req) return identify();
  const cached = authenticatedIdentities.get(req);
  if (cached) return cached;
  const verified = identify(req);
  authenticatedIdentities.set(req, verified);
  return verified;
}

type ActorContext = {
  profile: {
    id: string; name: string | null; email: string | null; role_id: string | null;
    is_admin: boolean; type: string | null; deleted: boolean | null; approved: boolean | null;
  } | null;
  roles: { id: string; code: string; name: string }[];
  permissions: string[];
  allowed: boolean | null;
};

type ContextOptions = { includePermissions?: boolean; permission?: string };
const authenticatedContexts = new WeakMap<Request, Map<string, Promise<AuthenticatedUser>>>();

async function loadActor(req: Request | undefined, options: ContextOptions): Promise<AuthenticatedUser> {
  const userAuth = await verifiedIdentity(req);
  const admin = createAdminClient();
  if (!admin) throw new AuthError('Serviço de autenticação não configurado.', 503);
  const { data, error } = await admin.rpc('api_actor_context', {
    p_auth_user_id: userAuth.id,
    p_permission: options.permission ?? null,
    p_include_permissions: options.includePermissions !== false,
  });
  if (error || !data) {
    console.error('[AUTH RPC ERROR]', error?.code);
    throw new AuthError('Serviço de autorização indisponível.', 503);
  }
  const { profile, roles, permissions, allowed } = data as ActorContext;
  if (!profile) throw new AuthError('Utilizador não encontrado ou inativo.');
  const eligibility = profileEligibility(profile);
  if (eligibility === 'deleted') throw new AuthError('Utilizador não encontrado ou inativo.');
  if (eligibility === 'pending') throw new ForbiddenError('A conta aguarda aprovação por um administrador.');
  if (eligibility === 'external') throw new ForbiddenError('Este utilizador não está autorizado a aceder ao sistema interno.');
  if (options.permission) {
    if (!roles.length) throw new ForbiddenError('Utilizador sem role válida atribuída.');
    if (allowed !== true) throw new ForbiddenError();
  }
  return {
    requestId: req?.headers.get('x-request-id') || undefined,
    id: profile.id,
    auth_user_id: userAuth.id,
    name: profile.name || '',
    email: profile.email || userAuth.email || '',
    role_id: profile.role_id || null,
    role_ids: roles.map(role => role.id),
    role_codes: roles.map(role => role.code),
    role_names: roles.map(role => role.name),
    permissions,
    is_admin: Boolean(profile.is_admin),
    is_super_admin: roles.some(role => role.code === 'SUPER_ADMIN'),
    type: profile.type || 'Team',
  };
}

function actorContext(req: Request | undefined, options: ContextOptions) {
  if (!req) return loadActor(req, options);
  const key = JSON.stringify([options.permission, options.includePermissions !== false]);
  const contexts = authenticatedContexts.get(req) ?? new Map<string, Promise<AuthenticatedUser>>();
  authenticatedContexts.set(req, contexts);
  const cached = contexts.get(key);
  if (cached) return cached;
  const actor = loadActor(req, options);
  contexts.set(key, actor);
  return actor;
}

/** Validates only a Supabase session and an approved linked profile. */
export function requireAuth(req?: Request, options: { includePermissions?: boolean } = {}) {
  return actorContext(req, options);
}

export function requirePermission(
  reqOrCode: Request | keyof GroupPermissions | string,
  permissionCode?: keyof GroupPermissions | string,
): Promise<AuthenticatedUser> {
  const permission = typeof reqOrCode === 'string' ? reqOrCode : permissionCode;
  if (!permission) return Promise.reject(new ForbiddenError());
  const request = typeof reqOrCode === 'string' ? undefined : reqOrCode;
  return actorContext(request, { permission, includePermissions: false });
}
