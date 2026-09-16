import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { authenticateRequest } from '@/lib/auth/authorization';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.authenticated && auth.user) {
    await logAuditEvent({
      action: 'LOGOUT',
      userId: auth.user.id,
      entity: 'users',
      entityId: auth.user.id,
      details: { email: auth.user.email },
    });
  }

  const response = NextResponse.json({
    success: true,
    message: 'Sessão terminada com sucesso.',
  });

  // Clear legacy cookie
  response.cookies.set('erp_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  // Clear Supabase session cookies if present
  try {
    const supabase = await createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch (error) {
    console.warn('[LOGOUT] Supabase sign out warning:', error);
  }

  return response;
}
