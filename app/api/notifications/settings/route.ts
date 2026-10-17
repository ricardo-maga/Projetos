import { NextRequest, NextResponse } from 'next/server';
import { AuthError, ForbiddenError, requireAuth } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

export const dynamic = 'force-dynamic';

const types = new Set([
  'new_project', 'project_allocation', 'task_allocation',
  'task_due_date', 'project_due_date', 'project_scheduled_date',
]);
const groups = new Set(['all', 'allocated', 'managers']);

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const db = requireServerDbClient();
    const { data: allowed, error: permissionError } = await db.rpc('has_permission', {
      p_permission_code: 'config:write', p_user_id: user.auth_user_id,
    });
    if (permissionError) throw new AuthError('Serviço de autorização indisponível.', 503);
    if (allowed !== true) throw new ForbiddenError();

    const body = await req.json();
    if (!body || !types.has(body.type) || !body.updates || typeof body.updates !== 'object' || Array.isArray(body.updates))
      return NextResponse.json({ message: 'Definição inválida.' }, { status: 400 });
    const updates = body.updates as Record<string, unknown>;
    if (Object.keys(updates).length === 0 || Object.keys(updates).some(key => !['enabled', 'daysBefore', 'targetGroup'].includes(key)))
      return NextResponse.json({ message: 'Campos inválidos.' }, { status: 400 });
    if (updates.enabled !== undefined && typeof updates.enabled !== 'boolean')
      return NextResponse.json({ message: 'Estado inválido.' }, { status: 400 });
    if (updates.daysBefore !== undefined && (!Number.isInteger(updates.daysBefore) || Number(updates.daysBefore) < 0 || Number(updates.daysBefore) > 30))
      return NextResponse.json({ message: 'A antecedência deve estar entre 0 e 30 dias.' }, { status: 400 });
    if (updates.targetGroup !== undefined && !groups.has(String(updates.targetGroup)))
      return NextResponse.json({ message: 'Destinatários inválidos.' }, { status: 400 });
    const changes: Record<string, unknown> = {};
    if (updates.enabled !== undefined) changes.enabled = updates.enabled;
    if (updates.daysBefore !== undefined) changes.days_before = updates.daysBefore;
    if (updates.targetGroup !== undefined) changes.target_group = updates.targetGroup;
    const { data, error } = await db.from('notification_settings').update(changes).eq('type', body.type).select('*').single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ message: error instanceof AuthError ? error.message : 'Não foi possível gravar a definição.' },
      { status: error instanceof AuthError ? error.statusCode : 500 });
  }
}
