import { createApiHandler } from '@/lib/apiErrors';
import { NextRequest } from 'next/server';
import { deleteDomainEntity } from '@/lib/supabase/deleteDomainEntity';
export const dynamic = 'force-dynamic';
async function handleDelete(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return deleteDomainEntity(req, 'comments', (await context.params).id);
}

export const DELETE = createApiHandler(handleDelete);
