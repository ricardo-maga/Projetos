export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { logAuditEvent } from '@/lib/audit';

const schema = z.object({
  projectId: z.string().uuid(), requirementId: z.string().uuid(), version: z.number().int().nonnegative(),
  action: z.enum(['instantiate', 'link', 'waive', 'clear']),
  taskId: z.string().uuid().optional(), reason: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  if (process.env.PLANNING_PREVIEW_ENABLED !== 'true' || process.env.VERCEL_ENV === 'production')
    return new NextResponse(null, { status: 404 });
  const auth = await requirePermission(req, 'planning_center_write');
  if (!auth.success) return auth.response;
  for (const code of ['tasks_write', 'projects_read'] as const) {
    const permission = await requirePermission(req, code);
    if (!permission.success) return permission.response;
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 422 });
  const input = parsed.data;
  try {
    const db = requireServerDbClient(auth.user);
    const { data, error } = await db.rpc('mutate_project_task_requirement', {
      p_project_id: input.projectId, p_requirement_id: input.requirementId,
      p_actor_id: auth.user.id, p_expected_version: input.version,
      p_action: input.action, p_task_id: input.taskId || null, p_reason: input.reason || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status:
      error.code === '40001' || error.code === '23505' ? 409 : error.code === '42501' ? 403
        : error.code === 'P0002' ? 404 : error.code === '22023' ? 422 : 503 });
    await logAuditEvent({ action: input.action === 'instantiate' ? 'TASK_CREATED' : 'TASK_UPDATED',
      userId: auth.user.id, entity: 'project_task_requirements', entityId: input.requirementId,
      details: { projectId: input.projectId, taskId: data.taskId, operation: input.action,
        ...(input.reason ? { reason: input.reason } : {}) } });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[REQUIREMENT ACTION]', error);
    return NextResponse.json({ error: 'Requisito indisponível.' }, { status: 503 });
  }
}
