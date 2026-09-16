import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { requirePermission } from '@/lib/auth/authorization';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'materials_write');
  if (!auth.success) return auth.response;

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
    if (!currentState.projectMaterials) {
      currentState.projectMaterials = [];
    }

    const matIndex = currentState.projectMaterials.findIndex((m: any) => m.id === id);

    if (matIndex === -1) {
      return NextResponse.json({ success: false, message: 'Material não encontrado.' }, { status: 404 });
    }

    currentState.projectMaterials[matIndex] = {
      ...currentState.projectMaterials[matIndex],
      ...updates,
      id
    };

    const saveResult = await saveActiveStateToSupabase(currentState);
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Linha de material atualizada.',
      data: currentState.projectMaterials[matIndex]
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'materials_delete');
  if (!auth.success) return auth.response;

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
    if (!currentState.projectMaterials) {
      currentState.projectMaterials = [];
    }

    const matIndex = currentState.projectMaterials.findIndex((m: any) => m.id === id);

    if (matIndex === -1) {
      return NextResponse.json({ success: false, message: 'Material não encontrado.' }, { status: 404 });
    }

    currentState.projectMaterials[matIndex].deleted = true;

    const saveResult = await saveActiveStateToSupabase(currentState);
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Linha de material eliminada.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
