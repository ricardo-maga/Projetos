export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { createClientSchema, queryClientSchema } from '@/domains/clients/contracts/client';
import { createClient, listClients } from '@/domains/clients/modules/clientService';
import { clientErrorResponse } from './clientError';
import { badRequest, internalServerError, validationError } from '@/lib/apiErrors';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'clients_read');
  if (!auth.success) return auth.response;
  const { requestId } = auth;
  const parsed = queryClientSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) return validationError('Parâmetros de consulta inválidos.', requestId, parsed.error.flatten());
  try {
    const db = (await getServerDbClient(req, auth.user)) || defaultSupabase;
    if (!db) return internalServerError('Base de dados Supabase não disponível.', requestId);
    return NextResponse.json(await listClients(db, parsed.data));
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Falha inesperada ao consultar clientes.');
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'clients_write');
  if (!auth.success) return auth.response;
  const { user, requestId } = auth;
  try {
    let body: unknown;
    try { body = await req.json(); }
    catch { return badRequest('Corpo JSON inválido.', requestId); }
    const parsed = createClientSchema.safeParse(body);
    if (!parsed.success) return validationError('Dados inválidos para criação do cliente.', requestId, parsed.error.flatten());
    const db = (await getServerDbClient(req, auth.user)) || defaultSupabase;
    if (!db) return internalServerError('Base de dados Supabase não disponível.', requestId);
    const data = await createClient(db, parsed.data, user.id);
    return NextResponse.json({ success: true, message: 'Cliente criado com sucesso.', data }, { status: 201 });
  } catch (error) {
    return clientErrorResponse(error, requestId, 'Erro inesperado na criação do cliente.');
  }
}
