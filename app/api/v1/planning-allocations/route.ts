import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import {
  createPlanningAllocationSchema,
  queryPlanningAllocationSchema,
} from '@/lib/validations/planningAllocation';
import {
  validationError,
  internalServerError,
  createErrorResponse,
} from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import {
  validatePlanningAllocation,
  parseTimeToMinutes,
} from '@/lib/planning/validationEngine';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'calendar_read');
  if (!auth.success) return auth.response;

  const { requestId } = auth;
  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  const parseResult = queryPlanningAllocationSchema.safeParse(rawParams);
  if (!parseResult.success) {
    return validationError(
      'Parâmetros de consulta inválidos.',
      requestId,
      parseResult.error.flatten()
    );
  }

  const {
    task_id,
    taskId,
    resource_id,
    resourceId,
    date,
    date_from,
    dateFrom,
    date_to,
    dateTo,
    status,
    page,
    pageSize,
  } = parseResult.data;

  const targetTaskId = task_id || taskId;
  const targetResourceId = resource_id || resourceId;
  const targetDateFrom = date_from || dateFrom;
  const targetDateTo = date_to || dateTo;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    let query = sb
      .from('planning_allocations')
      .select('*', { count: 'exact' });

    if (targetTaskId) query = query.eq('task_id', targetTaskId);
    if (targetResourceId) query = query.eq('resource_id', targetResourceId);
    if (date) query = query.eq('date', date);
    if (targetDateFrom) query = query.gte('date', targetDateFrom);
    if (targetDateTo) query = query.lte('date', targetDateTo);
    if (status) query = query.eq('status', status);

    const { data: rows, count, error } = await query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('[API PLANNING ALLOCATIONS GET ERROR]', error);
      return internalServerError(
        `Erro ao consultar alocações de planeamento: ${error.message}`,
        requestId
      );
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);

    // Enrich with related task and resource info
    const taskIds = Array.from(new Set((rows || []).map((r: any) => r.task_id).filter(Boolean)));
    const resourceIds = Array.from(new Set((rows || []).map((r: any) => r.resource_id).filter(Boolean)));

    let tasksMap: Record<string, any> = {};
    if (taskIds.length > 0) {
      const { data: tasksData } = await sb
        .from('tasks')
        .select('id, task_title, project_id')
        .in('id', taskIds);
      (tasksData || []).forEach((t: any) => {
        tasksMap[t.id] = {
          id: t.id,
          title: t.task_title,
          projectId: t.project_id,
        };
      });
    }

    let resourcesMap: Record<string, any> = {};
    if (resourceIds.length > 0) {
      const { data: usersData } = await sb
        .from('users')
        .select('id, name, email')
        .in('id', resourceIds);
      (usersData || []).forEach((u: any) => {
        resourcesMap[u.id] = {
          id: u.id,
          name: u.name,
          email: u.email,
        };
      });
    }

    const mapped = (rows || []).map((row: any) => {
      const startMin = parseTimeToMinutes(row.start_time);
      const endMin = parseTimeToMinutes(row.end_time);
      const durationMinutes = Math.max(0, endMin - startMin);

      return {
        id: row.id,
        taskId: row.task_id,
        resourceId: row.resource_id,
        date: row.date,
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
        version: row.version || 1,
        durationMinutes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        task: tasksMap[row.task_id] || null,
        resource: resourcesMap[row.resource_id] || null,
      };
    });

    return NextResponse.json({
      success: true,
      count: mapped.length,
      total,
      page,
      pageSize,
      totalPages,
      data: mapped,
    });
  } catch (error: any) {
    console.error('[API PLANNING ALLOCATIONS GET EXCEPTION]', error);
    return internalServerError(
      'Falha inesperada ao consultar alocações de planeamento.',
      requestId
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'calendar_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;

  try {
    const rawBody = await req.json();
    const parseResult = createPlanningAllocationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError(
        'Dados inválidos para criação da alocação de planeamento.',
        requestId,
        parseResult.error.flatten()
      );
    }

    const payload = parseResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    // Run business, temporal, schedule, and capacity validation
    const validation = await validatePlanningAllocation(sb, {
      taskId: payload.taskId,
      resourceId: payload.resourceId,
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
      status: payload.status,
      overrideWorkSchedule: payload.overrideWorkSchedule,
      isAdmin: Boolean(user.isAdmin),
    });

    if (!validation.isValid) {
      return createErrorResponse(
        validation.httpStatus,
        validation.errorCode,
        validation.message,
        requestId,
        validation.details
      );
    }

    const now = new Date().toISOString();
    const insertPayload = {
      task_id: payload.taskId,
      resource_id: payload.resourceId,
      date: payload.date,
      start_time: payload.startTime,
      end_time: payload.endTime,
      status: payload.status,
      version: 1,
      created_at: now,
      updated_at: now,
    };

    const { data: created, error: insertError } = await sb
      .from('planning_allocations')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      console.error('[API PLANNING ALLOCATION INSERT ERROR]', insertError);
      return internalServerError(
        `Erro ao gravar alocação de planeamento: ${insertError.message}`,
        requestId
      );
    }

    // Fetch related task and resource for response
    const { data: task } = await sb
      .from('tasks')
      .select('id, task_title, project_id')
      .eq('id', payload.taskId)
      .maybeSingle();

    const { data: resUser } = await sb
      .from('users')
      .select('id, name, email')
      .eq('id', payload.resourceId)
      .maybeSingle();

    const startMin = parseTimeToMinutes(created.start_time);
    const endMin = parseTimeToMinutes(created.end_time);

    const dto = {
      id: created.id,
      taskId: created.task_id,
      resourceId: created.resource_id,
      date: created.date,
      startTime: created.start_time,
      endTime: created.end_time,
      status: created.status,
      version: created.version || 1,
      durationMinutes: Math.max(0, endMin - startMin),
      createdAt: created.created_at,
      updatedAt: created.updated_at,
      task: task
        ? {
            id: task.id,
            title: task.task_title,
            projectId: task.project_id,
          }
        : null,
      resource: resUser
        ? {
            id: resUser.id,
            name: resUser.name,
            email: resUser.email,
          }
        : null,
    };

    await logAuditEvent({
      action: 'PLANNING_ALLOCATION_CREATED',
      userId: user.id,
      entity: 'planning_allocations',
      entityId: created.id,
      details: {
        taskId: payload.taskId,
        resourceId: payload.resourceId,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        status: payload.status,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: dto,
        warnings: validation.warnings,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API PLANNING ALLOCATION CREATE EXCEPTION]', error);
    return internalServerError(
      'Falha inesperada ao criar alocação de planeamento.',
      requestId
    );
  }
}
