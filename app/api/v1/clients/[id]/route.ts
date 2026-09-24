import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updateClientSchema } from '@/lib/validations/client';
import { notFound, conflict, validationError, internalServerError, badRequest } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'clients_read');
  if (!auth.success) return auth.response;

  const { id } = await params;
  const { requestId } = auth;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const { data: client, error } = await sb
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('deleted', false)
      .maybeSingle();

    if (error) return internalServerError(`Erro ao consultar cliente: ${error.message}`, requestId);
    if (!client) return notFound('Cliente não encontrado.', requestId);

    return NextResponse.json({
      success: true,
      data: {
        id: client.id,
        name: client.name,
        clientName: client.name,
        code: client.code || '',
        contactPerson: client.contact_person || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        city: client.city || '',
        postalCode: client.postal_code || '',
        country: client.country || '',
        notes: client.notes || '',
        color: client.color || '#3b82f6',
        version: client.version || 1,
        deleted: Boolean(client.deleted),
        createdAt: client.created_at,
        updatedAt: client.updated_at,
      },
    });
  } catch (error: any) {
    return internalServerError('Falha inesperada ao consultar cliente.', requestId);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdate(req, params);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdate(req, params);
}

async function handleUpdate(req: NextRequest, paramsPromise: Promise<{ id: string }>) {
  const auth = await requirePermission(req, 'clients_write');
  if (!auth.success) return auth.response;

  const { id } = await paramsPromise;
  const { user, requestId } = auth;

  try {
    const rawBody = await req.json();
    const parseResult = updateClientSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para atualização do cliente.', requestId, parseResult.error.flatten());
    }

    const updates = parseResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const { data: current, error: fetchError } = await sb
      .from('clients')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) return internalServerError(`Erro ao ler versão atual do cliente: ${fetchError.message}`, requestId);
    if (!current || current.deleted) return notFound('Cliente não encontrado.', requestId);

    const hasVersion = typeof current.version === 'number';
    const currentVersion = hasVersion ? current.version : (updates.version || 1);
    if (hasVersion && updates.version !== undefined && updates.version !== currentVersion) {
      return conflict(
        `Conflito de concorrência. O cliente foi alterado por outro utilizador (versão atual: ${currentVersion}, versão submetida: ${updates.version}).`,
        requestId,
        { currentVersion, submittedVersion: updates.version }
      );
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      updated_at: now,
      updated_by: user.id,
    };
    if (hasVersion) {
      updatePayload.version = currentVersion + 1;
    }

    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.code !== undefined) updatePayload.code = updates.code;
    if (updates.contactPerson !== undefined) updatePayload.contact_person = updates.contactPerson;
    if (updates.email !== undefined) updatePayload.email = updates.email;
    if (updates.phone !== undefined) updatePayload.phone = updates.phone;
    if (updates.address !== undefined) updatePayload.address = updates.address;
    if (updates.city !== undefined) updatePayload.city = updates.city;
    if (updates.postalCode !== undefined) updatePayload.postal_code = updates.postalCode;
    if (updates.country !== undefined) updatePayload.country = updates.country;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;
    if (updates.color !== undefined) updatePayload.color = updates.color;

    let updateQuery = sb.from('clients').update(updatePayload).eq('id', id);
    if (hasVersion) {
      updateQuery = updateQuery.eq('version', currentVersion);
    }
    const { error: updateError } = await updateQuery;

    if (updateError) return badRequest(`Erro ao atualizar cliente: ${updateError.message}`, requestId);

    // Re-leitura autoritativa diretamente da base de dados
    const { data: reRead, error: readError } = await sb
      .from('clients')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (readError || !reRead) {
      return internalServerError(`Erro ao ler registo do cliente atualizado: ${readError?.message || 'Registo não encontrado.'}`, requestId);
    }

    const updatedClientData = {
      id: reRead.id,
      name: reRead.name,
      clientName: reRead.name,
      code: reRead.code || '',
      shortName: reRead.code || (reRead.name ? reRead.name.substring(0, 10) : ''),
      contactPerson: reRead.contact_person || '',
      contactEmail: reRead.email || '',
      email: reRead.email || '',
      contactPhone: reRead.phone || '',
      phone: reRead.phone || '',
      location: [reRead.address, reRead.city, reRead.postal_code, reRead.country].filter(Boolean).join(', ') || reRead.address || '',
      address: reRead.address || '',
      city: reRead.city || '',
      postalCode: reRead.postal_code || '',
      country: reRead.country || '',
      taxId: reRead.tax_id || reRead.taxId || '',
      notes: reRead.notes || '',
      color: reRead.color || '#3b82f6',
      version: reRead.version ?? (currentVersion + 1),
      deleted: Boolean(reRead.deleted),
      createdAt: reRead.created_at,
      createdDate: reRead.created_at,
      updatedAt: reRead.updated_at,
    };

    await logAuditEvent({
      action: 'CLIENT_UPDATED',
      userId: user.id,
      entity: 'clients',
      entityId: id,
      details: { version: updatedClientData.version },
    });

    return NextResponse.json({
      success: true,
      message: 'Cliente atualizado com sucesso.',
      data: updatedClientData,
    });
  } catch (error: any) {
    return internalServerError('Falha inesperada ao atualizar cliente.', requestId);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'clients_delete');
  if (!auth.success) return auth.response;

  const { id } = await params;
  const { user, requestId } = auth;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const { data: current } = await sb.from('clients').select('*').eq('id', id).maybeSingle();
    if (!current || current.deleted) return notFound('Cliente não encontrado.', requestId);

    const hasVersion = typeof current.version === 'number';
    const currentVersion = hasVersion ? current.version : 1;
    const now = new Date().toISOString();

    const deletePayload: Record<string, any> = {
      deleted: true,
      updated_at: now,
    };
    if (hasVersion) {
      deletePayload.version = currentVersion + 1;
      deletePayload.updated_by = user.id;
    }

    let { error: deleteError } = await sb
      .from('clients')
      .update(deletePayload)
      .eq('id', id);

    if (deleteError && (deleteError.code === '42703' || deleteError.message?.includes('column'))) {
      const fallbackRes = await sb.from('clients').update({ deleted: true }).eq('id', id);
      deleteError = fallbackRes.error;
    }

    if (deleteError) return badRequest(`Erro ao eliminar cliente: ${deleteError.message}`, requestId);

    await logAuditEvent({
      action: 'CLIENT_DELETED',
      userId: user.id,
      entity: 'clients',
      entityId: id,
      details: { deleted: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Cliente eliminado com sucesso.',
    });
  } catch (error: any) {
    return internalServerError('Falha inesperada ao eliminar cliente.', requestId);
  }
}

