import { createHmac, timingSafeEqual } from 'node:crypto';

export const recoveryCookie = 'erp_password_recovery';
export const recoveryPendingCookie = 'erp_password_recovery_pending';
export const recoveryMaxAge = 15 * 60;
export const recoveryCookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/',
};

function signature(value: string) {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret ? createHmac('sha256', secret).update(`password-recovery:${value}`).digest('hex') : null;
}

type VerifierCookie = { name: string; value: string };
const verifierPattern = /^erp-recovery-auth-token(?:-flow-[a-z0-9-]+)?-code-verifier(?:\.\d+)?$/i;

export function recoveryVerifierCookies(cookies: VerifierCookie[]) {
  return cookies.filter(({ name, value }) => verifierPattern.test(name) && value);
}

export function signRecoveryVerifier(cookie: VerifierCookie) {
  return signature(`verifier:${cookie.name}:${cookie.value}`);
}

export function verifiedRecoveryVerifier(pending: string | undefined, cookies: VerifierCookie[], flowId: string | null) {
  if (!pending || !/^[a-f0-9]{64}$/.test(pending)) return false;
  return recoveryVerifierCookies(cookies).some(cookie => {
    if (flowId && !cookie.name.includes(`-flow-${flowId}-code-verifier`)) return false;
    if (!flowId && cookie.name.includes('-flow-')) return false;
    const expected = signRecoveryVerifier(cookie);
    return Boolean(expected && timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(pending, 'hex')));
  });
}

export function createRecoveryGrant(userId: string, sessionId: string) {
  const expires = Math.floor(Date.now() / 1000) + recoveryMaxAge;
  const signed = signature(`${userId}:${sessionId}:${expires}`);
  return signed ? `${expires}.${signed}` : null;
}

export function validRecoveryGrant(grant: string | undefined, userId: string, sessionId: string) {
  if (!grant || !/^\d+\.[a-f0-9]{64}$/.test(grant)) return false;
  const [expires, signed] = grant.split('.');
  if (Number(expires) <= Date.now() / 1000) return false;
  const expected = signature(`${userId}:${sessionId}:${expires}`);
  return Boolean(expected && timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signed, 'hex')));
}
