import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAuthenticatedUserSession() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims || !data.claims.sub) {
    return null;
  }

  const authUserId = data.claims.sub;

  let { data: dbUser } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .eq('deleted', false)
    .maybeSingle();

  if (!dbUser) {
    const { data: fallbackUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUserId)
      .eq('deleted', false)
      .maybeSingle();
    dbUser = fallbackUser;
  }

  if (!dbUser || dbUser.deleted) {
    return null;
  }

  return {
    id: dbUser.id,
    name: dbUser.name,
    type: dbUser.type,
    email: dbUser.email,
    roleId: dbUser.role_id || dbUser.roleId || 'ug-5',
    isAdmin: !!(dbUser.is_admin ?? dbUser.isAdmin),
  };
}

export async function GET() {
  try {
    const user = await getAuthenticatedUserSession();
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
        sameSite: 'none',
        path: '/',
        maxAge: 0,
      });
      return response;
    }

    const user = await getAuthenticatedUserSession();
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
      sameSite: 'none',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Erro ao encerrar sessão.' }, { status: 500 });
  }
}


