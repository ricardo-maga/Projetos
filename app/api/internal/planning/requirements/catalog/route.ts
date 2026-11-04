export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { logAuditEvent } from '@/lib/audit';

const schema = z.object({
  id: z.string().uuid().optional(), version: z.number().int().positive().optional(),
  categoryId: z.string().uuid(), defaultTaskId: z.string().uuid(),
  necessity: z.enum(['mandatory', 'recommended', 'conditional']),
  conditionCode: z.enum(['install_project_no', 'sf_opportunity_no']).nullable(),
  sortOrder: z.number().int().min(0).max(10000), active: z.boolean(),
}).refine(value => (value.necessity === 'conditional') === Boolean(value.conditionCode), {
  message: 'A condição é obrigatória apenas para requisitos condicionais.',
}).refine(value => !value.id || value.version !== undefined, {
  message: 'A versão é obrigatória ao alterar um requisito.',
});

export async function POST(req: NextRequest) {
  if (process.env.PLANNING_PREVIEW_ENABLED !== 'true' || process.env.VERCEL_ENV === 'production')
    return new NextResponse(null, { status: 404 });
  const center = await requirePermission(req, 'planning_center_write');
  if (!center.success) return center.response;
  const config = await requirePermission(req, 'config_write');
  if (!config.success) return config.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 422 });
  const input = parsed.data;
  try {
    const db = requireServerDbClient(center.user);
    const values = { category_id: input.categoryId, default_task_id: input.defaultTaskId,
      necessity: input.necessity, condition_code: input.conditionCode,
      sort_order: input.sortOrder, active: input.active, updated_by: center.user.id,
      updated_at: new Date().toISOString() };
    const query = input.id
      ? db.from('project_task_requirements').update({ ...values, version: input.version! + 1 })
        .eq('id', input.id).eq('version', input.version!).select('id,version').maybeSingle()
      : db.from('project_task_requirements').insert(values).select('id,version').single();
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Requisito já configurado.' : 'Não foi possível guardar o requisito.' },
      { status: error.code === '23505' ? 409 : error.code === '23503' || error.code === '23514' ? 422 : 503 });
    if (!data) return NextResponse.json({ error: 'Versão desatualizada ou requisito inexistente.' }, { status: 409 });
    await logAuditEvent({ action: 'TASK_UPDATED', userId: center.user.id,
      entity: 'project_task_requirements', entityId: data.id,
      details: { operation: input.id ? 'catalog_update' : 'catalog_create', categoryId: input.categoryId } });
    return NextResponse.json(data, { status: input.id ? 200 : 201 });
  } catch (error) {
    console.error('[REQUIREMENT CATALOG]', error);
    return NextResponse.json({ error: 'Catálogo indisponível.' }, { status: 503 });
  }
}
