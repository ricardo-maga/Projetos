export function createContentNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

function supabaseConnectSources(): string {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!configured) return '';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    const websocket = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return ` ${url.origin} ${websocket}//${url.host}`;
  } catch {
    return '';
  }
}

export function documentContentSecurityPolicy(pathname: string): string | undefined {
  // JSON APIs and the isolated Swagger document have their own response policies.
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/') || pathname === '/docs/openapi') return;
  const developmentScripts = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${createContentNonce()}' 'strict-dynamic'${developmentScripts}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `connect-src 'self'${supabaseConnectSources()}`,
    "font-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}
