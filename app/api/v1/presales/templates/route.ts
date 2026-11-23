import { createApiHandler } from '@/lib/apiErrors';
import { updatePresalesTemplateSchema } from '@/lib/validations/apiInputs';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { auditRequestHeaders, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function handleGet(req: NextRequest) {
  const auth = await requirePermission(req,'config.read');
  if (!auth.success) return auth.response;
  const db = createAdminClient(req.method === 'GET' ? undefined : auditRequestHeaders(auth.user));
  if (!db) return NextResponse.json({ success:false,message:'Base de dados indisponível.' },{status:503});
  const { data,error } = await db.from('presales_document_templates').select('*').order('code');
  if (error) return NextResponse.json({ success:false,message:'Não foi possível consultar templates.' },{status:500});
  return NextResponse.json({success:true,data});
}

async function handlePatch(req: NextRequest) {
  const auth = await requirePermission(req,'config.write');
  if (!auth.success) return auth.response;
  const parsed = updatePresalesTemplateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({success:false,message:'Template inválido.'},{status:400});
  const db = createAdminClient(req.method === 'GET' ? undefined : auditRequestHeaders(auth.user));
  if (!db) return NextResponse.json({success:false,message:'Base de dados indisponível.'},{status:503});
  const { data,error } = await db.from('presales_document_templates').update({title:parsed.data.title,
    markdown:parsed.data.markdown,version:parsed.data.version+1,updated_by:auth.user.id,updated_at:new Date().toISOString()})
    .eq('code',parsed.data.code).eq('version',parsed.data.version).select('code,version').single();
  if (error || !data) return NextResponse.json({success:false,message:'Versão desatualizada ou erro de gravação.'},{status:409});
  return NextResponse.json({success:true,data});
}

export const GET = createApiHandler(handleGet);

export const PATCH = createApiHandler(handlePatch);
