import { NextRequest, NextResponse } from 'next/server';
import { AuthError, ForbiddenError, requireAuth } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

export async function authorizeRbac(req: NextRequest, permission: 'roles.read' | 'roles.manage') {
  const user = await requireAuth(req);
  const db = requireServerDbClient();
  const { data, error } = await db.rpc('has_permission', {
    p_permission_code: permission,
    p_user_id: user.id,
  });
  if (error) throw new AuthError('Não foi possível validar as permissões.', 503);
  if (data !== true) throw new ForbiddenError('Apenas utilizadores autorizados podem gerir funções.');
  return { user, db };
}

export async function auditRbac(
  db: ReturnType<typeof requireServerDbClient>,
  req: NextRequest,
  user: { id: string; name: string; email: string },
  entityName: string,
  entityId: string,
  changes: unknown,
  entityType: 'SYSTEM' | 'USER' = 'SYSTEM',
) {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip');
  const { error } = await db.from('audit_logs').insert({
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    action: 'SETTINGS',
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    details: JSON.stringify(changes),
    ip,
    user_agent: req.headers.get('user-agent'),
    request_id: req.headers.get('x-request-id'),
  });
  if (error) throw new AuthError('A alteração foi feita, mas não foi possível registar a auditoria.', 500);
}

export function rbacError(error: unknown) {
  const status = error instanceof AuthError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Erro inesperado.';
  return NextResponse.json({ success: false, message }, { status });
}

export function databaseError(error: { code?: string; message?: string }) {
  const status = error.code === '42501' ? 403
    : error.code === 'P0002' ? 404
      : error.code === '23514' ? 409
        : error.code === '22023' ? 400 : 500;
  return NextResponse.json({ success: false, message: error.message || 'Falha na operação RBAC.' }, { status });
}
