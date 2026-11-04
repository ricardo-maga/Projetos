export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { logAuditEvent } from '@/lib/audit';

const schema = z.object({ id: z.string().uuid().optional(), version: z.number().int().positive().optional(),
  clientId: z.string().uuid(), name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(500).nullable(), region: z.string().trim().max(120).nullable(),
  deleted: z.boolean().default(false),
}).refine(value => !value.id || value.version !== undefined, { message: 'Versão obrigatória para edição.' });

export async function POST(req: NextRequest) {
  if (process.env.PLANNING_PREVIEW_ENABLED !== 'true' || process.env.VERCEL_ENV === 'production')
    return new NextResponse(null, { status: 404 });
  const center = await requirePermission(req, 'planning_center_write');
  if (!center.success) return center.response;
  const clients = await requirePermission(req, 'clients_write');
  if (!clients.success) return clients.response;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Instalação inválida.' }, { status: 422 });
  const input = parsed.data;
  try {
    const db = requireServerDbClient(center.user);
    const values = { client_id: input.clientId, name: input.name, address: input.address,
      region: input.region, deleted: input.deleted, updated_by: center.user.id,
      updated_at: new Date().toISOString() };
    const query = input.id
      ? db.from('client_sites').update({ ...values, version: (input.version || 0) + 1 })
        .eq('id', input.id).eq('version', input.version || 0).select('id,version').maybeSingle()
      : db.from('client_sites').insert(values).select('id,version').single();
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Instalação já existe.' : 'Não foi possível guardar a instalação.' },
      { status: error.code === '23505' ? 409 : error.code === '23503' || error.code === '23514' ? 422 : 503 });
    if (!data) return NextResponse.json({ error: 'Versão desatualizada ou instalação inexistente.' }, { status: 409 });
    await logAuditEvent({ action: 'CLIENT_UPDATED', userId: center.user.id,
      entity: 'client_sites', entityId: data.id, details: { clientId: input.clientId, deleted: input.deleted } });
    return NextResponse.json(data, { status: input.id ? 200 : 201 });
  } catch (error) {
    console.error('[PLANNING SITE]', error);
    return NextResponse.json({ error: 'Instalações indisponíveis.' }, { status: 503 });
  }
}
