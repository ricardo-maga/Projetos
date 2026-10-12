export const dynamic = 'force-dynamic';

import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

import { NextRequest, NextResponse } from 'next/server';
import { 
  saveActiveStateToSupabase, 
  formatSupabaseError 
} from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Ticket } from '@/lib/types';
import { requirePermission } from '@/lib/auth/authorization';
import { activeRelationExists, getOperationalRecord, mapTicket } from '@/lib/supabase/operationalRecords';
import { withCanonicalErrors } from '@/lib/apiErrors';
import { updateTicketSchema } from '@/lib/validations/operational';

const VALID_STATUSES = ['validacao', 'aberto', 'em_analise', 'convertido', 'resolvido', 'cancelado'];

async function getIdFromParams(input: any): Promise<string> {
  if (!input) return '';
  const resolved = typeof input.then === 'function' ? await input : input;
  if (typeof resolved === 'string') return resolved;
  if (resolved?.params) {
    const paramsResolved = typeof resolved.params.then === 'function' ? await resolved.params : resolved.params;
    return paramsResolved?.id || '';
  }
  return resolved?.id || '';
}

async function getTicket(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'tickets_read');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const databaseClient = requireServerDbClient();
    const ticket = await getOperationalRecord(databaseClient, 'tickets', id, mapTicket);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket não encontrado ou eliminado.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: ticket
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: formatSupabaseError(err) },
      { status: 500 }
    );
  }
}

