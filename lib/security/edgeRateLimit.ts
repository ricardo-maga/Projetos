import { createClient } from '@supabase/supabase-js';

export type Quota = { success: boolean; resetAt: number };

/** Shared, atomic quota for middleware (which runs in the Edge runtime). */
export async function consumeEdgeQuota(identifier: string, limit: number, windowSeconds = 60): Promise<Quota> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Rate limiting service unavailable.');
  const bytes = new TextEncoder().encode(identifier);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const bucket = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc('consume_rate_limit', {
    p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result || !Number.isFinite(Date.parse(result.reset_at)))
    throw new Error('Rate limiting service unavailable.');
  return { success: result.success === true, resetAt: Date.parse(result.reset_at) };
}

export function quotaResponse(quota: Quota, requestId: string): Response | null {
  if (quota.success) return null;
  return Response.json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Limite de pedidos excedido.', requestId } }, {
    status: 429,
    headers: { 'x-request-id': requestId, 'Retry-After': String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000))) },
  });
}

export function quotaUnavailable(requestId: string): Response {
  return Response.json({ error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Serviço de limites indisponível.', requestId } },
    { status: 503, headers: { 'x-request-id': requestId } });
}
