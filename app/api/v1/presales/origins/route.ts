import { createApiHandler } from '@/lib/apiErrors';
import { updatePresalesOriginSchema } from '@/lib/validations/apiInputs';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { auditRequestHeaders, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function handleGet(req:NextRequest) {
  const auth = await requirePermission(req,'config.read');
  if (!auth.success) return auth.response;
  const db = createAdminClient(req.method === 'GET' ? undefined : auditRequestHeaders(auth.user));
  if (!db) return NextResponse.json({success:false,message:'Base de dados indisponível.'},{status:503});
  const {data,error} = await db.from('presales_origins').select('code,label,active,sort_order').order('sort_order');
  if (error) return NextResponse.json({success:false,message:'Não foi possível consultar origens.'},{status:500});
  return NextResponse.json({success:true,data});
}

async function handlePatch(req:NextRequest) {
  const auth = await requirePermission(req,'config.write');
  if (!auth.success) return auth.response;
  const parsed = updatePresalesOriginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({success:false,message:'Origem inválida.'},{status:400});
  const db = createAdminClient(req.method === 'GET' ? undefined : auditRequestHeaders(auth.user));
  if (!db) return NextResponse.json({success:false,message:'Base de dados indisponível.'},{status:503});
  const {data,error} = await db.from('presales_origins').update({label:parsed.data.label,active:parsed.data.active})
    .eq('code',parsed.data.code).select('code').single();
  if (error || !data) return NextResponse.json({success:false,message:'Não foi possível guardar origem.'},{status:400});
  return NextResponse.json({success:true});
}

export const GET = createApiHandler(handleGet);

export const PATCH = createApiHandler(handlePatch);
