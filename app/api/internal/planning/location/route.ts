export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { logAuditEvent } from '@/lib/audit';

const schema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('task'), id: z.string().uuid(), version: z.number().int().positive(),
    kind: z.enum(['inherit', 'site', 'company', 'remote', 'unknown']), siteId: z.string().uuid().nullable() }),
  z.object({ target: z.literal('project'), id: z.string().uuid(), version: z.number().int().positive(),
    siteId: z.string().uuid().nullable() }),
]);

export async function POST(req: NextRequest) {
  if (process.env.PLANNING_PREVIEW_ENABLED !== 'true' || process.env.VERCEL_ENV === 'production')
    return new NextResponse(null, { status: 404 });
  const center = await requirePermission(req, 'planning_center_write');
  if (!center.success) return center.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Local inválido.' }, { status: 422 });
  const input = parsed.data;
  const scope = await requirePermission(req, input.target === 'task' ? 'tasks_write' : 'projects_write');
  if (!scope.success) return scope.response;
  try {
    const db = requireServerDbClient(center.user);
    const { data, error } = input.target === 'task'
      ? await db.rpc('set_task_execution_location', { p_task_id: input.id,
        p_expected_version: input.version, p_actor_id: center.user.id,
        p_kind: input.kind, p_site_id: input.siteId })
      : await db.rpc('set_project_default_site', { p_project_id: input.id,
        p_expected_version: input.version, p_actor_id: center.user.id,
        p_site_id: input.siteId });
    if (error) return NextResponse.json({ error: error.message }, { status:
      error.code === '40001' ? 409 : error.code === '42501' ? 403
        : error.code === 'P0002' ? 404 : error.code === '23514' || error.code === '22023' ? 422 : 503 });
    await logAuditEvent({ action: input.target === 'task' ? 'TASK_UPDATED' : 'PROJECT_UPDATED',
      userId: center.user.id, entity: input.target === 'task' ? 'tasks' : 'projects',
      entityId: input.id, details: { operation: 'set_execution_location', siteId: input.siteId } });
    return NextResponse.json({ version: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[PLANNING LOCATION]', error);
    return NextResponse.json({ error: 'Local indisponível.' }, { status: 503 });
  }
}
