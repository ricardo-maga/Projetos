import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';
import { manageDesignSchema } from '@/lib/mechanicalDesign';
import { listMechanicalDesign, designRpcError } from '@/lib/mechanicalDesignServer';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const auth = await requirePermission(req, 'mechanical_design.read');
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Apenas a equipa pode consultar pedidos de desenho.' }, { status: 403 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ success: false, message: 'Identificador inválido.' }, { status: 400 });
  try {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const row = (await listMechanicalDesign(db, id))[0];
    return row ? NextResponse.json({ success: true, data: row })
      : NextResponse.json({ success: false, message: 'Pedido inexistente.' }, { status: 404 });
  } catch (error) {
    console.error('[MECHANICAL DESIGN GET]', error);
    return NextResponse.json({ success: false, message: 'Não foi possível consultar o pedido.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const auth = await requireAuth(req);
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Apenas a equipa pode gerir pedidos de desenho.' }, { status: 403 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ success: false, message: 'Identificador inválido.' }, { status: 400 });
  const parsed = manageDesignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Operação inválida.', details: parsed.error.flatten() }, { status: 400 });
  const requiredPermission = ['start','block','resume','complete','file','deliver'].includes(parsed.data.action)
    ? 'mechanical_design.execute' : 'mechanical_design.manage';
  const permission = await requirePermission(req, requiredPermission);
  if (!permission.success) return permission.response;
  try {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const input = parsed.data;
    let result;
    if (input.action === 'assign_task') {
      result = await db.rpc('assign_mechanical_design_task', { p_request_id: id, p_task_id: input.taskId,
        p_actor_id: auth.user.id, p_expected_version: input.version, p_assignee_ids: input.assigneeIds });
    } else if (input.action === 'add_task') {
      result = await db.rpc('add_mechanical_design_task', { p_request_id: id, p_actor_id: auth.user.id,
        p_expected_version: input.version, p_title: input.title, p_description: input.description,
        p_assignee_ids: input.assigneeIds, p_estimated_days: input.estimatedDays });
    } else if (['start','block','resume','complete','reopen'].includes(input.action)) {
      const taskInput = input as Extract<typeof input, { taskId: string }>;
      result = await db.rpc('mechanical_design_task_action', { p_request_id: id, p_task_id: taskInput.taskId,
        p_actor_id: auth.user.id, p_expected_task_version: taskInput.taskVersion,
        p_action: taskInput.action, p_reason: taskInput.reason || null });
    } else if (input.action === 'edit') {
      if (input.usage !== undefined && input.projectStatusId !== undefined && input.otherManagerIds !== undefined) {
        result = await db.rpc('edit_mechanical_design_request_v2', {
          p_id: id, p_actor_id: auth.user.id, p_expected_version: input.version,
          p_instructions: input.instructions, p_deliverables: input.deliverables,
          p_file_identifier: input.fileIdentifier, p_file_revision: input.fileRevision,
          p_planned_start_date: input.plannedStartDate, p_planned_end_date: input.plannedEndDate,
          p_usage_text: input.usage, p_project_status_id: input.projectStatusId,
          p_other_manager_ids: input.otherManagerIds,
        });
      } else {
        result = await db.rpc('manage_mechanical_design_request', {
          p_id: id, p_actor_id: auth.user.id, p_expected_version: input.version, p_action: 'edit',
          p_instructions: input.instructions, p_deliverables: input.deliverables,
          p_file_identifier: input.fileIdentifier, p_file_revision: input.fileRevision,
          p_planned_start_date: input.plannedStartDate, p_planned_end_date: input.plannedEndDate,
        });
      }
    } else {
      const managed = input as Extract<typeof input, { action: 'accept' | 'reject' | 'file' | 'deliver' }>;
      result = await db.rpc('manage_mechanical_design_request', {
        p_id: id, p_actor_id: auth.user.id, p_expected_version: managed.version, p_action: managed.action,
        p_assignee_ids: managed.action === 'accept' ? managed.assigneeIds : null,
        p_estimated_days: managed.action === 'accept' ? managed.estimatedDays : null,
        p_instructions: null,
        p_deliverables: null,
        p_file_identifier: managed.action === 'file' ? managed.fileIdentifier : null,
        p_file_revision: managed.action === 'file' ? managed.fileRevision : null,
        p_planned_start_date: null,
        p_planned_end_date: null,
      });
    }
    if (result.error) { const mapped = designRpcError(result.error); return NextResponse.json({ success: false, message: mapped.message }, { status: mapped.status }); }
    return NextResponse.json({ success: true, data: (await listMechanicalDesign(db, id))[0] });
  } catch (error) {
    console.error('[MECHANICAL DESIGN PATCH]', error);
    return NextResponse.json({ success: false, message: 'Não foi possível gravar a operação.' }, { status: 500 });
  }
}
