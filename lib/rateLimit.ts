import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';

export interface RateLimitOptions {
  limit: number;      // Maximum allowed requests within window
  windowSeconds: number; // Time window in seconds
}

export async function checkRateLimit(identifier: string, options: RateLimitOptions): Promise<{ success: boolean; remaining: number; resetTime: number }> {
  const client = createAdminClient();
  if (!client) throw new Error('Rate limiting service unavailable.');
  const { data, error } = await client.rpc('consume_rate_limit', {
    p_bucket: createHash('sha256').update(identifier).digest('hex'), p_limit: options.limit, p_window_seconds: options.windowSeconds,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) throw new Error('Rate limiting service unavailable.');
  return { success: row.success === true, remaining: Number(row.remaining), resetTime: new Date(row.reset_at).getTime() };
}
