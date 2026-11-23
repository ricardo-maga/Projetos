import { createApiHandler } from '@/lib/apiErrors';
import { updateConfigurationSchema } from '@/lib/validations/apiInputs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { configurationReadQuery } from '@/domains/configuration/data/configurationRepository';


async function handlePatch(req: NextRequest) {
  const auth = await requirePermission(req, 'config_write');
  if (!auth.success) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = updateConfigurationSchema.safeParse(body);
  if (!parsed.success || !Object.keys(parsed.data.updates).length)
    return NextResponse.json({ success: false, message: 'Configuração inválida.' }, { status: 400 });
  const updates = parsed.data.updates;
  const payload: Record<string, unknown> = {};
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
    const { data: current, error: readError } = await configurationReadQuery(db, 'id').maybeSingle();
    if (readError) throw readError;
    if (!current) return NextResponse.json({ success: false, message: 'Configuração não encontrada.' }, { status: 404 });
    const { data, error } = await db.from('app_configuration').update(payload)
      .eq('id', current.id).eq('sync_version', parsed.data.syncVersion).select('sync_version').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: 'A configuração foi alterada por outro utilizador. Recarregue os dados.' }, { status: 409 });
    return NextResponse.json({ success: true, data: { ...updates, syncVersion: Number(data.sync_version) } });
  } catch (error) {
    console.error('[API CONFIGURATION PATCH EXCEPTION]', error);
    return NextResponse.json({ success: false, message: 'Não foi possível guardar a configuração.' }, { status: 503 });
  }
}

export const PATCH = createApiHandler(handlePatch);
