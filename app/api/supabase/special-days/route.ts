export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { checkRateLimit } from '@/lib/rateLimit';
import { createSpecialDaySchema, mapSpecialDay } from '@/lib/specialDays/contracts';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!(await checkRateLimit(`special-days:${user.id}`, { limit: 30, windowSeconds: 60 })).success)
      return NextResponse.json({ success: false, message: 'Demasiados pedidos.' }, { status: 429, headers: noStore });
    const db = requireServerDbClient(user);
    const { data: allowed, error: permissionError } = await db.rpc('has_permission', {
      p_permission_code: 'config:write', p_user_id: user.auth_user_id,
    });
    if (permissionError) throw new AuthError('Serviço de autorização indisponível.', 503);
    if (allowed !== true) throw new ForbiddenError('Sem permissão para criar dias especiais.');
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400, headers: noStore }); }
    const parsed = createSpecialDaySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Dia especial inválido.' }, { status: 400, headers: noStore });
    const { data, error } = await db.from('special_days').insert(parsed.data).select('*').single();
    if (error || !data) throw error || new Error('Missing inserted row');
    return NextResponse.json({ success: true, data: mapSpecialDay(data) }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ success: false, message: error.message }, { status: 403, headers: noStore });
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode || 401, headers: noStore });
    return NextResponse.json({ success: false, message: 'Não foi possível criar o dia especial.' }, { status: 503, headers: noStore });
  }
}
