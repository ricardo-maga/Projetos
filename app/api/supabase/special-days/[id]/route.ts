export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { checkRateLimit } from '@/lib/rateLimit';
import { updateSpecialDaySchema, mapSpecialDay } from '@/lib/specialDays/contracts';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    if (!(await checkRateLimit(`special-days:${user.id}`, { limit: 30, windowSeconds: 60 })).success)
      return NextResponse.json({ success: false, message: 'Demasiados pedidos.' }, { status: 429, headers: noStore });
    const db = requireServerDbClient(user);
    const { data: allowed, error: permissionError } = await db.rpc('has_permission', {
      p_permission_code: 'config:write', p_user_id: user.auth_user_id,
    });
    if (permissionError) throw new AuthError('Serviço de autorização indisponível.', 503);
    if (allowed !== true) throw new ForbiddenError('Sem permissão para alterar dias especiais.');
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      return NextResponse.json({ success: false, message: 'ID inválido.' }, { status: 400, headers: noStore });
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400, headers: noStore }); }
    const parsed = updateSpecialDaySchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 1)
      return NextResponse.json({ success: false, message: 'Alteração inválida.' }, { status: 400, headers: noStore });
    const { syncVersion, ...changes } = parsed.data;
    const { data, error } = await db.from('special_days').update(changes)
      .eq('id', id).eq('sync_version', syncVersion).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: 'O dia especial foi alterado ou removido. Recarregue os dados.' }, { status: 409, headers: noStore });
    return NextResponse.json({ success: true, data: mapSpecialDay(data) }, { headers: noStore });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ success: false, message: error.message }, { status: 403, headers: noStore });
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode || 401, headers: noStore });
    return NextResponse.json({ success: false, message: 'Não foi possível alterar o dia especial.' }, { status: 503, headers: noStore });
  }
}
