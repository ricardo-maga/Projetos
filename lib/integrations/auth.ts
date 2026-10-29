import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireIntegrationKeyLookupClient, requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { checkRateLimit } from '@/lib/rateLimit';

export type Integration = {
  id: string;
  permissions: string[];
  client_ids: string[];
  project_ids: string[];
  rate_limit_per_minute: number;
};

export async function authenticateIntegration(req: NextRequest, permission: 'projects:read' | 'tasks:read'):
  Promise<{ integration: Integration; db: ReturnType<typeof requireServerDbClient> } | { response: NextResponse }> {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const header = req.headers.get('authorization');
  const key = header?.match(/^Bearer (erp_int_[A-Za-z0-9_-]{32,})$/)?.[1];
  if (!key) return { response: NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Credencial de integração inválida.', requestId } }, { status: 401 }) };

  try {
    const db = requireIntegrationKeyLookupClient();
    const hash = createHash('sha256').update(key).digest('hex');
    const { data, error } = await db.from('api_integrations')
      .select('id,permissions,client_ids,project_ids,rate_limit_per_minute,expires_at,revoked_at')
      .eq('key_hash', hash).maybeSingle();
    if (error) throw error;
    if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now())
      return { response: NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Credencial de integração inválida ou expirada.', requestId } }, { status: 401 }) };
    if (!data.permissions.includes(permission))
      return { response: NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Permissão insuficiente.', requestId } }, { status: 403 }) };
    const quota = await checkRateLimit(`integration:${data.id}`, { limit: data.rate_limit_per_minute, windowSeconds: 60 });
    if (!quota.success) return { response: NextResponse.json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Limite de pedidos excedido.', requestId } },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((quota.resetTime - Date.now()) / 1000))) } }) };
    await db.from('api_integrations').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
    return { integration: data as Integration, db };
  } catch {
    return { response: NextResponse.json({ error: { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Serviço de integração indisponível.', requestId } }, { status: 503 }) };
  }
}
