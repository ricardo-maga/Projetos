import { type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';
import { cutoverMaintenanceResponse } from './lib/cutoverMaintenance';
import { consumeEdgeQuota, quotaResponse, quotaUnavailable } from './lib/security/edgeRateLimit';
import { clientIp } from './lib/security/clientIp';

async function validateApiEnvelope(request: NextRequest): Promise<Response | null> {
  const { pathname, searchParams } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return null;
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
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
          await reader.cancel();
          return reject(413, 'Corpo do pedido demasiado grande.');
        }
      }
    } catch {
      return reject(400, 'Corpo do pedido inválido.');
    }
  }
  return null;
}

async function apiQuota(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/')) return null;
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const url = request.nextUrl;
  const isV1 = url.pathname.startsWith('/api/v1/') || url.pathname.startsWith('/api/integrations/v1/');
  const ip = clientIp(request);
  try {
    const general = quotaResponse(await consumeEdgeQuota(`api:ip:${ip}`, 600), requestId);
    if (general) return general;
    if (isV1 && url.pathname !== '/api/v1/openapi.json')
      return quotaResponse(await consumeEdgeQuota(`v1:${ip}`, 120), requestId);
    return null;
  } catch {
    return quotaUnavailable(requestId);
  }
}

export async function middleware(request: NextRequest) {
  const maintenance = cutoverMaintenanceResponse(request.nextUrl.pathname, process.env.ERP_CUTOVER_MAINTENANCE);
  if (maintenance) return maintenance;
  const invalid = await validateApiEnvelope(request);
  if (invalid) return invalid;
  const quota = await apiQuota(request);
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
