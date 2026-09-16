import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';

function isSupabaseJwt(token?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return !!(payload.aud === 'authenticated' || payload.role === 'authenticated' || (typeof payload.iss === 'string' && payload.iss.includes('supabase')));
  } catch {
    return false;
  }
}

/**
 * Creates an official Supabase server client bound to Next.js cookies and headers.
 * Handles reading and writing session cookies securely in Route Handlers and Server Actions,
 * and automatically forwards Bearer authorization tokens for iframe compatibility.
 */
export async function createClient(customToken?: string) {
  const cookieStore = await cookies();

  let token = customToken;
  if (!token) {
    try {
      const headerStore = await headers();
      const authHeader = headerStore.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    } catch {
      // headers() might not be available in all contexts
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment credentials are not defined.');
  }

  const shouldAttachBearer = isSupabaseJwt(token);

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    global: shouldAttachBearer && token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
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
              sameSite: 'none',
              httpOnly: true,
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
