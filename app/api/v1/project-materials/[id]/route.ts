export const dynamic = 'force-dynamic';

import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

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
    const databaseClient = requireServerDbClient();
    const result = await getActiveStateFromSupabase(databaseClient);
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const currentState = result.data;
    if (!currentState.projectMaterials) {
      currentState.projectMaterials = [];
    }

    const matIndex = currentState.projectMaterials.findIndex((m: any) => m.id === id);

    if (matIndex === -1 || currentState.projectMaterials[matIndex].deleted) {
      return NextResponse.json({ success: false, message: 'Material não encontrado.' }, { status: 404 });
    }

    if (updates.projectId) {
      if (currentState.projects && Array.isArray(currentState.projects)) {
        const projectExists = currentState.projects.some((p: any) => p.id === updates.projectId && !p.deleted);
        if (!projectExists) {
          return NextResponse.json({
            success: false,
            message: 'O projeto especificado não existe ou foi eliminado.'
          }, { status: 404 });
        }
      }
    }

    // Write permission must not permit soft-delete or rewriting server identity.
    if (updates.syncVersion !== undefined && updates.syncVersion !== currentState.projectMaterials[matIndex].syncVersion) {
      return NextResponse.json({ success: false, message: 'O material foi alterado entretanto. Atualize antes de repetir.' }, { status: 409 });
    }
    const mutableFields = ['projectId', 'description', 'supplier', 'quantity', 'reference',
      'budget', 'costPrice', 'salePrice', 'expectedDeliveryDate', 'status'];
    const permittedUpdates = Object.fromEntries(mutableFields
      .filter(field => updates[field] !== undefined).map(field => [field, updates[field]]));
    currentState.projectMaterials[matIndex] = {
      ...currentState.projectMaterials[matIndex],
      ...permittedUpdates,
      id
    };

    const saveResult = await saveActiveStateToSupabase(currentState, databaseClient, { projectMaterials: [currentState.projectMaterials[matIndex]] });
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: saveResult.status || 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Linha de material atualizada.',
      data: { ...currentState.projectMaterials[matIndex], syncVersion: saveResult.versions?.projectMaterials?.[id] }
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
    const databaseClient = requireServerDbClient();
    const result = await getActiveStateFromSupabase(databaseClient);
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

    const saveResult = await saveActiveStateToSupabase(currentState, databaseClient, { projectMaterials: [currentState.projectMaterials[matIndex]] });
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: saveResult.status || 500 });
    }

    return NextResponse.json({ success: true, message: 'Linha de material eliminada.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
