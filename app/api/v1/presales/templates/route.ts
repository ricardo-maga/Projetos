import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const schema = z.object({ code: z.enum(['basic','normal','advanced']), title: z.string().trim().min(1).max(120),
  markdown: z.string().max(50000), version: z.number().int().positive() });

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req,'config.read');
  if (!auth.success) return auth.response;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ success:false,message:'Base de dados indisponível.' },{status:503});
  const { data,error } = await db.from('presales_document_templates').select('*').order('code');
  if (error) return NextResponse.json({ success:false,message:'Não foi possível consultar templates.' },{status:500});
  return NextResponse.json({success:true,data});
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req,'config.write');
  if (!auth.success) return auth.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({success:false,message:'Template inválido.'},{status:400});
  const db = createAdminClient();
  if (!db) return NextResponse.json({success:false,message:'Base de dados indisponível.'},{status:503});
  const { data,error } = await db.from('presales_document_templates').update({title:parsed.data.title,
    markdown:parsed.data.markdown,version:parsed.data.version+1,updated_by:auth.user.id,updated_at:new Date().toISOString()})
    .eq('code',parsed.data.code).eq('version',parsed.data.version).select('code,version').single();
  if (error || !data) return NextResponse.json({success:false,message:'Versão desatualizada ou erro de gravação.'},{status:409});
  return NextResponse.json({success:true,data});
}
