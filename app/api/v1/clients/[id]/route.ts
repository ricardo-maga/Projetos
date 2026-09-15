import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { authorizeRequest } from '@/lib/serverAuth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorizeRequest(req, 'clients_write');
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const updates = await req.json();
    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const currentState = result.data;
    if (!currentState.clients) currentState.clients = [];

    const clientIndex = currentState.clients.findIndex((c: any) => c.id === id);

    if (clientIndex === -1) {
      return NextResponse.json({ success: false, message: 'Cliente não encontrado.' }, { status: 404 });
    }

    currentState.clients[clientIndex] = {
      ...currentState.clients[clientIndex],
      ...updates,
      id
    };

    const saveResult = await saveActiveStateToSupabase(currentState);
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Cliente atualizado.',
      data: currentState.clients[clientIndex]
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorizeRequest(req, 'clients_delete');
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const currentState = result.data;
    if (!currentState.clients) currentState.clients = [];

    const clientIndex = currentState.clients.findIndex((c: any) => c.id === id);

    if (clientIndex === -1) {
      return NextResponse.json({ success: false, message: 'Cliente não encontrado.' }, { status: 404 });
    }

    currentState.clients[clientIndex].deleted = true;

    const saveResult = await saveActiveStateToSupabase(currentState);
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Cliente eliminado.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
