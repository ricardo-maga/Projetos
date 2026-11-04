import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';
import { presalesRegistrySchema } from '@/lib/presalesRegistry';
import { listPresales } from '@/lib/presalesServer';
import { presalesError } from '../../route';

type Context={params:Promise<{id:string}>};
export async function PATCH(req:NextRequest,context:Context) {
  const auth=await requirePermission(req,'presales.manage');
  if (!auth.success) return auth.response;
  const {id}=await context.params;
  if (!z.guid().safeParse(id).success) return NextResponse.json({success:false,message:'Identificador inválido.'},{status:400});
  const body=await req.json().catch(() => null);
  const parsed=presalesRegistrySchema.safeParse(body);
  if (!parsed.success || !Number.isInteger(body?.version) || body.version<1)
    return NextResponse.json({success:false,message:'Dados do processo inválidos.'},{status:400});
  const db=createAdminClient();
  if (!db) return NextResponse.json({success:false,message:'Base de dados indisponível.'},{status:503});
  const {error}=await db.rpc('presales_registry_mutate',{p_id:id,p_actor_id:auth.user.id,
    p_expected_version:body.version,p_action:'edit',p_payload:parsed.data});
  if (error) return presalesError(error);
  return NextResponse.json({success:true,data:(await listPresales(db,{id}))[0]});
}
