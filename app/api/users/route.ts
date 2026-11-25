export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { User } from '@supabase/supabase-js';
import { requirePermission, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { CANONICAL_ROLE_IDS } from '@/lib/permissions';
import { withCanonicalErrors } from '@/lib/apiErrors';
import { beginProfileChange, isDefinitiveAuthError } from '@/lib/users/profileChange';
import { getIdempotentEntityId, runIdempotent } from '@/lib/apiIdempotency';

const fields = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().max(254).email().transform(value => value.toLowerCase()),
  type: z.enum(['Team', 'Sales', 'Admin', 'External', 'Other']),
  password: z.preprocess(value => value === '' ? undefined : value, z.string().min(12).max(1024).optional()),
});
const createFields = fields;
const updateFields = fields.extend({ id: z.guid() });

function failure(error: unknown) {
  const status = error instanceof AuthError ? error.statusCode : 500;
  return NextResponse.json({ success: false, message: status === 500 ? 'Falha ao guardar o utilizador.' : error instanceof Error ? error.message : 'Operação recusada.' }, { status });
}

async function recordUserFailure(actor: { id: string; name: string }, id: string, compensationFailed: boolean) {
  await logAuditEvent({ action: 'USER_OPERATION_FAILED', userId: actor.id, userName: actor.name,
    entity: 'users', entityId: id, outcome: compensationFailed ? 'partial' : 'failed',
    details: { compensationCompleted: !compensationFailed } });
}

