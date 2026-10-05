export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { retiredPlanning } from '@/lib/planning/retired';

export async function GET(req: NextRequest) {
  return retiredPlanning(req, 'calendar_read');
}

export async function PATCH(req: NextRequest) {
  return retiredPlanning(req, 'calendar_write');
}

export async function DELETE(req: NextRequest) {
  return retiredPlanning(req, 'calendar_write');
}
