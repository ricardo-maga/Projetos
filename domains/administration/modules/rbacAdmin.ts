import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requirePermission } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { clientIp } from '@/lib/security/clientIp';

export async function authorizeRbac(req: NextRequest, permission: 'roles.read' | 'roles.manage') {
  const user = await requirePermission(req, permission);
  const db = requireServerDbClient(user);
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
  const ip = clientIp(req);
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
  const message = error instanceof AuthError ? error.message : 'Falha na operação RBAC.';
  return NextResponse.json({ success: false, message }, { status });
}

export function databaseError(error: { code?: string; message?: string }) {
  const status = error.code === '42501' ? 403
    : error.code === 'P0002' ? 404
      : error.code === '23514' ? 409
        : error.code === '22023' ? 400 : 500;
  console.warn('[RBAC DATABASE]', error.code);
  const message = ({
    403: 'Sem permissão para realizar esta operação.',
    404: 'Registo não encontrado.',
    409: 'A operação entra em conflito com a configuração de funções.',
    400: 'Dados inválidos para a operação.',
  } as Record<number, string>)[status] || 'Falha na operação RBAC.';
  return NextResponse.json({ success: false, message }, { status });
}
