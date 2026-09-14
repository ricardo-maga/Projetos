import { NextRequest, NextResponse } from 'next/server';
import { formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const source = searchParams.get('source');
    const assignedToId = searchParams.get('assignedToId');
    const clientId = searchParams.get('clientId');
    
    let query = supabase.from('tickets').select('*').eq('deleted', false).order('created_at', { ascending: false }).limit(50);
    
    if (status) query = query.eq('status', status);
    if (source) query = query.eq('source', source);
    if (assignedToId) query = query.eq('assigned_to_id', assignedToId);
    if (clientId) query = query.eq('client_id', clientId);
    
    const { data, error } = await query;
    if (error) throw error;
    
    const tickets = data.map(t => ({
      id: t.id,
      ticketNumber: t.ticket_number,
      title: t.title,
      description: t.description,
      source: t.source,
      sourceDetails: t.source_details,
      status: t.status,
      priority: t.priority,
      category: t.category,
      clientId: t.client_id,
      requesterName: t.requester_name,
      requesterEmail: t.requester_email,
      requesterPhone: t.requester_phone,
      assignedToId: t.assigned_to_id,
      createdById: t.created_by_id,
      createdDate: t.created_at,
      updatedDate: t.updated_at,
      deleted: t.deleted
    }));
    
    return NextResponse.json({ success: true, count: tickets.length, data: tickets });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }
  try {
    const body = await req.json();
    if (!body.title) {
      return NextResponse.json({ success: false, message: 'Título do ticket é obrigatório.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    
    const { count } = await supabase.from('tickets').select('*', { count: 'exact', head: true });
    
    const year = new Date().getFullYear();
    const ticketNumber = `TCK-${year}-${String((count || 0) + 1).padStart(3, '0')}`;
    const isExternal = body.source === 'email' || body.source === 'teams' || body.source === 'portal';
    const status = isExternal ? 'validacao' : (body.status || 'aberto');
    
    const newTicket = {
      id,
      ticket_number: ticketNumber,
      title: body.title,
      description: body.description || '',
      source: body.source || 'manual',
      source_details: body.sourceDetails || (isExternal ? `Canal externo (${body.source})` : 'Criado via API'),
      status,
      priority: body.priority || 'media',
      category: body.category || 'Geral',
      client_id: body.clientId || null,
      requester_name: body.requesterName || null,
      requester_email: body.requesterEmail || null,
      requester_phone: body.requesterPhone || null,
      assigned_to_id: body.assignedToId || null,
      created_by_id: body.createdById || null,
      created_at: now,
      updated_at: now,
      deleted: false
    };
    
    const { error } = await supabase.from('tickets').insert([newTicket]);
    if (error) throw error;
    
    return NextResponse.json({ success: true, message: 'Ticket criado com sucesso.', data: { ...body, id, ticketNumber } }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(err) }, { status: 500 });
  }
}
