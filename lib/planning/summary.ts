import type { PlanningAllocationDTO } from './types.ts';

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

  // Deterministic sorting (FASE 23E-C3G Requirement 10):
  // 1. Tasks with CONFIRMED first
  // 2. Tasks with DRAFT next
  // 3. Higher PLANEADO (descending)
  // 4. Project name (localeCompare pt-PT)
  // 5. Task title (localeCompare pt-PT)
  groups.sort((a, b) => {
    // 1. Tasks with CONFIRMED
    if (a.hasConfirmed && !b.hasConfirmed) return -1;
    if (!a.hasConfirmed && b.hasConfirmed) return 1;

    // 2. Tasks with DRAFT
    if (a.hasDraft && !b.hasDraft) return -1;
    if (!a.hasDraft && b.hasDraft) return 1;

    // 3. Maior PLANEADO (descending)
    if (b.plannedMinutes !== a.plannedMinutes) {
      return b.plannedMinutes - a.plannedMinutes;
    }

    // 4. Nome do projeto
    const projNameA = a.project?.title || '';
    const projNameB = b.project?.title || '';
    const projCompare = projNameA.localeCompare(projNameB, 'pt-PT');
    if (projCompare !== 0) return projCompare;

    // 5. Nome da tarefa
    const taskTitleA = a.task?.title || a.taskId;
    const taskTitleB = b.task?.title || b.taskId;
    return taskTitleA.localeCompare(taskTitleB, 'pt-PT');
  });

  return groups;
}

export type TaskDailyOperationalStatus = 'NORMAL' | 'DRAFT' | 'EXCESSO_TAREFA';

/**
 * Returns the operational load status of a task on a specific resource day.
 * 
 * Rules (FASE 23E-C3G Section 7):
 * - EXCESSO DA TAREFA: Only if the canonical global planning summary of the task determines excess.
 *   (Does not confuse task excess with resource capacity excess).
 * - DRAFT: If the allocation has draft work pending confirmation.
 * - NORMAL: Work planned within standard boundaries.
 */
export function getTaskDailyOperationalStatus(
  group: ResourceDayTaskGroup,
  allTaskAllocations: PlanningAllocationDTO[] = []
): {
  status: TaskDailyOperationalStatus;
  label: string;
  badgeClass: string;
  excessHours: number;
} {
  const taskActiveAllocations = allTaskAllocations.filter(
    a => a.taskId === group.taskId && a.status !== 'CANCELLED'
  );
  const taskSummary = computePlanningSummary(group.task?.estimatedHours, taskActiveAllocations);

  if (taskSummary.excessHours > 0 || taskSummary.isOverAllocated) {
    return {
      status: 'EXCESSO_TAREFA',
      label: `Excesso da Tarefa (+${formatHoursDisplay(taskSummary.excessHours)})`,
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      excessHours: taskSummary.excessHours,
    };
  }

  if (group.hasDraft) {
    return {
      status: 'DRAFT',
      label: 'Draft Pendente',
      badgeClass: 'bg-amber-50 text-amber-900 border-amber-300 border-dashed',
      excessHours: 0,
    };
  }

  return {
    status: 'NORMAL',
    label: 'Normal',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    excessHours: 0,
  };
}

/**
 * Computes consistency metrics between day summary and task groups sum (FASE 23E-C3G Section 9).
 */
