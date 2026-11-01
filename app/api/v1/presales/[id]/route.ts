import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';
import { presalesActionSchema } from '@/lib/presales';
import { listPresales } from '@/lib/presalesServer';
import { presalesError } from '../route';
import sanitizeHtml from 'sanitize-html';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const auth = await requirePermission(req, 'presales.read');
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Apenas a equipa pode consultar Presales.' }, { status: 403 });
  const { id } = await context.params;
  if (!z.guid().safeParse(id).success) return NextResponse.json({ success: false, message: 'Identificador inválido.' }, { status: 400 });
  try {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const row = (await listPresales(db, { id }))[0];
    return row ? NextResponse.json({ success: true, data: row })
      : NextResponse.json({ success: false, message: 'Presales inexistente.' }, { status: 404 });
  } catch (error) {
    console.error('[PRESALES GET]', error);
    return NextResponse.json({ success: false, message: 'Não foi possível consultar Presales.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const { id } = await context.params;
  if (!z.guid().safeParse(id).success) return NextResponse.json({ success: false, message: 'Identificador inválido.' }, { status: 400 });
  const parsed = presalesActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Operação inválida.', details: parsed.error.flatten() }, { status: 400 });
  const action = parsed.data;
  const permission = action.action === 'task_action' && action.taskAction !== 'reopen' ? 'presales.execute' : 'presales.manage';
  const auth = await requirePermission(req, permission);
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Apenas a equipa pode gerir Presales.' }, { status: 403 });
  try {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const payload = action.action === 'save_document' ? { ...action, document: { ...action.document,
      blocks: action.document.blocks.map(block => block.type === 'rich_text'
        ? { ...block, content: sanitizeHtml(block.content, {
          allowedAttributes: { p: ['style'], h2: ['style'], h3: ['style'], span: ['style'] },
          allowedTags: ['p','br','strong','em','h2','h3','ul','ol','li','blockquote','code','pre','hr','span'],
          allowedStyles: { '*': { 'text-align': [/^(left|center|right|justify)$/], 'font-size': [/^(12|14|16|18|20|24|28)px$/] } } }) } : block) } } : action;
    const { error } = await db.rpc('presales_mutate_v2', { p_id: id, p_actor_id: auth.user.id,
      p_expected_version: action.version, p_action: action.action, p_payload: payload });
    if (error) return presalesError(error);
    return NextResponse.json({ success: true, data: (await listPresales(db, { id }))[0] });
  } catch (error) {
    console.error('[PRESALES PATCH]', error);
    return NextResponse.json({ success: false, message: 'Não foi possível gravar Presales.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  const auth = await requirePermission(req, 'presales.manage');
  if (!auth.success) return auth.response;
  const { id } = await context.params;
  const version = Number(new URL(req.url).searchParams.get('version'));
  if (!z.guid().safeParse(id).success || !Number.isInteger(version) || version < 1)
    return NextResponse.json({ success: false, message: 'Pedido ou versão inválidos.' }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
  const { error } = await db.rpc('archive_work_request', { p_id: id, p_actor_id: auth.user.id, p_expected_version: version });
  if (error) return presalesError(error);
  return NextResponse.json({ success: true });
}
