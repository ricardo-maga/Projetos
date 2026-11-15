/** Only trust forwarding headers when the deployment's ingress controls them. */
export function clientIp(request: Request): string {
  const header = process.env.VERCEL_ENV
    ? request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for')
    : process.env.TRUST_PROXY_IP_HEADERS === 'true' ? request.headers.get('x-real-ip') : null;
  return header?.split(',')[0]?.trim() || 'unknown';
}
