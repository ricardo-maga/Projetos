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
    if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status)) {
      return NextResponse.json({
        success: false,
        message: `Estado de ticket inválido. Estados permitidos: ${VALID_STATUSES.join(', ')}.`
      }, { status: 400 });
    }

    // Validate relations if updated
    if (updates.clientId && state.clients && Array.isArray(state.clients)) {
      const clientExists = state.clients.some((c: any) => c.id === updates.clientId && !c.deleted);
      if (!clientExists) {
        return NextResponse.json({ success: false, message: 'O cliente especificado não existe ou foi eliminado.' }, { status: 400 });
      }
    }

    if (updates.assignedToId && state.users && Array.isArray(state.users)) {
      const userExists = state.users.some((u: any) => u.id === updates.assignedToId && !u.deleted);
      if (!userExists) {
        return NextResponse.json({ success: false, message: 'O utilizador responsável especificado não existe ou está inativo.' }, { status: 400 });
      }
    }

    if (updates.convertedProjectId && state.projects && Array.isArray(state.projects)) {
      const projectExists = state.projects.some((p: any) => p.id === updates.convertedProjectId && !p.deleted);
      if (!projectExists) {
        return NextResponse.json({ success: false, message: 'O projeto especificado não existe ou foi eliminado.' }, { status: 400 });
      }
    }

    const existingTicket = tickets[index];
    const updatedTicket: Ticket = {
      ...existingTicket,
      ...updates,
      id, // Preserve ID
      ticketNumber: existingTicket.ticketNumber, // Preserve ticket number
      createdDate: existingTicket.createdDate, // Preserve creation date
      createdById: existingTicket.createdById, // Preserve creator ID
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
      data: updatedTicket
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
