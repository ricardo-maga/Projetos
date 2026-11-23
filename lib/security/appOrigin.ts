export function appOrigin() {
  const host = process.env.VERCEL_ENV === 'production'
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_URL;
  const value = process.env.APP_URL || (host ? `https://${host}` : process.env.NEXT_PUBLIC_APP_URL)
    || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined);
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return null;
    return url.origin;
  } catch {
    return null;
  }
}
