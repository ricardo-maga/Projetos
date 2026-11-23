export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/requireAuth';
import { createClient, createIsolatedAuthClient } from '@/lib/supabase/server';
import { passwordChangeSchema } from '@/lib/validations/auth';
import { logAuditEvent } from '@/lib/audit';
import { badRequest, createErrorResponse, forbidden, rateLimitExceeded, serviceUnavailable, unauthorized } from '@/lib/apiErrors';
import { clientIp } from '@/lib/security/clientIp';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const ip = clientIp(req);
  if (!ip) return serviceUnavailable('Não foi possível verificar o pedido.', requestId);
  try {
    const user = await requireAuth(req, { includePermissions: false });
    for (const key of [`password:user:${user.id}`, `password:ip:${ip}`]) {
      if (!(await checkRateLimit(key, { limit: 5, windowSeconds: 60 })).success) return rateLimitExceeded(requestId);
    }
    const parsed = passwordChangeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest('Indique a palavra-passe atual e uma nova com pelo menos 12 caracteres.', requestId);

    const verifier = createIsolatedAuthClient();
    const bearer = req.headers.has('authorization');
    if (!verifier) return serviceUnavailable('Serviço de autenticação indisponível.', requestId);
    const session = bearer ? verifier : await createClient();
    const { data: account, error: accountError } = bearer
      ? await verifier.auth.getUser(req.headers.get('authorization')!.slice(7).trim())
      : await session.auth.getUser();
    if (accountError || account.user?.id !== user.auth_user_id || !account.user.email)
      return unauthorized('Sessão inválida ou expirada.', requestId);

    const { data: verified, error } = await verifier.auth.signInWithPassword({
      email: account.user.email, password: parsed.data.currentPassword,
    });
    if (error || verified.user?.id !== user.auth_user_id)
      return forbidden('Palavra-passe atual incorreta.', requestId);

    try {
      const { error: changeError } = await session.auth.updateUser({
        password: parsed.data.password, current_password: parsed.data.currentPassword,
      });
      if (changeError) return badRequest('Não foi possível definir a nova palavra-passe.', requestId);
      const { error: revokeError } = await session.auth.signOut({ scope: 'others' });
      await logAuditEvent({
        action: 'PASSWORD_RESET_COMPLETED', userId: user.id, entity: 'users', entityId: user.id,
        requestId, ip, details: { method: 'profile', sessionsRevoked: !revokeError },
      });
      if (revokeError) console.error('[PASSWORD SESSION REVOCATION]', revokeError.code);
      return NextResponse.json({ success: true, ...(revokeError ? {
        message: 'A palavra-passe foi alterada. Não foi possível confirmar o encerramento das outras sessões.',
      } : {}) });
    } finally {
      const { error: closeError } = await verifier.auth.signOut({ scope: 'local' });
      if (closeError) console.error('[PASSWORD VERIFICATION SESSION]', closeError.code);
    }
  } catch (error) {
    if (error instanceof AuthError)
      return createErrorResponse(error.statusCode, 'PASSWORD_CHANGE_DENIED', error.message, requestId);
    console.error('[PASSWORD CHANGE]', error instanceof Error ? error.name : 'unknown');
    return serviceUnavailable('Não foi possível processar a alteração.', requestId);
  }
}
