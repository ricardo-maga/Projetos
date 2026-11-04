export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const db = requireServerDbClient(user);
    const { data: allowed, error: permissionError } = await db.rpc('has_permission', {
      p_permission_code: 'config:read', p_user_id: user.auth_user_id,
    });
    if (permissionError) throw new Error('permission lookup failed');
    if (allowed !== true) {
      return NextResponse.json({ success: false, message: 'Sem permissão para consultar templates de tarefas.' }, { status: 403, headers: noStore });
    }

    const { data, error } = await db.from('default_tasks').select('*');
    if (error) throw error;
    return NextResponse.json({ success: true, data: (data || []).map((row: any) => ({
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      estimatedHours: row.estimated_hours || '',
      taskTypeId: row.task_type_id || undefined,
    })) }, { headers: noStore });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ success: false, message: error.message }, { status: 403, headers: noStore });
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode || 401, headers: noStore });
    return NextResponse.json({ success: false, message: 'Não foi possível consultar os templates de tarefas.' }, { status: 503, headers: noStore });
  }
}
