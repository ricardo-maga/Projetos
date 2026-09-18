import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ValidationContext,
  ValidationResult,
  PlanningWarning,
} from './types';

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function timesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && endA > startB;
}

export function getIsoDayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay; // 1 = Monday ... 7 = Sunday
}

export function parseIntervalToHours(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  if (typeof val === 'string') {
    const timeMatch = val.match(/^(\d+):(\d+)(?::(\d+))?$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      return hours + minutes / 60;
    }
    let totalHours = 0;
    const hoursMatch = val.match(/(\d+(?:\.\d+)?)\s*(?:hour|hours|hrs|h)/i);
    if (hoursMatch) totalHours += parseFloat(hoursMatch[1]);
    const minsMatch = val.match(/(\d+)\s*(?:minute|minutes|mins|m)/i);
    if (minsMatch) totalHours += parseInt(minsMatch[1], 10) / 60;
    if (totalHours > 0) return totalHours;
    const num = parseFloat(val);
    if (!isNaN(num)) return num;
  }
  if (typeof val === 'object') {
    const hours = (val.days || 0) * 8 + (val.hours || 0) + (val.minutes || 0) / 60;
    return hours;
  }
  return 0;
}

/**
 * Validates a planning allocation against all business, temporal, schedule,
 * capacity, and skill requirements.
 */
