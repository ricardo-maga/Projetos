/** Only trust forwarding headers when the deployment's ingress controls them. */
export function clientIp(request: Request): string | null {
  const header = process.env.VERCEL_ENV
    ? request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for')
    : process.env.TRUST_PROXY_IP_HEADERS === 'true' ? request.headers.get('x-real-ip') : null;
  const address = header?.split(',')[0]?.trim();
  if (address && (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)
    ? address.split('.').every(part => Number(part) <= 255)
    : /^[0-9a-f:.]+$/i.test(address) && address.includes(':') && isIpv6(address))) return address;
  if (!process.env.VERCEL_ENV && process.env.TRUST_PROXY_IP_HEADERS !== 'true'
    && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)) return '127.0.0.1';
  return null;
}

function isIpv6(address: string) {
  try {
    return new URL(`http://[${address}]/`).hostname.startsWith('[');
  } catch {
    return false;
  }
}
