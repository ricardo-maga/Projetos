import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string; assetId: string }> };

export async function GET(req: NextRequest, context: Context) {
  const auth = await requirePermission(req, 'presales.read');
  if (!auth.success) return auth.response;
  if (auth.user.type === 'External') return NextResponse.json({ success: false, message: 'Sem acesso.' }, { status: 403 });
  const { id, assetId } = await context.params;
  if (!z.guid().safeParse(id).success || !z.guid().safeParse(assetId).success)
    return NextResponse.json({ success: false, message: 'Identificador inválido.' }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
  const { data: asset, error } = await db.from('presales_assets').select('storage_path,media_type')
    .eq('id', assetId).eq('request_id', id).maybeSingle();
  if (error) return NextResponse.json({ success: false, message: 'Não foi possível consultar a imagem.' }, { status: 500 });
  if (!asset) return NextResponse.json({ success: false, message: 'Imagem inexistente.' }, { status: 404 });
  const { data: blob, error: downloadError } = await db.storage.from('presales-assets').download(asset.storage_path);
  if (downloadError || !blob) return NextResponse.json({ success: false, message: 'Imagem indisponível.' }, { status: 503 });
  return new Response(blob, { headers: { 'Content-Type': asset.media_type,
    'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
