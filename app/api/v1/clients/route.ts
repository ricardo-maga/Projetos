import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createClientSchema, queryClientSchema } from '@/lib/validations/client';
import { validationError, badRequest, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'clients_read');
  if (!auth.success) return auth.response;

  const { requestId } = auth;
  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  const parseResult = queryClientSchema.safeParse(rawParams);
  if (!parseResult.success) {
    return validationError('Parâmetros de consulta inválidos.', requestId, parseResult.error.flatten());
  }

  const { page, pageSize, search } = parseResult.data;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    let query = sb
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('deleted', false);

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(`client_name.ilike.${q},short_name.ilike.${q},contact_person.ilike.${q},contact_email.ilike.${q},contact_phone.ilike.${q},tax_id.ilike.${q},location.ilike.${q}`);
    }

    const { data: rows, count, error } = await query
      .order('client_name', { ascending: true })
      .range(from, to);

    if (error) return internalServerError(`Erro ao consultar clientes: ${error.message}`, requestId);

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);

    const mappedClients = (rows || []).map((row: any) => ({
      id: row.id,
      clientName: row.client_name || '',
      shortName: row.short_name || '',
      location: row.location || '',
      taxId: row.tax_id || '',
      contactPerson: row.contact_person || '',
      contactEmail: row.contact_email || '',
      contactPhone: row.contact_phone || '',
      notes: row.notes || '',
      color: row.color || '#3b82f6',
      version: row.version || 1,
      deleted: Boolean(row.deleted),
      createdAt: row.created_at,
      createdDate: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({
      success: true,
      count: mappedClients.length,
      total,
      page,
      pageSize,
      totalPages,
      data: mappedClients,
    });
  } catch (error: any) {
    return internalServerError('Falha inesperada ao consultar clientes.', requestId);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'clients_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;

  try {
    const rawBody = await req.json();
    const parseResult = createClientSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para criação do cliente.', requestId, parseResult.error.flatten());
    }

    const c = parseResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const newId = c.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const insertPayload: Record<string, any> = {
      id: newId,
      client_name: c.clientName,
      short_name: c.shortName || null,
      location: c.location || null,
      tax_id: c.taxId || null,
      contact_person: c.contactPerson || null,
      contact_email: c.contactEmail || null,
      contact_phone: c.contactPhone || null,
      notes: c.notes || null,
      color: c.color || '#3b82f6',
      deleted: false,
      version: 1,
      created_by: user.id,
      updated_by: user.id,
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await sb.from('clients').insert([insertPayload]);

    if (insertError) {
      return badRequest(`Erro ao inserir cliente: ${insertError.message}`, requestId);
    }

    // Re-leitura autoritativa diretamente da base de dados após INSERT
    const { data: createdRow, error: readError } = await sb
      .from('clients')
      .select('*')
      .eq('id', newId)
      .maybeSingle();

    if (readError || !createdRow) {
      return internalServerError(`Erro ao ler registo persistido do cliente criado: ${readError?.message || 'Registo não encontrado.'}`, requestId);
    }

    await logAuditEvent({
      action: 'CLIENT_CREATED',
      userId: user.id,
      entity: 'clients',
      entityId: newId,
      details: { clientName: createdRow.client_name },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Cliente criado com sucesso.',
        data: {
          id: createdRow.id,
          clientName: createdRow.client_name || '',
          shortName: createdRow.short_name || '',
          location: createdRow.location || '',
          taxId: createdRow.tax_id || '',
          contactPerson: createdRow.contact_person || '',
          contactEmail: createdRow.contact_email || '',
          contactPhone: createdRow.contact_phone || '',
          notes: createdRow.notes || '',
          color: createdRow.color || '#3b82f6',
          version: createdRow.version || 1,
          deleted: Boolean(createdRow.deleted),
          createdAt: createdRow.created_at,
          createdDate: createdRow.created_at,
          updatedAt: createdRow.updated_at,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return internalServerError('Erro inesperado na criação do cliente.', requestId);
  }
}
