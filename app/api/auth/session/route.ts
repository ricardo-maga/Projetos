import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/serverAuth';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ success: false, message: 'Nenhum token fornecido.' }, { status: 400 });
    }

    const session = verifySession(token);
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
    return NextResponse.json({ success: false, message: error.message || 'Erro interno.' }, { status: 500 });
  }
}
