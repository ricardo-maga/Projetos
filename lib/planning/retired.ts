import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '../auth/authorization';

// Retired routes retain their access checks, but never read/write allocations.
export async function retiredPlanning(req: NextRequest, permission: 'calendar_read' | 'calendar_write') {
  const auth = await requirePermission(req, permission);
  if (!auth.success) return auth.response;
  return NextResponse.json({ success: false, error: {
    code: 'PLANNING_RETIRED',
    message: 'O planeamento por alocações foi descontinuado. Utilize a data e as horas previstas da tarefa.',
  }, requestId: auth.requestId }, { status: 410 });
}