async function handleUpdate(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'tickets_write');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const parsed = updateTicketSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Dados do ticket inválidos.' }, { status: 400 });
    const updates = parsed.data as Record<string, any>;
    const databaseClient = requireServerDbClient();
    const existingTicket = await getOperationalRecord(databaseClient, 'tickets', id, mapTicket);
    if (!existingTicket) {
      return NextResponse.json({ success: false, message: 'Ticket não encontrado ou eliminado.' }, { status: 404 });
    }

    // Validate title if updated
    if (updates.title !== undefined && (typeof updates.title !== 'string' || !updates.title.trim())) {
      return NextResponse.json({ success: false, message: 'O título do ticket não pode ser vazio.' }, { status: 400 });
    }

    // Validate status if updated
    const validStatuses = [...VALID_STATUSES];
    if (updates.status !== undefined) {
      const { data: ticketStatuses, error: statusesError } = await databaseClient.from('ticket_statuses')
        .select('id,name').eq('deleted', false);
      if (statusesError) throw statusesError;
      for (const ts of ticketStatuses || []) {
        if (ts.id && !validStatuses.includes(ts.id)) validStatuses.push(ts.id);
        if (ts.name && !validStatuses.includes(ts.name)) validStatuses.push(ts.name);
      }
    }

    if (updates.status !== undefined && !validStatuses.includes(updates.status)) {
      return NextResponse.json({
        success: false,
        message: `Estado de ticket inválido. Estados permitidos: ${VALID_STATUSES.join(', ')}.`
      }, { status: 400 });
    }

    // Validate client relation if updated
    if (updates.clientId !== undefined && updates.clientId !== null && updates.clientId !== '') {
      const clientExists = await activeRelationExists(databaseClient, 'clients', updates.clientId);
      if (!clientExists) {
        return NextResponse.json({ success: false, message: 'O cliente especificado não existe ou foi eliminado.' }, { status: 400 });
      }
    }

    // Validate assignee relation if updated
    if (updates.assignedToId !== undefined && updates.assignedToId !== null && updates.assignedToId !== '') {
      const userExists = await activeRelationExists(databaseClient, 'users', updates.assignedToId);
      if (!userExists) {
        return NextResponse.json({ success: false, message: 'O utilizador responsável especificado não existe ou está inativo.' }, { status: 400 });
      }
    }

    // Validate project relation if updated
    const projectUpdateToCheck = updates.convertedProjectId !== undefined ? updates.convertedProjectId : updates.projectId;
    if (projectUpdateToCheck !== undefined && projectUpdateToCheck !== null && projectUpdateToCheck !== '') {
      const projectExists = await activeRelationExists(databaseClient, 'projects', projectUpdateToCheck);
      if (!projectExists) {
        return NextResponse.json({ success: false, message: 'O projeto especificado não existe ou foi eliminado.' }, { status: 400 });
      }
    }

    if (updates.syncVersion !== undefined && updates.syncVersion !== existingTicket.syncVersion) {
      return NextResponse.json({ success: false, message: 'O ticket foi alterado entretanto. Atualize antes de repetir.' }, { status: 409 });
    }
    const updatedTicket: Ticket = {
      ...existingTicket,
      ...(updates.title !== undefined ? { title: updates.title.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.source !== undefined ? { source: updates.source } : {}),
      ...(updates.sourceDetails !== undefined ? { sourceDetails: updates.sourceDetails } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.statusId !== undefined ? { statusId: updates.statusId } : {}),
      ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
      ...(updates.priorityId !== undefined ? { priorityId: updates.priorityId } : {}),
      ...(updates.taskTypeId !== undefined ? { taskTypeId: updates.taskTypeId } : {}),
      ...(updates.category !== undefined ? { category: updates.category } : {}),
      ...(updates.clientId !== undefined ? { clientId: updates.clientId || undefined } : {}),
      ...(updates.requesterName !== undefined ? { requesterName: updates.requesterName } : {}),
      ...(updates.requesterEmail !== undefined ? { requesterEmail: updates.requesterEmail } : {}),
      ...(updates.requesterPhone !== undefined ? { requesterPhone: updates.requesterPhone } : {}),
      ...(updates.assignedToId !== undefined ? { assignedToId: updates.assignedToId || undefined } : {}),
      ...(projectUpdateToCheck !== undefined ? { convertedProjectId: projectUpdateToCheck || undefined } : {}),
      ...(updates.convertedTaskId !== undefined ? { convertedTaskId: updates.convertedTaskId || undefined } : {}),
      ...(updates.resolutionNotes !== undefined ? { resolutionNotes: updates.resolutionNotes } : {}),
      ...(updates.validationNotes !== undefined ? { validationNotes: updates.validationNotes } : {}),
      ...(updates.resolvedDate !== undefined ? { resolvedDate: updates.resolvedDate } : {}),
      // Server-authoritative protected fields (MUST NOT be altered by client payload)
      id: existingTicket.id,
      ticketNumber: existingTicket.ticketNumber,
      createdDate: existingTicket.createdDate,
      createdById: existingTicket.createdById,
      deleted: false,
      updatedDate: new Date().toISOString()
    };

    const saveRes = await saveActiveStateToSupabase({} as any, databaseClient, { tickets: [updatedTicket] });
    if (!saveRes.success) {
      return NextResponse.json(saveRes, { status: saveRes.status || 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Ticket atualizado com sucesso.',
      data: { ...updatedTicket, syncVersion: saveRes.versions?.tickets?.[id] }
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: formatSupabaseError(err) },
      { status: 500 }
    );
  }
}

async function deleteTicket(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'tickets_delete');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const databaseClient = requireServerDbClient();
    const ticket = await getOperationalRecord(databaseClient, 'tickets', id, mapTicket);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket não encontrado ou já eliminado.' }, { status: 404 });
    }

    const deletedTicket: Ticket = {
      ...ticket,
      deleted: true,
      updatedDate: new Date().toISOString()
    };

    const saveRes = await saveActiveStateToSupabase({} as any, databaseClient, { tickets: [deletedTicket] });
    if (!saveRes.success) {
      return NextResponse.json(saveRes, { status: saveRes.status || 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Ticket eliminado com sucesso.'
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: formatSupabaseError(err) },
      { status: 500 }
    );
  }
}

export const GET = withCanonicalErrors(getTicket);
export const PATCH = withCanonicalErrors(handleUpdate);
export const PUT = PATCH;
export const DELETE = withCanonicalErrors(deleteTicket);
