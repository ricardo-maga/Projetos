import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { bootstrapSchema } from '@/lib/validations/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { logAuditEvent } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { badRequest, forbidden, tooManyRequests, validationError, internalServerError } from '@/lib/apiErrors';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  // 1. Rate limiting: 5 attempts per IP per hour
  const rateCheck = checkRateLimit(`bootstrap_${ip}`, { limit: 5, windowSeconds: 3600 });
  if (!rateCheck.success) {
    return tooManyRequests('Demasiadas tentativas de bootstrap. Tente novamente mais tarde.', requestId);
  }

  // 2. Check if bootstrap is enabled in environment
  const bootstrapEnabled = process.env.ERP_BOOTSTRAP_ENABLED !== 'false';
  const expectedSecret = process.env.ERP_BOOTSTRAP_SECRET;

  if (!bootstrapEnabled || !expectedSecret) {
    return forbidden('A operação de bootstrap administrativo está permanentemente desativada ou não configurada.', requestId);
  }

  try {
    const rawBody = await req.json();
    const parseResult = bootstrapSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para bootstrap administrativo.', requestId, parseResult.error.flatten());
    }

    const { secret, adminEmail, adminPassword, adminName } = parseResult.data;

    // 3. Constant-time comparison of secret to prevent timing attacks
    const providedBuffer = Buffer.from(secret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
      await logAuditEvent({
        action: 'BOOTSTRAP_ADMIN_CREATED',
        ip,
        userAgent: req.headers.get('user-agent') || undefined,
        details: { status: 'FAILED_INVALID_SECRET', email: adminEmail },
      });
      return forbidden('Credenciais de bootstrap inválidas.', requestId);
    }

    // 4. One-time check: verify if an active admin user already exists
    const adminSb = createAdminClient();
    const sb = adminSb || defaultSupabase;

    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const { data: existingAdmins, error: adminQueryError } = await sb
      .from('users')
      .select('id, email, is_admin, approved, deleted')
      .eq('is_admin', true)
      .eq('deleted', false);

    if (adminQueryError) {
      console.error('Error checking existing admins during bootstrap:', adminQueryError);
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return forbidden(
        'Operação recusada: O sistema já possui um ou mais administradores configurados. O bootstrap está desativado.',
        requestId
      );
    }

    // 5. Create or configure admin user in Supabase Auth
    let authUserId: string | null = null;

    if (adminSb) {
      // Use Admin API to create user with email confirmed
      const { data: createdAuthUser, error: authError } = await adminSb.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { name: adminName || 'Super Administrador' },
      });

      if (authError) {
        // If user already exists in auth, update password
        if (authError.message.includes('already') || authError.message.includes('exists')) {
          const { data: listData } = await adminSb.auth.admin.listUsers();
          const target = listData?.users?.find((u) => u.email?.toLowerCase() === adminEmail.toLowerCase());
          if (target) {
            authUserId = target.id;
            await adminSb.auth.admin.updateUserById(target.id, {
              password: adminPassword,
              email_confirm: true,
              user_metadata: { name: adminName || 'Super Administrador' },
            });
          }
        } else {
          return badRequest(`Erro ao criar utilizador no Supabase Auth: ${authError.message}`, requestId);
        }
      } else if (createdAuthUser?.user) {
        authUserId = createdAuthUser.user.id;
      }
    } else {
      // Fallback: standard sign up
      const { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: {
          data: { name: adminName || 'Super Administrador' },
        },
      });

      if (signUpError && !signUpError.message.includes('already')) {
        return badRequest(`Erro no registo de utilizador: ${signUpError.message}`, requestId);
      }
      authUserId = signUpData?.user?.id || null;
    }

    // 6. Associate with users table as SUPER_ADMIN
    const targetUserId = authUserId || crypto.randomUUID();
    const { error: upsertError } = await sb.from('users').upsert(
      {
        id: targetUserId,
        email: adminEmail.toLowerCase(),
        name: adminName || 'Super Administrador',
        is_admin: true,
        approved: true,
        deleted: false,
        type: 'Team',
        role_id: '00000000-0000-0000-0000-000000000001',
      },
      { onConflict: 'email' }
    );

    if (upsertError) {
      console.error('Error inserting user profile during bootstrap:', upsertError);
      return internalServerError('Falha ao gravar perfil administrativo.', requestId);
    }

    // 7. Audit log of the successful bootstrap
    await logAuditEvent({
      action: 'BOOTSTRAP_ADMIN_CREATED',
      userId: targetUserId,
      entity: 'users',
      entityId: targetUserId,
      ip,
      userAgent: req.headers.get('user-agent') || undefined,
      details: { status: 'SUCCESS', email: adminEmail },
    });

    return NextResponse.json({
      success: true,
      message: 'Administrador inicial criado com sucesso. O bootstrap foi consumido e encontra-se agora concluído.',
      requestId,
    });
  } catch (error: any) {
    console.error('Unexpected exception during bootstrap:', error);
    return internalServerError('Erro inesperado no processo de bootstrap.', requestId);
  }
}
