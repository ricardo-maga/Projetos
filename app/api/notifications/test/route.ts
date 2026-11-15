import { NextRequest, NextResponse } from 'next/server';
import { AuthError, ForbiddenError, requireAuth } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { notificationTypes } from '@/lib/notificationCatalog';
import { z } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const db = requireServerDbClient(user);
    const { data: allowed, error: permissionError } = await db.rpc('has_permission', {
      p_permission_code: 'config:write', p_user_id: user.auth_user_id,
    });
    if (permissionError) throw new AuthError('Serviço de autorização indisponível.', 503);
    if (allowed !== true) throw new ForbiddenError();
    const parsed = z.object({ type: z.string().max(100) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success || !Object.hasOwn(notificationTypes, parsed.data.type))
      return NextResponse.json({ message: 'Notificação inválida.' }, { status: 400 });
    const type = parsed.data.type;
    const sample = notificationTypes[type];
    const { error } = await db.from('notifications').insert({
      user_id: user.id, title: `[Teste] ${sample.name}`, message: sample.sample,
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof AuthError ? error.message : 'Não foi possível enviar o teste.' },
      { status: error instanceof AuthError ? error.statusCode : 500 });
  }
}