export async function validatePlanningAllocation(
  sb: SupabaseClient,
  ctx: ValidationContext
): Promise<ValidationResult> {
  const warnings: PlanningWarning[] = [];
  const startMin = parseTimeToMinutes(ctx.startTime);
  const endMin = parseTimeToMinutes(ctx.endTime);

  // 1. Temporal validation
  if (startMin >= endMin) {
    return {
      isValid: false,
      errorCode: 'INVALID_TIME_RANGE',
      message: 'A hora de início deve ser anterior à hora de fim e a alocação não pode atravessar a meia-noite.',
      httpStatus: 400,
      warnings,
      details: { startTime: ctx.startTime, endTime: ctx.endTime },
    };
  }

  const durationMinutes = endMin - startMin;
  if (durationMinutes < 15) {
    return {
      isValid: false,
      errorCode: 'INVALID_DURATION',
      message: 'A duração mínima de uma alocação é de 15 minutos.',
      httpStatus: 400,
      warnings,
      details: { durationMinutes },
    };
  }

  // 2. Validate Task existence
  const { data: task, error: taskError } = await sb
    .from('tasks')
    .select('id, task_title, estimated_hours, deleted')
    .eq('id', ctx.taskId)
    .maybeSingle();

  if (taskError) {
    return {
      isValid: false,
      errorCode: 'DATABASE_ERROR',
      message: `Erro ao validar tarefa: ${taskError.message}`,
      httpStatus: 500,
      warnings,
    };
  }

  if (!task || task.deleted) {
    return {
      isValid: false,
      errorCode: 'TASK_NOT_FOUND',
      message: 'A tarefa associada não foi encontrada ou está eliminada.',
      httpStatus: 404,
      warnings,
      details: { taskId: ctx.taskId },
    };
  }

  // 3. Validate Resource (User) existence
  const { data: resource, error: resourceError } = await sb
    .from('users')
    .select('id, name, email, deleted, approved')
    .eq('id', ctx.resourceId)
    .maybeSingle();

  if (resourceError) {
    return {
      isValid: false,
      errorCode: 'DATABASE_ERROR',
      message: `Erro ao validar recurso: ${resourceError.message}`,
      httpStatus: 500,
      warnings,
    };
  }

  if (!resource || resource.deleted) {
    return {
      isValid: false,
      errorCode: 'RESOURCE_NOT_FOUND',
      message: 'O recurso (utilizador) não foi encontrado ou está inativo.',
      httpStatus: 404,
      warnings,
      details: { resourceId: ctx.resourceId },
    };
  }

  // 4. Task Estimate comparison (generates WARNING for both DRAFT and CONFIRMED)
  const taskEstimatedHours = parseIntervalToHours(task.estimated_hours);
  if (taskEstimatedHours > 0) {
    let allocQuery = sb
      .from('planning_allocations')
      .select('id, start_time, end_time')
      .eq('task_id', ctx.taskId)
      .in('status', ['DRAFT', 'CONFIRMED']);

    if (ctx.currentAllocationId) {
      allocQuery = allocQuery.neq('id', ctx.currentAllocationId);
    }

    const { data: existingTaskAllocs } = await allocQuery;
    let existingTaskMinutes = 0;
    (existingTaskAllocs || []).forEach((a: any) => {
      existingTaskMinutes += parseTimeToMinutes(a.end_time) - parseTimeToMinutes(a.start_time);
    });

    const totalTaskMinutes = existingTaskMinutes + durationMinutes;
    const totalTaskHours = totalTaskMinutes / 60;

    if (totalTaskHours > taskEstimatedHours) {
      warnings.push({
        code: 'ALLOCATED_TIME_EXCEEDS_ESTIMATE',
        message: `O tempo total alocado (${totalTaskHours.toFixed(1)}h) excede a estimativa definida para a tarefa (${taskEstimatedHours.toFixed(1)}h).`,
        details: {
          estimatedHours: taskEstimatedHours,
          totalPlannedHours: totalTaskHours,
        },
      });
    }
  }

  // If status is DRAFT, conflicts do not block creation/updates!
  if (ctx.status === 'DRAFT') {
    return {
      isValid: true,
      warnings,
    };
  }

  // If status is CANCELLED, no capacity/schedule validation is required
  if (ctx.status === 'CANCELLED') {
    return {
      isValid: true,
      warnings,
    };
  }

  // 5. VALIDATIONS FOR STATUS = 'CONFIRMED'

  // A. Overlap with existing CONFIRMED allocations for the same resource and date
  let overlapQuery = sb
    .from('planning_allocations')
    .select('id, start_time, end_time, status')
    .eq('resource_id', ctx.resourceId)
    .eq('date', ctx.date)
    .eq('status', 'CONFIRMED');

  if (ctx.currentAllocationId) {
    overlapQuery = overlapQuery.neq('id', ctx.currentAllocationId);
  }

  const { data: existingAllocs, error: overlapError } = await overlapQuery;
  if (overlapError) {
    return {
      isValid: false,
      errorCode: 'DATABASE_ERROR',
      message: `Erro ao verificar sobreposição de alocações: ${overlapError.message}`,
      httpStatus: 500,
      warnings,
    };
  }

  const conflictingAllocs = (existingAllocs || []).filter((a: any) => {
    const existingStart = parseTimeToMinutes(a.start_time);
    const existingEnd = parseTimeToMinutes(a.end_time);
    return timesOverlap(startMin, endMin, existingStart, existingEnd);
  });

  if (conflictingAllocs.length > 0) {
    return {
      isValid: false,
      errorCode: 'ALLOCATION_OVERLAP',
      message: 'O recurso já possui uma alocação confirmada com sobreposição temporal nesta data.',
      httpStatus: 409,
      warnings,
      details: {
        resourceId: ctx.resourceId,
        date: ctx.date,
        startTime: ctx.startTime,
        endTime: ctx.endTime,
        conflictingAllocations: conflictingAllocs,
      },
    };
  }

  // B. User Absences Conflict
  const { data: absences, error: absError } = await sb
    .from('user_absences')
    .select('id, absence_start_date, absence_end_date, is_full_day, start_time, end_time, type, reason')
    .eq('user_id', ctx.resourceId)
    .lte('absence_start_date', ctx.date)
    .gte('absence_end_date', ctx.date);

  if (absError) {
    return {
      isValid: false,
      errorCode: 'DATABASE_ERROR',
      message: `Erro ao verificar ausências do recurso: ${absError.message}`,
      httpStatus: 500,
      warnings,
    };
  }

  if (absences && absences.length > 0) {
    for (const abs of absences) {
      if (abs.is_full_day || !abs.start_time || !abs.end_time) {
        return {
          isValid: false,
          errorCode: 'RESOURCE_ABSENCE',
          message: 'O recurso tem ausência de dia completo registada nesta data.',
          httpStatus: 409,
          warnings,
          details: {
            absenceId: abs.id,
            type: abs.type,
            reason: abs.reason,
            date: ctx.date,
          },
        };
      } else {
        const absStart = parseTimeToMinutes(abs.start_time);
        const absEnd = parseTimeToMinutes(abs.end_time);
        if (timesOverlap(startMin, endMin, absStart, absEnd)) {
          return {
            isValid: false,
            errorCode: 'RESOURCE_ABSENCE',
            message: 'O recurso tem ausência parcial que coincide com o horário da alocação.',
            httpStatus: 409,
            warnings,
            details: {
              absenceId: abs.id,
              type: abs.type,
              reason: abs.reason,
              startTime: abs.start_time,
              endTime: abs.end_time,
            },
          };
        }
      }
    }
  }

  // C. Non-Project Work Conflict
  const { data: npAllocations, error: npError } = await sb
    .from('resource_non_project_allocations')
    .select('id, work_id, start_time, end_time, status')
    .eq('resource_id', ctx.resourceId)
    .eq('date', ctx.date)
    .neq('status', 'CANCELLED');

  if (npError) {
    return {
      isValid: false,
      errorCode: 'DATABASE_ERROR',
      message: `Erro ao verificar trabalho não relacionado com projetos: ${npError.message}`,
      httpStatus: 500,
      warnings,
    };
  }

  const conflictingNp = (npAllocations || []).filter((np: any) => {
    const npStart = parseTimeToMinutes(np.start_time);
    const npEnd = parseTimeToMinutes(np.end_time);
    return timesOverlap(startMin, endMin, npStart, npEnd);
  });

  if (conflictingNp.length > 0) {
    return {
      isValid: false,
      errorCode: 'INSUFFICIENT_CAPACITY',
      message: 'O recurso possui trabalho não relacionado com projeto agendado neste período.',
      httpStatus: 409,
      warnings,
      details: {
        resourceId: ctx.resourceId,
        date: ctx.date,
        conflictingNonProjectWork: conflictingNp,
      },
    };
  }

  // D. Work Schedules and Overrides
  const isoDay = getIsoDayOfWeek(ctx.date);
  const isWeekend = isoDay === 6 || isoDay === 7;
  let workingPeriods: Array<{ start: number; end: number }> = [];
  let scheduleDetermined = false;

  // Check overrides first
  const { data: override } = await sb
    .from('work_schedule_overrides')
    .select('id, is_working_day')
    .eq('resource_id', ctx.resourceId)
    .eq('date', ctx.date)
    .maybeSingle();

  if (override) {
    scheduleDetermined = true;
    if (!override.is_working_day) {
      if (!(ctx.isAdmin && ctx.overrideWorkSchedule)) {
        return {
          isValid: false,
          errorCode: 'OUTSIDE_WORK_SCHEDULE',
          message: 'A data está definida como dia não útil para este recurso.',
          httpStatus: 409,
          warnings,
          details: { resourceId: ctx.resourceId, date: ctx.date, isWorkingDay: false },
        };
      }
    } else {
      const { data: overridePeriods } = await sb
        .from('work_schedule_override_periods')
        .select('start_time, end_time')
        .eq('override_id', override.id);

      (overridePeriods || []).forEach((p: any) => {
        workingPeriods.push({
          start: parseTimeToMinutes(p.start_time),
          end: parseTimeToMinutes(p.end_time),
        });
      });
    }
  }

  // If no override, check resource work schedule
  if (!scheduleDetermined) {
    const { data: resSched } = await sb
      .from('resource_work_schedules')
      .select('schedule_id')
      .eq('resource_id', ctx.resourceId)
      .maybeSingle();

    if (resSched) {
      const { data: periods } = await sb
        .from('work_schedule_periods')
        .select('start_time, end_time')
        .eq('schedule_id', resSched.schedule_id)
        .eq('day_of_week', isoDay);

      if (periods && periods.length > 0) {
        scheduleDetermined = true;
        periods.forEach((p: any) => {
          workingPeriods.push({
            start: parseTimeToMinutes(p.start_time),
            end: parseTimeToMinutes(p.end_time),
          });
        });
      }
    }
  }

  // If still not determined, check if weekend
  if (!scheduleDetermined && isWeekend) {
    if (!(ctx.isAdmin && ctx.overrideWorkSchedule)) {
      return {
        isValid: false,
        errorCode: 'OUTSIDE_WORK_SCHEDULE',
        message: 'Agendamento em fim de semana bloqueado por defeito.',
        httpStatus: 409,
        warnings,
        details: { resourceId: ctx.resourceId, date: ctx.date, dayOfWeek: isoDay, isWeekend: true },
      };
    }
  }

  // If working periods exist, check if allocation is completely within working periods
  if (workingPeriods.length > 0) {
    let workableMinutes = 0;
    for (let m = startMin; m < endMin; m++) {
      const isMinuteWorkable = workingPeriods.some((p) => m >= p.start && m < p.end);
      if (isMinuteWorkable) {
        workableMinutes++;
      }
    }

    if (workableMinutes < durationMinutes) {
      if (!(ctx.isAdmin && ctx.overrideWorkSchedule)) {
        return {
          isValid: false,
          errorCode: 'OUTSIDE_WORK_SCHEDULE',
          message: 'A alocação ultrapassa o horário de trabalho do recurso ou coincide com período de intervalo/almoço.',
          httpStatus: 409,
          warnings,
          details: {
            durationMinutes,
            workableMinutes,
            unworkableMinutes: durationMinutes - workableMinutes,
            workingPeriods: workingPeriods.map((p) => ({
              start: formatMinutesToTime(p.start),
              end: formatMinutesToTime(p.end),
            })),
          },
        };
      }
    }
  }

  // E. Skills Verification (Competências)
  const { data: skillRequirements, error: skillReqError } = await sb
    .from('task_skill_requirements')
    .select('id, skill_id, is_mandatory')
    .eq('task_id', ctx.taskId);

  if (skillReqError) {
    return {
      isValid: false,
      errorCode: 'DATABASE_ERROR',
      message: `Erro ao consultar requisitos de competência da tarefa: ${skillReqError.message}`,
      httpStatus: 500,
      warnings,
    };
  }

  if (skillRequirements && skillRequirements.length > 0) {
    const { data: resourceSkills, error: resSkillsError } = await sb
      .from('resource_skills')
      .select('skill_id, proficiency_level')
      .eq('resource_id', ctx.resourceId);

    if (resSkillsError) {
      return {
        isValid: false,
        errorCode: 'DATABASE_ERROR',
        message: `Erro ao consultar competências do recurso: ${resSkillsError.message}`,
        httpStatus: 500,
        warnings,
      };
    }

    const resourceSkillIds = new Set((resourceSkills || []).map((s: any) => s.skill_id));

    for (const req of skillRequirements) {
      const hasSkill = resourceSkillIds.has(req.skill_id);
      if (!hasSkill) {
        if (req.is_mandatory) {
          return {
            isValid: false,
            errorCode: 'MANDATORY_SKILL_MISSING',
            message: 'O recurso não possui a competência obrigatória exigida por esta tarefa.',
            httpStatus: 409,
            warnings,
            details: {
              taskId: ctx.taskId,
              resourceId: ctx.resourceId,
              skillId: req.skill_id,
              isMandatory: true,
            },
          };
        } else {
          warnings.push({
            code: 'PREFERRED_SKILL_MISSING',
            message: 'O recurso não possui uma competência preferencial recomendada para esta tarefa.',
            details: {
              taskId: ctx.taskId,
              resourceId: ctx.resourceId,
              skillId: req.skill_id,
              isMandatory: false,
            },
          });
        }
      }
    }
  }

  return {
    isValid: true,
    warnings,
  };
}
