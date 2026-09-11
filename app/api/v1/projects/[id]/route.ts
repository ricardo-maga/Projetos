import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const proj = (result.data.projects || []).find((p: any) => p.id === id && !p.deleted);
    if (!proj) {
      return NextResponse.json({ success: false, message: 'Projeto não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: proj });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    if (!currentState.projects) currentState.projects = [];

    const projIndex = currentState.projects.findIndex((p: any) => p.id === id);

    if (projIndex === -1) {
      return NextResponse.json({ success: false, message: 'Projeto não encontrado.' }, { status: 404 });
    }

    currentState.projects[projIndex] = {
      ...currentState.projects[projIndex],
      ...updates,
      id
    };

    const saveResult = await saveActiveStateToSupabase(currentState);
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Projeto atualizado com sucesso.',
      data: currentState.projects[projIndex]
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    if (!currentState.projects) currentState.projects = [];

    const projIndex = currentState.projects.findIndex((p: any) => p.id === id);

    if (projIndex === -1) {
      return NextResponse.json({ success: false, message: 'Projeto não encontrado.' }, { status: 404 });
    }

    currentState.projects[projIndex].deleted = true;

    const saveResult = await saveActiveStateToSupabase(currentState);
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Projeto eliminado com sucesso.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
