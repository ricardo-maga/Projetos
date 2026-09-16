import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkRateLimit } from '@/lib/rateLimit';
import { registerSchema } from '@/lib/validations/auth';
import { rateLimitExceeded, validationError, badRequest, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  // 1. Rate limiting (3 registrations per minute per IP)
  const rateLimit = checkRateLimit(`register:${ip}`, { limit: 3, windowSeconds: 60 });
  if (!rateLimit.success) {
    return rateLimitExceeded(requestId);
  }

  // 2. Validate input schema with Zod
  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    return validationError('Corpo da mensagem inválido (JSON esperado).', requestId);
  }

  const parseResult = registerSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return validationError('Dados de registo inválidos.', requestId, parseResult.error.flatten());
  }

  const { name, email, password } = parseResult.data;
  const cleanEmail = email.trim().toLowerCase();

  try {
    const adminSupabase = createAdminClient();
    const dbClient = adminSupabase || defaultSupabase;

    if (!dbClient) {
      return internalServerError('Base de dados Supabase não configurada.', requestId);
    }

    // Check if email is already in public.users
    const { data: existingUser } = await dbClient
      .from('users')
      .select('id, email')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return badRequest('Já existe uma conta associada a este endereço de email.', requestId);
    }

    let authUserId: string | null = null;

    // Create in Supabase Auth if admin client is available
    if (adminSupabase) {
      const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
        email: cleanEmail,
        password: password.trim(),
        // Do not mark self-registered accounts as verified until Supabase has
        // completed its configured email-verification flow.
        email_confirm: false,
        user_metadata: { name: name.trim() },
      });

      if (authError) {
        console.error('[REGISTER AUTH ERROR]', authError);
        return badRequest(`Erro ao criar utilizador no Supabase Auth: ${authError.message}`, requestId);
      }

      authUserId = authUser.user?.id || null;
    }

    const newUserId = authUserId || crypto.randomUUID();
    const now = new Date().toISOString();

    // The auth.users trigger may have created the profile already. Upsert keeps
    // registration idempotent while preserving the mandatory approval gate.
    const { error: insertError } = await dbClient.from('users').upsert([
      {
        id: newUserId,
        auth_user_id: authUserId,
        name: name.trim(),
        email: cleanEmail,
        role_id: '00000000-0000-0000-0000-000000000004', // Default: TECHNICIAN
        approved: false, // Requires administrator approval
        deleted: false,
        is_admin: false,
        type: 'Team',
        created_at: now,
      },
    ], { onConflict: 'id' });

    if (insertError) {
      console.error('[REGISTER DB ERROR]', insertError);
      return internalServerError(`Erro ao gravar perfil do utilizador: ${insertError.message}`, requestId);
    }

    await logAuditEvent({
      action: 'REGISTER',
      userId: newUserId,
      entity: 'users',
      entityId: newUserId,
      ip,
      details: { email: cleanEmail },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Registo efetuado com sucesso. A sua conta aguarda aprovação por um administrador.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[REGISTER EXCEPTION]', error);
    return internalServerError('Falha inesperada no registo de utilizador.', requestId);
  }
}
