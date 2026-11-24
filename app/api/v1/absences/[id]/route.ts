import { NextRequest } from 'next/server';
import { deleteDomainEntity } from '@/lib/supabase/deleteDomainEntity';
export const dynamic = 'force-dynamic';
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return deleteDomainEntity(req, 'userAbsences', (await context.params).id);
}
