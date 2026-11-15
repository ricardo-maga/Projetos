export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';

const changes = z.object({
  appName: z.string().max(200).optional(), appDescription: z.string().max(2000).optional(),
  footerText: z.string().max(2000).optional(), footerCopyrightText: z.string().max(2000).optional(),
  logo: z.string().max(524288).optional(), logoImagePath: z.string().max(524288).optional(), theme: z.string().max(100).optional(),
  salesRepGroupIds: z.array(z.guid()).optional(), projManagerGroupIds: z.array(z.guid()).optional(),
  fieldManagerGroupIds: z.array(z.guid()).optional(), taskAssigneeGroupIds: z.array(z.guid()).optional(),
  salesRepGroupId: z.string().optional(), projManagerGroupId: z.string().optional(),
  fieldManagerGroupId: z.string().optional(), taskAssigneeGroupId: z.string().optional(),
}).strict();
const input = z.object({ syncVersion: z.number().int().positive(), updates: changes });

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, 'config_write');
  if (!auth.success) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = input.safeParse(body);
  if (!parsed.success || !Object.keys(parsed.data.updates).length)
    return NextResponse.json({ success: false, message: 'Configuração inválida.' }, { status: 400 });
  const updates = parsed.data.updates;
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.appName !== undefined) payload.app_name = updates.appName;
  if (updates.appDescription !== undefined) payload.app_description = updates.appDescription;
  if (updates.footerText !== undefined) payload.footer_text = updates.footerText;
  if (updates.footerCopyrightText !== undefined) payload.footer_copyright_text = updates.footerCopyrightText;
  if (updates.theme !== undefined) payload.theme_name = updates.theme;
  if (updates.logoImagePath !== undefined || updates.logo !== undefined) {
    payload.logo_url = updates.logoImagePath ?? updates.logo;
    payload.logo_image_path = updates.logoImagePath ?? updates.logo;
  }
  const groups = [
    ['salesRepGroupIds', 'salesRepGroupId', 'sales_rep_group_id'],
    ['projManagerGroupIds', 'projManagerGroupId', 'proj_manager_group_id'],
    ['fieldManagerGroupIds', 'fieldManagerGroupId', 'field_manager_group_id'],
    ['taskAssigneeGroupIds', 'taskAssigneeGroupId', 'task_assignee_group_id'],
  ] as const;
  for (const [arrayKey, legacyKey, column] of groups) {
    const ids = updates[arrayKey];
    if (ids !== undefined) payload[column] = ids.length ? ids.join(',') : null;
    else if (updates[legacyKey] !== undefined) payload[column] = updates[legacyKey] || null;
  }
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data: current, error: readError } = await db.from('app_configuration').select('id').limit(1).maybeSingle();
    if (readError) throw readError;
    if (!current) return NextResponse.json({ success: false, message: 'Configuração não encontrada.' }, { status: 404 });
    const { data, error } = await db.from('app_configuration').update(payload)
      .eq('id', current.id).eq('sync_version', parsed.data.syncVersion).select('sync_version').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: 'A configuração foi alterada por outro utilizador. Recarregue os dados.' }, { status: 409 });
    return NextResponse.json({ success: true, data: { ...updates, syncVersion: Number(data.sync_version) } });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível guardar a configuração.' }, { status: 503 }); }
}
