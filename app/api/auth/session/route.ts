import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/serverAuth';

export async function GET(req: NextRequest) {
  const session = verifySession(req);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Sessão inválida ou expirada.' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    user: {
      id: session.id,
      name: session.name,
      type: session.type,
      email: session.email,
      roleId: session.roleId,
      isAdmin: session.isAdmin,
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    if (body?.logout) {
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

    const token = body?.token;
    const session = verifySession(token || req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: session.id,
        name: session.name,
        type: session.type,
        email: session.email,
        roleId: session.roleId,
        isAdmin: session.isAdmin,
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE() {
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

