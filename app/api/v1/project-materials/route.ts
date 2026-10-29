export const dynamic = 'force-dynamic';

import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

import { NextRequest, NextResponse } from 'next/server';
import { saveActiveStateToSupabase } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { ProjectMaterial } from '@/lib/types';
import { requirePermission } from '@/lib/auth/authorization';
import { activeRelationExists, isUuid, mapProjectMaterial, parsePage } from '@/lib/supabase/operationalRecords';
import { withCanonicalErrors } from '@/lib/apiErrors';
import { createProjectMaterialSchema } from '@/lib/validations/operational';

async function getMaterials(req: NextRequest) {
  const auth = await requirePermission(req, 'project_materials:read');
  if (!auth.success) return auth.response;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const pagination = parsePage(searchParams);
    if (!pagination) return NextResponse.json({ success: false, message: 'page e pageSize inválidos (pageSize máximo: 100).' }, { status: 400 });
    if (projectId && !isUuid(projectId))
      return NextResponse.json({ success: false, message: 'Filtro de projeto inválido.' }, { status: 400 });

    const databaseClient = requireServerDbClient();
    let query = databaseClient.from('project_materials').select('*', { count: 'exact' }).eq('deleted', false);
    if (projectId) query = query.eq('project_id', projectId);
    const from = (pagination.page - 1) * pagination.pageSize;
    const { data, count, error } = await query.order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(from, from + pagination.pageSize - 1);
    if (error) throw error;
    const materials = (data || []).map(mapProjectMaterial);
    return NextResponse.json({ success: true, count: materials.length, total: count || 0,
      page: pagination.page, pageSize: pagination.pageSize,
      totalPages: Math.ceil((count || 0) / pagination.pageSize), data: materials });
  } catch (error: any) {
    console.error('[API MATERIALS GET]', error);
    return NextResponse.json({ success: false, message: 'Falha ao consultar materiais.' }, { status: 500 });
  }
}

async function createMaterial(req: NextRequest) {
  const auth = await requirePermission(req, 'project_materials:write');
  if (!auth.success) return auth.response;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    let rawBody: unknown;
    try { rawBody = await req.json(); }
    catch { return NextResponse.json({ success: false, message: 'Corpo JSON inválido.' }, { status: 400 }); }
    const parsed = createProjectMaterialSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        message: 'Dados do material inválidos.'
      }, { status: 400 });
    }
    const body = parsed.data;

    const databaseClient = requireServerDbClient();
    // Validate that target project exists and is not deleted
    const projectExists = await activeRelationExists(databaseClient, 'projects', body.projectId);
    if (!projectExists) {
      return NextResponse.json({
        success: false,
        message: 'O projeto especificado não existe ou foi eliminado.'
      }, { status: 404 });
    }

    const newMaterial: ProjectMaterial = {
      id: crypto.randomUUID(),
      projectId: body.projectId,
      description: body.description,
      supplier: body.supplier,
      quantity: Number(body.quantity) || 1,
      reference: body.reference || '',
      budget: body.budget ?? '',
      costPrice: Number(body.costPrice) || 0,
      salePrice: Number(body.salePrice) || 0,
      expectedDeliveryDate: body.expectedDeliveryDate || '',
      status: body.status || 'por_encomendar',
      deleted: false,
      createdDate: new Date().toISOString()
    };

    const saveResult = await saveActiveStateToSupabase({} as any, databaseClient, { projectMaterials: [newMaterial] });

    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: saveResult.status || 500 });
    }

    return NextResponse.json({ success: true, message: 'Linha de material criada.', data: { ...newMaterial, syncVersion: saveResult.versions?.projectMaterials?.[newMaterial.id] } }, { status: 201 });
  } catch (error: any) {
    console.error('[API MATERIALS POST]', error);
    return NextResponse.json({ success: false, message: 'Falha ao criar material.' }, { status: 500 });
  }
}

export const GET = withCanonicalErrors(getMaterials);
export const POST = withCanonicalErrors(createMaterial);
