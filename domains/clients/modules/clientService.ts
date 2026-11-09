import type { z } from 'zod';
import { createClientSchema, queryClientSchema, updateClientSchema } from '../contracts/client';
import { mapClientRow } from '../data/clientMapper';
import {
  findActiveProjects, findClient, findClients, insertClient, updateClientRow,
  type ClientDatabase,
} from '../data/clientRepository';
import { logAuditEvent } from '@/lib/audit';

export class ClientFailure extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 500,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) { super(message); }
}

export async function listClients(db: ClientDatabase, query: z.infer<typeof queryClientSchema>) {
  const { page, pageSize, search } = query;
  const { data, count, error } = await findClients(db, page, pageSize, search);
  if (error) {
    console.error('[API CLIENTS GET]', error);
    throw new ClientFailure(500, 'Erro ao consultar clientes.');
  }
  const clients = (data || []).map(mapClientRow);
  const total = count || 0;
  return { success: true as const, count: clients.length, total, page, pageSize,
    totalPages: Math.ceil(total / pageSize), data: clients };
}

export async function getClient(db: ClientDatabase, id: string) {
  const { data, error } = await findClient(db, id, true);
  if (error) {
    console.error('[API CLIENT GET]', error);
    throw new ClientFailure(500, 'Erro ao consultar cliente.');
  }
  if (!data) throw new ClientFailure(404, 'Cliente não encontrado.');
  return mapClientRow(data);
}

export async function createClient(db: ClientDatabase, input: z.infer<typeof createClientSchema>, userId: string) {
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id,
    client_name: input.clientName,
    short_name: input.shortName || null,
    location: input.location || null,
    tax_id: input.taxId || null,
    contact_person: input.contactPerson || null,
    contact_email: input.contactEmail || null,
    contact_phone: input.contactPhone || null,
    notes: input.notes || null,
    color: input.color || '#3b82f6',
    deleted: false,
    version: 1,
    created_by: userId,
    updated_by: userId,
    created_at: now,
    updated_at: now,
  };
  const { error: insertError } = await insertClient(db, payload);
  if (insertError) throw new ClientFailure(400, `Erro ao inserir cliente: ${insertError.message}`);

  // Authoritative read after insertion, matching the existing API contract.
  const { data, error } = await findClient(db, id);
  if (error || !data) {
    console.error('[API CLIENT READ AFTER CREATE]', error);
    throw new ClientFailure(500, 'Erro ao ler o cliente criado.');
  }
  await logAuditEvent({ action: 'CLIENT_CREATED', userId, entity: 'clients', entityId: id,
    details: { clientName: data.client_name } });
  return mapClientRow(data);
}

export async function editClient(db: ClientDatabase, id: string, updates: z.infer<typeof updateClientSchema>, userId: string) {
  const { data: current, error: fetchError } = await findClient(db, id);
  if (fetchError) {
    console.error('[API CLIENT UPDATE READ]', fetchError);
    throw new ClientFailure(500, 'Erro ao ler versão atual do cliente.');
  }
  if (!current || current.deleted) throw new ClientFailure(404, 'Cliente não encontrado.');

  const hasVersion = typeof current.version === 'number';
  const currentVersion = hasVersion ? current.version! : (updates.version || 1);
  if (hasVersion && updates.version !== undefined && updates.version !== currentVersion) {
    throw new ClientFailure(409,
      `Conflito de concorrência. O cliente foi alterado por outro utilizador (versão atual: ${currentVersion}, versão submetida: ${updates.version}).`,
      { currentVersion, submittedVersion: updates.version });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId };
  if (hasVersion) payload.version = currentVersion + 1;
  if (updates.clientName !== undefined) payload.client_name = updates.clientName.trim();
  if (updates.shortName !== undefined) payload.short_name = updates.shortName.trim();
  if (updates.location !== undefined) payload.location = updates.location.trim();
  if (updates.taxId !== undefined) payload.tax_id = updates.taxId.trim();
  if (updates.contactPerson !== undefined) payload.contact_person = updates.contactPerson.trim();
  if (updates.contactEmail !== undefined) payload.contact_email = updates.contactEmail.trim();
  if (updates.contactPhone !== undefined) payload.contact_phone = updates.contactPhone.trim();
  if (updates.notes !== undefined) payload.notes = updates.notes.trim();
  if (updates.color !== undefined) payload.color = updates.color;

  const { error: updateError } = await updateClientRow(db, id, payload, hasVersion ? currentVersion : undefined);
  if (updateError) throw new ClientFailure(400, `Erro ao atualizar cliente: ${updateError.message}`);
  const { data: reRead, error: readError } = await findClient(db, id);
  if (readError || !reRead) {
    console.error('[API CLIENT READ AFTER UPDATE]', readError);
    throw new ClientFailure(500, 'Erro ao ler cliente atualizado.');
  }
  const updated = mapClientRow(reRead, currentVersion + 1);
  await logAuditEvent({ action: 'CLIENT_UPDATED', userId, entity: 'clients', entityId: id,
    details: { version: updated.version } });
  return updated;
}

export async function removeClient(db: ClientDatabase, id: string, userId: string) {
  const { data: current, error: fetchError } = await findClient(db, id);
  if (fetchError) {
    console.error('[API CLIENT DELETE READ]', fetchError);
    throw new ClientFailure(500, 'Erro ao ler cliente.');
  }
  if (!current || current.deleted) throw new ClientFailure(404, 'Cliente não encontrado.');

  const { data: projects, error: projectsError } = await findActiveProjects(db, id);
  if (projectsError) {
    console.error('[API CLIENT PROJECT CHECK]', projectsError);
    throw new ClientFailure(500, 'Erro ao verificar projetos associados ao cliente.');
  }
  if (projects && projects.length > 0) {
    throw new ClientFailure(409,
      `Não é possível eliminar o cliente "${current.client_name || id}" porque existem ${projects.length} projeto(s) ativo(s) associado(s). Conclua ou desassocie primeiro os projetos.`,
      { activeProjectsCount: projects.length });
  }

  const hasVersion = typeof current.version === 'number';
  const payload: Record<string, unknown> = { deleted: true, updated_at: new Date().toISOString() };
  if (hasVersion) {
    payload.version = current.version! + 1;
    payload.updated_by = userId;
  }
  let { error: deleteError } = await updateClientRow(db, id, payload);
  if (deleteError && ((deleteError as any).code === '42703' || deleteError.message?.includes('column'))) {
    const fallback = await updateClientRow(db, id, { deleted: true });
    deleteError = fallback.error;
  }
  if (deleteError) throw new ClientFailure(400, `Erro ao eliminar cliente: ${deleteError.message}`);
  await logAuditEvent({ action: 'CLIENT_DELETED', userId, entity: 'clients', entityId: id,
    details: { deleted: true } });
}
