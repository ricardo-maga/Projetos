export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { mapRisk, riskInput, riskPayload } from '@/domains/projects/data/riskRepository';

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;
  if (!(await checkRateLimit(`risk-create:${auth.user.id}`, { limit: 30, windowSeconds: 60 })).success)
    return NextResponse.json({ success: false, message: 'Demasiados pedidos.' }, { status: 429, headers: { 'Retry-After': '60' } });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = riskInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Item de risco inválido.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', parsed.data.projectId).eq('deleted', false).maybeSingle();
    if (projectError) throw projectError;
    if (!project) return NextResponse.json({ success: false, message: 'Projeto não encontrado.' }, { status: 404 });
    const { data, error } = await db.from('project_risk_items').insert(riskPayload(parsed.data)).select('*').single();
    if (error || !data) throw error || new Error('Missing risk');
    return NextResponse.json({ success: true, data: mapRisk(data) }, { status: 201 });
  } catch { return NextResponse.json({ success: false, message: 'Não foi possível criar o risco.' }, { status: 503 }); }
}
