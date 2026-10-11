export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, AuthError } from '@/lib/auth/requireAuth';
import { createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const parsed = z.object({ name: z.string().trim().min(2).max(200) }).safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Nome inválido.' }, { status: 400 });
    const admin = createAdminClient();
    if (!admin) throw new AuthError('Serviço de autenticação indisponível.', 503);
    const { data, error } = await admin.from('users').update({ name: parsed.data.name })
      .eq('id', user.id).eq('auth_user_id', user.auth_user_id).select('id').single();
    if (error || !data) return NextResponse.json({ success: false, message: 'Não foi possível atualizar o perfil.' }, { status: 500 });
    await logAuditEvent({ action: 'USER_UPDATED', userId: user.id, entity: 'users', entityId: user.id, details: { field: 'name' } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    return NextResponse.json({ success: false, message: status === 500 ? 'Falha ao atualizar o perfil.' : error instanceof Error ? error.message : 'Sessão inválida.' }, { status });
  }
}
