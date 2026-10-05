import { NextRequest, NextResponse } from 'next/server';
import { AuthError, ForbiddenError, requireAuth } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  return NextResponse.json({ success: false, message: error instanceof AuthError ? error.message : 'Erro no serviço de auditoria.' },
    { status: error instanceof AuthError ? error.statusCode : 500 });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const client = requireServerDbClient();
    const { data: permitted, error: permissionError } = await client.rpc('has_permission', {
      p_permission_code: 'admin:access', p_user_id: user.id,
    });
    if (permissionError) throw new AuthError('Serviço de autorização indisponível.', 503);
    if (permitted !== true) throw new ForbiddenError();
    const requested = Number(req.nextUrl.searchParams.get('limit') || 100);
    const limit = Number.isFinite(requested) ? Math.min(200, Math.max(1, Math.floor(requested))) : 100;
    const { data, error } = await client.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return NextResponse.json({ success: true, data: (data || []).map(item => ({
      id: item.id, timestamp: item.created_at, createdDate: item.created_at,
      userId: item.user_id, userName: item.user_name, userEmail: item.user_email,
      action: item.action, entityType: item.entity_type, entityId: item.entity_id,
      entityName: item.entity_name, details: item.details,
    })) });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!checkRateLimit(`audit-client:${user.id}`, { limit: 30, windowSeconds: 60 }).success)
      return NextResponse.json({ success: false, message: 'Demasiados pedidos.' }, { status: 429 });
    if (Number(req.headers.get('content-length') || 0) > 4096)
      return NextResponse.json({ success: false, message: 'Pedido demasiado grande.' }, { status: 413 });
    const body = await req.json();
    const allowed = ['CREATE','UPDATE','DELETE','LOGIN','LOGOUT','RESTORE','EXPORT','SETTINGS'];
    if (!body || !allowed.includes(body.action))
      return NextResponse.json({ success: false, message: 'Evento inválido.' }, { status: 400 });
    // Client reports are explicitly non-authoritative. Ignore caller identity,
    // timestamps, arbitrary details and entity identifiers (including secrets).
    const { error } = await requireServerDbClient().from('audit_logs').insert({
      user_id: user.id, user_name: user.name, user_email: user.email,
      action: 'CLIENT_EVENT', entity_type: 'SYSTEM', entity_name: body.action,
      details: 'Evento comunicado pelo cliente; não comprova uma operação na base de dados.',
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
