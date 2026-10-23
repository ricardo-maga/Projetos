import type { Client, Project, ProjectRiskItem, Task } from './types';
import { addCivilDays, formatDateToYYYYMMDD, getCivilDaysDifference, isTaskOnDate, normalizeDateStr } from './operationalCalendar';

export type TimelineHorizon = 7 | 14 | 21 | 28 | 'all';
export type ProjectTimelineEvent =
  | { kind: 'task'; date: string; title: string; task: Task }
  | { kind: 'milestone'; date: string; title: string }
  | { kind: 'risk'; date: string; title: string; risk: ProjectRiskItem };
export type ProjectTimelineEvents = Map<string, Map<string, ProjectTimelineEvent[]>>;

export function getOtherTimelineTasks(tasks: Task[], date: string): Task[] {
  return tasks.filter(task => !task.projectId && isTaskOnDate(task, date));
}

export function canDropTimelineTask(task: Task, targetProjectId: string | null): boolean {
  return !task.deleted && (!task.projectId || task.projectId === targetProjectId);
}

export function computeTimelineTaskDropUpdates(task: Task, targetDate: string, targetProjectId: string | null): Partial<Task> | null {
  const date = normalizeDateStr(targetDate);
  if (!date || !canDropTimelineTask(task, targetProjectId)) return null;
  const start = normalizeDateStr(task.startDate);
  const end = normalizeDateStr(task.endDate);
  const currentDate = start && end ? start : normalizeDateStr(task.estimatedDate);
  const updates: Partial<Task> = {};
  if (currentDate !== date) {
    updates.estimatedDate = date;
    if (start && end) {
      updates.startDate = date;
      updates.endDate = addCivilDays(date, Math.max(0, getCivilDaysDifference(start, end)));
    } else if (start || end) {
      updates.startDate = date;
      updates.endDate = date;
    }
  }
  if (!task.projectId && targetProjectId) updates.projectId = targetProjectId;
  return Object.keys(updates).length ? updates : null;
}

// Presentation-only index; task dates continue to obey the operational helper.
export function buildProjectTimelineEvents(projects: Project[], tasks: Task[], risks: ProjectRiskItem[], includeRiskReviews: boolean): ProjectTimelineEvents {
  const index: ProjectTimelineEvents = new Map();
  const activeIds = new Set(projects.filter(p => !p.deleted).map(p => p.id));
  const add = (projectId: string, event: ProjectTimelineEvent) => {
    if (!event.date || !activeIds.has(projectId)) return;
    const dates = index.get(projectId) || new Map<string, ProjectTimelineEvent[]>();
    dates.set(event.date, [...(dates.get(event.date) || []), event]);
    index.set(projectId, dates);
  };
  for (const p of projects.filter(p => !p.deleted)) {
    for (const [raw, title] of [[p.startDate, 'Início de projeto'], [p.scheduledDate, 'Agendamento / Instalação'],
      [p.estimatedDate, 'Previsão de entrega real'], [p.deliveryDate, 'Prazo de entrega']]) {
      add(p.id, { kind: 'milestone', date: normalizeDateStr(raw), title });
    }
  }
  for (const task of tasks) {
    const start = normalizeDateStr(task.startDate), end = normalizeDateStr(task.endDate);
    const date = start && end ? start : normalizeDateStr(task.estimatedDate);
    if (task.projectId && isTaskOnDate(task, date)) add(task.projectId, { kind: 'task', date, title: task.title, task });
  }
  if (includeRiskReviews) for (const risk of risks.filter(r => !r.deleted)) {
    add(risk.projectId, { kind: 'risk', date: normalizeDateStr(risk.reviewDate), title: risk.title, risk });
  }
  return index;
}

export function filterProjectTimeline(projects: Project[], clients: Client[], statuses: { id: string; scale?: number }[], events: ProjectTimelineEvents,
  options: { search: string; horizon: TimelineHorizon; showCompleted: boolean }, now = new Date()) {
  const today = formatDateToYYYYMMDD(now);
  const end = new Date(now); end.setDate(end.getDate() + (options.horizon === 'all' ? 0 : options.horizon - 1));
  const last = formatDateToYYYYMMDD(end);
  const query = options.search.trim().toLocaleLowerCase('pt-PT');
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const statusMap = new Map(statuses.map(s => [s.id, s.scale]));
  return projects.filter(p => {
    const scale = statusMap.get(p.statusId) ?? 0;
    if (p.deleted || !(scale >= 1 && scale <= 4 || options.showCompleted && scale >= 5)) return false;
    const client = clientMap.get(p.clientId);
    if (query && !`${p.title} ${client?.clientName || ''} ${client?.shortName || ''} ${p.installProjectNo || ''}`.toLocaleLowerCase('pt-PT').includes(query)) return false;
    return options.horizon === 'all' || [...(events.get(p.id)?.keys() || [])].some(date => date >= today && date <= last);
  });
}
