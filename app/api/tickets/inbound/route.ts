import { NextRequest, NextResponse } from 'next/server';
import { 
  getActiveStateFromSupabase, 
  saveActiveStateToSupabase, 
  formatSupabaseError 
} from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Ticket } from '@/lib/types';
import { genId } from '@/lib/utils';
import crypto from 'crypto';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const secret = process.env.INBOUND_TICKETS_SECRET;
  const supplied = req.headers.get('x-inbound-ticket-secret');
  if (!secret || !supplied || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
    return NextResponse.json({ success: false, message: 'Não autorizado.' }, { status: 401 });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(`inbound-ticket:${ip}`, { limit: 30, windowSeconds: 60 }).success) {
    return NextResponse.json({ success: false, message: 'Demasiados pedidos.' }, { status: 429 });
  }
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const body = await req.json();

    const title = body.title || body.subject || body.topic || 'Pedido Recebido via Canal Externo';
    const description = body.description || body.body || body.text || body.content || '';
    const source = body.source || (body.teams ? 'teams' : 'email');
    const requesterEmail = body.requesterEmail || body.from || body.sender || '';
    const requesterName = body.requesterName || (requesterEmail ? requesterEmail.split('@')[0].replace('.', ' ') : 'Contacto Externo');

    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const state = result.data;
    const now = new Date().toISOString();
    const id = genId('tck');
    const count = (state.tickets || []).length + 1;
    const year = new Date().getFullYear();
    const ticketNumber = `TCK-${year}-${String(count).padStart(3, '0')}`;

    // Always put inbound external tickets in validation stage
    const newTicket: Ticket = {
      id,
      ticketNumber,
      title,
      description,
      source: source === 'teams' ? 'teams' : 'email',
      sourceDetails: source === 'teams' 
        ? `Microsoft Teams: ${body.channel || '#geral'} (${requesterEmail || 'utilizador'})` 
        : `Email Inbound: ${requesterEmail || 'desconhecido'}`,
      status: 'validacao', // Automatic validation stage requirement
      priority: body.priority || 'media',
      category: body.category || 'Suporte Técnico',
      requesterName,
      requesterEmail,
      requesterPhone: body.requesterPhone,
      createdDate: now,
      updatedDate: now,
      deleted: false
    };

    const newState = {
      ...state,
      tickets: [newTicket, ...(state.tickets || [])]
    };

    const saveRes = await saveActiveStateToSupabase(newState);
    if (!saveRes.success) {
      return NextResponse.json(saveRes, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Ticket recebido e colocado em fase de Validação com sucesso.',
      ticketNumber: newTicket.ticketNumber,
      ticketId: newTicket.id,
      status: 'validacao'
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: formatSupabaseError(err) },
      { status: 500 }
    );
  }
}
