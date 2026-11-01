import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';
import { runIdempotent, getIdempotentEntityId } from '@/lib/apiIdempotency';
import { createPresalesSchema } from '@/lib/presales';
import { listPresales, personalPresalesIds, usersWithPresalesPermission } from '@/lib/presalesServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'presales.read');
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Apenas a equipa pode consultar Presales.' }, { status: 403 });
  const page = Number(new URL(req.url).searchParams.get('page') || 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) return NextResponse.json({ success: false, message: 'Página inválida.' }, { status: 400 });
  try {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const mine = new URL(req.url).searchParams.get('scope') === 'mine';
    const assignedIds = mine ? await personalPresalesIds(db, auth.user.id) : [];
    let countQuery = db.from('work_requests').select('id', { count: 'exact', head: true }).eq('kind', 'presales');
    if (mine) countQuery = assignedIds.length ? countQuery.or(`area_owner_id.eq.${auth.user.id},id.in.(${assignedIds.join(',')})`)
      : countQuery.eq('area_owner_id', auth.user.id);
    const [countResult, rows, managerIds, executorIds] = await Promise.all([
      countQuery, listPresales(db, { page, ownerId: mine ? auth.user.id : undefined, assignedIds }),
      usersWithPresalesPermission(db, 'presales.manage'), usersWithPresalesPermission(db, 'presales.execute'),
    ]);
    if (countResult.error) throw countResult.error;
    return NextResponse.json({ success: true, data: rows, total: countResult.count || 0,
      page, eligibleManagerIds: managerIds, eligibleExecutorIds: executorIds });
  } catch (error) {
    console.error('[PRESALES LIST]', error);
    return NextResponse.json({ success: false, message: 'Não foi possível consultar Presales.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'presales.create');
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Apenas a equipa pode criar Presales.' }, { status: 403 });
  if (!req.headers.has('Idempotency-Key')) return NextResponse.json({ success: false, message: 'Idempotency-Key obrigatória.' }, { status: 400 });
  return runIdempotent(req, auth.user.id, 'presales:create', async claimedReq => {
    const parsed = createPresalesSchema.safeParse(await claimedReq.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Dados Presales inválidos.', details: parsed.error.flatten() }, { status: 400 });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const id = getIdempotentEntityId(claimedReq);
    const { error } = await db.rpc('presales_mutate', {
      p_id: id, p_actor_id: auth.user.id, p_expected_version: null, p_action: 'create', p_payload: parsed.data,
    });
    if (error) return presalesError(error);
    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  });
}

export function presalesError(error: { code?: string; message?: string }) {
  const status = error.code === '40001' || error.code === '23505' ? 409
    : error.code === '42501' ? 403 : error.code === 'P0002' ? 404
      : ['22023','23514','23503'].includes(error.code || '') ? 400 : 500;
  return NextResponse.json({ success: false,
    message: status === 500 ? 'Não foi possível guardar Presales.' : error.message || 'Operação inválida.' }, { status });
}
