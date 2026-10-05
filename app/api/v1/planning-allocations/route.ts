export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { retiredPlanning } from '@/lib/planning/retired';

export async function GET(req: NextRequest) {
  return retiredPlanning(req, 'calendar_read');
}

export async function POST(req: NextRequest) {
  return retiredPlanning(req, 'calendar_write');
}
