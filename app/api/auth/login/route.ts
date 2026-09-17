import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkRateLimit } from '@/lib/rateLimit';
import { loginSchema } from '@/lib/validations/auth';
import { rateLimitExceeded, validationError, unauthorized, forbidden, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(`login:${ip}`, { limit: 10, windowSeconds: 60 }).success) return rateLimitExceeded(requestId);
  let body: unknown;
  try { body = await req.json(); } catch { return validationError('Corpo da mensagem inválido (JSON esperado).', requestId); }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return validationError('Dados de login inválidos.', requestId, parsed.error.flatten());

  try {
    const supabase = await createClient();
    const { data: signIn, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email.trim().toLowerCase(), password: parsed.data.password });
    if (error || !signIn.user) return unauthorized('Email ou palavra-passe incorretos.', requestId);
    const admin = createAdminClient();
    if (!admin) return internalServerError('Serviço de autenticação não configurado.', requestId);
    const { data: profile, error: profileError } = await admin.from('users')
      .select('id, auth_user_id, name, email, role_id, is_admin, type, approved, deleted')
      .or(`auth_user_id.eq.${signIn.user.id},id.eq.${signIn.user.id}`).maybeSingle();
    if (profileError || !profile || profile.deleted) { await supabase.auth.signOut(); return unauthorized('A conta não está autorizada para aceder à aplicação.', requestId); }
    if (!profile.approved) { await supabase.auth.signOut(); return forbidden('Este utilizador ainda aguarda aprovação por um administrador.', requestId); }
    const user = { id: profile.id, name: profile.name, email: profile.email, type: profile.type || 'Team', roleId: profile.role_id, isAdmin: Boolean(profile.is_admin) };
    await logAuditEvent({ action: 'LOGIN', userId: profile.id, entity: 'users', entityId: profile.id, ip, details: { method: 'supabase_auth' } });
    // Return authenticated user details and active session token for API / bearer authentication
    return NextResponse.json({ 
      success: true, 
      user, 
      token: signIn.session?.access_token || null,
      requestId 
    });
  } catch (error) { console.error('[LOGIN ERROR]', error); return internalServerError('Erro inesperado durante a autenticação.', requestId); }
}
