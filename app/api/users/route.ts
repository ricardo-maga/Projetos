export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, AuthError } from '@/lib/auth/requireAuth';
import { createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { CANONICAL_ROLE_IDS } from '@/lib/permissions';
import { withCanonicalErrors } from '@/lib/apiErrors';

const fields = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().transform(value => value.toLowerCase()),
  type: z.enum(['Team', 'Sales', 'Admin', 'External', 'Other']),
  password: z.string().min(12).optional(),
});
const createFields = fields.extend({ password: z.string().min(12) });
const updateFields = fields.extend({ id: z.string().uuid() });

function failure(error: unknown) {
  const status = error instanceof AuthError ? error.statusCode : 500;
  return NextResponse.json({ success: false, message: status === 500 ? 'Falha ao guardar o utilizador.' : error instanceof Error ? error.message : 'Operação recusada.' }, { status });
}

async function createUser(req: NextRequest) {
  try {
    const actor = await requirePermission(req, 'users_write');
    const parsed = createFields.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Nome, email, tipo ou password inválidos.' }, { status: 400 });
    const admin = createAdminClient();
    if (!admin) throw new AuthError('Serviço de autenticação indisponível.', 503);
    const { name, email, type, password } = parsed.data;
    const { data: existing, error: lookupError } = await admin.from('users').select('id').ilike('email', email).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return NextResponse.json({ success: false, message: 'Já existe um perfil com este email. Edite o perfil existente.' }, { status: 409 });

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (authError || !created.user) return NextResponse.json({ success: false, message: 'Não foi possível criar a conta de autenticação. Verifique se o email já existe.' }, { status: 409 });
    const id = created.user.id;
    // The auth.users trigger creates the profile; upsert also works if the trigger is absent.
    const { error: profileError } = await admin.from('users').upsert({
      id, auth_user_id: id, name, email, type, approved: true, deleted: false,
      role_id: CANONICAL_ROLE_IDS.TECHNICIAN, is_admin: false,
    }, { onConflict: 'id' });
    if (profileError) {
      const { error: profileRollbackError } = await admin.from('users').delete().eq('id', id);
      const { error: authRollbackError } = await admin.auth.admin.deleteUser(id);
      return NextResponse.json({ success: false, message: profileRollbackError || authRollbackError
        ? 'O perfil não pôde ser gravado e a reversão da conta não ficou completa. Requer reconciliação.'
        : 'A conta Auth foi revertida porque o perfil não pôde ser gravado.' }, { status: 500 });
    }
    const { error: roleError } = await admin.from('user_roles').upsert({
      user_id: id, role_id: CANONICAL_ROLE_IDS.TECHNICIAN, assigned_by: actor.id,
    }, { onConflict: 'user_id,role_id' });
    if (roleError) {
      const { error: profileRollbackError } = await admin.from('users').delete().eq('id', id);
      const { error: authRollbackError } = await admin.auth.admin.deleteUser(id);
      return NextResponse.json({ success: false, message: profileRollbackError || authRollbackError
        ? 'A função inicial falhou e a reversão da conta não ficou completa. Requer reconciliação.'
        : 'A conta foi revertida porque a função inicial não pôde ser gravada.' }, { status: 500 });
    }
    await logAuditEvent({ action: 'USER_CREATED', userId: actor.id, entity: 'users', entityId: id, details: { email } });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) { return failure(error); }
}

async function updateUser(req: NextRequest) {
  try {
    const actor = await requirePermission(req, 'users_write');
    const parsed = updateFields.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Dados do utilizador inválidos.' }, { status: 400 });
    const admin = createAdminClient();
    if (!admin) throw new AuthError('Serviço de autenticação indisponível.', 503);
    const { id, name, email, type, password } = parsed.data;
    const { data: profile, error: lookupError } = await admin.from('users')
      .select('id,auth_user_id,name,email,type,approved,deleted').eq('id', id).single();
    if (lookupError || !profile || profile.deleted) return NextResponse.json({ success: false, message: 'Perfil não encontrado.' }, { status: 404 });
    const { data: duplicate, error: duplicateError } = await admin.from('users').select('id').ilike('email', email).neq('id', id).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return NextResponse.json({ success: false, message: 'O email já pertence a outro perfil.' }, { status: 409 });

    let authId = profile.auth_user_id as string | null;
    if (!authId) {
      if (!password) return NextResponse.json({ success: false, message: 'Este perfil ainda não tem conta Auth. Defina uma password para o ativar.' }, { status: 409 });
      if (email !== profile.email?.toLowerCase()) return NextResponse.json({ success: false, message: 'Associe primeiro a conta Auth usando o email atual; altere o email depois.' }, { status: 409 });
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      });
      if (createError || !created.user) return NextResponse.json({ success: false, message: 'Não foi possível criar a conta Auth. Verifique se o email já está registado.' }, { status: 409 });
      authId = created.user.id;
      const { error: linkError } = await admin.from('users').update({ auth_user_id: authId, name, type }).eq('id', id);
      if (linkError) {
        const { error: rollbackError } = await admin.auth.admin.deleteUser(authId);
        return NextResponse.json({ success: false, message: rollbackError
          ? 'O perfil não pôde ser associado e a reversão da conta Auth falhou. Requer reconciliação.'
          : 'A conta Auth foi revertida porque o perfil não pôde ser associado.' }, { status: 500 });
      }
    } else {
      const { data: authUser, error: getAuthError } = await admin.auth.admin.getUserById(authId);
      if (getAuthError || !authUser.user) return NextResponse.json({ success: false, message: 'A conta Auth associada não foi encontrada.' }, { status: 409 });
      const { data: updatedProfile, error: profileError } = await admin.from('users')
        .update({ name, email, type }).eq('id', id).select('id').single();
      if (profileError || !updatedProfile) return NextResponse.json({ success: false, message: 'Não foi possível atualizar o perfil.' }, { status: 500 });
      const { error: authError } = await admin.auth.admin.updateUserById(authId, {
        ...(email !== authUser.user.email?.toLowerCase() ? { email, email_confirm: true } : {}),
        ...(password ? { password } : {}),
        user_metadata: { ...authUser.user.user_metadata, name },
      });
      if (authError) {
        const { error: rollbackError } = await admin.from('users').update({ name: profile.name, email: profile.email, type: profile.type }).eq('id', id);
        return NextResponse.json({ success: false, message: rollbackError
          ? 'A conta Auth não foi alterada e a reversão do perfil falhou. Requer reconciliação.'
          : 'Não foi possível atualizar a conta Auth; o perfil foi revertido.' }, { status: 409 });
      }
    }
    await logAuditEvent({ action: 'USER_UPDATED', userId: actor.id, entity: 'users', entityId: id, details: { email } });
    return NextResponse.json({ success: true, id });
  } catch (error) { return failure(error); }
}

export const POST = withCanonicalErrors(createUser);
export const PATCH = withCanonicalErrors(updateUser);
