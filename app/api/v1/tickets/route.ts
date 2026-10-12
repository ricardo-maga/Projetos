export const dynamic = 'force-dynamic';

import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

import { NextRequest, NextResponse } from 'next/server';
import { 
  saveActiveStateToSupabase, 
  formatSupabaseError 
} from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Ticket } from '@/lib/types';
import { genId } from '@/lib/utils';
import { requirePermission } from '@/lib/auth/authorization';
import { reserveTicketNumber } from '@/lib/supabase/ticketNumber';
import { activeRelationExists, isUuid, mapTicket, parsePage } from '@/lib/supabase/operationalRecords';
import { withCanonicalErrors } from '@/lib/apiErrors';
import { createTicketSchema } from '@/lib/validations/operational';

async function getTickets(req: NextRequest) {
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
    const pagination = parsePage(searchParams);
    if (!pagination) return NextResponse.json({ success: false, message: 'page e pageSize inválidos (pageSize máximo: 100).' }, { status: 400 });
    if ((assignedToId && !isUuid(assignedToId)) || (clientId && !isUuid(clientId)))
      return NextResponse.json({ success: false, message: 'Filtro de utilizador ou cliente inválido.' }, { status: 400 });

    const databaseClient = requireServerDbClient();
    let query = databaseClient.from('tickets').select('*', { count: 'exact' }).eq('deleted', false);
    if (status) query = query.eq('status', status);
    if (source) query = query.eq('source', source);
    if (assignedToId) query = query.eq('assigned_to_id', assignedToId);
    if (clientId) query = query.eq('client_id', clientId);
    const from = (pagination.page - 1) * pagination.pageSize;
    const { data, count, error } = await query.order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(from, from + pagination.pageSize - 1);
    if (error) throw error;
    const tickets = (data || []).map(mapTicket);

    return NextResponse.json({
      success: true,
      count: tickets.length,
      total: count || 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil((count || 0) / pagination.pageSize),
      data: tickets
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: formatSupabaseError(err) },
      { status: 500 }
    );
  }
}

async function createTicket(req: NextRequest) {
  const auth = await requirePermission(req, 'tickets_write');
  if (!auth.success) return auth.response;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const parsed = createTicketSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Dados do ticket inválidos.' }, { status: 400 });
    const body = parsed.data;

    const validStatuses = ['validacao', 'aberto', 'em_analise', 'convertido', 'resolvido', 'cancelado'];
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json({
        success: false,
        message: `Estado de ticket inválido. Estados permitidos: ${validStatuses.join(', ')}.`
      }, { status: 400 });
    }

    const databaseClient = requireServerDbClient();
    // Validate client relation if specified
    if (body.clientId !== undefined && body.clientId !== null && body.clientId !== '') {
      const clientExists = await activeRelationExists(databaseClient, 'clients', body.clientId);
      if (!clientExists) {
        return NextResponse.json({
          success: false,
          message: 'O cliente especificado não existe ou foi eliminado.'
        }, { status: 400 });
      }
    }

    // Validate assignee relation if specified
    if (body.assignedToId !== undefined && body.assignedToId !== null && body.assignedToId !== '') {
      const userExists = await activeRelationExists(databaseClient, 'users', body.assignedToId);
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
      const projectExists = await activeRelationExists(databaseClient, 'projects', targetProjectId);
      if (!projectExists) {
        return NextResponse.json({
          success: false,
          message: 'O projeto especificado não existe ou foi eliminado.'
        }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    // Return the same canonical ID that PostgreSQL persists and GET/PATCH use.
    const id = crypto.randomUUID();
    const ticketNumber = await reserveTicketNumber(databaseClient);

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

    const notifications = [] as any[];
    if (newTicket.assignedToId && !isExternal) {
      notifications.push({
          id: genId('notif'),
          userId: newTicket.assignedToId,
          title: `Novo Ticket Atribuído: ${ticketNumber}`,
          message: `Foi-lhe atribuído o ticket ${ticketNumber}: "${newTicket.title}".`,
          isRead: false,
          createdDate: now,
          linkUrl: `?tab=tickets&ticketId=${id}`
      });
    }

    const saveRes = await saveActiveStateToSupabase({} as any, databaseClient, {
      tickets: [newTicket],
      notifications,
    });
    if (!saveRes.success) {
      return NextResponse.json(saveRes, { status: saveRes.status || 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Ticket criado com sucesso.',
      data: { ...newTicket, syncVersion: saveRes.versions?.tickets?.[newTicket.id] }
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: formatSupabaseError(err) },
      { status: 500 }
    );
  }
}

export const GET = withCanonicalErrors(getTickets);
export const POST = withCanonicalErrors(createTicket);
