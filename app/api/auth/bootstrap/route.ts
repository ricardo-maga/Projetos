export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { bootstrapSchema } from '@/lib/validations/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { logAuditEvent } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/server';
import { badRequest, forbidden, tooManyRequests, validationError, internalServerError } from '@/lib/apiErrors';
import { clientIp } from '@/lib/security/clientIp';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  // Bootstrap is a setup-only capability. Production accounts are managed through
  // the authenticated users API and must never recreate a first administrator.
  if (process.env.VERCEL_ENV === 'production') {
    return forbidden('O bootstrap administrativo está permanentemente desativado em produção.', requestId);
  }
  const ip = clientIp(req);

  // 1. Rate limiting: 5 attempts per IP per hour
  const rateCheck = await checkRateLimit(`bootstrap_${ip}`, { limit: 5, windowSeconds: 3600 });
  if (!rateCheck.success) {
    return tooManyRequests('Demasiadas tentativas de bootstrap. Tente novamente mais tarde.', requestId, 3600);
  }

  // 2. Check if bootstrap is enabled in environment
  // Bootstrap must be deliberately enabled for a short, one-time deployment window.
  const bootstrapEnabled = process.env.ERP_BOOTSTRAP_ENABLED === 'true';
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
    if (!adminSb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }
    const sb = adminSb;

    const { data: existingAdmins, error: adminQueryError } = await sb
      .from('users')
      .select('id, email, is_admin, approved, deleted')
      .eq('is_admin', true)
      .eq('deleted', false);

    if (adminQueryError) {
      console.error('Error checking existing admins during bootstrap:', adminQueryError);
      return internalServerError('Não foi possível verificar os administradores existentes.', requestId);
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return forbidden(
        'Operação recusada: O sistema já possui um ou mais administradores configurados. O bootstrap está desativado.',
        requestId
      );
    }

    // Bootstrap may create a new identity only. In particular, it must never
    // turn an existing deleted profile into an approved administrator.
    if (adminEmail.trim().toLowerCase() === 'ricardo75@gmail.com')
      return forbidden('A conta indicada não pode ser utilizada para bootstrap.', requestId);
    const { data: existingProfile, error: profileError } = await sb.from('users')
      .select('id').ilike('email', adminEmail.trim()).maybeSingle();
    if (profileError) return internalServerError('Não foi possível validar a conta indicada.', requestId);
    if (existingProfile) return forbidden('A conta indicada já existe.', requestId);

    // 5. Create a new administrator in Supabase Auth.
    const { data: createdAuthUser, error: authError } = await adminSb.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { name: adminName || 'Super Administrador' },
    });
    if (authError || !createdAuthUser.user)
      return badRequest('Não foi possível criar a conta administrativa.', requestId);
    const authUserId = createdAuthUser.user.id;

    // 6. Associate with users table as SUPER_ADMIN
    const targetUserId = authUserId;
    const { error: upsertError } = await sb.from('users').upsert(
      {
        id: targetUserId,
        auth_user_id: authUserId,
        email: adminEmail.toLowerCase(),
        name: adminName || 'Super Administrador',
        is_admin: true,
        approved: true,
        deleted: false,
        type: 'Team',
        role_id: '10000000-0000-0000-0000-000000000001', // Canonical RBAC SUPER_ADMIN
      },
      { onConflict: 'id' }
    );

    if (upsertError) {
      console.error('Error inserting user profile during bootstrap:', upsertError);
      await adminSb.auth.admin.deleteUser(authUserId);
      return internalServerError('Falha ao gravar perfil administrativo.', requestId);
    }
    const { error: roleError } = await sb.from('user_roles').upsert({
      user_id: targetUserId, role_id: '10000000-0000-0000-0000-000000000001',
    }, { onConflict: 'user_id,role_id' });
    if (roleError) return internalServerError('Falha ao gravar a função de Super Administrador.', requestId);

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
