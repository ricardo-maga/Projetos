import { NextRequest, NextResponse } from 'next/server';
import { formatSupabaseError, fetchPaginatedProjectsDirectly } from '@/lib/supabaseSync';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
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
    const clientId = searchParams.get('clientId') || '';

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

    // Default to a small limit if no pagination specified to prevent memory overload
    let query = supabase.from('projects').select('*').eq('deleted', false).order('created_at', { ascending: false }).limit(50);
    
    if (statusId) query = query.eq('status_id', statusId);
    if (clientId) query = query.eq('client_id', clientId);
    if (managerId) query = query.eq('project_manager_id', managerId);

    const { data, error } = await query;
    if (error) throw error;
    
    // Map data
    const projects = data.map(p => ({
      id: p.id,
      title: p.project_title || p.title,
      clientId: p.client_id,
      description: p.description,
      categoryId: p.category_id,
      categoryIds: p.category_ids,
      statusId: p.status_id,
      projectManagerId: p.project_manager_id,
      fieldManagerId: p.field_manager_id,
      salesRepId: p.sales_rep_id,
      startDate: p.start_date,
      deliveryDate: p.delivery_date,
      estimatedDate: p.estimated_date,
      scheduledDate: p.scheduled_date,
      installProjectNo: p.install_project_no,
      sfOpportunityNo: p.sf_opportunity_no,
      riskId: p.risk_id,
      priorityId: p.priority_id,
      teamsInvolvedIds: p.teams_involved_ids,
      partnersIds: p.partners_ids,
      documents: p.documents,
      budgetValue: p.budget_value,
      createdById: p.created_by_id,
      demo: p.demo,
      deleted: p.deleted,
      createdDate: p.created_at,
      updatedDate: p.updated_at
    }));

    return NextResponse.json({ success: true, count: projects.length, data: projects });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ success: false, message: 'Supabase não está configurado.' }, { status: 400 });
  }
  try {
    const body = await req.json();
    if (!body.title || !body.clientId) {
      return NextResponse.json({ success: false, message: 'Os campos "title" e "clientId" são obrigatórios.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newProject = {
      id: crypto.randomUUID(),
      project_title: body.title,
      client_id: body.clientId,
      description: body.description || '',
      category_id: body.categoryId || 'pc-1',
      category_ids: Array.isArray(body.categoryIds) ? body.categoryIds : [],
      status_id: body.statusId || 'ps-1',
      project_manager_id: body.projectManagerId || '',
      field_manager_id: body.fieldManagerId || '',
      sales_rep_id: body.salesRepId || '',
      start_date: body.startDate || '',
      delivery_date: body.deliveryDate || '',
      estimated_date: body.estimatedDate || '',
      scheduled_date: body.scheduledDate || '',
      install_project_no: body.installProjectNo || '',
      sf_opportunity_no: body.sfOpportunityNo || '',
      risk_id: body.riskId || 'pr-1',
      priority_id: body.priorityId || 'pp-1',
      teams_involved_ids: Array.isArray(body.teamsInvolvedIds) ? body.teamsInvolvedIds : [],
      partners_ids: Array.isArray(body.partnersIds) ? body.partnersIds : [],
      documents: Array.isArray(body.documents) ? body.documents : [],
      budget_value: Number(body.budgetValue) || 0,
      created_by_id: body.createdById || '',
      demo: Boolean(body.demo),
      deleted: false,
      created_at: now,
      updated_at: now
    };

    const { error } = await supabase.from('projects').insert([newProject]);
    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Projeto criado.', data: { ...body, id: newProject.id } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
