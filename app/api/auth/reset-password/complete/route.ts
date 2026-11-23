import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { profileEligibility } from '@/lib/auth/profileEligibility';
import { recoveryCookie, recoveryCookieOptions, validRecoveryGrant } from '@/lib/auth/passwordRecovery';
import { passwordResetConfirmSchema } from '@/lib/validations/auth';
import { badRequest, serviceUnavailable, unauthorized } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const expired = () => unauthorized('A ligação de recuperação expirou. Peça uma nova ligação.', requestId);
  const grant = req.cookies.get(recoveryCookie)?.value;
  if (!grant || req.headers.has('authorization')) return expired();
  const parsed = passwordResetConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('A nova palavra-passe deve ter pelo menos 12 caracteres.', requestId);

  try {
    const auth = await createClient(undefined, undefined, { recovery: true });
    const { data } = await auth.auth.getClaims();
    const claims = data?.claims;
    if (!claims || typeof claims.session_id !== 'string' || !validRecoveryGrant(grant, claims.sub, claims.session_id))
      return expired();
    const db = createAdminClient();
    if (!db) return serviceUnavailable('A recuperação está temporariamente indisponível.', requestId);
    const { data: user, error: lookupError } = await db.from('users').select('id,approved,deleted,type')
      .eq('auth_user_id', claims.sub).maybeSingle();
    if (lookupError) return serviceUnavailable('A recuperação está temporariamente indisponível.', requestId);
    if (!user || profileEligibility(user) !== 'active') return expired();
    const { error } = await auth.auth.updateUser({ password: parsed.data.password });
    if (error) return badRequest('Não foi possível definir a nova palavra-passe.', requestId);

    const { error: revokeError } = await auth.auth.signOut({ scope: 'global' });
    await logAuditEvent({
      action: 'PASSWORD_RESET_COMPLETED', userId: user.id, entity: 'users', entityId: user.id,
      requestId, details: { method: 'recovery', sessionsRevoked: !revokeError },
    });
    if (revokeError) console.error('[PASSWORD RECOVERY REVOCATION]', revokeError.code);
    const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(recoveryCookie, '', { ...recoveryCookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    return serviceUnavailable('Não foi possível concluir a recuperação.', requestId);
  }
}
