export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { updateClientSchema } from '@/domains/clients/contracts/client';
import { editClient, getClient, removeClient } from '@/domains/clients/modules/clientService';
import { clientErrorResponse } from '../clientError';
import { badRequest, internalServerError, validationError } from '@/lib/apiErrors';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  const auth = await requirePermission(req, 'clients_read');
  if (!auth.success) return auth.response;
  const { id } = await params;
  const { requestId } = auth;
  try {
    const db = (await getServerDbClient(req, auth.user)) || defaultSupabase;
    if (!db) return internalServerError('Base de dados Supabase não disponível.', requestId);
    return NextResponse.json({ success: true, data: await getClient(db, id) });
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Falha inesperada ao consultar cliente.');
  }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  return handleUpdate(req, params);
}

export async function PUT(req: NextRequest, { params }: Context) {
  return handleUpdate(req, params);
}

async function handleUpdate(req: NextRequest, params: Context['params']) {
  const auth = await requirePermission(req, 'clients_write');
  if (!auth.success) return auth.response;
  const { id } = await params;
  const { user, requestId } = auth;
  try {
    let body: unknown;
    try { body = await req.json(); }
    catch { return badRequest('Corpo JSON inválido.', requestId); }
    const parsed = updateClientSchema.safeParse(body);
    if (!parsed.success) return validationError('Dados inválidos para atualização do cliente.', requestId, parsed.error.flatten());
    const db = (await getServerDbClient(req, auth.user)) || defaultSupabase;
    if (!db) return internalServerError('Base de dados Supabase não disponível.', requestId);
    const data = await editClient(db, id, parsed.data, user.id);
    return NextResponse.json({ success: true, message: 'Cliente atualizado com sucesso.', data });
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Falha inesperada ao atualizar cliente.');
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const auth = await requirePermission(req, 'clients_delete');
  if (!auth.success) return auth.response;
  const { id } = await params;
  const { user, requestId } = auth;
  try {
    const db = (await getServerDbClient(req, auth.user)) || defaultSupabase;
    if (!db) return internalServerError('Base de dados Supabase não disponível.', requestId);
    await removeClient(db, id, user.id);
    return NextResponse.json({ success: true, message: 'Cliente eliminado com sucesso.' });
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Falha inesperada ao eliminar cliente.');
  }
}