async function createUser(req: NextRequest) {
  try {
    const actor = await requirePermission(req, 'users_write');
    const parsed = createFields.safeParse(await req.clone().json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Nome, email, tipo ou password inválidos.' }, { status: 400 });
    if (req.headers.has('idempotency-key') && parsed.data.password) {
      return NextResponse.json({ success: false, message: 'A chave de idempotência aplica-se à criação de perfis sem login.' }, { status: 400 });
    }
    return await runIdempotent(req, actor.id, 'users:create-profile',
      claimed => createUserRecord(parsed.data, actor, getIdempotentEntityId(claimed)));
  } catch (error) { return failure(error); }
}

async function createUserRecord(input: z.infer<typeof createFields>, actor: { id: string; name: string; requestId?: string }, requestedId?: string) {
  const admin = createAdminClient();
  if (!admin) throw new AuthError('Serviço de autenticação indisponível.', 503);
  const { name, email, type, password } = input;
  const { data: existing, error: lookupError } = await admin.from('users').select('id').ilike('email', email).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return NextResponse.json({ success: false, message: 'Já existe um perfil com este email. Edite o perfil existente.' }, { status: 409 });

  let authId: string | null = null;
  if (password) {
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (authError || !created.user) return NextResponse.json({ success: false, message: 'Não foi possível criar a conta de autenticação. Verifique se o email já existe.' }, { status: 409 });
    authId = created.user.id;
  }
  const id = authId ?? requestedId ?? randomUUID();
  // The auth.users trigger creates the profile; upsert also works if the trigger is absent.
  const { error: profileError } = await admin.from('users').upsert({
    id, auth_user_id: authId, name, email, type, approved: true, deleted: false,
    role_id: CANONICAL_ROLE_IDS.TECHNICIAN, is_admin: false,
  }, { onConflict: 'id' });
  if (profileError) {
    const { error: profileRollbackError } = await admin.from('users').delete().eq('id', id);
    const authRollbackError = authId ? (await admin.auth.admin.deleteUser(authId)).error : null;
    await recordUserFailure(actor, id, Boolean(profileRollbackError || authRollbackError));
    return NextResponse.json({ success: false, message: profileRollbackError || authRollbackError
      ? 'O perfil não pôde ser gravado e a reversão da conta não ficou completa. Requer reconciliação.'
      : 'A criação do utilizador foi revertida porque o perfil não pôde ser gravado.' }, { status: 500 });
  }
  const { error: roleError } = await admin.from('user_roles').upsert({
    user_id: id, role_id: CANONICAL_ROLE_IDS.TECHNICIAN, assigned_by: actor.id,
  }, { onConflict: 'user_id,role_id' });
  if (roleError) {
    const { error: profileRollbackError } = await admin.from('users').delete().eq('id', id);
    const authRollbackError = authId ? (await admin.auth.admin.deleteUser(authId)).error : null;
    await recordUserFailure(actor, id, Boolean(profileRollbackError || authRollbackError));
    return NextResponse.json({ success: false, message: profileRollbackError || authRollbackError
      ? 'A função inicial falhou e a reversão da conta não ficou completa. Requer reconciliação.'
      : 'A conta foi revertida porque a função inicial não pôde ser gravada.' }, { status: 500 });
  }
  await logAuditEvent({ action: 'USER_CREATED', userId: actor.id, userName: actor.name, entity: 'users', entityId: id,
    requestId: actor.requestId, details: { accessEnabled: Boolean(authId) } });
  return NextResponse.json({ success: true, id }, { status: 201 });
}

async function updateUser(req: NextRequest) {
  try {
    const actor = await requirePermission(req, 'users_write');
    const parsed = updateFields.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Dados do utilizador inválidos.' }, { status: 400 });
    const admin = createAdminClient();
    if (!admin) throw new AuthError('Serviço de autenticação indisponível.', 503);
    const { id, name, email, type, password } = parsed.data;
    const { data: profile, error: lookupError } = await admin.from('users')
      .select('auth_user_id,name,email,type,deleted,sync_version').eq('id', id).single();
    if (lookupError || !profile || profile.deleted) throw new AuthError('Perfil não encontrado.', 404);

    const authId = profile.auth_user_id as string | null;
    let authUser: User | null = null;
    if (authId) {
      const { data, error } = await admin.auth.admin.getUserById(authId);
      if (error || !data.user) throw new AuthError('A conta Auth associada não foi encontrada.', 409);
      authUser = data.user;
    }

    const authEmailChange = authUser !== null && email !== authUser.email?.toLowerCase();
    const emailChange = email !== profile.email?.toLowerCase() || authEmailChange;
    const nameChange = name !== profile.name;
    const changedFields = [
      ...(nameChange ? ['name'] : []),
      ...(emailChange ? ['email'] : []),
      ...(type !== profile.type ? ['type'] : []),
      ...(password ? ['password'] : []),
    ];
    if (!changedFields.length) return NextResponse.json({ success: true, id });
    if (actor.id === id && emailChange) throw new ForbiddenError('Para alterar o próprio email é necessário confirmar o novo endereço.');
    if (actor.id === id && password) throw new ForbiddenError('Altere a sua palavra-passe nas definições do perfil.');
    if (!authId && password && emailChange) {
      throw new AuthError('Associe primeiro a conta Auth usando o email atual.', 409);
    }
    if (emailChange) {
      const { data: duplicate, error } = await admin.from('users').select('id')
        .ilike('email', email.replace(/[\\%_]/g, '\\$&')).neq('id', id).maybeSingle();
      if (error) throw error;
      if (duplicate) throw new AuthError('O email já pertence a outro perfil.', 409);
    }

    const change = await beginProfileChange(admin, actor.id, id, profile.sync_version, emailChange || Boolean(password));
    let activated = false;
    let keepReservation = false;
    try {
      // The first read may have overlapped an earlier operation that wrote its
      // profile before finishing in Auth. Verify the authorized email snapshot
      // after acquiring the reservation and before making either write.
      if (authId && authUser) {
        const { data, error } = await admin.auth.admin.getUserById(authId);
        if (error || !data.user || data.user.email?.toLowerCase() !== authUser.email?.toLowerCase()) {
          throw new AuthError('A conta Auth foi alterada entretanto. Recarregue e tente novamente.', 409);
        }
      }
      if (!authId && password) {
        keepReservation = true;
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { name },
        });
        if (error || !data.user) {
          keepReservation = !isDefinitiveAuthError(error);
          throw new AuthError('Não foi possível criar a conta de autenticação.', 409);
        }

        try {
          await change.write({ name, email, type, authId: data.user.id }, profile.sync_version);
        } catch (error) {
          // Only undo a known rejection. A lost RPC response may have committed the link.
          if (error instanceof AuthError && error.statusCode < 500) {
            const { error: undoError } = await admin.auth.admin.deleteUser(data.user.id);
            keepReservation = Boolean(undoError);
          }
          throw error;
        }
        activated = true;
        keepReservation = false;
      } else {
        keepReservation = true;
        let written: number;
        try {
          written = await change.write({ name, email, type, authId }, profile.sync_version);
        } catch (error) {
          keepReservation = !(error instanceof AuthError && error.statusCode < 500);
          throw error;
        }
        keepReservation = false;
        if (authId && (authEmailChange || password || nameChange)) {
          keepReservation = true;
          const { error } = await admin.auth.admin.updateUserById(authId, {
            ...(authEmailChange ? { email, email_confirm: true } : {}),
            ...(password ? { password } : {}),
            ...(nameChange ? { user_metadata: { name } } : {}),
          });
          if (error) {
            if (isDefinitiveAuthError(error)) {
              await change.write({ name: profile.name, email: profile.email, type: profile.type, authId }, written);
              keepReservation = false;
            }
            throw new AuthError('Não foi possível atualizar a conta Auth.', 409);
          }
          keepReservation = false;
        }
      }
      await logAuditEvent({ action: activated ? 'USER_ACCESS_ACTIVATED' : 'USER_UPDATED',
        userId: actor.id, userName: actor.name, entity: 'users', entityId: id, requestId: actor.requestId,
        details: { accessEnabled: activated || Boolean(authId), changedFields } });
    } catch (error) {
      if (keepReservation) {
        await recordUserFailure(actor, id, true);
        throw new AuthError('A alteração requer reconciliação antes de voltar a editar esta conta.', 409);
      }
      await recordUserFailure(actor, id, false);
      throw error;
    } finally {
      if (!keepReservation) await change.release();
    }

    return NextResponse.json({ success: true, id });
  } catch (error) { return failure(error); }
}

export const POST = withCanonicalErrors(createUser);
export const PATCH = withCanonicalErrors(updateUser);
