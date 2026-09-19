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
  plannedHours: number;
  capacityConsumedHours: number;
  remainingHours: number;
  excessHours: number;
  isOverAllocated: boolean;
}

/**
 * Computes the authoritative planning summary for a task given its estimated hours and its allocations.
 * 
 * Rules:
 * - Planned = SUM(duration of DRAFT + CONFIRMED)
 * - Capacity Consumed = SUM(duration of CONFIRMED)
 * - Remaining = Estimated - Planned (if < 0, Remaining = 0, Excess = Planned - Estimated)
 * - CANCELLED allocations do NOT count towards Planned or Capacity Consumed.
 */
export function computePlanningSummary(
  estimatedHoursInput: string | number | undefined | null,
  allocations: PlanningAllocationDTO[] = []
): PlanningSummary {
  const estimatedHours = parseHoursToNumber(estimatedHoursInput);

  let plannedMinutes = 0;
  let capacityConsumedMinutes = 0;

  for (const a of allocations) {
    const duration = a.durationMinutes || 0;
    if (a.status === 'CONFIRMED') {
      plannedMinutes += duration;
      capacityConsumedMinutes += duration;
    } else if (a.status === 'DRAFT') {
      plannedMinutes += duration;
    }
  }

  const plannedHours = plannedMinutes / 60;
  const capacityConsumedHours = capacityConsumedMinutes / 60;
  const rawRemaining = estimatedHours - plannedHours;
  const remainingHours = Math.max(0, rawRemaining);
  const excessHours = rawRemaining < 0 ? Math.abs(rawRemaining) : 0;

  return {
    estimatedHours,
    plannedHours,
    capacityConsumedHours,
    remainingHours,
    excessHours,
    isOverAllocated: excessHours > 0,
  };
}
