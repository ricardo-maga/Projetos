import { AsyncLocalStorage } from 'node:async_hooks';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { authCookieLifetime, SESSION_PREFERENCE_COOKIE } from '@/lib/auth/sessionPersistence';

/**
 * Creates an official Supabase server client bound to Next.js cookies.
 * Handles reading and writing session cookies securely in Route Handlers and Server Actions.
 */
export async function createClient(customToken?: string, loginPreference?: string, options?: {
  fetcher?: typeof fetch;
  recovery?: boolean;
}) {
  const cookieStore = await cookies();
  const preference = loginPreference ?? cookieStore.get(SESSION_PREFERENCE_COOKIE)?.value;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment credentials are not defined.');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    global: { ...(customToken ? { headers: { Authorization: `Bearer ${customToken}` } } : {}), fetch: options?.fetcher },
    cookieOptions: options?.recovery ? { name: 'erp-recovery-auth-token' } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              ...(options.maxAge !== 0 && value
                ? (name.startsWith('erp-recovery-auth-token') ? { maxAge: 3600 } : authCookieLifetime(preference)) : {}),
              ...(name.startsWith('erp-recovery-auth-token') || name.includes('-code-verifier') ? { httpOnly: true } : {}),
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            });
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}

/** Verifies credentials without replacing the browser session. */
export function createIsolatedAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return url && key ? createSupabaseJsClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) : null;
}

/**
 * Creates a server-only administrative Supabase client using the Service Role Key.
 * NEVER exposed to the browser. Used exclusively for operations like bootstrap and recovery.
 */
export function createAdminClient(headers?: Record<string, string>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createSupabaseJsClient(supabaseUrl, serviceRoleKey, {
    global: headers ? { headers } : undefined,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Resolves the privileged database client after the route checks RBAC.
 */
export async function getServerDbClient(req: Request, actor: { id: string; requestId?: string }) {
  if (!actor?.id) throw new Error('Authenticated actor required for database access.');
  return createAdminClient(
    req && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? auditRequestHeaders(actor) : undefined,
  );
}

const auditOperation = new AsyncLocalStorage<string>();

export function runWithAuditOperation<T>(id: string, operation: () => T): T {
  return auditOperation.run(id, operation);
}

/** Only the server, after resolving the actor, sends these headers to PostgREST. */
export function auditRequestHeaders(actor: { id: string; requestId?: string }) {
  return {
    'x-projetos-audit-actor': actor.id,
    'x-projetos-audit-operation': auditOperation.getStore() || actor.requestId || crypto.randomUUID(),
  };
}
