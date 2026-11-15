import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authCookieLifetime, SESSION_PREFERENCE_COOKIE } from '@/lib/auth/sessionPersistence';
import { consumeEdgeQuota, quotaResponse, quotaUnavailable } from '@/lib/security/edgeRateLimit';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  supabaseResponse.headers.set('x-request-id', requestId);

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
        supabaseResponse = NextResponse.next({
          request,
        });
        supabaseResponse.headers.set('x-request-id', requestId);
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

  // IMPORTANT: Do not run any logic between createServerClient and getUser().
  try {
    const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    const { data } = await supabase.auth.getUser(bearer);
    if (data.user && request.nextUrl.pathname.startsWith('/api/')) {
      const kind = request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
      const limit = kind === 'read' ? 240 : 60;
      try {
        const quota = quotaResponse(await consumeEdgeQuota(`api:user:${kind}:${data.user.id}`, limit), requestId);
        if (quota) return quota;
      } catch {
        return quotaUnavailable(requestId);
      }
    }
  } catch {
    // Ignore missing session errors during unauthenticated requests
  }

  return supabaseResponse;
}
