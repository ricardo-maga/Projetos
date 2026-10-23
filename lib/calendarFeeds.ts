import { addCivilDays, normalizeDateStr } from './operationalCalendar';
import { getUserInitials } from './utils';

export type CalendarFeedScope = 'mine' | 'all';

export interface FeedTask {
  id: string;
  project_id: string | null;
  task_title: string;
  start_date: string | null;
  end_date: string | null;
  estimated_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  version: number | null;
  assigneeIds: string[];
}

export interface FeedProject {
  id: string;
  client_id: string | null;
  install_project_no: string | null;
  deleted: boolean | null;
  updated_at: string | null;
}

export interface FeedClient {
  id: string;
  client_name: string | null;
  deleted: boolean | null;
  updated_at: string | null;
}

export interface FeedUser { id: string; name: string; updated_at: string | null }

export function taskCalendarDate(task: Pick<FeedTask, 'start_date' | 'end_date' | 'estimated_date'>): string {
  const date = task.start_date && task.end_date ? task.start_date : task.estimated_date;
  const normalized = normalizeDateStr(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const timestamp = Date.parse(`${normalized}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === normalized ? normalized : '';
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function fold(line: string): string {
  const result: string[] = [];
  let part = '';
  for (const char of line) {
    if (Buffer.byteLength(part + char, 'utf8') > (result.length ? 74 : 75)) {
      result.push(part);
      part = ' ';
    }
    part += char;
  }
  result.push(part);
  return result.join('\r\n');
}

function stamp(value?: string | null): string {
  const parsed = value ? new Date(value) : new Date(0);
  return (Number.isNaN(parsed.getTime()) ? new Date(0) : parsed).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function renderCalendarFeed(input: {
  scope: CalendarFeedScope;
  ownerId: string;
  tasks: FeedTask[];
  projects: FeedProject[];
  clients: FeedClient[];
  users: FeedUser[];
}): string {
  const projectMap = new Map(input.projects.map(project => [project.id, project]));
  const clientMap = new Map(input.clients.map(client => [client.id, client]));
  const userMap = new Map(input.users.map(user => [user.id, user]));
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Material3//Task Calendars//PT',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(input.scope === 'mine' ? 'As minhas tarefas' : 'Todas as tarefas')}`,
  ];

  for (const task of input.tasks) {
    const date = taskCalendarDate(task);
    if (!date || (input.scope === 'mine' && !task.assigneeIds.includes(input.ownerId))) continue;
    const project = task.project_id ? projectMap.get(task.project_id) : undefined;
    const client = project?.client_id ? clientMap.get(project.client_id) : undefined;
    const clientName = client?.client_name?.trim() || 'Sem cliente';
    const ip = project?.install_project_no?.trim() || 'Sem IP';
    const names = [...new Set(task.assigneeIds)].map(id => userMap.get(id)?.name).filter((name): name is string => Boolean(name));
    const prefix = names.length ? `[${names.map(getUserInitials).join(', ')}] ` : '[-] ';
    const summary = `${input.scope === 'all' ? prefix : ''}${clientName} - ${task.task_title} (${ip})`;
    const changed = [task.updated_at, project?.updated_at, client?.updated_at,
      ...task.assigneeIds.map(id => userMap.get(id)?.updated_at)]
      .filter((value): value is string => Boolean(value)).sort().at(-1) || task.created_at;
    lines.push('BEGIN:VEVENT',
      `UID:${task.id}-${input.scope}@material3.calendar`,
      `DTSTAMP:${stamp(changed)}`,
      `LAST-MODIFIED:${stamp(changed)}`,
      `SEQUENCE:${Math.max(0, Number(task.version) || 0)}`,
      `DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addCivilDays(date, 1).replace(/-/g, '')}`,
      `SUMMARY:${escapeText(summary)}`,
      'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
