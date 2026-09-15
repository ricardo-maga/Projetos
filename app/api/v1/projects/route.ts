import { NextRequest, NextResponse } from 'next/server';
import { 
  getActiveStateFromSupabase, 
  saveActiveStateToSupabase, 
  formatSupabaseError,
  fetchPaginatedProjectsDirectly 
} from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Project } from '@/lib/types';
import { authorizeRequest } from '@/lib/serverAuth';

export async function GET(req: NextRequest) {
  const auth = authorizeRequest(req, 'projects_read');
  if ('errorResponse' in auth) return auth.errorResponse;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não está configurado.' }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize') || searchParams.get('limit');
    const search = searchParams.get('search') || '';
    const statusId = searchParams.get('statusId') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const managerId = searchParams.get('managerId') || '';

    // If explicit pagination requested, use high performance direct SQL query
    if (pageParam || pageSizeParam) {
      const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam || '25', 10) || 25));

      const paginated = await fetchPaginatedProjectsDirectly({
        page,
        pageSize,
        search,
        statusId,
        categoryId,
        managerId,
      });

      return NextResponse.json({
        success: paginated.success,
        count: paginated.data.length,
        total: paginated.total,
        page: paginated.page,
        pageSize: paginated.pageSize,
        totalPages: paginated.totalPages,
        data: paginated.data,
      });
    }

    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    let projects = (result.data.projects || []).filter((p: any) => !p.deleted);
    if (search) {
      const q = search.toLowerCase();
      projects = projects.filter((p: any) => 
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.installProjectNo && p.installProjectNo.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }
    if (statusId) {
      projects = projects.filter((p: any) => p.statusId === statusId);
    }
    if (categoryId) {
      projects = projects.filter((p: any) => p.categoryId === categoryId || (p.categoryIds && p.categoryIds.includes(categoryId)));
    }
    if (managerId) {
      projects = projects.filter((p: any) => p.projectManagerId === managerId);
    }

    return NextResponse.json({ success: true, count: projects.length, data: projects });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = authorizeRequest(req, 'projects_write');
  if ('errorResponse' in auth) return auth.errorResponse;

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
