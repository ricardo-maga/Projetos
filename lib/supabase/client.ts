import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates an official Supabase browser client with PKCE and cookie management.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase client credentials are not defined.');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
