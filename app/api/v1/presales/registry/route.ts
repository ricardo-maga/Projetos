import { NextRequest,NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/server';
import { getIdempotentEntityId,runIdempotent } from '@/lib/apiIdempotency';
import { presalesRegistrySchema } from '@/lib/presalesRegistry';
import { presalesError } from '../route';

export async function POST(req:NextRequest) {
  const auth=await requirePermission(req,'presales.create');
  if (!auth.success) return auth.response;
  if (auth.user.type==='External') return NextResponse.json({success:false,message:'Apenas a equipa pode criar processos.'},{status:403});
  if (!req.headers.has('Idempotency-Key')) return NextResponse.json({success:false,message:'Idempotency-Key obrigatória.'},{status:400});
  return runIdempotent(req,auth.user.id,'presales:registry:create',async claimedReq => {
    const parsed=presalesRegistrySchema.safeParse(await claimedReq.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({success:false,message:'Dados do processo inválidos.',details:parsed.error.flatten()},{status:400});
    const db=createAdminClient();
    if (!db) return NextResponse.json({success:false,message:'Base de dados indisponível.'},{status:503});
    const id=getIdempotentEntityId(claimedReq);
    const {error}=await db.rpc('presales_registry_mutate',{p_id:id,p_actor_id:auth.user.id,
      p_expected_version:null,p_action:'create',p_payload:parsed.data});
    if (error) return presalesError(error);
    return NextResponse.json({success:true,data:{id}},{status:201});
  });
}
