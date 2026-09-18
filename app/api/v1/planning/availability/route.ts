import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import {
  validationError,
  badRequest,
  internalServerError,
} from '@/lib/apiErrors';
import { queryAvailabilitySchema } from '@/lib/validations/planningCapacity';
import { getResourceAvailabilitySlots } from '@/lib/planning/capacityService';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'calendar_read');
  if (!auth.success) return auth.response;

  const { requestId } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const queryParams = {
      resource_id: searchParams.get('resource_id') || undefined,
      resourceId: searchParams.get('resourceId') || undefined,
      duration_minutes: searchParams.get('duration_minutes') || undefined,
      durationMinutes: searchParams.get('durationMinutes') || undefined,
      date: searchParams.get('date') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    };

    const parseResult = queryAvailabilitySchema.safeParse(queryParams);
    if (!parseResult.success) {
      return validationError(
        'Parâmetros inválidos para consulta de disponibilidade.',
        requestId,
        parseResult.error.flatten()
      );
    }

    const { resourceId, durationMinutes, dateFrom, dateTo } = parseResult.data;

    const rawStep = searchParams.get('step_minutes') || searchParams.get('stepMinutes');
    let stepMinutes = 30;
    if (rawStep) {
      const parsedStep = parseInt(rawStep, 10);
      if (!isNaN(parsedStep) && parsedStep >= 15 && parsedStep <= 120) {
        stepMinutes = parsedStep;
      }
    }

    // Check maximum date range limit (62 days)
    const startDate = new Date(dateFrom);
    const endDate = new Date(dateTo);
    const diffDays = Math.round(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays > 62) {
      return badRequest(
        'O intervalo máximo permitido para consulta de disponibilidade é de 62 dias.',
        requestId,
        { dateFrom, dateTo, diffDays, maxAllowedDays: 62 }
      );
    }

    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase indisponível.', requestId);
    }

    const data = await getResourceAvailabilitySlots(sb, {
      resourceId,
      dateFrom,
      dateTo,
      durationMinutes,
      stepMinutes,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('[API PLANNING AVAILABILITY EXCEPTION]', error);
    return internalServerError(
      error?.message ? `Falha ao consultar disponibilidade: ${error.message}` : 'Falha inesperada ao consultar disponibilidade de horários.',
      requestId
    );
  }
}
