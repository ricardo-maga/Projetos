import { createApiHandler } from '@/lib/apiErrors';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { updateClientSchema } from '@/domains/clients/contracts/client';
import { editClient, getClient, removeClient } from '@/domains/clients/modules/clientService';
import { clientErrorResponse } from '../clientError';
import { badRequest, internalServerError, validationError, serviceUnavailable } from '@/lib/apiErrors';
import { isSafeIdentifier } from '@/lib/security/identifiers';

type Context = { params: Promise<{ id: string }> };

async function handleGet(req: NextRequest, { params }: Context) {
  const auth = await requirePermission(req, 'clients_read');
  if (!auth.success) return auth.response;
  const { id } = await params;
  const { requestId } = auth;
  if (!isSafeIdentifier(id)) return badRequest('ID de cliente inválido.', requestId);
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
    return NextResponse.json({ success: true, data: await getClient(db, id) });
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Falha inesperada ao consultar cliente.');
  }
}

async function handlePatch(req: NextRequest, { params }: Context) {
  return handleUpdate(req, params);
}

async function handlePut(req: NextRequest, { params }: Context) {
  return handleUpdate(req, params);
}

async function handleUpdate(req: NextRequest, params: Context['params']) {
  const auth = await requirePermission(req, 'clients_write');
  if (!auth.success) return auth.response;
  const { id } = await params;
  const { user, requestId } = auth;
  if (!isSafeIdentifier(id)) return badRequest('ID de cliente inválido.', requestId);
  try {
    let body: unknown;
    try { body = await req.json(); }
    catch { return badRequest('Corpo JSON inválido.', requestId); }
    const parsed = updateClientSchema.safeParse(body);
    if (!parsed.success) return validationError('Dados inválidos para atualização do cliente.', requestId, parsed.error.flatten());
    const db = await getServerDbClient(req, auth.user);
    if (!db) return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
    const data = await editClient(db, id, parsed.data, user.id);
    return NextResponse.json({ success: true, message: 'Cliente atualizado com sucesso.', data });
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Falha inesperada ao atualizar cliente.');
  }
}

async function handleDelete(req: NextRequest, { params }: Context) {
  const auth = await requirePermission(req, 'clients_delete');
  if (!auth.success) return auth.response;
  const { id } = await params;
  const { user, requestId } = auth;
  if (!isSafeIdentifier(id)) return badRequest('ID de cliente inválido.', requestId);
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
    const data = await removeClient(db, id, user.id);
    return NextResponse.json({ success: true, message: 'Cliente eliminado com sucesso.', data });
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Falha inesperada ao eliminar cliente.');
  }
}

export const GET = createApiHandler(handleGet);

export const PATCH = createApiHandler(handlePatch);

export const PUT = createApiHandler(handlePut);

export const DELETE = createApiHandler(handleDelete);
