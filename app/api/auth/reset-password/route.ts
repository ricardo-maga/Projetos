export const dynamic = 'force-dynamic';

import { after, NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/rateLimit';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { resetPasswordSchema } from '@/lib/validations/auth';
import { appOrigin } from '@/lib/security/appOrigin';
import { clientIp } from '@/lib/security/clientIp';
import { badRequest, rateLimitExceeded, serviceUnavailable } from '@/lib/apiErrors';
import { recoveryCookieOptions, recoveryPendingCookie, recoveryVerifierCookies, signRecoveryVerifier } from '@/lib/auth/passwordRecovery';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const ip = clientIp(req);
  const origin = appOrigin();
  if (!ip || !origin) return serviceUnavailable('A recuperação está temporariamente indisponível.', requestId);
  if (new URL(req.url).origin !== origin)
    return badRequest('Abra a página de recuperação no endereço oficial da aplicação.', requestId, { origin });
  try {
    if (!(await checkRateLimit(`reset-pwd:${ip}`, { limit: 3, windowSeconds: 60 })).success)
      return rateLimitExceeded(requestId);
  } catch {
    return serviceUnavailable('O serviço de limites está temporariamente indisponível.', requestId);
  }

  const parsed = resetPasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Indique um endereço de email válido.', requestId);

  try {
    // The SSR client saves the PKCE verifier in the browser that started recovery.
    const email = parsed.data.email.toLowerCase();
    const admin = createAdminClient();
    if (!admin) return serviceUnavailable('A recuperação está temporariamente indisponível.', requestId);
    const { data: profiles, error: lookupError } = await admin.from('users')
      .select('id').ilike('email', email.replace(/[\\%_]/g, '\\$&'))
      .eq('deleted', false).eq('approved', true).neq('type', 'External').not('auth_user_id', 'is', null).limit(1);
    if (lookupError) return serviceUnavailable('A recuperação está temporariamente indisponível.', requestId);
    const cookieStore = await cookies();
    const before = new Map(recoveryVerifierCookies(cookieStore.getAll()).map(cookie => [cookie.name, cookie.value]));
    const supabase = await createClient(undefined, undefined, {
      recovery: true, fetcher: profiles.length ? undefined : async () => Response.json({}),
    });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('/auth/callback?next=/reset-password', origin).href,
    });
    if (error) console.warn('[PASSWORD RECOVERY REQUEST]', requestId, error.code);
    if (!error && profiles[0]) after(() => logAuditEvent({
      action: 'PASSWORD_RESET_REQUESTED', entity: 'users', entityId: profiles[0].id, requestId, ip,
    }));
    const changed = recoveryVerifierCookies(cookieStore.getAll()).find(cookie => before.get(cookie.name) !== cookie.value);
    const proof = changed && signRecoveryVerifier(changed);
    if (proof) cookieStore.set(recoveryPendingCookie, proof, { ...recoveryCookieOptions, maxAge: 3600 });
  } catch (error) {
    console.warn('[PASSWORD RECOVERY REQUEST]', requestId, error instanceof Error ? error.name : 'unknown');
  }
  return NextResponse.json({
    success: true,
    message: 'Se o endereço estiver registado no sistema, receberá instruções para redefinir a palavra-passe.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
