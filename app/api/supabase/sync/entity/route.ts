import { NextRequest, NextResponse } from 'next/server';
import { AuthError, ForbiddenError, requireAuth } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
const targets = {
  comments: { table: 'comments', permission: 'projects:delete' },
  userAbsences: { table: 'user_absences', permission: 'absences:delete' },
  specialDays: { table: 'special_days', permission: 'config:write' },
  defaultTasks: { table: 'default_tasks', permission: 'config:write' },
} as const;

// Explicit, single-record deletion. A missing row in sync is never a command.
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!checkRateLimit(`sync-delete:${user.id}`, { limit: 30, windowSeconds: 60 }).success)
      return NextResponse.json({ success: false, message: 'Demasiados pedidos.' }, { status: 429 });
    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido inválido.' }, { status: 400 }); }
    if (!body || !Object.hasOwn(targets, body.entity) || typeof body.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))
      return NextResponse.json({ success: false, message: 'Entidade ou ID inválido.' }, { status: 400 });
    const target = targets[body.entity as keyof typeof targets];
    const db = requireServerDbClient();
    const can = async (code: string) => {
      const { data, error } = await db.rpc('has_permission', { p_permission_code: code, p_user_id: user.auth_user_id });
      if (error) throw new AuthError('Serviço de autorização indisponível.', 503);
      return data === true;
    };
    if (!(await can(target.permission))) throw new ForbiddenError();
    const administrative = body.entity === 'specialDays' || body.entity === 'defaultTasks';
    const admin = administrative || body.entity === 'userAbsences' ? await can('admin:access') : false;
    if (administrative && !admin) throw new ForbiddenError();
    let deletion = db.from(target.table).delete().eq('id', body.id);
    // Constrain the DELETE itself, avoiding a lookup/ownership race.
    if (body.entity === 'userAbsences' && !admin) deletion = deletion.eq('user_id', user.id);
    const { data, error } = await deletion.select('id');
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ success: false, message: 'Registo não encontrado ou inacessível.' }, { status: 404 });
    return NextResponse.json({ success: true, id: body.id });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof AuthError ? error.message : 'Não foi possível eliminar o registo.' },
      { status: error instanceof AuthError ? error.statusCode : 500 });
  }
}
