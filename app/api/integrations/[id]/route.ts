import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth/requireAuth';
import { authorizeRbac } from '@/lib/rbac/admin';
import { logAuditEvent } from '@/lib/audit';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await authorizeRbac(req, 'roles.manage');
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
    const { data, error } = await db.from('api_integrations').update({ revoked_at: new Date().toISOString() })
      .eq('id', id).is('revoked_at', null).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Integração não encontrada ou já revogada.' }, { status: 404 });
    await logAuditEvent({ action: 'INTEGRATION_REVOKED', userId: user.id, entity: 'api_integrations', entityId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 503;
    return NextResponse.json({ error: status === 503 ? 'Serviço indisponível.' : (error as Error).message }, { status });
  }
}
