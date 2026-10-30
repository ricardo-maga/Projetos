import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';
import { runIdempotent, getIdempotentEntityId } from '@/lib/apiIdempotency';
import { createDesignSchema } from '@/lib/mechanicalDesign';
import { listMechanicalDesign, listEligibleDesignExecutors, designRpcError } from '@/lib/mechanicalDesignServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'mechanical_design.read');
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Apenas a equipa pode consultar pedidos de desenho.' }, { status: 403 });
  try {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const page = Number(new URL(req.url).searchParams.get('page') || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) return NextResponse.json({ success: false, message: 'Página inválida.' }, { status: 400 });
    const [{ count, error }, rows, eligibleExecutorIds] = await Promise.all([
      db.from('work_requests').select('id', { count: 'exact', head: true }).eq('kind','mechanical_design'),
      listMechanicalDesign(db, undefined, page),
      listEligibleDesignExecutors(db),
    ]);
    if (error) throw error;
    return NextResponse.json({ success: true, data: rows, page, total: count || 0, eligibleExecutorIds });
  } catch (error) {
    console.error('[MECHANICAL DESIGN LIST]', error);
    return NextResponse.json({ success: false, message: 'Não foi possível consultar os pedidos.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'mechanical_design.create');
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Apenas a equipa pode criar pedidos de desenho.' }, { status: 403 });
  if (!req.headers.has('Idempotency-Key')) return NextResponse.json({ success: false, message: 'Idempotency-Key obrigatória.' }, { status: 400 });
  return runIdempotent(req, auth.user.id, 'mechanical_design:create', async (claimedReq) => {
    const parsed = createDesignSchema.safeParse(await claimedReq.json().catch(() => null));
    if (!parsed.success) {
      const labels: Record<string, string> = { title: 'Nome do pedido', ownerId: 'Gestor de projeto', projectId: 'Projeto associado',
        plannedStartDate: 'Início previsto', plannedEndDate: 'Fim previsto', projectStatusId: 'Estado do projeto',
        requestedForId: 'Requisitante', priorityId: 'Prioridade', otherManagerIds: 'Outros responsáveis' };
      const field = String(parsed.error.issues[0]?.path[0] || 'pedido');
      return NextResponse.json({ success: false, message: `Dados do pedido inválidos. Verifique: ${labels[field] || field}.`,
        details: parsed.error.flatten() }, { status: 400 });
    }
    const db = createAdminClient();
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data, error } = await db.rpc('create_mechanical_design_request_v3', {
      p_id: getIdempotentEntityId(claimedReq), p_actor_id: auth.user.id,
      p_owner_id: parsed.data.ownerId, p_title: parsed.data.title,
      p_instructions: parsed.data.instructions, p_deliverables: parsed.data.deliverables,
      p_project_id: parsed.data.projectId || null,
      p_planned_start_date: parsed.data.plannedStartDate,
      p_planned_end_date: parsed.data.plannedEndDate,
      p_usage_text: parsed.data.usage,
      p_project_status_id: parsed.data.projectStatusId,
      p_other_manager_ids: parsed.data.otherManagerIds,
      p_requested_for_id: parsed.data.requestedForId,
      p_priority_id: parsed.data.priorityId,
    });
    if (error) { const mapped = designRpcError(error); return NextResponse.json({ success: false, message: mapped.message }, { status: mapped.status }); }
    return NextResponse.json({ success: true, data: { id: data } }, { status: 201 });
  });
}
