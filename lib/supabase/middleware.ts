import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authCookieLifetime, SESSION_PREFERENCE_COOKIE } from '@/lib/auth/sessionPersistence';
import { consumeEdgeQuota, quotaHeaders, quotaResponse, quotaUnavailable } from '@/lib/security/edgeRateLimit';

export async function updateSession(request: NextRequest, requestId: string) {
  const forwardRequest = () => {
    const headers = new Headers(request.headers);
    headers.set('x-request-id', requestId);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set('x-request-id', requestId);
    return response;
  };

  let supabaseResponse = forwardRequest();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = forwardRequest();
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, {
            ...options,
            ...(value && options.maxAge !== 0
              ? authCookieLifetime(request.cookies.get(SESSION_PREFERENCE_COOKIE)?.value)
              : {}),
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
          })
        );
      },
    },
  });

  // Verify claims before using the subject for quotas. The route separately verifies its session.
  try {
    const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    const { data } = await supabase.auth.getClaims(bearer);
    if (data?.claims.sub && request.nextUrl.pathname.startsWith('/api/')) {
      const kind = request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
      const limit = kind === 'read' ? 240 : 60;
      try {
        const quota = await consumeEdgeQuota(`api:user:${kind}:${data.claims.sub}`, limit);
        const rejection = quotaResponse(quota, requestId);
        if (rejection) return rejection;
        for (const [key, value] of Object.entries(quotaHeaders(quota))) supabaseResponse.headers.set(key, value);
      } catch {
        return quotaUnavailable(requestId);
      }
    }
  } catch {
    // Ignore missing session errors during unauthenticated requests
  }

  return supabaseResponse;
}
