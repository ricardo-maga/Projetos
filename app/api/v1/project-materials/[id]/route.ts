export const dynamic = 'force-dynamic';

import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

import { NextRequest, NextResponse } from 'next/server';
import { persistProjectMaterial } from '@/domains/projects/services/persistProjectMaterial';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { requirePermission } from '@/lib/auth/authorization';
import { activeRelationExists, getOperationalRecord, mapProjectMaterial } from '@/lib/supabase/operationalRecords';
import { withCanonicalErrors } from '@/lib/apiErrors';
import { updateProjectMaterialSchema } from '@/lib/validations/operational';
import { isSafeIdentifier } from '@/lib/security/identifiers';
import { isNotModified, mutationPrecondition, preconditionFailed, resourceTag, validationHeaders, warnMissingPrecondition } from '@/lib/security/resourceVersion';

async function getMaterial(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'project_materials:read');
  if (!auth.success) return auth.response;
  const { id } = await params;
  if (!isSafeIdentifier(id))
    return NextResponse.json({ success: false, message: 'ID de material inválido.' }, { status: 400 });
  const db = requireServerDbClient(auth.user);
  const data = await getOperationalRecord(db, 'project_materials', id, mapProjectMaterial);
  if (!data || data.deleted) return NextResponse.json({ success: false, message: 'Material não encontrado.' }, { status: 404 });
  const etag = resourceTag(data);
  const headers = validationHeaders(etag);
  if (isNotModified(req, etag)) return new NextResponse(null, { status: 304, headers });
  return NextResponse.json({ success: true, data }, { headers });
}

async function updateMaterial(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'project_materials:write');
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isSafeIdentifier(id)) return NextResponse.json({ success: false, message: 'ID de material inválido.' }, { status: 400 });
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    let rawBody: unknown;
    try { rawBody = await req.json(); }
    catch { return NextResponse.json({ success: false, message: 'Corpo JSON inválido.' }, { status: 400 }); }
    const parsed = updateProjectMaterialSchema.safeParse(rawBody);
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Dados do material inválidos.' }, { status: 400 });
    const updates = parsed.data as Record<string, any>;
    const databaseClient = requireServerDbClient(auth.user);
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

    const precondition = mutationPrecondition(req, resourceTag(existingMaterial), updates.syncVersion,
      existingMaterial.syncVersion, auth.requestId);
    if (precondition) return precondition;
    // Write permission must not permit soft-delete or rewriting server identity.
    const mutableFields = ['projectId', 'description', 'supplier', 'quantity', 'reference',
      'budget', 'costPrice', 'salePrice', 'expectedDeliveryDate', 'status'];
    const permittedUpdates = Object.fromEntries(mutableFields
      .filter(field => updates[field] !== undefined).map(field => [field, updates[field]]));
    const updatedMaterial = {
      ...existingMaterial,
      ...permittedUpdates,
      id
    };

    const saveResult = await persistProjectMaterial(databaseClient, updatedMaterial, 'update');
    if (!saveResult.success) {
      if (req.headers.has('if-match') && saveResult.status === 409) return preconditionFailed(auth.requestId);
      return NextResponse.json(saveResult, { status: saveResult.status || 500 });
    }

    const data = { ...updatedMaterial, syncVersion: saveResult.syncVersion };
    const response = NextResponse.json({
      success: true,
      message: 'Linha de material atualizada.',
      data,
    }, { headers: { 'Cache-Control': 'no-store' } });
    return warnMissingPrecondition(req, updates.syncVersion, response);
  } catch (error: any) {
    console.error('[API MATERIAL UPDATE]', error);
    return NextResponse.json({ success: false, message: 'Falha ao atualizar material.' }, { status: 500 });
  }
}

async function deleteMaterial(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'project_materials:delete');
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isSafeIdentifier(id)) return NextResponse.json({ success: false, message: 'ID de material inválido.' }, { status: 400 });
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const databaseClient = requireServerDbClient(auth.user);
    const existingMaterial = await getOperationalRecord(databaseClient, 'project_materials', id, mapProjectMaterial);
    if (!existingMaterial) {
      return NextResponse.json({ success: false, message: 'Material não encontrado.' }, { status: 404 });
    }

    const deletedMaterial = { ...existingMaterial, deleted: true };
    const saveResult = await persistProjectMaterial(databaseClient, deletedMaterial, 'delete');
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: saveResult.status || 500 });
    }

    return NextResponse.json({ success: true, message: 'Linha de material eliminada.' });
  } catch (error: any) {
    console.error('[API MATERIAL DELETE]', error);
    return NextResponse.json({ success: false, message: 'Falha ao eliminar material.' }, { status: 500 });
  }
}

export const GET = withCanonicalErrors(getMaterial);
export const PUT = withCanonicalErrors(updateMaterial);
export const DELETE = withCanonicalErrors(deleteMaterial);
