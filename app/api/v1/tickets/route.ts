import { NextRequest, NextResponse } from 'next/server';
import { 
  getActiveStateFromSupabase, 
  saveActiveStateToSupabase, 
  formatSupabaseError 
} from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Ticket } from '@/lib/types';
import { genId } from '@/lib/utils';
import { requirePermission } from '@/lib/auth/authorization';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'tickets_read');
  if (!auth.success) return auth.response;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const source = searchParams.get('source');
    const assignedToId = searchParams.get('assignedToId');
    const clientId = searchParams.get('clientId');

    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    let tickets: Ticket[] = (result.data.tickets || []).filter((t: Ticket) => !t.deleted);

    if (status) {
      tickets = tickets.filter(t => t.status === status);
    }
    if (source) {
      tickets = tickets.filter(t => t.source === source);
    }
    if (assignedToId) {
      tickets = tickets.filter(t => t.assignedToId === assignedToId);
    }
    if (clientId) {
      tickets = tickets.filter(t => t.clientId === clientId);
    }

    return NextResponse.json({
      success: true,
      count: tickets.length,
      data: tickets
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: formatSupabaseError(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'tickets_write');
  if (!auth.success) return auth.response;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const body = await req.json();

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ success: false, message: 'Título do ticket é obrigatório.' }, { status: 400 });
    }

    const validStatuses = ['validacao', 'aberto', 'em_analise', 'convertido', 'resolvido', 'cancelado'];
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json({
        success: false,
        message: `Estado de ticket inválido. Estados permitidos: ${validStatuses.join(', ')}.`
      }, { status: 400 });
    }

    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const state = result.data;

    // Validate client relation if specified
    if (body.clientId !== undefined && body.clientId !== null && body.clientId !== '') {
      const clientExists = Array.isArray(state.clients) && state.clients.some((c: any) => c.id === body.clientId && !c.deleted);
      if (!clientExists) {
        return NextResponse.json({
          success: false,
          message: 'O cliente especificado não existe ou foi eliminado.'
        }, { status: 400 });
      }
    }

    // Validate assignee relation if specified
    if (body.assignedToId !== undefined && body.assignedToId !== null && body.assignedToId !== '') {
      const userExists = Array.isArray(state.users) && state.users.some((u: any) => u.id === body.assignedToId && !u.deleted && u.approved !== false);
      if (!userExists) {
        return NextResponse.json({
          success: false,
          message: 'O utilizador responsável especificado não existe ou está inativo.'
        }, { status: 400 });
      }
    }

    // Validate project relation if specified
    const targetProjectId = body.convertedProjectId || body.projectId;
    if (targetProjectId !== undefined && targetProjectId !== null && targetProjectId !== '') {
      const projectExists = Array.isArray(state.projects) && state.projects.some((p: any) => p.id === targetProjectId && !p.deleted);
      if (!projectExists) {
        return NextResponse.json({
          success: false,
          message: 'O projeto especificado não existe ou foi eliminado.'
        }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const id = genId('tck');
    const count = (state.tickets || []).length + 1;
    const year = new Date().getFullYear();
    const ticketNumber = `TCK-${year}-${String(count).padStart(3, '0')}`;

    const isExternal = body.source === 'email' || body.source === 'teams' || body.source === 'portal';
    const status = isExternal ? 'validacao' : (body.status || 'aberto');

    const newTicket: Ticket = {
      id,
      ticketNumber,
      title: body.title.trim(),
      description: body.description || '',
      source: body.source || 'manual',
      sourceDetails: body.sourceDetails || (isExternal ? `Canal externo (${body.source})` : 'Criado via API'),
      status,
      priority: body.priority || 'media',
      category: body.category || 'Geral',
      clientId: body.clientId || undefined,
      requesterName: body.requesterName,
      requesterEmail: body.requesterEmail,
      requesterPhone: body.requesterPhone,
      assignedToId: body.assignedToId || undefined,
      createdById: auth.user.id,
      convertedProjectId: targetProjectId || undefined,
      createdDate: now,
      updatedDate: now,
      deleted: false
    };

    let notifications = state.notifications || [];
    if (newTicket.assignedToId && !isExternal) {
      notifications = [
        {
          id: genId('notif'),
          userId: newTicket.assignedToId,
          title: `Novo Ticket Atribuído: ${ticketNumber}`,
          message: `Foi-lhe atribuído o ticket ${ticketNumber}: "${newTicket.title}".`,
          isRead: false,
          createdDate: now,
          linkUrl: `?tab=tickets&ticketId=${id}`
        },
        ...notifications
      ];
    }

    const newState = {
      ...state,
      tickets: [newTicket, ...(state.tickets || [])],
      notifications
    };

    const saveRes = await saveActiveStateToSupabase(newState);
    if (!saveRes.success) {
      return NextResponse.json(saveRes, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Ticket criado com sucesso.',
      data: newTicket
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: formatSupabaseError(err) },
      { status: 500 }
    );
  }
}
