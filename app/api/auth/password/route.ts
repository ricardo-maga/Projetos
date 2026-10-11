export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/requireAuth';
import { createAdminClient } from '@/lib/supabase/server';
import { passwordResetConfirmSchema } from '@/lib/validations/auth';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const parsed = passwordResetConfirmSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: 'A password deve ter no mínimo 12 caracteres.' }, { status: 400 });
    const admin = createAdminClient();
    if (!admin) throw new AuthError('Serviço de autenticação indisponível.', 503);
    const { error } = await admin.auth.admin.updateUserById(user.auth_user_id, { password: parsed.data.password });
    if (error) return NextResponse.json({ success: false, message: 'Não foi possível alterar a password.' }, { status: 400 });
    await logAuditEvent({ action: 'PASSWORD_RESET_COMPLETED', userId: user.id, entity: 'users', entityId: user.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    return NextResponse.json({ success: false, message: 'Sessão inválida ou expirada.' }, { status });
  }
}
