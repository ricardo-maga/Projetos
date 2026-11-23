import { createApiHandler } from '@/lib/apiErrors';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { createClientSchema, queryClientSchema } from '@/domains/clients/contracts/client';
import { createClient, listClients } from '@/domains/clients/modules/clientService';
import { getIdempotentEntityId, withUserIdempotency } from '@/lib/apiIdempotency';
import { clientErrorResponse } from './clientError';
import { badRequest, internalServerError, validationError, serviceUnavailable } from '@/lib/apiErrors';

async function handleGet(req: NextRequest) {
  const auth = await requirePermission(req, 'clients_read');
  if (!auth.success) return auth.response;
  const { requestId } = auth;
  const parsed = queryClientSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) return validationError('Parâmetros de consulta inválidos.', requestId, parsed.error.flatten());
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
    return NextResponse.json(await listClients(db, parsed.data));
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Falha inesperada ao consultar clientes.');
  }
}

async function createClientHandler(req: NextRequest) {
  const auth = await requirePermission(req, 'clients_write');
  if (!auth.success) return auth.response;
  const { user, requestId } = auth;
  try {
    let body: unknown;
    try { body = await req.json(); }
    catch { return badRequest('Corpo JSON inválido.', requestId); }
    const parsed = createClientSchema.safeParse(body);
    if (!parsed.success) return validationError('Dados inválidos para criação do cliente.', requestId, parsed.error.flatten());
    const db = await getServerDbClient(req, auth.user);
    if (!db) return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
    const data = await createClient(db, { ...parsed.data, id: getIdempotentEntityId(req) || parsed.data.id }, user.id);
    return NextResponse.json({ success: true, message: 'Cliente criado com sucesso.', data }, { status: 201 });
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Erro inesperado na criação do cliente.');
  }
}

export const POST = withUserIdempotency(createClientHandler, 'clients:create', 'clients_write');

export const GET = createApiHandler(handleGet);
