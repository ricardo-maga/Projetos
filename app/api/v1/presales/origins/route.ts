import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const schema = z.object({ code:z.enum(['email','phone','whatsapp','in_person','other']),
  label:z.string().trim().min(1).max(80),active:z.boolean() });

export async function GET(req:NextRequest) {
  const auth = await requirePermission(req,'config.read');
  if (!auth.success) return auth.response;
  const db = createAdminClient();
  if (!db) return NextResponse.json({success:false,message:'Base de dados indisponível.'},{status:503});
  const {data,error} = await db.from('presales_origins').select('code,label,active,sort_order').order('sort_order');
  if (error) return NextResponse.json({success:false,message:'Não foi possível consultar origens.'},{status:500});
  return NextResponse.json({success:true,data});
}

export async function PATCH(req:NextRequest) {
  const auth = await requirePermission(req,'config.write');
  if (!auth.success) return auth.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({success:false,message:'Origem inválida.'},{status:400});
  const db = createAdminClient();
  if (!db) return NextResponse.json({success:false,message:'Base de dados indisponível.'},{status:503});
  const {data,error} = await db.from('presales_origins').update({label:parsed.data.label,active:parsed.data.active})
    .eq('code',parsed.data.code).select('code').single();
  if (error || !data) return NextResponse.json({success:false,message:'Não foi possível guardar origem.'},{status:400});
  return NextResponse.json({success:true});
}
