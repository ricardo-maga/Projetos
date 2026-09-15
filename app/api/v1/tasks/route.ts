import { NextRequest, NextResponse } from 'next/server';
import { 
  getActiveStateFromSupabase, 
  saveActiveStateToSupabase, 
  formatSupabaseError,
  fetchPaginatedTasksDirectly 
} from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Task } from '@/lib/types';
import { getDefaultTaskStatusId, matchTaskStatusId } from '@/lib/utils';
import { authorizeRequest } from '@/lib/serverAuth';

export async function GET(req: NextRequest) {
  const auth = authorizeRequest(req, 'tasks_read');
  if ('errorResponse' in auth) return auth.errorResponse;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize') || searchParams.get('limit');
    const projectId = searchParams.get('projectId') || '';
    const statusId = searchParams.get('statusId') || '';
    const taskTypeId = searchParams.get('taskTypeId') || '';
    const search = searchParams.get('search') || '';

    // If explicit pagination requested, use high performance direct SQL query
    if (pageParam || pageSizeParam) {
      const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam || '25', 10) || 25));

      const paginated = await fetchPaginatedTasksDirectly({
        page,
        pageSize,
        projectId,
        statusId,
        taskTypeId,
        search,
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

    let tasks = (result.data.tasks || []).filter((t: any) => !t.deleted);

    if (projectId) {
      tasks = tasks.filter((t: any) => t.projectId === projectId);
    }
    if (statusId) {
      tasks = tasks.filter((t: any) => t.statusId === statusId);
    }
    if (taskTypeId) {
      tasks = tasks.filter((t: any) => t.taskTypeId === taskTypeId);
    }
    if (search) {
      const q = search.toLowerCase();
      tasks = tasks.filter((t: any) => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.notes && t.notes.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({ success: true, count: tasks.length, data: tasks });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = authorizeRequest(req, 'tasks_write');
  if ('errorResponse' in auth) return auth.errorResponse;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    if (!body.projectId || !body.title) {
      return NextResponse.json({
        success: false,
        message: 'Os campos "projectId" e "title" são obrigatórios.'
      }, { status: 400 });
    }

    const result = await getActiveStateFromSupabase();
    if (!result.success || !result.data) {
      return NextResponse.json(result, { status: 500 });
    }

    const currentState = result.data;
    const resolvedStatusId = (() => {
      if (body.statusId && body.statusId !== 'ts-1') {
        const found = (currentState.taskStatuses || []).find((s: any) => s.id === body.statusId || matchTaskStatusId(s.id, body.statusId));
        if (found) return found.id;
        return body.statusId;
      }
      return getDefaultTaskStatusId(currentState.taskStatuses || []);
    })();

    const resolvedTaskTypeId = (() => {
      if (body.taskTypeId) return body.taskTypeId;
      if (body.isMilestone) {
        const milestoneType = (currentState.taskTypes || []).find((tt: any) => tt.name.toLowerCase().includes('marco'));
        if (milestoneType) return milestoneType.id;
      }
      const defaultType = (currentState.taskTypes || []).find((tt: any) => !tt.deleted);
      return defaultType ? defaultType.id : '';
    })();

    const newTask: Task = {
      id: crypto.randomUUID(),
      projectId: body.projectId,
      title: body.title,
      description: body.description || '',
      statusId: resolvedStatusId,
      taskTypeId: resolvedTaskTypeId,
      assigneeIds: Array.isArray(body.assigneeIds) ? body.assigneeIds : Array.isArray(body.userIds) ? body.userIds : [],
      estimatedDate: body.estimatedDate || '',
      estimatedHours: String(body.estimatedHours || '0'),
      actualHours: String(body.actualHours || '0'),
      startDate: body.startDate || '',
      startTime: body.startTime || '',
      endDate: body.endDate || '',
      endTime: body.endTime || '',
      notes: body.notes || '',
      isMilestone: Boolean(body.isMilestone),
      deleted: false,
      createdDate: new Date().toISOString()
    };

    currentState.tasks = [newTask, ...(currentState.tasks || [])];
    const saveResult = await saveActiveStateToSupabase(currentState);

    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Tarefa criada.', data: newTask }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
