export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { checkRateLimit } from '@/lib/rateLimit';
import { createDefaultTaskSchema, mapDefaultTask } from '@/lib/defaultTasks/contracts';

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
    return NextResponse.json({ success: true, data: (data || []).map(mapDefaultTask) }, { headers: noStore });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ success: false, message: error.message }, { status: 403, headers: noStore });
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode || 401, headers: noStore });
    return NextResponse.json({ success: false, message: 'Não foi possível consultar os templates de tarefas.' }, { status: 503, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!(await checkRateLimit(`default-tasks:${user.id}`, { limit: 30, windowSeconds: 60 })).success)
      return NextResponse.json({ success: false, message: 'Demasiados pedidos.' }, { status: 429, headers: noStore });
    const db = requireServerDbClient(user);
    const { data: allowed, error: permissionError } = await db.rpc('has_permission', {
      p_permission_code: 'config:write', p_user_id: user.auth_user_id,
    });
    if (permissionError) throw new AuthError('Serviço de autorização indisponível.', 503);
    if (allowed !== true) throw new ForbiddenError('Sem permissão para criar templates de tarefas.');

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400, headers: noStore }); }
    const parsed = createDefaultTaskSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Template de tarefa inválido.' }, { status: 400, headers: noStore });
    const { data, error } = await db.from('default_tasks').insert({
      title: parsed.data.title,
      description: parsed.data.description || null,
      estimated_hours: parsed.data.estimatedHours,
      task_type_id: parsed.data.taskTypeId || null,
    }).select('*').single();
    if (error || !data) throw error || new Error('Missing inserted row');
    return NextResponse.json({ success: true, data: mapDefaultTask(data) }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ success: false, message: error.message }, { status: 403, headers: noStore });
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode || 401, headers: noStore });
    return NextResponse.json({ success: false, message: 'Não foi possível criar o template de tarefa.' }, { status: 503, headers: noStore });
  }
}
