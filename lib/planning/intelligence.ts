export type PlanningLevel = 'blocking' | 'critical' | 'warning' | 'info' | 'undetermined';
export type DayHalf = 'am' | 'pm';

export interface PlanningBlock { taskId: string; userId: string; date: string; half: DayHalf }
export interface PlanningTask {
  id: string; title: string; projectId: string | null; estimatedDate: string | null;
  assigneeIds: string[]; version: number; deleted?: boolean; statusId?: string;
  completedDate?: string | null;
  executionLocationKind?: 'inherit' | 'site' | 'company' | 'remote' | 'unknown';
  executionSiteId?: string | null;
}
export interface PlanningPerson { id: string; name: string; deleted?: boolean; approved?: boolean }
export interface PlanningAbsence { userId: string; start: string; end: string; fullDay?: boolean }
export interface PlanningSchedule { userId: string; weekday: number; halves: DayHalf[] }
export interface PlanningFinding {
  code: 'ABSENT' | 'OVER_CAPACITY' | 'LEGACY_TASK' | 'UNKNOWN_SCHEDULE' | 'ADJACENT_TASK' | 'SAME_DAY_TASK';
  level: PlanningLevel; evidenceTaskIds: string[]; date: string;
}

function adjacent(date: string, offset: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function evaluatePersonDay(input: {
  person: PlanningPerson; date: string; tasks: PlanningTask[]; blocks: PlanningBlock[];
  absences: PlanningAbsence[]; schedules: PlanningSchedule[]; candidateTaskId?: string;
  candidateHalves?: DayHalf[];
}) {
  const { person, date, tasks, blocks, absences, schedules, candidateTaskId } = input;
  const active = tasks.filter(task => !task.deleted);
  const relevant = blocks.filter(block => block.userId === person.id && block.date === date && active.some(t => t.id === block.taskId));
  const taskIds = [...new Set(relevant.map(block => block.taskId))];
  const legacy = active.filter(task => task.assigneeIds.includes(person.id) && task.estimatedDate === date && !blocks.some(block => block.taskId === task.id));
  const absent = absences.some(abs => abs.userId === person.id && abs.fullDay !== false && abs.start <= date && abs.end >= date);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  const schedule = schedules.find(s => s.userId === person.id && s.weekday === weekday);
  const available = schedule ? [...new Set(schedule.halves)] : null;
  const occupied = [...new Set(relevant.map(block => block.half))];
  const findings: PlanningFinding[] = [];
  if (absent) findings.push({ code: 'ABSENT', level: 'blocking', evidenceTaskIds: taskIds, date });
  if (!available) findings.push({ code: 'UNKNOWN_SCHEDULE', level: 'undetermined', evidenceTaskIds: [], date });
  if (legacy.length) findings.push({ code: 'LEGACY_TASK', level: 'undetermined', evidenceTaskIds: legacy.map(t => t.id), date });
  if (schedule && occupied.some(half => !available!.includes(half))) findings.push({ code: 'OVER_CAPACITY', level: 'critical', evidenceTaskIds: taskIds, date });
  if (taskIds.length > 1) findings.push({ code: 'SAME_DAY_TASK', level: 'info', evidenceTaskIds: taskIds, date });
  const adjacentDates = [adjacent(date, -1), adjacent(date, 1)];
  const adjacentTaskIds = [...new Set(active.filter(task => task.assigneeIds.includes(person.id) &&
    (adjacentDates.includes(task.estimatedDate || '') || blocks.some(block =>
      block.taskId === task.id && block.userId === person.id && adjacentDates.includes(block.date)))).map(task => task.id))];
  if (adjacentTaskIds.length) findings.push({ code: 'ADJACENT_TASK', level: 'info', evidenceTaskIds: adjacentTaskIds, date });
  const candidate = input.candidateHalves || [];
  if (candidate.length && schedule && candidate.some(half => !available!.includes(half) || relevant.some(block => block.half === half && block.taskId !== candidateTaskId))) {
    findings.push({ code: 'OVER_CAPACITY', level: 'critical', evidenceTaskIds: taskIds, date });
  }
  return {
    userId: person.id, date, capacityHalves: absent ? 0 : available?.length ?? null,
    occupiedHalves: occupied.length, taskIds, adjacentTaskIds, findings,
    quality: available && !legacy.length ? 'known' as const : 'incomplete' as const,
  };
}
