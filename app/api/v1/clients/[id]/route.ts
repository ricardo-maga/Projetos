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
        clientName: client.client_name || '',
        shortName: client.short_name || '',
        location: client.location || '',
        taxId: client.tax_id || '',
        contactPerson: client.contact_person || '',
        contactEmail: client.contact_email || '',
        contactPhone: client.contact_phone || '',
        notes: client.notes || '',
        color: client.color || '#3b82f6',
        version: client.version || 1,
        deleted: Boolean(client.deleted),
        createdAt: client.created_at,
        createdDate: client.created_at,
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

    if (updates.clientName !== undefined) updatePayload.client_name = updates.clientName.trim();
    if (updates.shortName !== undefined) updatePayload.short_name = updates.shortName.trim();
    if (updates.location !== undefined) updatePayload.location = updates.location.trim();
    if (updates.taxId !== undefined) updatePayload.tax_id = updates.taxId.trim();
    if (updates.contactPerson !== undefined) updatePayload.contact_person = updates.contactPerson.trim();
    if (updates.contactEmail !== undefined) updatePayload.contact_email = updates.contactEmail.trim();
    if (updates.contactPhone !== undefined) updatePayload.contact_phone = updates.contactPhone.trim();
    if (updates.notes !== undefined) updatePayload.notes = updates.notes.trim();
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
      clientName: reRead.client_name || '',
      shortName: reRead.short_name || '',
      location: reRead.location || '',
      taxId: reRead.tax_id || '',
      contactPerson: reRead.contact_person || '',
      contactEmail: reRead.contact_email || '',
      contactPhone: reRead.contact_phone || '',
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

    const { data: current, error: fetchErr } = await sb.from('clients').select('*').eq('id', id).maybeSingle();
    if (fetchErr) return internalServerError(`Erro ao ler cliente: ${fetchErr.message}`, requestId);
    if (!current || current.deleted) return notFound('Cliente não encontrado.', requestId);

    // Check for active projects associated with this client
    const { data: activeProjects, error: projErr } = await sb
      .from('projects')
      .select('id, project_title, deleted')
      .eq('client_id', id)
      .eq('deleted', false);

    if (projErr) {
      return internalServerError(`Erro ao verificar projetos associados ao cliente: ${projErr.message}`, requestId);
    }

    if (activeProjects && activeProjects.length > 0) {
      return conflict(
        `Não é possível eliminar o cliente "${current.client_name || id}" porque existem ${activeProjects.length} projeto(s) ativo(s) associado(s). Conclua ou desassocie primeiro os projetos.`,
        requestId,
        { activeProjectsCount: activeProjects.length }
      );
    }

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

