export const dynamic = 'force-dynamic';

import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

import { NextRequest, NextResponse } from 'next/server';
import { saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { requirePermission } from '@/lib/auth/authorization';
import { activeRelationExists, getOperationalRecord, mapProjectMaterial } from '@/lib/supabase/operationalRecords';
import { withCanonicalErrors } from '@/lib/apiErrors';
import { updateProjectMaterialSchema } from '@/lib/validations/operational';

async function updateMaterial(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'project_materials:write');
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const parsed = updateProjectMaterialSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Dados do material inválidos.' }, { status: 400 });
    const updates = parsed.data as Record<string, any>;
    const databaseClient = requireServerDbClient();
    const existingMaterial = await getOperationalRecord(databaseClient, 'project_materials', id, mapProjectMaterial);
    if (!existingMaterial) {
      return NextResponse.json({ success: false, message: 'Material não encontrado.' }, { status: 404 });
    }

    if (updates.projectId) {
      const projectExists = await activeRelationExists(databaseClient, 'projects', updates.projectId);
      if (!projectExists) {
        return NextResponse.json({
          success: false,
          message: 'O projeto especificado não existe ou foi eliminado.'
        }, { status: 404 });
      }
    }

    // Write permission must not permit soft-delete or rewriting server identity.
    if (updates.syncVersion !== undefined && updates.syncVersion !== existingMaterial.syncVersion) {
      return NextResponse.json({ success: false, message: 'O material foi alterado entretanto. Atualize antes de repetir.' }, { status: 409 });
    }
    const mutableFields = ['projectId', 'description', 'supplier', 'quantity', 'reference',
      'budget', 'costPrice', 'salePrice', 'expectedDeliveryDate', 'status'];
    const permittedUpdates = Object.fromEntries(mutableFields
      .filter(field => updates[field] !== undefined).map(field => [field, updates[field]]));
    const updatedMaterial = {
      ...existingMaterial,
      ...permittedUpdates,
      id
    };

    const saveResult = await saveActiveStateToSupabase({} as any, databaseClient, { projectMaterials: [updatedMaterial] });
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: saveResult.status || 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Linha de material atualizada.',
      data: { ...updatedMaterial, syncVersion: saveResult.versions?.projectMaterials?.[id] }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

async function deleteMaterial(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'project_materials:delete');
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const databaseClient = requireServerDbClient();
    const existingMaterial = await getOperationalRecord(databaseClient, 'project_materials', id, mapProjectMaterial);
    if (!existingMaterial) {
      return NextResponse.json({ success: false, message: 'Material não encontrado.' }, { status: 404 });
    }

    const deletedMaterial = { ...existingMaterial, deleted: true };
    const saveResult = await saveActiveStateToSupabase({} as any, databaseClient, { projectMaterials: [deletedMaterial] });
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: saveResult.status || 500 });
    }

    return NextResponse.json({ success: true, message: 'Linha de material eliminada.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export const PUT = withCanonicalErrors(updateMaterial);
export const DELETE = withCanonicalErrors(deleteMaterial);
