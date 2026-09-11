import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Project } from '@/lib/types';

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não está configurado.' }, { status: 400 });
  }

  try {
    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const projects = (result.data.projects || []).filter((p: any) => !p.deleted);
    return NextResponse.json({ success: true, count: projects.length, data: projects });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não está configurado.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    if (!body.title || !body.clientId) {
      return NextResponse.json({ success: false, message: 'Os campos "title" e "clientId" são obrigatórios.' }, { status: 400 });
    }

    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const currentState = result.data;
    const now = new Date().toISOString();

    const newProject: Project = {
      id: crypto.randomUUID(),
      title: body.title,
      clientId: body.clientId,
      description: body.description || '',
      categoryId: body.categoryId || 'pc-1',
      categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds : [],
      statusId: body.statusId || 'ps-1',
      projectManagerId: body.projectManagerId || '',
      fieldManagerId: body.fieldManagerId || '',
      salesRepId: body.salesRepId || '',
      startDate: body.startDate || '',
      deliveryDate: body.deliveryDate || '',
      estimatedDate: body.estimatedDate || '',
      scheduledDate: body.scheduledDate || '',
      installProjectNo: body.installProjectNo || '',
      sfOpportunityNo: body.sfOpportunityNo || '',
      riskId: body.riskId || 'pr-1',
      priorityId: body.priorityId || 'pp-1',
      teamsInvolvedIds: Array.isArray(body.teamsInvolvedIds) ? body.teamsInvolvedIds : [],
      partnersIds: Array.isArray(body.partnersIds) ? body.partnersIds : [],
      documents: Array.isArray(body.documents) ? body.documents : [],
      budgetValue: Number(body.budgetValue) || 0,
      createdById: body.createdById || '',
      demo: Boolean(body.demo),
      deleted: false,
      createdDate: now,
      updatedDate: now
    };

    currentState.projects = [newProject, ...(currentState.projects || [])];
    const saveResult = await saveActiveStateToSupabase(currentState);

    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Projeto criado com sucesso.', data: newProject }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
