import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Creates an official Supabase server client bound to Next.js cookies.
 * Handles reading and writing session cookies securely in Route Handlers and Server Actions.
 */
export async function createClient(customToken?: string) {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment credentials are not defined.');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    global: customToken ? { headers: { Authorization: `Bearer ${customToken}` } } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              secure: true,
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

/**
 * Creates a server-only administrative Supabase client using the Service Role Key.
 * NEVER exposed to the browser. Used exclusively for operations like bootstrap and recovery.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createSupabaseJsClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Resolves the most reliable database client for server API route handlers.
 * Prefers the service role admin client when available, or passes the request's
 * Bearer authorization token so Row-Level Security (RLS) identifies the user.
 */
export async function getServerDbClient(req?: Request) {
  const admin = createAdminClient();
  if (admin) return admin;

  const header = req?.headers?.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

  if (token) {
    try {
      const client = await createClient(token);
      if (client) return client;
    } catch {
      // fallback
    }
  }

  try {
    const client = await createClient();
    if (client) return client;
  } catch {
    // fallback
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    return createSupabaseJsClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return null;
}
