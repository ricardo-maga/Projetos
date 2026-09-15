import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { checkRateLimit } from '@/lib/rateLimit';
import { loginSchema } from '@/lib/validations/auth';
import { rateLimitExceeded, validationError, unauthorized, forbidden, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { signSession } from '@/lib/serverAuth';

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  // 1. Sliding Window Rate Limiting (5 attempts per minute)
  const rateLimit = checkRateLimit(`login:${ip}`, { limit: 5, windowSeconds: 60 });
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

  const parseResult = loginSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return validationError('Dados de login inválidos.', requestId, parseResult.error.flatten());
  }

  const { email, password, rememberMe } = parseResult.data;
  const cleanEmail = email.trim().toLowerCase();
  const rawPassword = password.trim();

  try {
    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const dbClient = adminSupabase || defaultSupabase;

    if (!dbClient) {
      return internalServerError('Base de dados Supabase não configurada.', requestId);
    }

    // Step 1: Attempt native Supabase Auth authentication if client is available
    let authUser: any = null;
    let authSession: any = null;

    if (supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: rawPassword,
        });

        if (!authError && authData.user) {
          authUser = authData.user;
          authSession = authData.session;
        }
      } catch (authErr) {
        console.warn('[LOGIN] Native Supabase Auth attempt notice:', authErr);
      }
    }

    // Step 2: Fetch corresponding user record from application `users` table
    const { data: dbUsers, error: dbError } = await dbClient
      .from('users')
      .select('*')
      .ilike('email', cleanEmail)
      .eq('deleted', false)
      .limit(1);

    if (dbError) {
      console.error('[LOGIN DB ERROR]', dbError);
      return internalServerError('Erro ao verificar utilizador na base de dados.', requestId);
    }

    const dbUser = dbUsers?.[0];

    // If native Supabase Auth succeeded and we have a dbUser
    if (authUser && dbUser) {
      if (!dbUser.approved) {
        return forbidden('Este utilizador ainda aguarda aprovação por um administrador.', requestId);
      }

      // Ensure auth_user_id is linked
      if (!dbUser.auth_user_id) {
        try {
          await dbClient
            .from('users')
            .update({ auth_user_id: authUser.id, updated_at: new Date().toISOString() })
            .eq('id', dbUser.id);
        } catch {}
      }

      const userPayload = {
        id: dbUser.id,
        name: dbUser.name,
        type: dbUser.type || 'Team',
        email: dbUser.email,
        roleId: dbUser.role_id || '00000000-0000-0000-0000-000000000002',
        isAdmin: !!dbUser.is_admin,
      };

      const legacyToken = signSession(userPayload, rememberMe ? 30 * 24 : 8);
      await logAuditEvent({
        action: 'LOGIN',
        userId: dbUser.id,
        entity: 'users',
        entityId: dbUser.id,
        ip,
        details: { method: 'supabase_auth' },
      });

      const response = NextResponse.json({
        success: true,
        user: userPayload,
        token: legacyToken,
        session: authSession,
      });

      const maxAge = rememberMe ? 30 * 24 * 3600 : 8 * 3600;
      response.cookies.set('erp_session', legacyToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge,
      });

      return response;
    }

    // Step 3: If native Supabase Auth was not successful, check legacy credentials in `users` table
    if (!dbUser) {
      return unauthorized('Email ou palavra-passe incorretos.', requestId);
    }

    if (!dbUser.approved) {
      return forbidden('Este utilizador ainda aguarda aprovação por um administrador.', requestId);
    }

    // Verify password supporting ONLY valid bcrypt hash during legacy migration
    let isPasswordValid = false;
    const storedPassword = (dbUser.password || '').trim();

    if (
      storedPassword &&
      (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$'))
    ) {
      try {
        isPasswordValid = bcrypt.compareSync(rawPassword, storedPassword);
      } catch {
        isPasswordValid = false;
      }
    }

    if (!isPasswordValid) {
      return unauthorized('Email ou palavra-passe incorretos.', requestId);
    }

    // Step 4: Seamless Migration - Automatically migrate user to Supabase Auth!
    let migratedAuthId: string | null = null;
    if (adminSupabase) {
      try {
        // Check if user already exists in auth.users
        const { data: existingUserList } = await adminSupabase.auth.admin.listUsers();
        const existingAuthUser = (existingUserList?.users || []).find(
          (u) => u.email?.toLowerCase() === cleanEmail
        );

        if (existingAuthUser) {
          migratedAuthId = existingAuthUser.id;
          // Update password to match the valid credential
          await adminSupabase.auth.admin.updateUserById(existingAuthUser.id, {
            password: rawPassword,
            email_confirm: true,
            user_metadata: { name: dbUser.name },
          });
        } else {
          // Create in auth.users
          const { data: createdAuth, error: createError } = await adminSupabase.auth.admin.createUser({
            email: cleanEmail,
            password: rawPassword,
            email_confirm: true,
            user_metadata: { name: dbUser.name },
          });

          if (!createError && createdAuth.user) {
            migratedAuthId = createdAuth.user.id;
          }
        }

        // Link auth_user_id in application users table
        if (migratedAuthId) {
          await dbClient
            .from('users')
            .update({ auth_user_id: migratedAuthId, updated_at: new Date().toISOString() })
            .eq('id', dbUser.id);
        }
      } catch (migrateErr) {
        console.warn('[LOGIN] Automatic Supabase Auth migration notice:', migrateErr);
      }
    }

    // If supabase SSR client is configured, sign in with the new/updated password
    if (supabase) {
      try {
        const { data: authData } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: rawPassword,
        });
        if (authData?.session) {
          authSession = authData.session;
        }
      } catch {}
    }

    const userPayload = {
      id: dbUser.id,
      name: dbUser.name,
      type: dbUser.type || 'Team',
      email: dbUser.email,
      roleId: dbUser.role_id || '00000000-0000-0000-0000-000000000002',
      isAdmin: !!dbUser.is_admin,
    };

    const legacyToken = signSession(userPayload, rememberMe ? 30 * 24 : 8);

    await logAuditEvent({
      action: migratedAuthId ? 'LOGIN_MIGRATED' : 'LOGIN',
      userId: dbUser.id,
      entity: 'users',
      entityId: dbUser.id,
      ip,
      details: {
        method: 'seamless_migration',
        migratedToAuth: Boolean(migratedAuthId),
      },
    });

    const maxAge = rememberMe ? 30 * 24 * 3600 : 8 * 3600;
    const response = NextResponse.json({
      success: true,
      user: userPayload,
      token: legacyToken,
      session: authSession,
    });

    response.cookies.set('erp_session', legacyToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge,
    });

    return response;
  } catch (error: any) {
    console.error('[LOGIN CRITICAL ERROR]', error);
    return internalServerError('Erro inesperado durante a autenticação.', requestId);
  }
}
