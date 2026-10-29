import { createClient } from '@supabase/supabase-js';
import { createClient as createBrowserClient } from './supabase/client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

const isBrowser = typeof window !== 'undefined';

// Lazy initialization pattern to prevent crashes if credentials are missing
export const supabase = isSupabaseConfigured
  ? isBrowser
    ? createBrowserClient()
    : createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
  : null;
