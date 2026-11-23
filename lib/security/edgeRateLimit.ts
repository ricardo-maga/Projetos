import { createClient } from '@supabase/supabase-js';

export type Quota = { success: boolean; resetAt: number; limit: number; remaining: number };

/** Shared, atomic quota for middleware (which runs in the Edge runtime). */
export async function consumeEdgeQuota(identifier: string, limit: number, windowSeconds = 60): Promise<Quota> {
  return (await consumeEdgeQuotas([{ identifier, limit, windowSeconds }]))[0];
}

export async function consumeEdgeQuotas(
  requests: { identifier: string; limit: number; windowSeconds?: number; cost?: number }[],
): Promise<Quota[]> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Rate limiting service unavailable.');
  const limits = await Promise.all(requests.map(async ({ identifier, limit, windowSeconds = 60, cost = 1 }) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identifier));
    const bucket = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { bucket, max_requests: limit, window_seconds: windowSeconds, cost };
  }));
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc('consume_rate_limits', { p_limits: limits });
  if (error || !Array.isArray(data)) throw new Error('Rate limiting service unavailable.');
  return limits.map(({ bucket, max_requests: limit }) => {
    const row = data.find(result => result.bucket === bucket);
    if (!row || !Number.isFinite(Date.parse(row.reset_at))) throw new Error('Rate limiting service unavailable.');
    return { success: row.success === true, limit, remaining: row.remaining, resetAt: Date.parse(row.reset_at) };
  });
}

export function quotaHeaders(quota: Quota) {
  return {
    'RateLimit-Limit': String(quota.limit),
    'RateLimit-Remaining': String(quota.remaining),
    'RateLimit-Reset': String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000))),
  };
}

export function quotaResponse(quota: Quota, requestId: string): Response | null {
  if (quota.success) return null;
  const limits = quotaHeaders(quota);
  const message = 'Limite de pedidos excedido.';
  return Response.json({ success: false, message, error: { code: 'TOO_MANY_REQUESTS', message, requestId } }, {
    status: 429,
    headers: { 'x-request-id': requestId, 'Retry-After': limits['RateLimit-Reset'], ...limits },
  });
}

export function quotaUnavailable(requestId: string): Response {
  const message = 'Serviço de limites indisponível.';
  return Response.json({ success: false, message, error: { code: 'RATE_LIMIT_UNAVAILABLE', message, requestId } },
    { status: 503, headers: { 'x-request-id': requestId } });
}
