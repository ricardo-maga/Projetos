import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const mediaTypes: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export async function POST(req: NextRequest, context: Context) {
  const auth = await requirePermission(req, 'presales.manage');
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Sem acesso.' }, { status: 403 });
  const { id } = await context.params;
  if (!z.guid().safeParse(id).success) return NextResponse.json({ success: false, message: 'Identificador inválido.' }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
  const { data: request, error: requestError } = await db.from('work_requests').select('area_owner_id,kind')
    .eq('id', id).eq('kind', 'presales').maybeSingle();
  if (requestError) return NextResponse.json({ success: false, message: 'Não foi possível consultar Presales.' }, { status: 500 });
  if (!request) return NextResponse.json({ success: false, message: 'Presales inexistente.' }, { status: 404 });
  if (request.area_owner_id !== auth.user.id && !hasPermission(auth.user, 'presales_coordinate'))
    return NextResponse.json({ success: false, message: 'Sem permissão para alterar esta proposta.' }, { status: 403 });
  const { data: details } = await db.from('presales_details').select('document_locked').eq('request_id', id).single();
  if (!details || details.document_locked) return NextResponse.json({ success: false, message: 'Crie uma nova revisão antes de inserir imagens.' }, { status: 409 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || !mediaTypes[file.type] || file.size < 1 || file.size > 10_485_760)
    return NextResponse.json({ success: false, message: 'Envie uma imagem PNG, JPEG ou WebP até 10 MB.' }, { status: 400 });
  const assetId = crypto.randomUUID();
  const path = `${id}/${assetId}.${mediaTypes[file.type]}`;
  const { error: uploadError } = await db.storage.from('presales-assets').upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ success: false, message: 'Não foi possível guardar a imagem.' }, { status: 500 });
  const { error: insertError } = await db.from('presales_assets').insert({ id: assetId, request_id: id,
    storage_path: path, filename: file.name.slice(0, 255), media_type: file.type, uploaded_by: auth.user.id });
  if (insertError) {
    await db.storage.from('presales-assets').remove([path]);
    return NextResponse.json({ success: false, message: 'Não foi possível registar a imagem.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { id: assetId } }, { status: 201 });
}
