import { type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';
import { cutoverMaintenanceResponse } from './lib/cutoverMaintenance';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

async function v1Quota(request: NextRequest) {
  if (!(request.nextUrl.pathname.startsWith('/api/v1/') || request.nextUrl.pathname.startsWith('/api/integrations/v1/'))
    || request.nextUrl.pathname === '/api/v1/openapi.json') return null;
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const unavailable = () => Response.json({ error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Serviço de limites indisponível.', requestId } },
    { status: 503, headers: { 'x-request-id': requestId } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return unavailable();
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const bytes = new TextEncoder().encode(`v1:${ip}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const bucket = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const db = createSupabaseClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc('consume_rate_limit', {
      p_bucket: bucket, p_limit: 120, p_window_seconds: 60,
    });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result) throw error || new Error('rate limiter unavailable');
    if (!result.success) return Response.json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Limite de pedidos excedido.', requestId } }, {
      status: 429,
      headers: { 'x-request-id': requestId, 'Retry-After': String(Math.max(1, Math.ceil((new Date(result.reset_at).getTime() - Date.now()) / 1000))) },
    });
    return null;
  } catch {
    return unavailable();
  }
}

export async function middleware(request: NextRequest) {
  const maintenance = cutoverMaintenanceResponse(request.nextUrl.pathname, process.env.ERP_CUTOVER_MAINTENANCE);
  if (maintenance) return maintenance;
  const quota = await v1Quota(request);
  if (quota) return quota;
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
