export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { authenticateRequest } from '@/lib/auth/authorization';
import { SESSION_PREFERENCE_COOKIE } from '@/lib/auth/sessionPersistence';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  let outcome: 'succeeded' | 'failed' = 'succeeded';
  try {
    const supabase = await createClient();
    const result = await supabase.auth.signOut();
    if (result.error) outcome = 'failed';
  } catch (error) {
    outcome = 'failed';
    console.warn('[LOGOUT] Supabase sign out warning:', error);
  }
  if (auth.authenticated && auth.user) {
    await logAuditEvent({
      action: 'LOGOUT', userId: auth.user.id, userName: auth.user.name, entity: 'users', entityId: auth.user.id,
      outcome, requestId: auth.requestId,
    });
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
  response.cookies.delete(SESSION_PREFERENCE_COOKIE);
  return response;
}
