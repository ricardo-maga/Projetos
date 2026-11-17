/** Compare the browser origin with the actual HTTP destination. NextURL normalizes loopback hosts. */
export function hasSameRequestOrigin(request: { headers: Headers; nextUrl: { origin: string; protocol: string } }): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Non-browser authenticated clients keep their existing contract.
  const host = request.headers.get('host');
  try {
    const destination = host ? new URL(`${request.nextUrl.protocol}//${host}`).origin : request.nextUrl.origin;
    return origin === destination;
  } catch { return false; }
}
