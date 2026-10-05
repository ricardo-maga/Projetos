/** Server-only operational switch; never grants access or bypasses authentication. */
export function cutoverMaintenanceResponse(pathname: string, enabled: string | undefined): Response | null {
  if (enabled !== 'true') return null;
  const headers = { 'Cache-Control': 'no-store', 'Retry-After': '120' };
  if (pathname.startsWith('/api/')) {
    return Response.json({ success: false, error: 'Aplicação temporariamente em manutenção.' }, { status: 503, headers });
  }
  return new Response('<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manutenção</title><body><main><h1>Manutenção em curso</h1><p>A aplicação estará novamente disponível dentro de alguns minutos.</p></main></body></html>', {
    status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
