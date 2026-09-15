import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Client } from '@/lib/types';
import { authorizeRequest } from '@/lib/serverAuth';

export async function GET(req: NextRequest) {
  const auth = authorizeRequest(req, 'clients_read');
  if ('errorResponse' in auth) return auth.errorResponse;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const clients = (result.data.clients || []).filter((c: any) => !c.deleted);
    return NextResponse.json({ success: true, count: clients.length, data: clients });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = authorizeRequest(req, 'clients_write');
  if ('errorResponse' in auth) return auth.errorResponse;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const clientName = body.clientName || body.name;
    if (!clientName) {
      return NextResponse.json({ success: false, message: 'O campo "clientName" ou "name" é obrigatório.' }, { status: 400 });
    }

    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const currentState = result.data;
    const newClient: Client = {
      id: crypto.randomUUID(),
      clientName: clientName,
      shortName: body.shortName || clientName.substring(0, 10),
      location: body.location || body.address || '',
      taxId: body.taxId || body.nif || '',
      contactPerson: body.contactPerson || '',
      contactEmail: body.contactEmail || body.email || '',
      contactPhone: body.contactPhone || body.phone || '',
      notes: body.notes || '',
      deleted: false,
      createdDate: new Date().toISOString()
    };

    currentState.clients = [newClient, ...(currentState.clients || [])];
    const saveResult = await saveActiveStateToSupabase(currentState);

    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Cliente criado com sucesso.', data: newClient }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
