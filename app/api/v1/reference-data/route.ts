export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { referenceCollection, referenceFields, referencePayload, referenceTables } from '@/domains/administration/data/referenceData';

const create = z.object({ collection: referenceCollection, fields: referenceFields.extend({ name: z.string().trim().min(1).max(200) }) });
const edit = z.object({ collection: referenceCollection, id: z.string().uuid(), syncVersion: z.number().int().positive(), fields: referenceFields });

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'config_write');
  if (!auth.success) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = create.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Opção inválida.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const table = referenceTables[parsed.data.collection];
    const { data: last, error: orderError } = await db.from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1);
    if (orderError) throw orderError;
    const { data, error } = await db.from(table).insert({ id: crypto.randomUUID(), ...referencePayload(parsed.data.collection, parsed.data.fields),
      sort_order: (Number(last?.[0]?.sort_order) || 0) + 1, deleted: false }).select('*').single();
    if (error || !data) throw error || new Error('Missing reference row');
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível criar a opção.' }, { status: 503 }); }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, 'config_write');
  if (!auth.success) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = edit.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Opção inválida.' }, { status: 400 });
  const fields = referencePayload(parsed.data.collection, parsed.data.fields);
  if (!Object.keys(fields).length) return NextResponse.json({ success: false, message: 'Sem alterações.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data, error } = await db.from(referenceTables[parsed.data.collection]).update(fields)
      .eq('id', parsed.data.id).eq('deleted', false).eq('sync_version', parsed.data.syncVersion).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: 'A opção foi alterada por outro utilizador. Recarregue os dados.' }, { status: 409 });
    return NextResponse.json({ success: true, data });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível alterar a opção.' }, { status: 503 }); }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, 'config_write');
  if (!auth.success) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = edit.pick({ collection: true, id: true, syncVersion: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Opção inválida.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data, error } = await db.from(referenceTables[parsed.data.collection]).update({ deleted: true })
      .eq('id', parsed.data.id).eq('deleted', false).eq('sync_version', parsed.data.syncVersion).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: 'A opção foi alterada por outro utilizador. Recarregue os dados.' }, { status: 409 });
    return NextResponse.json({ success: true, id: parsed.data.id });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível eliminar a opção.' }, { status: 503 }); }
}
