export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { mapRisk, riskInput, riskPayload } from '@/domains/projects/data/riskRepository';

type Context = { params: Promise<{ id: string }> };
const versionSchema = z.number().int().positive();

export async function PATCH(req: NextRequest, { params }: Context) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ success: false, message: 'ID inválido.' }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = riskInput.extend({ syncVersion: versionSchema }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Item de risco inválido. Recarregue os dados.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data, error } = await db.from('project_risk_items').update(riskPayload(parsed.data))
      .eq('id', id).eq('project_id', parsed.data.projectId).eq('deleted', false)
      .eq('sync_version', parsed.data.syncVersion).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: 'O risco foi alterado por outro utilizador. Recarregue os dados.' }, { status: 409 });
    return NextResponse.json({ success: true, data: mapRisk(data) });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível atualizar o risco.' }, { status: 503 }); }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const auth = await requirePermission(req, 'projects_delete');
  if (!auth.success) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ success: false, message: 'ID inválido.' }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = z.object({ syncVersion: versionSchema }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Versão inválida. Recarregue os dados.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data, error } = await db.from('project_risk_items').update({ deleted: true })
      .eq('id', id).eq('deleted', false).eq('sync_version', parsed.data.syncVersion).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: 'O risco foi alterado por outro utilizador. Recarregue os dados.' }, { status: 409 });
    return NextResponse.json({ success: true, id });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível eliminar o risco.' }, { status: 503 }); }
}
