export const dynamic = 'force-dynamic';

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

  // Clear Supabase session cookies if present
  try {
    const supabase = await createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch (error) {
    console.warn('[LOGOUT] Supabase sign out warning:', error);
  }

  const response = NextResponse.json({
    success: true,
    message: 'Sessão terminada com sucesso.',
  });
  response.cookies.set('erp_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
