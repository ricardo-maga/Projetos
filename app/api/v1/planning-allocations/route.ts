export const dynamic = 'force-dynamic';

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
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import {
  queryPlanningAllocations,
  createPlanningAllocation,
} from '@/lib/planning/allocationService';

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

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const result = await queryPlanningAllocations(sb, {
      taskId: task_id || taskId,
      resourceId: resource_id || resourceId,
      date,
      dateFrom: date_from || dateFrom,
      dateTo: date_to || dateTo,
      status,
      page,
      pageSize,
    });

    if (!result.success || !result.data) {
      return createErrorResponse(
        result.error?.httpStatus || 500,
        result.error?.errorCode || 'INTERNAL_ERROR',
        result.error?.message || 'Erro ao consultar alocações.',
        requestId,
        result.error?.details
      );
    }

    return NextResponse.json({
      success: true,
      count: result.data.allocations.length,
      total: result.data.total,
      page: result.data.page,
      pageSize: result.data.pageSize,
      totalPages: result.data.totalPages,
      data: result.data.allocations,
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

    const result = await createPlanningAllocation(sb, payload, {
      id: user.id,
      isAdmin: Boolean(user.isAdmin),
    });

    if (!result.success || !result.data) {
      return createErrorResponse(
        result.error?.httpStatus || 500,
        result.error?.errorCode || 'INTERNAL_ERROR',
        result.error?.message || 'Erro ao criar alocação.',
        requestId,
        result.error?.details
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        warnings: result.warnings || [],
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
