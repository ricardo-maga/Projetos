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

export interface ResourceDayTaskGroup {
  taskId: string;
  task: any | null;
  project: any | null;
  confirmedMinutes: number;
  draftMinutes: number;
  plannedMinutes: number;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  allocations: PlanningAllocationDTO[];
  hasConfirmed: boolean;
  hasDraft: boolean;
}

/**
 * Groups active (CONFIRMED + DRAFT) allocations for a specific resource on a specific date by Task (FASE 23E-C3M-C).
 * 
 * Rules:
 * - Only considers allocations for the given resource and date with status CONFIRMED or DRAFT.
 * - Excludes CANCELLED allocations from totals and operational groupings.
 * - Aggregates CONFIRMED hours, DRAFT hours, and Total Planned hours for each task.
 * - Resolves task and project objects using the provided lookup collections.
 * - Sorts tasks deterministically:
 *   1. Tasks with CONFIRMED allocations first
 *   2. Tasks with only DRAFT allocations next
 *   3. Tie-breaker: Project name and then Task title alphabetically
 */
export function groupResourceDayAllocationsByTask(
  resourceId: string,
  dateStr: string,
  allocations: PlanningAllocationDTO[] = [],
  tasks: any[] = [],
  projects: any[] = []
): ResourceDayTaskGroup[] {
  const activeAllocs = allocations.filter(
    a => a.resourceId === resourceId && a.date === dateStr && (a.status === 'CONFIRMED' || a.status === 'DRAFT')
  );

  const taskMap = new Map<string, PlanningAllocationDTO[]>();

  for (const a of activeAllocs) {
    const list = taskMap.get(a.taskId) || [];
    list.push(a);
    taskMap.set(a.taskId, list);
  }

  const groups: ResourceDayTaskGroup[] = [];

  taskMap.forEach((allocList, taskId) => {
    // Sort allocations within task chronologically by startTime
    allocList.sort((a, b) => a.startTime.localeCompare(b.startTime));

    let confirmedMinutes = 0;
    let draftMinutes = 0;

    for (const a of allocList) {
      const dur = a.durationMinutes || 0;
      if (a.status === 'CONFIRMED') {
        confirmedMinutes += dur;
      } else if (a.status === 'DRAFT') {
        draftMinutes += dur;
      }
    }

    const matchedTask = tasks.find(t => t.id === taskId) || (allocList[0]?.task ? {
      id: allocList[0].task.id,
      title: allocList[0].task.title,
      projectId: allocList[0].task.projectId || '',
      assigneeIds: [],
      statusId: '',
      estimatedDate: '',
      description: '',
      estimatedHours: '0',
      actualHours: '0',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      notes: '',
      deleted: false,
      createdDate: '',
    } : null);

    const matchedProject = projects.find(p => p.id === matchedTask?.projectId) || null;

    const confirmedHours = confirmedMinutes / 60;
    const draftHours = draftMinutes / 60;
    const plannedHours = confirmedHours + draftHours;

    groups.push({
      taskId,
      task: matchedTask,
      project: matchedProject,
      confirmedMinutes,
      draftMinutes,
      plannedMinutes: confirmedMinutes + draftMinutes,
      confirmedHours,
      draftHours,
      plannedHours,
      allocations: allocList,
      hasConfirmed: confirmedMinutes > 0,
      hasDraft: draftMinutes > 0,
    });
  });

  // Deterministic sorting:
  // 1. Tasks with CONFIRMED first
  // 2. Tasks with only DRAFT next
  // 3. Project name and Task title (localeCompare pt-PT)
  groups.sort((a, b) => {
    if (a.hasConfirmed && !b.hasConfirmed) return -1;
    if (!a.hasConfirmed && b.hasConfirmed) return 1;

    const projNameA = a.project?.title || '';
    const projNameB = b.project?.title || '';
    const projCompare = projNameA.localeCompare(projNameB, 'pt-PT');
    if (projCompare !== 0) return projCompare;

    const taskTitleA = a.task?.title || a.taskId;
    const taskTitleB = b.task?.title || b.taskId;
    return taskTitleA.localeCompare(taskTitleB, 'pt-PT');
  });

  return groups;
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
