import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkRateLimit } from '@/lib/rateLimit';
import { resetPasswordSchema } from '@/lib/validations/auth';
import { rateLimitExceeded, validationError, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  // 1. Rate limiting (3 requests per minute per IP)
  const rateLimit = checkRateLimit(`reset-pwd:${ip}`, { limit: 3, windowSeconds: 60 });
  if (!rateLimit.success) {
    return rateLimitExceeded(requestId);
  }

  // 2. Validate input schema
  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    return validationError('Corpo da mensagem inválido (JSON esperado).', requestId);
  }

  const parseResult = resetPasswordSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return validationError('Dados de reposição inválidos.', requestId, parseResult.error.flatten());
  }

  const { email } = parseResult.data;
  const cleanEmail = email.trim().toLowerCase();

  try {
    const adminSupabase = createAdminClient();
    const dbClient = adminSupabase || defaultSupabase;

    // Check if user exists (generic message returned regardless to prevent email enumeration)
    let userFound = false;
    if (dbClient) {
      const { data: user } = await dbClient
        .from('users')
        .select('id, email, approved, deleted')
        .ilike('email', cleanEmail)
        .eq('deleted', false)
        .maybeSingle();

      if (user) userFound = true;
    }

    if (userFound && adminSupabase) {
      // Send password reset email via Supabase Auth
      await adminSupabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${req.nextUrl.origin}/auth/callback?next=/reset-password`,
      }).catch((err) => {
        console.warn('[RESET PASSWORD NOTICE]', err);
      });

      await logAuditEvent({
        action: 'PASSWORD_RESET_REQUESTED',
        entity: 'users',
        ip,
        details: { email: cleanEmail },
      });
    }

    // Always respond with a generic success message to prevent user enumeration
    return NextResponse.json({
      success: true,
      message: 'Se o endereço estiver registado no sistema, receberá instruções para redefinir a palavra-passe.',
    });
  } catch (error: any) {
    console.error('[RESET PASSWORD EXCEPTION]', error);
    return internalServerError('Falha inesperada ao processar o pedido de recuperação.', requestId);
  }
}
