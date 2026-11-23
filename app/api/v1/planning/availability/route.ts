import { createApiHandler } from '@/lib/apiErrors';
export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { retiredPlanning } from '@/lib/planning/retired';

async function handleGet(req: NextRequest) {
  return retiredPlanning(req, 'calendar_read');
}

export const GET = createApiHandler(handleGet);
