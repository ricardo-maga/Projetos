export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, AuthError } from '@/lib/auth/requireAuth';
import { withCanonicalErrors } from '@/lib/apiErrors';

async function getAuthenticatedUserSession(req?: NextRequest) {
  try {
    const user = await requireAuth(req);
    return {
      id: user.id,
      name: user.name,
      type: user.type,
      email: user.email,
      roleId: user.role_id || user.role_ids[0] || '',
      roleIds: user.role_ids,
      roleNames: user.role_names,
      isAdmin: !!user.is_admin,
      isSuperAdmin: user.is_super_admin,
      permissions: user.permissions,
    };
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 500) throw error;
    return null;
  }
}

async function getSession(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserSession(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    let token: string | null = null;
    const header = req.headers.get('authorization');
    if (header?.startsWith('Bearer ')) {
      token = header.slice(7).trim();
    }
    if (!token) {
      try {
        const supabase = await createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token || null;
      } catch {}
    }

    return NextResponse.json({
      success: true,
      user,
      token,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Erro interno.' },
      { status: error instanceof AuthError ? error.statusCode : 500 });
  }
}

async function postSession(req: NextRequest) {
  try {
    const supabase = await createClient();
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    if (body?.logout) {
      await supabase.auth.signOut();
      const response = NextResponse.json({ success: true, message: 'Sessão encerrada com sucesso.' });
      response.cookies.set('erp_session', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
      return response;
    }

    const user = await getAuthenticatedUserSession(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Erro interno.' },
      { status: error instanceof AuthError ? error.statusCode : 500 });
  }
}

async function deleteSession(_req: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    const response = NextResponse.json({ success: true, message: 'Sessão encerrada com sucesso.' });
    response.cookies.set('erp_session', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Erro ao encerrar sessão.' }, { status: 500 });
  }
}

export const GET = withCanonicalErrors(getSession);
export const POST = withCanonicalErrors(postSession);
export const DELETE = withCanonicalErrors(deleteSession);

