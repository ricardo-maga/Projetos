import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';
import { cutoverMaintenanceResponse } from './lib/cutoverMaintenance';
import { consumeEdgeQuotas, quotaHeaders, quotaResponse, quotaUnavailable } from './lib/security/edgeRateLimit';
import { clientIp } from './lib/security/clientIp';
import { isUuid } from './lib/security/identifiers';

function validateMutationOrigin(request: NextRequest, requestId: string) {
  const { pathname, origin } = request.nextUrl;
  if (!pathname.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;
  const hasBearer = /^Bearer [^\s]+$/i.test(request.headers.get('authorization') || '');
  const cookieAuth = request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
  const originHeader = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const browser = originHeader !== null || referer !== null || request.headers.has('sec-fetch-site');
  const reject = (status: number, code: string, message: string) => Response.json({
    success: false, message, error: { code, message, requestId },
  }, { status, headers: { 'x-request-id': requestId } });

  if (!hasBearer && (cookieAuth || browser)) {
    let source = originHeader;
    if (!source && referer) {
      try { source = new URL(referer).origin; } catch { source = null; }
    }
    if (source !== origin)
      return reject(403, 'FORBIDDEN', 'A origem do pedido não é autorizada.');
  }

  if (!hasBearer && (cookieAuth || browser) && request.body && request.headers.get('content-length') !== '0') {
    const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const upload = pathname.startsWith('/api/v1/presales/') && pathname.endsWith('/assets');
    if (contentType !== 'application/json' && !(upload && contentType === 'multipart/form-data'))
      return reject(415, 'UNSUPPORTED_MEDIA_TYPE', 'Formato do pedido não suportado.');
  }
  return null;
}

async function validateApiEnvelope(request: NextRequest, requestId: string): Promise<Response | null> {
  const { pathname, searchParams } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return null;
  const reject = (status: number, message: string) => Response.json({ error: {
    code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST', message, requestId,
  } }, { status, headers: { 'x-request-id': requestId } });
  if (request.url.length > 4096 || pathname.split('/').some(segment => segment.length > 255) ||
    [...searchParams].length > 30 || [...searchParams].some(([key, value]) =>
      key.length > 64 || value.length > 512 || /[\u0000-\u001f\u007f]/.test(key + value)))
    return reject(400, 'Parâmetros do pedido inválidos ou demasiado longos.');
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  const maxBytes = pathname.includes('/assets') ? 11 * 1024 * 1024
    : pathname === '/api/supabase/sync' ? 8 * 1024 * 1024 : 1024 * 1024;
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    return reject(413, 'Corpo do pedido demasiado grande.');
  // Read a clone so chunked requests cannot bypass the length check.
  if (request.body) {
    const reader = request.clone().body!.getReader();
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          void reader.cancel().catch(() => undefined);
          return reject(413, 'Corpo do pedido demasiado grande.');
        }
      }
    } catch {
      return reject(400, 'Corpo do pedido inválido.');
    }
  }
  return null;
}

async function apiQuota(request: NextRequest, requestId: string) {
  if (!request.nextUrl.pathname.startsWith('/api/')) return null;
  const url = request.nextUrl;
  const isV1 = url.pathname.startsWith('/api/v1/') || url.pathname.startsWith('/api/integrations/v1/');
  const ip = clientIp(request);
  if (!ip) return quotaUnavailable(requestId);
  try {
    const limits = [{ identifier: `api:ip:${ip}`, limit: 600 }];
    if (isV1 && url.pathname !== '/api/v1/openapi.json')
      limits.push({ identifier: `v1:${ip}`, limit: 120 });
    const quotas = await consumeEdgeQuotas(limits);
    const overLimit = quotas.find(quota => !quota.success);
    return overLimit ? quotaResponse(overLimit, requestId) : quotas.at(-1);
  } catch {
    return quotaUnavailable(requestId);
  }
}

function applyLegacyHeaders(request: NextRequest, response: Response) {
  if (!request.nextUrl.pathname.startsWith('/api/supabase/')) return;
  const deprecated = Date.parse(process.env.API_LEGACY_DEPRECATION_DATE || '2026-11-23T00:00:00Z');
  if (Number.isFinite(deprecated)) response.headers.set('Deprecation', `@${Math.floor(deprecated / 1000)}`);
  const sunset = Date.parse(process.env.API_LEGACY_SUNSET || '');
  if (Number.isFinite(sunset) && sunset >= deprecated) response.headers.set('Sunset', new Date(sunset).toUTCString());
  response.headers.append('Link', '</api/v1/openapi.json>; rel="service-desc"');
}

function integrationCors(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/integrations/v1/')) return null;
  const origin = request.headers.get('origin');
  if (!origin || !process.env.API_INTEGRATION_CORS_ORIGINS?.split(',').map(value => value.trim()).includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-Api-Key, If-None-Match, X-Request-Id',
    'Access-Control-Expose-Headers': 'RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-Request-Id',
    'Access-Control-Max-Age': '600',
  };
}

export async function middleware(request: NextRequest) {
  const incomingId = request.headers.get('x-request-id');
  const requestId = isUuid(incomingId) ? incomingId : crypto.randomUUID();
  const maintenance = cutoverMaintenanceResponse(request.nextUrl.pathname, process.env.ERP_CUTOVER_MAINTENANCE);
  if (maintenance) {
    maintenance.headers.set('x-request-id', requestId);
    return maintenance;
  }
  if (request.nextUrl.pathname === '/api/health' || request.nextUrl.pathname === '/api/ready') {
    const response = NextResponse.next();
    response.headers.set('x-request-id', requestId);
    return response;
  }
  const cors = integrationCors(request);
  if (request.method === 'OPTIONS' && cors)
    return new Response(null, { status: 204, headers: { ...cors, Vary: 'Origin', 'x-request-id': requestId } });
  const originError = validateMutationOrigin(request, requestId);
  if (originError) return originError;
  const invalid = await validateApiEnvelope(request, requestId);
  if (invalid) return invalid;
  const quota = await apiQuota(request, requestId);
  const response = quota instanceof Response ? quota : await updateSession(request, requestId);
  if (quota && !(quota instanceof Response) && !response.headers.has('RateLimit-Limit'))
    for (const [key, value] of Object.entries(quotaHeaders(quota))) response.headers.set(key, value);
  applyLegacyHeaders(request, response);
  if (request.nextUrl.pathname.startsWith('/api/integrations/v1/')) response.headers.append('Vary', 'Origin');
  if (cors) for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
  return response;
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
