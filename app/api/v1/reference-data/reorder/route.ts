import { createApiHandler } from '@/lib/apiErrors';
import { reorderReferenceSchema } from '@/lib/validations/apiInputs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { referenceTables } from '@/domains/administration/data/referenceData';


async function handlePost(req: NextRequest) {
  const auth = await requirePermission(req, 'config_write');
  if (!auth.success) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = reorderReferenceSchema.safeParse(body);
  if (!parsed.success || new Set(parsed.data.rows.map(row => row.id)).size !== parsed.data.rows.length
    || parsed.data.rows.some((row, index) => row.sortOrder !== index))
    return NextResponse.json({ success: false, message: 'Ordenação inválida.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data, error } = await db.rpc('reorder_reference_records', {
      p_table: referenceTables[parsed.data.collection], p_changes: parsed.data.rows,
    });
    if (error?.code === 'PT409') return NextResponse.json({ success: false, message: 'As opções foram alteradas por outro utilizador. Recarregue os dados.' }, { status: 409 });
    if (error || !Array.isArray(data)) throw error || new Error('Missing reordered rows');
    return NextResponse.json({ success: true, data });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível reordenar as opções.' }, { status: 503 }); }
}

export const POST = createApiHandler(handlePost);
