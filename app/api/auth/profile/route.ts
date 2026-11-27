export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, AuthError } from '@/lib/auth/requireAuth';
import { createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { COLOR_SCHEME_IDS, normalizePreferredTheme, type ColorSchemeId } from '@/lib/presentationTheme';

const profilePatchSchema = z.strictObject({
  name: z.string().trim().min(2).max(200).optional(),
  preferredTheme: z.enum(COLOR_SCHEME_IDS).nullable().optional(),
}).refine(values => values.name !== undefined || values.preferredTheme !== undefined);

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req, { includePermissions: false });
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, message: 'Corpo JSON inválido.' }, { status: 400 }); }
    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      const message = field === 'name' ? 'Nome inválido.'
        : field === 'preferredTheme' ? 'Esquema de cores inválido.' : 'Alterações de perfil inválidas.';
      return NextResponse.json({ success: false, message }, { status: 400 });
    }
    const { name, preferredTheme } = parsed.data;
    const updates: { name?: string; preferred_theme?: ColorSchemeId | null } = {};
    if (name !== undefined) updates.name = name;
    if (preferredTheme !== undefined) updates.preferred_theme = preferredTheme;
    const admin = createAdminClient();
    if (!admin) throw new AuthError('Serviço de autenticação indisponível.', 503);
    const { data, error } = await admin.from('users').update(updates)
      .eq('id', user.id).eq('auth_user_id', user.auth_user_id)
      .eq('approved', true).eq('deleted', false).neq('type', 'External')
      .select('name, preferred_theme').maybeSingle();
    if (error?.code === 'PT409') {
      throw new AuthError('Existe uma alteração pendente nesta conta. Tente novamente.', 409);
    }
    if (error) {
      console.error('[PROFILE UPDATE]', error.code);
      return NextResponse.json({ success: false, message: 'Não foi possível atualizar o perfil.' }, { status: 500 });
    }
    if (!data) throw new AuthError('A sessão já não tem acesso ao perfil.', 403);
    await logAuditEvent({
      action: 'USER_UPDATED', userId: user.id, entity: 'users', entityId: user.id,
      details: { field: Object.keys(updates).join(', ') },
    });
    return NextResponse.json({ success: true, profile: { name: data.name, preferredTheme: normalizePreferredTheme(data.preferred_theme) } });
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    return NextResponse.json({ success: false, message: status === 500 ? 'Falha ao atualizar o perfil.' : error instanceof Error ? error.message : 'Sessão inválida.' }, { status });
  }
}