export function computeResourceDayTaskConsistency(
  groups: ResourceDayTaskGroup[],
  dayConfirmedMinutes: number,
  dayDraftMinutes: number
): {
  tasksConfirmedMinutes: number;
  tasksDraftMinutes: number;
  tasksPlannedMinutes: number;
  tasksConfirmedHours: number;
  tasksDraftHours: number;
  tasksPlannedHours: number;
  isConsistent: boolean;
} {
  let tasksConfirmedMinutes = 0;
  let tasksDraftMinutes = 0;

  for (const g of groups) {
    tasksConfirmedMinutes += g.confirmedMinutes;
    tasksDraftMinutes += g.draftMinutes;
  }

  const tasksPlannedMinutes = tasksConfirmedMinutes + tasksDraftMinutes;

  return {
    tasksConfirmedMinutes,
    tasksDraftMinutes,
    tasksPlannedMinutes,
    tasksConfirmedHours: tasksConfirmedMinutes / 60,
    tasksDraftHours: tasksDraftMinutes / 60,
    tasksPlannedHours: tasksPlannedMinutes / 60,
    isConsistent:
      tasksConfirmedMinutes === dayConfirmedMinutes &&
      tasksDraftMinutes === dayDraftMinutes,
  };
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

export interface TaskInvolvedResourceSummary {
  resourceId: string;
  resourceName: string;
  confirmedMinutes: number;
  draftMinutes: number;
  plannedMinutes: number;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  isAssignee: boolean;
}

export type TaskPlanningLoadStatus = 
  | 'SEM_PLANEAMENTO' 
  | 'PLANEAMENTO_PENDENTE' 
  | 'PLANEAMENTO_COMPLETO' 
  | 'EXCESSO';

/**
 * Returns the authoritative operational planning status of a task.
 * 
 * Priority:
 * 1. EXCESSO: if excessHours > 0
 * 2. SEM_PLANEAMENTO: if plannedHours === 0
 * 3. PLANEAMENTO_PENDENTE: if draftHours > 0 or plannedHours < estimatedHours
 * 4. PLANEAMENTO_COMPLETO: if plannedHours >= estimatedHours and excessHours === 0
 */
export function getTaskPlanningLoadStatus(summary: PlanningSummary): TaskPlanningLoadStatus {
  if (summary.excessHours > 0 || summary.isOverAllocated) {
    return 'EXCESSO';
  }
  if (summary.plannedHours === 0) {
    return 'SEM_PLANEAMENTO';
  }
  if (summary.draftHours > 0 || summary.remainingHours > 0) {
    return 'PLANEAMENTO_PENDENTE';
  }
  return 'PLANEAMENTO_COMPLETO';
}

/**
 * Consolidates all distinct resources involved in active (CONFIRMED + DRAFT) allocations for a task.
 * Excludes CANCELLED allocations.
 * 
 * Deterministic sorting:
 * 1. Higher CONFIRMED hours (descending)
 * 2. Higher DRAFT hours (descending)
 * 3. Resource Name (alphabetical pt-PT)
 */
export function groupTaskAllocationsByResource(
  allocations: PlanningAllocationDTO[] = [],
  users: any[] = [],
  assigneeIds: string[] = []
): TaskInvolvedResourceSummary[] {
  const activeAllocs = allocations.filter(a => a.status === 'CONFIRMED' || a.status === 'DRAFT');
  const resourceMap = new Map<string, { confirmedMinutes: number; draftMinutes: number }>();

  for (const a of activeAllocs) {
    const existing = resourceMap.get(a.resourceId) || { confirmedMinutes: 0, draftMinutes: 0 };
    const dur = a.durationMinutes || 0;
    if (a.status === 'CONFIRMED') {
      existing.confirmedMinutes += dur;
    } else if (a.status === 'DRAFT') {
      existing.draftMinutes += dur;
    }
    resourceMap.set(a.resourceId, existing);
  }

  const result: TaskInvolvedResourceSummary[] = [];

  resourceMap.forEach((totals, resId) => {
    const userObj = users.find(u => u.id === resId);
    const resourceName = userObj ? userObj.name : resId;
    const confirmedHours = totals.confirmedMinutes / 60;
    const draftHours = totals.draftMinutes / 60;
    const plannedHours = confirmedHours + draftHours;

    result.push({
      resourceId: resId,
      resourceName,
      confirmedMinutes: totals.confirmedMinutes,
      draftMinutes: totals.draftMinutes,
      plannedMinutes: totals.confirmedMinutes + totals.draftMinutes,
      confirmedHours,
      draftHours,
      plannedHours,
      isAssignee: assigneeIds.includes(resId),
    });
  });

  result.sort((a, b) => {
    if (b.confirmedHours !== a.confirmedHours) return b.confirmedHours - a.confirmedHours;
    if (b.draftHours !== a.draftHours) return b.draftHours - a.draftHours;
    return a.resourceName.localeCompare(b.resourceName, 'pt-PT');
  });

  return result;
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

export interface TaskDailyResourceImpact {
  resourceId: string;
  resourceName: string;
  isAssignee: boolean;
  confirmedMinutes: number;
  draftMinutes: number;
  plannedMinutes: number;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  allocations: PlanningAllocationDTO[];
}

export interface TaskDailyImpactGroup {
  date: string;
  dateLabel: string;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  percentageOfEstimate: number;
  resources: TaskDailyResourceImpact[];
}

export interface TaskPlanningImpact {
  totalPlannedDays: number;
  totalInvolvedResources: number;
  firstDate: string | null;
  firstDateLabel: string | null;
  lastDate: string | null;
  lastDateLabel: string | null;
  dailyGroups: TaskDailyImpactGroup[];
}

/**
 * Computes the daily planning impact of a task (FASE 23E-C3F).
 * 
 * Rules:
 * - Operates strictly on active allocations (CONFIRMED + DRAFT), excluding CANCELLED.
 * - Groups chronologically by date ascending.
 * - For each date, groups allocations by resource and aggregates confirmed, draft, and planned hours.
 * - Computes comparative metrics: total planned days, total involved resources, first and last planned date.
 * - Planning unit remains strictly RECURSO + DIA.
 */
export function computeTaskPlanningImpact(
  allocations: PlanningAllocationDTO[] = [],
  estimatedHoursInput?: string | number | null,
  users: any[] = [],
  assigneeIds: string[] = []
): TaskPlanningImpact {
  const activeAllocs = allocations.filter(a => a.status === 'CONFIRMED' || a.status === 'DRAFT');
  const estimatedHours = parseHoursToNumber(estimatedHoursInput);

  if (activeAllocs.length === 0) {
    return {
      totalPlannedDays: 0,
      totalInvolvedResources: 0,
      firstDate: null,
      firstDateLabel: null,
      lastDate: null,
      lastDateLabel: null,
      dailyGroups: [],
    };
  }

  const dateMap = new Map<string, PlanningAllocationDTO[]>();
  const resourceSet = new Set<string>();

  for (const a of activeAllocs) {
    const list = dateMap.get(a.date) || [];
    list.push(a);
    dateMap.set(a.date, list);
    resourceSet.add(a.resourceId);
  }

  const sortedDates = Array.from(dateMap.keys()).sort((a, b) => a.localeCompare(b));
  const firstDate = sortedDates[0] || null;
  const lastDate = sortedDates[sortedDates.length - 1] || null;

  const formatDateLabel = (dStr: string) => {
    try {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
      }
      return dStr;
    } catch {
      return dStr;
    }
  };

  const dailyGroups: TaskDailyImpactGroup[] = sortedDates.map(date => {
    const dayAllocs = dateMap.get(date) || [];
    let dayConfirmedMinutes = 0;
    let dayDraftMinutes = 0;

    const resMap = new Map<string, {
      confirmedMinutes: number;
      draftMinutes: number;
      allocs: PlanningAllocationDTO[];
    }>();

    for (const a of dayAllocs) {
      const dur = a.durationMinutes || 0;
      if (a.status === 'CONFIRMED') dayConfirmedMinutes += dur;
      if (a.status === 'DRAFT') dayDraftMinutes += dur;

      const existing = resMap.get(a.resourceId) || {
        confirmedMinutes: 0,
        draftMinutes: 0,
        allocs: [],
      };
      if (a.status === 'CONFIRMED') existing.confirmedMinutes += dur;
      if (a.status === 'DRAFT') existing.draftMinutes += dur;
      existing.allocs.push(a);
      resMap.set(a.resourceId, existing);
    }

    const dayConfirmedHours = dayConfirmedMinutes / 60;
    const dayDraftHours = dayDraftMinutes / 60;
    const dayPlannedHours = dayConfirmedHours + dayDraftHours;
    const percentage = estimatedHours > 0 ? Math.min(100, Math.round((dayPlannedHours / estimatedHours) * 100)) : 0;

    const resources: TaskDailyResourceImpact[] = Array.from(resMap.entries()).map(([resId, data]) => {
      const userObj = users.find(u => u.id === resId);
      const resourceName = userObj ? userObj.name : resId;
      const confH = data.confirmedMinutes / 60;
      const drfH = data.draftMinutes / 60;

      // Sort allocations chronologically by startTime
      data.allocs.sort((a, b) => a.startTime.localeCompare(b.startTime));

      return {
        resourceId: resId,
        resourceName,
        isAssignee: assigneeIds.includes(resId),
        confirmedMinutes: data.confirmedMinutes,
        draftMinutes: data.draftMinutes,
        plannedMinutes: data.confirmedMinutes + data.draftMinutes,
        confirmedHours: confH,
        draftHours: drfH,
        plannedHours: confH + drfH,
        allocations: data.allocs,
      };
    });

    // Sort resources within day:
    // 1. Higher confirmed hours descending
    // 2. Higher draft hours descending
    // 3. Resource name alphabetical
    resources.sort((a, b) => {
      if (b.confirmedHours !== a.confirmedHours) return b.confirmedHours - a.confirmedHours;
      if (b.draftHours !== a.draftHours) return b.draftHours - a.draftHours;
      return a.resourceName.localeCompare(b.resourceName, 'pt-PT');
    });

    return {
      date,
      dateLabel: formatDateLabel(date),
      confirmedHours: dayConfirmedHours,
      draftHours: dayDraftHours,
      plannedHours: dayPlannedHours,
      percentageOfEstimate: percentage,
      resources,
    };
  });

  return {
    totalPlannedDays: sortedDates.length,
    totalInvolvedResources: resourceSet.size,
    firstDate,
    firstDateLabel: firstDate ? formatDateLabel(firstDate) : null,
    lastDate,
    lastDateLabel: lastDate ? formatDateLabel(lastDate) : null,
    dailyGroups,
  };
}

export interface ResourceDayProjectTaskDistribution {
  taskId: string;
  taskTitle: string;
  task: any | null;
  confirmedMinutes: number;
  draftMinutes: number;
  plannedMinutes: number;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  allocationCount: number;
}

export interface ResourceDayProjectDistribution {
  projectId: string;
  projectTitle: string;
  project: any | null;
  confirmedMinutes: number;
  draftMinutes: number;
  plannedMinutes: number;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  taskCount: number;
  allocationCount: number;
  percentageOfPlanned: number;
  tasks: ResourceDayProjectTaskDistribution[];
}

export interface ResourceDayProjectSummary {
  projects: ResourceDayProjectDistribution[];
  totalConfirmedMinutes: number;
  totalDraftMinutes: number;
  totalPlannedMinutes: number;
  totalConfirmedHours: number;
  totalDraftHours: number;
  totalPlannedHours: number;
  isConsistent: boolean;
}

/**
 * Computes the distribution of a resource's planned work on a specific day grouped by Project (FASE 23E-C3H).
 * 
 * Rules:
 * - Only considers CONFIRMED and DRAFT allocations for resourceId on dateStr.
 * - Excludes CANCELLED allocations.
 * - Consolidates all tasks and allocations of each project.
 * - Each project appears only once.
 * - percentageOfPlanned = (project.plannedMinutes / totalPlannedMinutes) * 100 (load percentage, NOT capacity!).
 * - Deterministic sorting:
 *   1. Higher plannedMinutes (descending)
 *   2. Higher confirmedMinutes (descending)
 *   3. Higher draftMinutes (descending)
 *   4. Project name alphabetically ('pt-PT')
 * - Allocations without matched project are categorized under "Projeto não identificado".
 */
export function computeResourceDayProjectDistribution(
  resourceId: string,
  dateStr: string,
  allocations: PlanningAllocationDTO[] = [],
  tasks: any[] = [],
  projects: any[] = []
): ResourceDayProjectSummary {
  const activeAllocs = allocations.filter(
    a => a.resourceId === resourceId && a.date === dateStr && (a.status === 'CONFIRMED' || a.status === 'DRAFT')
  );

  let totalConfirmedMinutes = 0;
  let totalDraftMinutes = 0;

  for (const a of activeAllocs) {
    const dur = a.durationMinutes || 0;
    if (a.status === 'CONFIRMED') totalConfirmedMinutes += dur;
    if (a.status === 'DRAFT') totalDraftMinutes += dur;
  }

  const totalPlannedMinutes = totalConfirmedMinutes + totalDraftMinutes;

  // Group allocations by Project -> Task
  const projectMap = new Map<string, {
    projectId: string;
    projectTitle: string;
    projectObj: any | null;
    taskMap: Map<string, {
      taskId: string;
      taskTitle: string;
      taskObj: any | null;
      confirmedMinutes: number;
      draftMinutes: number;
      allocationCount: number;
    }>;
  }>();

  for (const a of activeAllocs) {
    const dur = a.durationMinutes || 0;
    const matchedTask = tasks.find(t => t.id === a.taskId) || (a as any).task || null;
    const taskProjectId = matchedTask?.projectId;
    const matchedProject = taskProjectId ? projects.find(p => p.id === taskProjectId) || (matchedTask as any)?.project || (a as any)?.project || null : null;

    const projectId = matchedProject?.id || (taskProjectId || 'unidentified');
    const projectTitle = matchedProject?.title || (projectId === 'unidentified' ? 'Projeto não identificado' : 'Projeto sem título');

    let projEntry = projectMap.get(projectId);
    if (!projEntry) {
      projEntry = {
        projectId,
        projectTitle,
        projectObj: matchedProject,
        taskMap: new Map(),
      };
      projectMap.set(projectId, projEntry);
    }

    const taskId = a.taskId || (matchedTask ? matchedTask.id : 'unknown_task');
    const taskTitle = matchedTask ? (matchedTask.title || 'Tarefa sem título') : 'Tarefa não identificada';

    let taskEntry = projEntry.taskMap.get(taskId);
    if (!taskEntry) {
      taskEntry = {
        taskId,
        taskTitle,
        taskObj: matchedTask,
        confirmedMinutes: 0,
        draftMinutes: 0,
        allocationCount: 0,
      };
      projEntry.taskMap.set(taskId, taskEntry);
    }

    if (a.status === 'CONFIRMED') {
      taskEntry.confirmedMinutes += dur;
    } else if (a.status === 'DRAFT') {
      taskEntry.draftMinutes += dur;
    }
    taskEntry.allocationCount += 1;
  }

  const projectList: ResourceDayProjectDistribution[] = [];
  let sumProjectConfirmed = 0;
  let sumProjectDraft = 0;

  for (const entry of projectMap.values()) {
    let projConfirmedMinutes = 0;
    let projDraftMinutes = 0;
    let projAllocationCount = 0;

    const tasksList: ResourceDayProjectTaskDistribution[] = [];

    for (const t of entry.taskMap.values()) {
      projConfirmedMinutes += t.confirmedMinutes;
      projDraftMinutes += t.draftMinutes;
      projAllocationCount += t.allocationCount;

      const tPlannedMinutes = t.confirmedMinutes + t.draftMinutes;
      tasksList.push({
        taskId: t.taskId,
        taskTitle: t.taskTitle,
        task: t.taskObj,
        confirmedMinutes: t.confirmedMinutes,
        draftMinutes: t.draftMinutes,
        plannedMinutes: tPlannedMinutes,
        confirmedHours: t.confirmedMinutes / 60,
        draftHours: t.draftMinutes / 60,
        plannedHours: tPlannedMinutes / 60,
        allocationCount: t.allocationCount,
      });
    }

    // Sort tasks within project: 1. Higher planned, 2. Higher confirmed, 3. Task title
    tasksList.sort((a, b) => {
      if (b.plannedMinutes !== a.plannedMinutes) return b.plannedMinutes - a.plannedMinutes;
      if (b.confirmedMinutes !== a.confirmedMinutes) return b.confirmedMinutes - a.confirmedMinutes;
      return a.taskTitle.localeCompare(b.taskTitle, 'pt-PT');
    });

    const projPlannedMinutes = projConfirmedMinutes + projDraftMinutes;
    const percentage = totalPlannedMinutes > 0
      ? Math.round((projPlannedMinutes / totalPlannedMinutes) * 100)
      : 0;

    sumProjectConfirmed += projConfirmedMinutes;
    sumProjectDraft += projDraftMinutes;

    projectList.push({
      projectId: entry.projectId,
      projectTitle: entry.projectTitle,
      project: entry.projectObj,
      confirmedMinutes: projConfirmedMinutes,
      draftMinutes: projDraftMinutes,
      plannedMinutes: projPlannedMinutes,
      confirmedHours: projConfirmedMinutes / 60,
      draftHours: projDraftMinutes / 60,
      plannedHours: projPlannedMinutes / 60,
      taskCount: entry.taskMap.size,
      allocationCount: projAllocationCount,
      percentageOfPlanned: percentage,
      tasks: tasksList,
    });
  }

  // Deterministic sorting of projects (FASE 23E-C3H Requirement 12):
  // 1. Higher plannedMinutes (descending)
  // 2. Higher confirmedMinutes (descending)
  // 3. Higher draftMinutes (descending)
  // 4. Project name ('pt-PT')
  projectList.sort((a, b) => {
    if (b.plannedMinutes !== a.plannedMinutes) return b.plannedMinutes - a.plannedMinutes;
    if (b.confirmedMinutes !== a.confirmedMinutes) return b.confirmedMinutes - a.confirmedMinutes;
    if (b.draftMinutes !== a.draftMinutes) return b.draftMinutes - a.draftMinutes;
    return a.projectTitle.localeCompare(b.projectTitle, 'pt-PT');
  });

  const isConsistent = 
    sumProjectConfirmed === totalConfirmedMinutes &&
    sumProjectDraft === totalDraftMinutes &&
    (sumProjectConfirmed + sumProjectDraft) === totalPlannedMinutes;

  return {
    projects: projectList,
    totalConfirmedMinutes,
    totalDraftMinutes,
    totalPlannedMinutes,
    totalConfirmedHours: totalConfirmedMinutes / 60,
    totalDraftHours: totalDraftMinutes / 60,
    totalPlannedHours: totalPlannedMinutes / 60,
    isConsistent,
  };
}

export interface ProjectPlanningTaskDistribution {
  taskId: string;
  taskTitle: string;
  task: any | null;
  estimatedHours?: number;
  confirmedMinutes: number;
  draftMinutes: number;
  plannedMinutes: number;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  remainingHours?: number;
  allocationCount: number;
}

export interface ProjectPlanningResourceDistribution {
  resourceId: string;
  resourceName: string;
  resource: any | null;
  isAssignee?: boolean;
  confirmedMinutes: number;
  draftMinutes: number;
  plannedMinutes: number;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  taskCount: number;
  allocationCount: number;
  tasks: ProjectPlanningTaskDistribution[];
}

export interface ProjectPlanningDayDistribution {
  date: string;
  dateLabel: string;
  confirmedMinutes: number;
  draftMinutes: number;
  plannedMinutes: number;
  confirmedHours: number;
  draftHours: number;
  plannedHours: number;
  resourceCount: number;
  taskCount: number;
  allocationCount: number;
  resources: ProjectPlanningResourceDistribution[];
}

export type ProjectPlanningStatus = 
  | 'SEM_PLANEAMENTO' 
  | 'DRAFT' 
  | 'PARCIALMENTE_CONFIRMADO' 
  | 'CONFIRMADO';

export interface ProjectPlanningSummary {
  projectId: string;
  projectTitle: string;
  project: any | null;
  status: ProjectPlanningStatus;
  statusLabel: string;
  
  totalConfirmedMinutes: number;
  totalDraftMinutes: number;
  totalPlannedMinutes: number;
  totalConfirmedHours: number;
  totalDraftHours: number;
  totalPlannedHours: number;
  
  daysCount: number;
  resourcesCount: number;
  tasksCount: number;
  allocationsCount: number;
  
  firstDate: string | null;
  lastDate: string | null;
  periodLabel: string | null;
  
  days: ProjectPlanningDayDistribution[];
  isConsistent: boolean;
}

/**
 * Computes the consolidated daily planning impact of a Project across time (FASE 23E-C3I).
 * Structure: Projeto -> Dia -> Recurso -> Tarefa
 * 
 * Rules:
 * - Only considers CONFIRMED and DRAFT allocations for the specified project.
 * - Excludes CANCELLED allocations from operational totals.
 * - Deterministic sorting:
 *   1. Date ascending
 *   2. Resource name alphabetically ('pt-PT')
 *   3. Task planned load descending, then confirmed descending, then task title ('pt-PT')
 * - Resources count is unique across the whole project.
 * - Does NOT assign or calculate resource capacity excess to the project.
 * - Strict mathematical consistency validation.
 */
export function computeProjectPlanningImpact(
  projectId: string,
  allocations: PlanningAllocationDTO[] = [],
  tasks: any[] = [],
  users: any[] = [],
  projects: any[] = []
): ProjectPlanningSummary {
  const projectObj = projects.find(p => p.id === projectId) || null;
  const projectTitle = projectObj?.title || (projectId === 'unidentified' ? 'Projeto não identificado' : 'Projeto sem título');

  // Filter allocations that belong to this projectId and are active (CONFIRMED or DRAFT)
  const projectAllocations = allocations.filter(a => {
    if (!a || (a.status !== 'CONFIRMED' && a.status !== 'DRAFT')) return false;

    const matchedTask = tasks.find(t => t.id === a.taskId) || (a as any).task || null;
    const taskProjectId = matchedTask?.projectId || (a as any).projectId || (matchedTask as any)?.project?.id || (a as any).project?.id;

    if (taskProjectId === projectId) return true;
    if (!taskProjectId && a.taskId && tasks.some(t => t.id === a.taskId && t.projectId === projectId)) return true;
    if (projectId === 'unidentified' && !taskProjectId) return true;

    return false;
  });

  let totalConfirmedMinutes = 0;
  let totalDraftMinutes = 0;
  const uniqueDatesSet = new Set<string>();
  const uniqueResourcesSet = new Set<string>();
  const uniqueTasksSet = new Set<string>();

  for (const a of projectAllocations) {
    const dur = a.durationMinutes || 0;
    if (a.status === 'CONFIRMED') totalConfirmedMinutes += dur;
    if (a.status === 'DRAFT') totalDraftMinutes += dur;

    if (a.date) uniqueDatesSet.add(a.date);
    if (a.resourceId) uniqueResourcesSet.add(a.resourceId);
    if (a.taskId) uniqueTasksSet.add(a.taskId);
    else uniqueTasksSet.add('unidentified_task');
  }

  const totalPlannedMinutes = totalConfirmedMinutes + totalDraftMinutes;
  const totalConfirmedHours = totalConfirmedMinutes / 60;
  const totalDraftHours = totalDraftMinutes / 60;
  const totalPlannedHours = totalPlannedMinutes / 60;

  // Status computation
  let status: ProjectPlanningStatus = 'SEM_PLANEAMENTO';
  let statusLabel = 'Sem planeamento';

  if (totalPlannedMinutes === 0) {
    status = 'SEM_PLANEAMENTO';
    statusLabel = 'Sem planeamento';
  } else if (totalConfirmedMinutes === 0 && totalDraftMinutes > 0) {
    status = 'DRAFT';
    statusLabel = 'Planeamento em DRAFT';
  } else if (totalConfirmedMinutes > 0 && totalDraftMinutes > 0) {
    status = 'PARCIALMENTE_CONFIRMADO';
    statusLabel = 'Planeamento parcialmente confirmado';
  } else {
    status = 'CONFIRMADO';
    statusLabel = 'Planeamento confirmado';
  }

  // Sorted unique dates for period calculation
  const sortedDates = Array.from(uniqueDatesSet).sort((a, b) => a.localeCompare(b));
  const firstDate = sortedDates.length > 0 ? sortedDates[0] : null;
  const lastDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

  const formatDatePT = (dStr: string) => {
    try {
      const [y, m, d] = dStr.split('-');
      if (y && m && d) return `${d}/${m}/${y}`;
      return dStr;
    } catch {
      return dStr;
    }
  };

  let periodLabel: string | null = null;
  if (sortedDates.length === 1 && firstDate) {
    periodLabel = formatDatePT(firstDate);
  } else if (sortedDates.length > 1 && firstDate && lastDate) {
    periodLabel = `${formatDatePT(firstDate)} → ${formatDatePT(lastDate)}`;
  }

  // Group by Date -> Resource -> Task
  const dateMap = new Map<string, {
    date: string;
    resourceMap: Map<string, {
      resourceId: string;
      resourceName: string;
      resourceObj: any | null;
      taskMap: Map<string, {
        taskId: string;
        taskTitle: string;
        taskObj: any | null;
        estimatedHours?: number;
        confirmedMinutes: number;
        draftMinutes: number;
        allocationCount: number;
      }>;
    }>;
  }>();

  for (const a of projectAllocations) {
    const dur = a.durationMinutes || 0;
    const dateStr = a.date;
    if (!dateStr) continue;

    let dateEntry = dateMap.get(dateStr);
    if (!dateEntry) {
      dateEntry = {
        date: dateStr,
        resourceMap: new Map(),
      };
      dateMap.set(dateStr, dateEntry);
    }

    const resId = a.resourceId || 'unknown_resource';
    const userObj = users.find(u => u.id === resId) || null;
    const resName = userObj ? userObj.name : (resId === 'unknown_resource' || !resId || resId.startsWith('unknown') ? 'Recurso não identificado' : resId);

    let resEntry = dateEntry.resourceMap.get(resId);
    if (!resEntry) {
      resEntry = {
        resourceId: resId,
        resourceName: resName,
        resourceObj: userObj,
        taskMap: new Map(),
      };
      dateEntry.resourceMap.set(resId, resEntry);
    }

    const matchedTask = tasks.find(t => t.id === a.taskId) || (a as any).task || null;
    const taskId = a.taskId || (matchedTask ? matchedTask.id : 'unknown_task');
    const taskTitle = matchedTask ? (matchedTask.title || 'Tarefa sem título') : 'Tarefa não identificada';
    const estimatedHours = matchedTask?.estimatedHours ? parseHoursToNumber(matchedTask.estimatedHours) : undefined;

    let taskEntry = resEntry.taskMap.get(taskId);
    if (!taskEntry) {
      taskEntry = {
        taskId,
        taskTitle,
        taskObj: matchedTask,
        estimatedHours,
        confirmedMinutes: 0,
        draftMinutes: 0,
        allocationCount: 0,
      };
      resEntry.taskMap.set(taskId, taskEntry);
    }

    if (a.status === 'CONFIRMED') {
      taskEntry.confirmedMinutes += dur;
    } else if (a.status === 'DRAFT') {
      taskEntry.draftMinutes += dur;
    }
    taskEntry.allocationCount += 1;
  }

  // Construct day distributions
  const daysList: ProjectPlanningDayDistribution[] = [];
  let sumDaysConfirmed = 0;
  let sumDaysDraft = 0;

  for (const dStr of sortedDates) {
    const dateEntry = dateMap.get(dStr);
    if (!dateEntry) continue;

    let dayConfirmedMinutes = 0;
    let dayDraftMinutes = 0;
    let dayAllocationCount = 0;
    const dayTasksSet = new Set<string>();

    const resourcesList: ProjectPlanningResourceDistribution[] = [];

    for (const rEntry of dateEntry.resourceMap.values()) {
      let resConfirmedMinutes = 0;
      let resDraftMinutes = 0;
      let resAllocationCount = 0;

      const tasksList: ProjectPlanningTaskDistribution[] = [];

      for (const tEntry of rEntry.taskMap.values()) {
        resConfirmedMinutes += tEntry.confirmedMinutes;
        resDraftMinutes += tEntry.draftMinutes;
        resAllocationCount += tEntry.allocationCount;
        dayTasksSet.add(tEntry.taskId);

        const tPlannedMinutes = tEntry.confirmedMinutes + tEntry.draftMinutes;
        const tPlannedHours = tPlannedMinutes / 60;
        const remainingHours = tEntry.estimatedHours !== undefined
          ? Math.max(0, tEntry.estimatedHours - tPlannedHours)
          : undefined;

        tasksList.push({
          taskId: tEntry.taskId,
          taskTitle: tEntry.taskTitle,
          task: tEntry.taskObj,
          estimatedHours: tEntry.estimatedHours,
          confirmedMinutes: tEntry.confirmedMinutes,
          draftMinutes: tEntry.draftMinutes,
          plannedMinutes: tPlannedMinutes,
          confirmedHours: tEntry.confirmedMinutes / 60,
          draftHours: tEntry.draftMinutes / 60,
          plannedHours: tPlannedHours,
          remainingHours,
          allocationCount: tEntry.allocationCount,
        });
      }

      // Sort tasks within resource: 1. Higher planned, 2. Higher confirmed, 3. Task title ('pt-PT')
      tasksList.sort((a, b) => {
        if (b.plannedMinutes !== a.plannedMinutes) return b.plannedMinutes - a.plannedMinutes;
        if (b.confirmedMinutes !== a.confirmedMinutes) return b.confirmedMinutes - a.confirmedMinutes;
        return a.taskTitle.localeCompare(b.taskTitle, 'pt-PT');
      });

      const resPlannedMinutes = resConfirmedMinutes + resDraftMinutes;
      dayConfirmedMinutes += resConfirmedMinutes;
      dayDraftMinutes += resDraftMinutes;
      dayAllocationCount += resAllocationCount;

      resourcesList.push({
        resourceId: rEntry.resourceId,
        resourceName: rEntry.resourceName,
        resource: rEntry.resourceObj,
        confirmedMinutes: resConfirmedMinutes,
        draftMinutes: resDraftMinutes,
        plannedMinutes: resPlannedMinutes,
        confirmedHours: resConfirmedMinutes / 60,
        draftHours: resDraftMinutes / 60,
        plannedHours: resPlannedMinutes / 60,
        taskCount: tasksList.length,
        allocationCount: resAllocationCount,
        tasks: tasksList,
      });
    }

    // Sort resources within day: Resource name alphabetically ('pt-PT')
    resourcesList.sort((a, b) => a.resourceName.localeCompare(b.resourceName, 'pt-PT'));

    const dayPlannedMinutes = dayConfirmedMinutes + dayDraftMinutes;
    sumDaysConfirmed += dayConfirmedMinutes;
    sumDaysDraft += dayDraftMinutes;

    // Date Label (e.g. "15 de setembro")
    let dateLabel = dStr;
    try {
      const dt = new Date(dStr + 'T00:00:00');
      dateLabel = dt.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
    } catch {
      dateLabel = dStr;
    }

    daysList.push({
      date: dStr,
      dateLabel,
      confirmedMinutes: dayConfirmedMinutes,
      draftMinutes: dayDraftMinutes,
      plannedMinutes: dayPlannedMinutes,
      confirmedHours: dayConfirmedMinutes / 60,
      draftHours: dayDraftMinutes / 60,
      plannedHours: dayPlannedMinutes / 60,
      resourceCount: resourcesList.length,
      taskCount: dayTasksSet.size,
      allocationCount: dayAllocationCount,
      resources: resourcesList,
    });
  }

  const isConsistent = 
    sumDaysConfirmed === totalConfirmedMinutes &&
    sumDaysDraft === totalDraftMinutes &&
    (sumDaysConfirmed + sumDaysDraft) === totalPlannedMinutes;

  return {
    projectId,
    projectTitle,
    project: projectObj,
    status,
    statusLabel,
    totalConfirmedMinutes,
    totalDraftMinutes,
    totalPlannedMinutes,
    totalConfirmedHours: totalConfirmedMinutes / 60,
    totalDraftHours: totalDraftMinutes / 60,
    totalPlannedHours: totalPlannedMinutes / 60,
    daysCount: uniqueDatesSet.size,
    resourcesCount: uniqueResourcesSet.size,
    tasksCount: uniqueTasksSet.size,
    allocationsCount: projectAllocations.length,
    firstDate,
    lastDate,
    periodLabel,
    days: daysList,
    isConsistent,
  };
}

