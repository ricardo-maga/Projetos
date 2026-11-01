export const SESSION_PREFERENCE_COOKIE = 'erp_remember_login';
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export function sessionPreference(rememberMe: boolean, now = Date.now()) {
  return rememberMe ? `until:${now + THIRTY_DAYS_SECONDS * 1000}` : 'session';
}

export function authCookieLifetime(preference?: string, now = Date.now()) {
  if (preference === 'session') return { maxAge: undefined, expires: undefined };
  if (preference?.startsWith('until:')) {
    const expiresAt = Number(preference.slice(6));
    if (Number.isFinite(expiresAt)) {
      const maxAge = Math.max(0, Math.ceil((expiresAt - now) / 1000));
      return { maxAge, expires: new Date(expiresAt) };
    }
  }
  return {};
}

export function preferenceCookieLifetime(rememberMe: boolean) {
  return rememberMe ? { maxAge: THIRTY_DAYS_SECONDS } : { maxAge: undefined, expires: undefined };
}
