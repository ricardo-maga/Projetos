import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/requireAuth';

async function getAuthenticatedUserSession(req?: NextRequest) {
  try {
    const user = await requireAuth(req);
    return {
      id: user.id,
      name: user.name,
      type: user.type,
      email: user.email,
      roleId: user.role_id || 'ug-5',
      isAdmin: !!user.is_admin,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUserSession(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ success: false, message: error?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE() {
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

