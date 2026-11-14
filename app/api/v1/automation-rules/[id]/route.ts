export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { mapRule, ruleInput, rulePayload, validateAgainstStatuses } from '@/domains/communication/data/automationRuleRepository';

type Context = { params: Promise<{ id: string }> };
const version = z.number().int().positive();

export async function PATCH(req: NextRequest, { params }: Context) {
  const auth = await requirePermission(req, 'config_write');
  if (!auth.success) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ success: false, message: 'ID inválido.' }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = ruleInput.extend({ syncVersion: version }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Regra inválida. Recarregue os dados.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const problem = await validateAgainstStatuses(db, parsed.data);
    if (problem) return NextResponse.json({ success: false, message: problem }, { status: 400 });
    const { data, error } = await db.from('automation_rules').update(rulePayload(parsed.data))
      .eq('id', id).eq('deleted', false).eq('sync_version', parsed.data.syncVersion).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: 'A regra foi alterada por outro utilizador. Recarregue os dados.' }, { status: 409 });
    return NextResponse.json({ success: true, data: mapRule(data) });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível atualizar a regra.' }, { status: 503 }); }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const auth = await requirePermission(req, 'config_write');
  if (!auth.success) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ success: false, message: 'ID inválido.' }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = z.object({ syncVersion: version }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Versão inválida.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data, error } = await db.from('automation_rules').update({ deleted: true, enabled: false })
      .eq('id', id).eq('deleted', false).eq('sync_version', parsed.data.syncVersion).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: 'A regra foi alterada por outro utilizador. Recarregue os dados.' }, { status: 409 });
    return NextResponse.json({ success: true, id });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível eliminar a regra.' }, { status: 503 }); }
}
