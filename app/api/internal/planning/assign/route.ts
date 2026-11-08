export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { runIdempotent } from '@/lib/apiIdempotency';
import { logAuditEvent } from '@/lib/audit';

const uuid = z.string().uuid();
const schema = z.object({
  taskId: uuid,
  version: z.number().int().positive(),
  assigneeIds: z.array(uuid).max(20),
  blocks: z.array(z.object({ userId: uuid, date: z.iso.date(), half: z.enum(['am', 'pm']) })).max(366),
}).superRefine((value, ctx) => {
  if (new Set(value.assigneeIds).size !== value.assigneeIds.length) ctx.addIssue({ code: 'custom', message: 'Responsáveis repetidos.' });
  const keys = value.blocks.map(b => `${b.userId}/${b.date}/${b.half}`);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Blocos repetidos.' });
  if (value.blocks.some(b => !value.assigneeIds.includes(b.userId))) ctx.addIssue({ code: 'custom', message: 'Bloco sem responsável.' });
});

async function assign(req: NextRequest): Promise<NextResponse> {
  if (process.env.PLANNING_PREVIEW_ENABLED !== 'true' || process.env.VERCEL_ENV === 'production')
    return new NextResponse(null, { status: 404 });
  const auth = await requirePermission(req, 'tasks_write');
  if (!auth.success) return auth.response;
  const center = await requirePermission(req, 'planning_center_write');
  if (!center.success) return center.response;
  const calendar = await requirePermission(req, 'calendar_write');
  if (!calendar.success) return calendar.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Plano inválido.', details: parsed.error.flatten() }, { status: 422 });
  const input = parsed.data;
  try {
    const db = requireServerDbClient(auth.user);
    const { data, error } = await db.rpc('plan_task_blocks', {
      p_task_id: input.taskId, p_expected_version: input.version, p_actor_id: auth.user.id,
      p_assignee_ids: input.assigneeIds,
      p_blocks: input.blocks.map(b => ({ user_id: b.userId, plan_date: b.date, day_half: b.half })),
    });
    if (error) {
      const status = error.code === '40001' || error.code === '23505' ? 409
        : error.code === '42501' ? 403 : error.code === 'P0002' ? 404
        : error.code === '23514' ? 409 : error.code === '22023' ? 422 : 503;
      return NextResponse.json({ error: error.message }, { status });
    }
    await logAuditEvent({ action: 'TASK_UPDATED', userId: auth.user.id, entity: 'tasks', entityId: input.taskId,
      details: { operation: 'planning', assigneeCount: input.assigneeIds.length, blockCount: input.blocks.length } });
    return NextResponse.json({ taskId: input.taskId, version: data.version }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[PLANNING ASSIGN]', error);
    return NextResponse.json({ error: 'Planeamento indisponível.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (process.env.PLANNING_PREVIEW_ENABLED !== 'true' || process.env.VERCEL_ENV === 'production')
    return new NextResponse(null, { status: 404 });
  const center = await requirePermission(req, 'planning_center_write');
  if (!center.success) return center.response;
  const tasks = await requirePermission(req, 'tasks_write');
  if (!tasks.success) return tasks.response;
  const calendar = await requirePermission(req, 'calendar_write');
  if (!calendar.success) return calendar.response;
  return runIdempotent(req, center.user.id, 'tasks:plan', assign);
}
