import { NextRequest, NextResponse } from 'next/server';
import { 
  getActiveStateFromSupabase, 
  saveActiveStateToSupabase, 
  formatSupabaseError 
} from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Ticket } from '@/lib/types';
import { requirePermission } from '@/lib/auth/authorization';

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

export async function GET(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'tickets_read');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const ticket = (result.data.tickets || []).find((t: Ticket) => t.id === id && !t.deleted);
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

export async function PATCH(req: NextRequest, ctx: any) {
  return handleUpdate(req, ctx);
}

export async function PUT(req: NextRequest, ctx: any) {
  return handleUpdate(req, ctx);
}

async function handleUpdate(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'tickets_write');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const updates = await req.json();
    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const state = result.data;
    if (!state.tickets) state.tickets = [];
    const tickets: Ticket[] = state.tickets;
    const index = tickets.findIndex((t: Ticket) => t.id === id && !t.deleted);

    if (index === -1) {
      return NextResponse.json({ success: false, message: 'Ticket não encontrado ou eliminado.' }, { status: 404 });
    }

    // Validate title if updated
    if (updates.title !== undefined && (typeof updates.title !== 'string' || !updates.title.trim())) {
      return NextResponse.json({ success: false, message: 'O título do ticket não pode ser vazio.' }, { status: 400 });
    }

    // Validate status if updated
    const validStatuses = [...VALID_STATUSES];
    if (Array.isArray(state.ticketStatuses)) {
      state.ticketStatuses.forEach((ts: any) => {
        if (ts && !ts.deleted) {
          if (ts.id && !validStatuses.includes(ts.id)) validStatuses.push(ts.id);
          if (ts.name && !validStatuses.includes(ts.name)) validStatuses.push(ts.name);
        }
      });
    }

    if (updates.status !== undefined && !validStatuses.includes(updates.status)) {
      return NextResponse.json({
        success: false,
        message: `Estado de ticket inválido. Estados permitidos: ${VALID_STATUSES.join(', ')}.`
      }, { status: 400 });
    }

    // Validate client relation if updated
    if (updates.clientId !== undefined && updates.clientId !== null && updates.clientId !== '') {
      const clientExists = Array.isArray(state.clients) && state.clients.some((c: any) => c.id === updates.clientId && !c.deleted);
      if (!clientExists) {
        return NextResponse.json({ success: false, message: 'O cliente especificado não existe ou foi eliminado.' }, { status: 400 });
      }
    }

    // Validate assignee relation if updated
    if (updates.assignedToId !== undefined && updates.assignedToId !== null && updates.assignedToId !== '') {
      const userExists = Array.isArray(state.users) && state.users.some((u: any) => u.id === updates.assignedToId && !u.deleted && u.approved !== false);
      if (!userExists) {
        return NextResponse.json({ success: false, message: 'O utilizador responsável especificado não existe ou está inativo.' }, { status: 400 });
      }
    }

    // Validate project relation if updated
    const projectUpdateToCheck = updates.convertedProjectId !== undefined ? updates.convertedProjectId : updates.projectId;
    if (projectUpdateToCheck !== undefined && projectUpdateToCheck !== null && projectUpdateToCheck !== '') {
      const projectExists = Array.isArray(state.projects) && state.projects.some((p: any) => p.id === projectUpdateToCheck && !p.deleted);
      if (!projectExists) {
        return NextResponse.json({ success: false, message: 'O projeto especificado não existe ou foi eliminado.' }, { status: 400 });
      }
    }

    const existingTicket = tickets[index];
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

    state.tickets[index] = updatedTicket;

    const saveRes = await saveActiveStateToSupabase(state);
    if (!saveRes.success) {
      return NextResponse.json(saveRes, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Ticket atualizado com sucesso.',
      data: state.tickets[index]
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: formatSupabaseError(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'tickets_delete');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const state = result.data;
    if (!state.tickets) state.tickets = [];
    const tickets: Ticket[] = state.tickets;
    const index = tickets.findIndex((t: Ticket) => t.id === id && !t.deleted);

    if (index === -1) {
      return NextResponse.json({ success: false, message: 'Ticket não encontrado ou já eliminado.' }, { status: 404 });
    }

    state.tickets[index] = {
      ...tickets[index],
      deleted: true,
      updatedDate: new Date().toISOString()
    };

    const saveRes = await saveActiveStateToSupabase(state);
    if (!saveRes.success) {
      return NextResponse.json(saveRes, { status: 500 });
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
