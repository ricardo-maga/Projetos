import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRecoveryGrant, recoveryCookie, recoveryCookieOptions, recoveryMaxAge, recoveryPendingCookie, verifiedRecoveryVerifier } from '@/lib/auth/passwordRecovery';
import { appOrigin } from '@/lib/security/appOrigin';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const flowId = requestUrl.searchParams.get('flow_id');
  const origin = appOrigin() || requestUrl.origin;

  if (code) {
    const verified = verifiedRecoveryVerifier(request.cookies.get(recoveryPendingCookie)?.value, request.cookies.getAll(), flowId);
    if (next === '/reset-password' && !verified)
      return NextResponse.redirect(new URL('/reset-password?expired=1', origin));
    const supabase = await createClient(undefined, undefined, { recovery: verified });
    const { data, error } = await supabase.auth.exchangeCodeForSession(code, {
      flowId: flowId || undefined,
    });
    const isRecovery = 'redirectType' in data && data.redirectType === 'recovery';
    if (!error && data.user && data.session && isRecovery && verified) {
      const { data: claims } = await supabase.auth.getClaims(data.session.access_token);
      const sessionId = claims?.claims.session_id;
      const grant = typeof sessionId === 'string' && createRecoveryGrant(data.user.id, sessionId);
      if (grant) {
        const response = NextResponse.redirect(new URL('/reset-password', origin));
        response.cookies.set(recoveryCookie, grant, { ...recoveryCookieOptions, maxAge: recoveryMaxAge });
        response.cookies.set(recoveryPendingCookie, '', { ...recoveryCookieOptions, maxAge: 0 });
        response.headers.set('Cache-Control', 'no-store');
        return response;
      }
      await supabase.auth.signOut({ scope: 'local' });
    }
    if (!error && isRecovery && !verified) await supabase.auth.signOut({ scope: 'local' });
    if (!error && !isRecovery && next !== '/reset-password')
      return NextResponse.redirect(new URL('/', origin));
    if (error) console.warn('[AUTH CALLBACK]', error.code);
  }

  // Return user to error page or login with informative message
  return NextResponse.redirect(new URL(next === '/reset-password' ? '/reset-password?expired=1' : '/?error=auth_callback_failed', origin));
}
