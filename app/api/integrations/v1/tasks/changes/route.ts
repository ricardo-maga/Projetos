import { NextRequest } from 'next/server';
import { integrationChanges } from '@/lib/integrations/changes';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) { return integrationChanges(req, 'tasks'); }
