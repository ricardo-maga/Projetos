import { SupabaseClient } from '@supabase/supabase-js';
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  getIsoDayOfWeek,
} from './validationEngine';
import type {
  WorkPeriod,
  FreePeriod,
  ResourceCapacityDetail,
  ResourceAvailabilitySlot,
  ResourceLoadSummary,
} from './types';

/**
 * Clips interval A [startA, endA] against bounding interval B [startB, endB].
 * Returns [start, end] intersection in minutes, or null if disjoint.
 */
export function clipInterval(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): [number, number] | null {
  const s = Math.max(startA, startB);
  const e = Math.min(endA, endB);
  return e > s ? [s, e] : null;
}

/**
 * Merges overlapping or adjacent continuous intervals [start, end].
 */
export function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = merged[merged.length - 1];

    if (current[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Subtracts busy intervals from a base interval [baseStart, baseEnd].
 * Returns remaining disjoint free intervals.
 */
export function subtractIntervals(
  baseStart: number,
  baseEnd: number,
  busyIntervals: Array<[number, number]>
): Array<[number, number]> {
  if (baseEnd <= baseStart) return [];

  // Clip busy intervals to base window and merge
  const clippedBusy: Array<[number, number]> = [];
  for (const busy of busyIntervals) {
    const clipped = clipInterval(busy[0], busy[1], baseStart, baseEnd);
    if (clipped) clippedBusy.push(clipped);
  }

  const mergedBusy = mergeIntervals(clippedBusy);
  const free: Array<[number, number]> = [];
  let pointer = baseStart;

  for (const b of mergedBusy) {
    if (b[0] > pointer) {
      free.push([pointer, b[0]]);
    }
    pointer = Math.max(pointer, b[1]);
  }

  if (pointer < baseEnd) {
    free.push([pointer, baseEnd]);
  }

  return free;
}

/**
 * Returns an array of continuous civil dates (YYYY-MM-DD) between dateFrom and dateTo.
 */
export function getDateRangeList(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);

  while (current <= end) {
    dates.push(current.toISOString().substring(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Calculates active work periods for a given date based on weekly schedule and daily overrides.
 */
export function calculateWorkPeriodsForDate(
  dateStr: string,
  weeklyPeriods: any[],
  dailyOverride?: any
): WorkPeriod[] {
  // If there's an explicit override for this date:
  if (dailyOverride) {
    if (!dailyOverride.is_working_day) {
      return [];
    }
    if (Array.isArray(dailyOverride.periods) && dailyOverride.periods.length > 0) {
      return dailyOverride.periods
        .map((p: any) => {
          const sMin = parseTimeToMinutes(p.start_time);
          const eMin = parseTimeToMinutes(p.end_time);
          if (eMin > sMin) {
            return {
              start: formatMinutesToTime(sMin),
              end: formatMinutesToTime(eMin),
              minutes: eMin - sMin,
            };
          }
          return null;
        })
        .filter((p: WorkPeriod | null): p is WorkPeriod => p !== null);
    }
  }

  // Otherwise, use regular weekly schedule
  const isoDay = getIsoDayOfWeek(dateStr);
  const dayPeriods = weeklyPeriods.filter((p) => p.day_of_week === isoDay);

  return dayPeriods
    .map((p) => {
      const sMin = parseTimeToMinutes(p.start_time);
      const eMin = parseTimeToMinutes(p.end_time);
      if (eMin > sMin) {
        return {
          start: formatMinutesToTime(sMin),
          end: formatMinutesToTime(eMin),
          minutes: eMin - sMin,
        };
      }
      return null;
    })
    .filter((p: WorkPeriod | null): p is WorkPeriod => p !== null);
}

/**
 * Clips an event to the resource's actual work periods.
 * Any portion falling outside work periods or during lunch break does not count.
 */
export function calculateEffectiveMinutes(
  startMin: number,
  endMin: number,
  workPeriods: WorkPeriod[]
): number {
  let effective = 0;
  for (const wp of workPeriods) {
    const wpStart = parseTimeToMinutes(wp.start);
    const wpEnd = parseTimeToMinutes(wp.end);
    const clipped = clipInterval(startMin, endMin, wpStart, wpEnd);
    if (clipped) {
      effective += clipped[1] - clipped[0];
    }
  }
  return effective;
}

/**
 * Calculates continuous free periods within working hours after subtracting busy windows.
 */
export function calculateFreePeriods(
  workPeriods: WorkPeriod[],
  busyIntervals: Array<[number, number]>
): FreePeriod[] {
  const freePeriods: FreePeriod[] = [];

  for (const wp of workPeriods) {
    const wpStart = parseTimeToMinutes(wp.start);
    const wpEnd = parseTimeToMinutes(wp.end);

    const disjointSegments = subtractIntervals(wpStart, wpEnd, busyIntervals);
    for (const seg of disjointSegments) {
      const duration = seg[1] - seg[0];
      if (duration > 0) {
        freePeriods.push({
          start: formatMinutesToTime(seg[0]),
          end: formatMinutesToTime(seg[1]),
          durationMinutes: duration,
        });
      }
    }
  }

  return freePeriods;
}

/**
 * Discovers available start/end slots for a task of specified durationMinutes.
 */
export function findAvailableSlotsForDuration(
  dateStr: string,
  freePeriods: FreePeriod[],
  durationMinutes: number,
  stepMinutes: number = 30
): ResourceAvailabilitySlot[] {
  const slots: ResourceAvailabilitySlot[] = [];

  for (const fp of freePeriods) {
    if (fp.durationMinutes < durationMinutes) continue;

    const fpStartMin = parseTimeToMinutes(fp.start);
    const fpEndMin = parseTimeToMinutes(fp.end);

    let candidateStart = fpStartMin;
    while (candidateStart + durationMinutes <= fpEndMin) {
      const candidateEnd = candidateStart + durationMinutes;
      slots.push({
        date: dateStr,
        startTime: formatMinutesToTime(candidateStart),
        endTime: formatMinutesToTime(candidateEnd),
        durationMinutes,
      });
      candidateStart += stepMinutes;
    }
  }

  return slots;
}

/**
 * Computes capacity details for a single resource on a single date.
 */
export function computeDayCapacity(
  resourceId: string,
  resourceName: string,
  dateStr: string,
  workPeriods: WorkPeriod[],
  absences: any[],
  nonProjects: any[],
  allocations: any[]
): ResourceCapacityDetail {
  // 1. Theoretical Capacity: sum of all active work period durations
  const theoreticalCapacityMinutes = workPeriods.reduce((acc, wp) => acc + wp.minutes, 0);

  // Busy intervals container for finding free periods
  const busyIntervals: Array<[number, number]> = [];

  // 2. Absences deduction
  let absenceMinutes = 0;
  for (const abs of absences) {
    if (abs.is_full_day) {
      absenceMinutes = theoreticalCapacityMinutes;
      for (const wp of workPeriods) {
        busyIntervals.push([parseTimeToMinutes(wp.start), parseTimeToMinutes(wp.end)]);
      }
      break;
    } else if (abs.start_time && abs.end_time) {
      const aStart = parseTimeToMinutes(abs.start_time);
      const aEnd = parseTimeToMinutes(abs.end_time);
      if (aEnd > aStart) {
        absenceMinutes += calculateEffectiveMinutes(aStart, aEnd, workPeriods);
        busyIntervals.push([aStart, aEnd]);
      }
    }
  }
  absenceMinutes = Math.min(absenceMinutes, theoreticalCapacityMinutes);

  // 3. Non-Project Work deduction
  let nonProjectMinutes = 0;
  for (const np of nonProjects) {
    if (np.start_time && np.end_time && np.status !== 'CANCELLED') {
      const npStart = parseTimeToMinutes(np.start_time);
      const npEnd = parseTimeToMinutes(np.end_time);
      if (npEnd > npStart) {
        nonProjectMinutes += calculateEffectiveMinutes(npStart, npEnd, workPeriods);
        busyIntervals.push([npStart, npEnd]);
      }
    }
  }

  // 4. Operational Capacity: Theoretical - Absences - Non-Project
  const operationalCapacityMinutes = Math.max(
    0,
    theoreticalCapacityMinutes - absenceMinutes - nonProjectMinutes
  );

  // 5. Confirmed Allocations: DRAFT does NOT consume capacity, CONFIRMED does
  let confirmedAllocationMinutes = 0;
  for (const alloc of allocations) {
    if (alloc.status === 'CONFIRMED' && alloc.start_time && alloc.end_time) {
      const allocStart = parseTimeToMinutes(alloc.start_time);
      const allocEnd = parseTimeToMinutes(alloc.end_time);
      if (allocEnd > allocStart) {
        const duration = allocEnd - allocStart;
        confirmedAllocationMinutes += duration;
        busyIntervals.push([allocStart, allocEnd]);
      }
    }
  }

  // 6. Available & Over-Allocated
  const availableMinutes = Math.max(0, operationalCapacityMinutes - confirmedAllocationMinutes);
  const overAllocatedMinutes = Math.max(0, confirmedAllocationMinutes - operationalCapacityMinutes);

  // 7. Utilization Percent: (Confirmed / Operational) * 100
  let utilizationPercent = 0;
  if (operationalCapacityMinutes > 0) {
    utilizationPercent = Number(
      ((confirmedAllocationMinutes / operationalCapacityMinutes) * 100).toFixed(1)
    );
  }

  // 8. Free periods computation
  const freePeriods = calculateFreePeriods(workPeriods, busyIntervals);

  return {
    resourceId,
    resourceName,
    date: dateStr,
    theoreticalCapacityMinutes,
    absenceMinutes,
    nonProjectMinutes,
    operationalCapacityMinutes,
    confirmedAllocationMinutes,
    availableMinutes,
    overAllocatedMinutes,
    utilizationPercent,
    workSchedulePeriods: workPeriods,
    freePeriods,
  };
}

/**
 * Bulk data fetcher and calculator for resource capacity across a date range.
 */
export async function getResourceCapacityData(
  supabase: SupabaseClient,
  params: {
    resourceId?: string;
    dateFrom: string;
    dateTo: string;
  }
): Promise<ResourceCapacityDetail[]> {
  const { resourceId, dateFrom, dateTo } = params;
  const dates = getDateRangeList(dateFrom, dateTo);

  // 1. Fetch Users / Resources
  let usersQuery = supabase
    .from('users')
    .select('id, name, email, deleted')
    .eq('deleted', false);

  if (resourceId) {
    usersQuery = usersQuery.eq('id', resourceId);
  }

  const { data: users, error: usersErr } = await usersQuery;
  if (usersErr) throw usersErr;
  if (!users || users.length === 0) return [];

  const userIds = users.map((u) => u.id);

  // 2. Fetch resource-specific work schedules and default schedule
  const { data: resSchedules } = await supabase
    .from('resource_work_schedules')
    .select('resource_id, schedule_id')
    .in('resource_id', userIds);

  const resourceScheduleMap = new Map<string, string>();
  if (resSchedules) {
    for (const rs of resSchedules) {
      if (rs.resource_id && rs.schedule_id) {
        resourceScheduleMap.set(rs.resource_id, rs.schedule_id);
      }
    }
  }

  const { data: defaultSchedule } = await supabase
    .from('work_schedules')
    .select('id, is_active')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const scheduleIds = Array.from(
    new Set(
      [
        ...Array.from(resourceScheduleMap.values()),
        defaultSchedule?.id,
      ].filter(Boolean)
    )
  );

  let schedulePeriods: any[] = [];
  if (scheduleIds.length > 0) {
    const { data: periods } = await supabase
      .from('work_schedule_periods')
      .select('schedule_id, day_of_week, start_time, end_time')
      .in('schedule_id', scheduleIds);
    if (periods) schedulePeriods = periods;
  }

  // 3. Fetch overrides in date range and their override periods
  let overrides: any[] = [];
  const { data: ovData } = await supabase
    .from('work_schedule_overrides')
    .select('id, resource_id, date, is_working_day')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .in('resource_id', userIds);
  if (ovData) overrides = ovData;

  const workingOverrideIds = overrides
    .filter((ov) => ov.is_working_day)
    .map((ov) => ov.id);

  let overridePeriods: any[] = [];
  if (workingOverrideIds.length > 0) {
    const { data: opData } = await supabase
      .from('work_schedule_override_periods')
      .select('override_id, start_time, end_time')
      .in('override_id', workingOverrideIds);
    if (opData) overridePeriods = opData;
  }

  // Map periods onto overrides
  const enrichedOverrides = overrides.map((ov) => ({
    ...ov,
    periods: overridePeriods.filter((p) => p.override_id === ov.id),
  }));

  // 4. Fetch absences overlapping date range
  let absences: any[] = [];
  const { data: absData } = await supabase
    .from('user_absences')
    .select('id, user_id, absence_start_date, absence_end_date, is_full_day, start_time, end_time, status')
    .in('user_id', userIds)
    .lte('absence_start_date', dateTo)
    .gte('absence_end_date', dateFrom)
    .neq('status', 'REJECTED');
  if (absData) absences = absData;

  // 5. Fetch non-project work allocations
  let nonProjects: any[] = [];
  const { data: npData } = await supabase
    .from('resource_non_project_allocations')
    .select('id, resource_id, date, start_time, end_time, status')
    .in('resource_id', userIds)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .neq('status', 'CANCELLED');
  if (npData) nonProjects = npData;

  // 6. Fetch planning allocations
  let allocations: any[] = [];
  const { data: allocData } = await supabase
    .from('planning_allocations')
    .select('id, resource_id, date, start_time, end_time, status')
    .in('resource_id', userIds)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .neq('status', 'CANCELLED');
  if (allocData) allocations = allocData;

  // 7. Calculate capacity for each resource and each date
  const results: ResourceCapacityDetail[] = [];

  for (const user of users) {
    const userScheduleId = resourceScheduleMap.get(user.id) || defaultSchedule?.id;
    const userWeeklyPeriods = schedulePeriods.filter((p) => p.schedule_id === userScheduleId);

    for (const dateStr of dates) {
      const dailyOverride = enrichedOverrides.find(
        (ov) => ov.resource_id === user.id && ov.date === dateStr
      );

      const workPeriods = calculateWorkPeriodsForDate(
        dateStr,
        userWeeklyPeriods,
        dailyOverride
      );

      const dayAbsences = absences.filter(
        (a) =>
          a.user_id === user.id &&
          a.absence_start_date <= dateStr &&
          a.absence_end_date >= dateStr
      );

      const dayNonProjects = nonProjects.filter(
        (np) => np.resource_id === user.id && np.date === dateStr
      );

      const dayAllocations = allocations.filter(
        (al) => al.resource_id === user.id && al.date === dateStr
      );

      const dayCap = computeDayCapacity(
        user.id,
        user.name || user.email || 'Recurso',
        dateStr,
        workPeriods,
        dayAbsences,
        dayNonProjects,
        dayAllocations
      );

      results.push(dayCap);
    }
  }

  // Sort results by resource name then date
  results.sort((a, b) => a.resourceName.localeCompare(b.resourceName) || a.date.localeCompare(b.date));

  return results;
}

/**
 * Searches for free availability slots for a specific resource and duration.
 */
export async function getResourceAvailabilitySlots(
  supabase: SupabaseClient,
  params: {
    resourceId: string;
    dateFrom: string;
    dateTo: string;
    durationMinutes: number;
    stepMinutes?: number;
  }
): Promise<ResourceAvailabilitySlot[]> {
  const capacityList = await getResourceCapacityData(supabase, {
    resourceId: params.resourceId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const slots: ResourceAvailabilitySlot[] = [];

  for (const dayCap of capacityList) {
    const daySlots = findAvailableSlotsForDuration(
      dayCap.date,
      dayCap.freePeriods,
      params.durationMinutes,
      params.stepMinutes ?? 30
    );
    slots.push(...daySlots);
  }

  return slots;
}

/**
 * Aggregates resource load summary for rapid capacity/load visualization.
 */
export async function getResourceLoadSummary(
  supabase: SupabaseClient,
  params: {
    resourceId?: string;
    dateFrom: string;
    dateTo: string;
  }
): Promise<ResourceLoadSummary[]> {
  const capacityList = await getResourceCapacityData(supabase, params);

  return capacityList.map((c) => ({
    resourceId: c.resourceId,
    resourceName: c.resourceName,
    date: c.date,
    operationalCapacityMinutes: c.operationalCapacityMinutes,
    plannedMinutes: c.confirmedAllocationMinutes,
    availableMinutes: c.availableMinutes,
    overAllocatedMinutes: c.overAllocatedMinutes,
    utilizationPercent: c.utilizationPercent,
  }));
}
