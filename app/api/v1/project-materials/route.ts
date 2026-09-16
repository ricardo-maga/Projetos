import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { ProjectMaterial } from '@/lib/types';
import { requirePermission } from '@/lib/auth/authorization';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'materials_read');
  if (!auth.success) return auth.response;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    let materials = (result.data.projectMaterials || []).filter((pm: any) => !pm.deleted);

    if (projectId) {
      materials = materials.filter((pm: any) => pm.projectId === projectId);
    }

    return NextResponse.json({ success: true, count: materials.length, data: materials });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'materials_write');
  if (!auth.success) return auth.response;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    if (!body.projectId || !body.description || !body.supplier) {
      return NextResponse.json({
        success: false,
        message: 'Os campos "projectId", "description" e "supplier" são obrigatórios.'
      }, { status: 400 });
    }

    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const currentState = result.data;
    const newMaterial: ProjectMaterial = {
      id: crypto.randomUUID(),
      projectId: body.projectId,
      description: body.description,
      supplier: body.supplier,
      quantity: Number(body.quantity) || 1,
      reference: body.reference || '',
      budget: Number(body.budget) || 0,
      costPrice: Number(body.costPrice) || 0,
      salePrice: Number(body.salePrice) || 0,
      expectedDeliveryDate: body.expectedDeliveryDate || '',
      status: body.status === 'em_stock' ? 'em_stock' : 'encomendado',
      deleted: false,
      createdDate: new Date().toISOString()
    };

    currentState.projectMaterials = [newMaterial, ...(currentState.projectMaterials || [])];
    const saveResult = await saveActiveStateToSupabase(currentState);

    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Linha de material criada.', data: newMaterial }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
