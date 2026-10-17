import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const db = requireServerDbClient();
    const body = await req.json();
    if (!body || (body.all !== true && (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id))))
      return NextResponse.json({ message: 'Pedido inválido.' }, { status: 400 });

    let query = db.from('notifications').select('id').or(`user_id.eq.${user.id},user_id.is.null`)
      .order('created_at', { ascending: false }).limit(200);
    if (body.all !== true) query = query.eq('id', body.id);
    const { data: notices, error: findError } = await query;
    if (findError) throw findError;
    if (body.all !== true && !notices?.length)
      return NextResponse.json({ message: 'Notificação indisponível.' }, { status: 404 });
    if (notices?.length) {
      const { error } = await db.from('notification_reads').upsert(
        notices.map(notice => ({ notification_id: notice.id, user_id: user.id, read_at: new Date().toISOString() })),
        { onConflict: 'notification_id,user_id' },
      );
      if (error) throw error;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof AuthError ? error.message : 'Não foi possível marcar como lida.' },
      { status: error instanceof AuthError ? error.statusCode : 500 });
  }
}
