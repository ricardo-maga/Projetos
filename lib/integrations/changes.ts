import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateIntegration } from '@/lib/integrations/auth';

const cursorSchema = z.object({ changedAt: z.iso.datetime({ offset: true }), id: z.uuid(),
  kind: z.enum(['projects', 'tasks']), projectId: z.uuid().nullable(), since: z.iso.datetime({ offset: true }) });
const querySchema = z.object({
  since: z.iso.datetime({ offset: true }),
  cursor: z.string().max(500).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  projectId: z.uuid().optional(),
});

export function encodeCursor(value: z.infer<typeof cursorSchema>) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor(value: string) {
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))); }
  catch { return null; }
}

export async function integrationChanges(req: NextRequest, kind: 'projects' | 'tasks') {
  const auth = await authenticateIntegration(req, kind === 'projects' ? 'projects:read' : 'tasks:read');
  if ('response' in auth) return auth.response;
  const query = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success || (kind === 'tasks' && !query.data.projectId))
    return NextResponse.json({ error: 'Indique since e, para tarefas, projectId válidos.' }, { status: 422 });
  const cursor = query.data.cursor ? decodeCursor(query.data.cursor) : null;
  if (query.data.cursor && (!cursor || cursor.kind !== kind || cursor.projectId !== (query.data.projectId || null)
    || cursor.since !== query.data.since))
    return NextResponse.json({ error: 'Cursor inválido.' }, { status: 422 });
  try {
    const { data, error } = await auth.db.rpc('list_integration_changes', {
      p_kind: kind,
      p_client_ids: auth.integration.client_ids,
      p_project_ids: auth.integration.project_ids,
      p_project_id: query.data.projectId || null,
      p_since: query.data.since,
      p_cursor_at: cursor?.changedAt || null,
      p_cursor_id: cursor?.id || null,
      p_limit: query.data.pageSize,
    });
    if (error) throw error;
    const rows = (data || []) as Array<{ id: string; changed_at: string; deleted: boolean; data: Record<string, unknown> | null }>;
    const hasMore = rows.length > query.data.pageSize;
    const page = rows.slice(0, query.data.pageSize);
    const last = page.at(-1);
    return NextResponse.json({
      data: page.map(row => ({ id: row.id, updatedAt: row.changed_at, deleted: row.deleted, data: row.deleted ? null : row.data })),
      hasMore,
      nextCursor: last ? encodeCursor({ changedAt: last.changed_at, id: last.id, kind,
        projectId: query.data.projectId || null, since: query.data.since }) : null,
    });
  } catch (error) {
    console.error('[INTEGRATION CHANGES]', error);
    return NextResponse.json({ error: 'Falha ao consultar alterações.' }, { status: 500 });
  }
}
