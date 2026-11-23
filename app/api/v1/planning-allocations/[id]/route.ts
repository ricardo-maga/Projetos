import { createApiHandler } from '@/lib/apiErrors';
export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { retiredPlanning } from '@/lib/planning/retired';

async function handleGet(req: NextRequest) {
  return retiredPlanning(req, 'calendar_read');
}

async function handlePatch(req: NextRequest) {
  return retiredPlanning(req, 'calendar_write');
}

async function handleDelete(req: NextRequest) {
  return retiredPlanning(req, 'calendar_write');
}

export const GET = createApiHandler(handleGet);

export const PATCH = createApiHandler(handlePatch);

export const DELETE = createApiHandler(handleDelete);
