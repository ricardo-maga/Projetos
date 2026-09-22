import { PlanningAllocationDTO } from './types';

/**
 * Parses a duration/hours input (e.g. '08:00', '8', '8.5', 8) into numeric decimal hours.
 */
export function parseHoursToNumber(val?: string | number | null): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim();
  if (!str) return 0;
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(Number);
    return (h || 0) + ((m || 0) / 60);
  }
  const num = parseFloat(str.replace('h', '').replace('H', '').replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

/**
 * Formats numeric hours to a user-friendly string (e.g. '8h', '1h 30m', '45m').
 */
export function formatHoursDisplay(hours: number): string {
  if (hours <= 0) return '0h';
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${wholeHours}h`;
  if (wholeHours === 0) return `${minutes}m`;
  return `${wholeHours}h ${minutes}m`;
}

export interface PlanningSummary {
  estimatedHours: number;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  remainingHours: number;
  excessHours: number;
  capacityConsumedHours: number;
  isOverAllocated: boolean;
}

export interface TaskDailyResourceAllocation {
  allocation: PlanningAllocationDTO;
  resourceId: string;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
}

export interface TaskDailyPlanningGroup {
  date: string;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  resourceAllocations: TaskDailyResourceAllocation[];
}

/**
 * Computes the authoritative planning summary for a task given its estimated hours and its allocations.
 * 
 * Rules:
 * - CONFIRMED = SUM(duration of CONFIRMED)
 * - DRAFT = SUM(duration of DRAFT)
 * - Planned = CONFIRMED + DRAFT
 * - Remaining = max(0, Estimated - Planned)
 * - Excess = max(0, Planned - Estimated)
 * - Capacity Consumed = CONFIRMED
 * - CANCELLED allocations do NOT count towards Planned, Confirmed, Draft, or Capacity Consumed.
 */
export function computePlanningSummary(
  estimatedHoursInput: string | number | undefined | null,
  allocations: PlanningAllocationDTO[] = []
): PlanningSummary {
  const estimatedHours = parseHoursToNumber(estimatedHoursInput);

  let confirmedMinutes = 0;
  let draftMinutes = 0;

  for (const a of allocations) {
    const duration = a.durationMinutes || 0;
    if (a.status === 'CONFIRMED') {
      confirmedMinutes += duration;
    } else if (a.status === 'DRAFT') {
      draftMinutes += duration;
    }
  }

  const confirmedHours = confirmedMinutes / 60;
  const draftHours = draftMinutes / 60;
  const plannedHours = confirmedHours + draftHours;
  const rawRemaining = estimatedHours - plannedHours;
  const remainingHours = Math.max(0, rawRemaining);
  const excessHours = rawRemaining < 0 ? Math.abs(rawRemaining) : 0;

  return {
    estimatedHours,
    confirmedHours,
    draftHours,
    plannedHours,
    capacityConsumedHours: confirmedHours,
    remainingHours,
    excessHours,
    isOverAllocated: excessHours > 0,
  };
}

/**
 * Groups active (CONFIRMED + DRAFT) allocations for a task by Date and then by Resource.
 * Returns sorted chronologically by date ascending, with sub-allocations by start time.
 */
export function groupTaskAllocationsByDate(
  allocations: PlanningAllocationDTO[] = []
): TaskDailyPlanningGroup[] {
  const activeAllocs = allocations.filter(a => a.status === 'CONFIRMED' || a.status === 'DRAFT');
  const dateMap = new Map<string, TaskDailyResourceAllocation[]>();

  for (const a of activeAllocs) {
    const dStr = a.date;
    const durHours = (a.durationMinutes || 0) / 60;
    const confH = a.status === 'CONFIRMED' ? durHours : 0;
    const drfH = a.status === 'DRAFT' ? durHours : 0;

    const resAlloc: TaskDailyResourceAllocation = {
      allocation: a,
      resourceId: a.resourceId,
      confirmedHours: confH,
      draftHours: drfH,
      plannedHours: confH + drfH,
    };

    const existing = dateMap.get(dStr) || [];
    existing.push(resAlloc);
    dateMap.set(dStr, existing);
  }

  // Sort dates ascending
  const sortedDates = Array.from(dateMap.keys()).sort((a, b) => a.localeCompare(b));

  return sortedDates.map(date => {
    const resAllocs = dateMap.get(date) || [];
    // Sort resource allocations within date by startTime
    resAllocs.sort((a, b) => a.allocation.startTime.localeCompare(b.allocation.startTime));

    let dayConfirmed = 0;
    let dayDraft = 0;

    for (const ra of resAllocs) {
      dayConfirmed += ra.confirmedHours;
      dayDraft += ra.draftHours;
    }

    return {
      date,
      confirmedHours: dayConfirmed,
      draftHours: dayDraft,
      plannedHours: dayConfirmed + dayDraft,
      resourceAllocations: resAllocs,
    };
  });
}
