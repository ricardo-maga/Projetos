import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { authCookieLifetime, SESSION_PREFERENCE_COOKIE } from '@/lib/auth/sessionPersistence';

/**
 * Creates an official Supabase browser client with PKCE and cookie management.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase client credentials are not defined.');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(document.cookie);
      },
      setAll(cookiesToSet) {
        const preference = parseCookieHeader(document.cookie)
          .find(cookie => cookie.name === SESSION_PREFERENCE_COOKIE)?.value;
        cookiesToSet.forEach(({ name, value, options }) => {
          document.cookie = serializeCookieHeader(name, value, {
            ...options,
            ...(value && options.maxAge !== 0 ? authCookieLifetime(preference) : {}),
            secure: window.location.protocol === 'https:',
            sameSite: 'lax',
            path: '/',
          });
        });
      },
    },
  });
}
