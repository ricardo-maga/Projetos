import { createHash, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { requirePermission } from '@/lib/auth/authorization';
import type { GroupPermissions } from '@/lib/permissions';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const asUuid = (hash: string) => `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

type Handler = (req: NextRequest) => Promise<NextResponse>;
const claimedEntityIds = new WeakMap<NextRequest, string>();
export const getIdempotentEntityId = (req: NextRequest) => claimedEntityIds.get(req);

export async function runIdempotent(req: NextRequest, principal: string, operation: string, handler: Handler): Promise<NextResponse> {
  const key = req.headers.get('idempotency-key');
  if (key === null) return handler(req);
  const requestId = req.headers.get('x-request-id') || randomUUID();
  if (!/^[\x21-\x7e]{8,128}$/.test(key))
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Idempotency-Key inválida.', requestId } }, { status: 422 });

  const raw = await req.clone().text();
  if (raw.length > 1_000_000)
    return NextResponse.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Pedido demasiado grande.', requestId } }, { status: 413 });
  const keyHash = digest(`${principal}\n${operation}\n${key}`);
  const requestHash = digest(raw);
  const entityId = asUuid(keyHash);
  const claimToken = randomUUID();
  try {
    const db = requireServerDbClient({ id: principal });
    const { error: insertError } = await db.from('api_idempotency').insert({
      key_hash: keyHash, request_hash: requestHash, entity_id: entityId, claim_token: claimToken,
    });
    if (insertError && insertError.code !== '23505') throw insertError;
    if (insertError) {
      const { data: existing, error } = await db.from('api_idempotency').select('*').eq('key_hash', keyHash).single();
      if (error || !existing) throw error || new Error('Claim missing');
      if (existing.request_hash !== requestHash)
        return NextResponse.json({ error: { code: 'CONFLICT', message: 'A chave já foi usada com outro pedido.', requestId } }, { status: 409 });
      if (existing.completed_at)
        return NextResponse.json(existing.response_body, { status: existing.response_status,
          headers: { 'Idempotency-Replayed': 'true', 'Cache-Control': 'no-store' } });
      const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: taken, error: takeError } = await db.from('api_idempotency')
        .update({ claim_token: claimToken, claimed_at: new Date().toISOString() })
        .eq('key_hash', keyHash).eq('claim_token', existing.claim_token).lt('claimed_at', cutoff)
        .is('completed_at', null).select('key_hash').maybeSingle();
      if (takeError) throw takeError;
      if (!taken)
        return NextResponse.json({ error: { code: 'CONFLICT', message: 'Pedido idempotente ainda em execução.', requestId } },
          { status: 409, headers: { 'Retry-After': '5' } });
    }

    // A previous worker may have persisted the entity but failed before storing the response.
    const table = operation === 'projects:create' ? 'projects'
      : operation === 'mechanical_design:create' ? 'work_requests' : 'tasks';
    const { data: persisted, error: persistedError } = await db.from(table).select('id').eq('id', entityId).maybeSingle();
    if (persistedError) throw persistedError;
    if (persisted)
      return NextResponse.json({ error: { code: 'CONFLICT', message: 'O registo foi criado; consulte-o pelo ID indicado.', requestId, entityId } }, { status: 409 });

    const request = new NextRequest(req.url, { method: req.method, headers: req.headers, body: raw });
    claimedEntityIds.set(request, entityId);
    const response = await handler(request);
    if (response.status >= 200 && response.status < 300) {
      const body = await response.clone().json();
      const { error } = await db.from('api_idempotency').update({ response_status: response.status, response_body: body,
        completed_at: new Date().toISOString() }).eq('key_hash', keyHash).eq('claim_token', claimToken);
      if (error) throw error;
    } else {
      await db.from('api_idempotency').delete().eq('key_hash', keyHash).eq('claim_token', claimToken);
    }
    return response;
  } catch (error) {
    console.error('[API IDEMPOTENCY]', error);
    return NextResponse.json({ error: { code: 'IDEMPOTENCY_UNAVAILABLE', message: 'Não foi possível garantir a idempotência do pedido.', requestId } }, { status: 503 });
  }
}

export function withUserIdempotency(handler: Handler, operation: string, permission: keyof GroupPermissions): Handler {
  return async (req) => {
    if (!req.headers.has('idempotency-key')) return handler(req);
    const auth = await requirePermission(req, permission);
    if (!auth.success) return auth.response;
    return runIdempotent(req, auth.user.id, operation, handler);
  };
}
