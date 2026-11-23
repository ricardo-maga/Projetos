import { createAbsenceSchema } from '@/lib/validations/apiInputs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { checkRateLimit } from '@/lib/rateLimit';
import { getIdempotentEntityId, runIdempotent } from '@/lib/apiIdempotency';
import { createApiHandler } from '@/lib/apiErrors';


async function createAbsence(req: NextRequest) {
  try {
    const actor = await requireAuth(req);
    if (!(await checkRateLimit(`absences-create:${actor.id}`, { limit: 30, windowSeconds: 60 })).success)
      return NextResponse.json({ success: false, message: 'Demasiados pedidos.' }, { status: 429, headers: { 'Retry-After': '60' } });
    const db = requireServerDbClient(actor);
    const { data: allowed, error: permissionError } = await db.rpc('has_permission', {
      p_permission_code: 'absences:write', p_user_id: actor.auth_user_id,
    });
    if (permissionError) throw new AuthError('Serviço de autorização indisponível.', 503);
    if (allowed !== true) throw new ForbiddenError();
    const { data: admin, error: adminError } = await db.rpc('has_permission', {
      p_permission_code: 'admin:access', p_user_id: actor.auth_user_id,
    });
    if (adminError) throw new AuthError('Serviço de autorização indisponível.', 503);
    const parsed = createAbsenceSchema.safeParse(await req.clone().json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Ausência inválida.' }, { status: 400 });
    if (admin !== true && parsed.data.userId !== actor.id) throw new ForbiddenError();
    return await runIdempotent(req, actor.id, 'absences:create', async claimed => {
      const id = getIdempotentEntityId(claimed);
      const { data, error } = await db.from('user_absences').insert({
        ...(id ? { id } : {}),
        user_id: parsed.data.userId,
        absence_start_date: parsed.data.absenceStartDate,
        absence_end_date: parsed.data.absenceEndDate,
        reason: parsed.data.reason,
      }).select('id,user_id,absence_start_date,absence_end_date,reason,created_at').single();
      if (error || !data) throw error || new Error('Missing inserted absence');
      return NextResponse.json({ success: true, data: {
        id: data.id, userId: data.user_id, absenceStartDate: data.absence_start_date,
        absenceEndDate: data.absence_end_date, reason: data.reason || '', createdDate: data.created_at,
      } }, { status: 201 });
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode });
    console.error('[absences:create] Failed to persist absence', error);
    return NextResponse.json({ success: false, message: 'Não foi possível criar a ausência.' }, { status: 503 });
  }
}

export const POST = createApiHandler(createAbsence);

