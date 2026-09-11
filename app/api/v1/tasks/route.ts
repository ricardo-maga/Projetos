import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Task } from '@/lib/types';
import { getDefaultTaskStatusId, matchTaskStatusId } from '@/lib/utils';

export async function GET(req: NextRequest) {
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

    let tasks = (result.data.tasks || []).filter((t: any) => !t.deleted);

    if (projectId) {
      tasks = tasks.filter((t: any) => t.projectId === projectId);
    }

    return NextResponse.json({ success: true, count: tasks.length, data: tasks });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    const newTask: Task = {
      id: crypto.randomUUID(),
      projectId: body.projectId,
      title: body.title,
      description: body.description || '',
      statusId: resolvedStatusId,
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
