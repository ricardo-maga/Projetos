export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updatePlanningAllocationSchema } from '@/lib/validations/planningAllocation';
import {
  validationError,
  internalServerError,
  createErrorResponse,
} from '@/lib/apiErrors';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import {
  getPlanningAllocationById,
  updatePlanningAllocation,
  deletePlanningAllocation,
} from '@/lib/planning/allocationService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, 'calendar_read');
  if (!auth.success) return auth.response;

  const { requestId } = auth;
  const { id } = await params;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const result = await getPlanningAllocationById(sb, id);

    if (!result.success || !result.data) {
      return createErrorResponse(
        result.error?.httpStatus || 500,
        result.error?.errorCode || 'INTERNAL_ERROR',
        result.error?.message || 'Erro ao consultar alocação.',
        requestId,
        result.error?.details
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    console.error('[API PLANNING ALLOCATION GET EXCEPTION]', error);
    return internalServerError(
      'Falha inesperada ao consultar alocação de planeamento.',
      requestId
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, 'calendar_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;
  const { id } = await params;

  try {
    const rawBody = await req.json();
    const parseResult = updatePlanningAllocationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError(
        'Dados inválidos para atualização da alocação de planeamento.',
        requestId,
        parseResult.error.flatten()
      );
    }

    const updates = parseResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const result = await updatePlanningAllocation(sb, id, updates, {
      id: user.id,
      isAdmin: Boolean(user.isAdmin),
    });

    if (!result.success || !result.data) {
      return createErrorResponse(
        result.error?.httpStatus || 500,
        result.error?.errorCode || 'INTERNAL_ERROR',
        result.error?.message || 'Erro ao atualizar alocação.',
        requestId,
        result.error?.details
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      warnings: result.warnings || [],
    });
  } catch (error: any) {
    console.error('[API PLANNING ALLOCATION UPDATE EXCEPTION]', error);
    return internalServerError(
      'Falha inesperada ao atualizar alocação de planeamento.',
      requestId
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, 'calendar_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;
  const { id } = await params;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const result = await deletePlanningAllocation(sb, id, { id: user.id });

    if (!result.success) {
      return createErrorResponse(
        result.error?.httpStatus || 500,
        result.error?.errorCode || 'INTERNAL_ERROR',
        result.error?.message || 'Erro ao eliminar alocação.',
        requestId,
        result.error?.details
      );
    }

    return NextResponse.json({
      success: true,
      message: result.data?.message || 'Alocação de planeamento eliminada com sucesso.',
    });
  } catch (error: any) {
    console.error('[API PLANNING ALLOCATION DELETE EXCEPTION]', error);
    return internalServerError(
      'Falha inesperada ao eliminar alocação de planeamento.',
      requestId
    );
  }
}
