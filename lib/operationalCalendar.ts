import { Task, Project, User, UserAbsence } from './types';

export interface CalendarDayItem {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  weekdayShort: string; // Seg, Ter, Qua...
  weekdayFull: string;
  monthShort: string;
  year: number;
  isToday: boolean;
  isWeekend: boolean;
}

export interface DayConflictInfo {
  hasConflict: boolean;
  isAbsent: boolean;
  hasMultipleTasks: boolean;
  taskCount: number;
  badgeText?: string;
  tooltipText?: string;
}

/**
 * Normalizes a date or date string to YYYY-MM-DD
 */
export function normalizeDateStr(d?: string | null): string {
  if (!d) return '';
  return d.trim().slice(0, 10);
}

/**
 * Returns the YYYY-MM-DD string for a Date instance in local time
 */
export function formatDateToYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Finds the Monday of the week containing the given date
 */
export function getMondayOfWeek(d: Date): Date {
  const result = new Date(d);
  result.setHours(12, 0, 0, 0); // Avoid midnight DST boundary issues
  const day = result.getDay(); // 0 is Sunday, 1 is Monday, ... 6 is Saturday
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

/**
 * Generates continuous calendar days starting from Monday of the week
 */
export function getOperationalCalendarDays(
  anchorDate: Date,
  periodDays: 7 | 14 = 7,
  alignToMonday: boolean = true
): CalendarDayItem[] {
  const start = alignToMonday ? getMondayOfWeek(anchorDate) : new Date(anchorDate);
  start.setHours(12, 0, 0, 0);

  const todayStr = formatDateToYYYYMMDD(new Date());
  const days: CalendarDayItem[] = [];

  for (let i = 0; i < periodDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = formatDateToYYYYMMDD(d);
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const weekdayShort = d.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '');
    const weekdayFull = d.toLocaleDateString('pt-PT', { weekday: 'long' });
    const monthShort = d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '');

    days.push({
      date: d,
      dateStr,
      dayNum: d.getDate(),
      weekdayShort: weekdayShort.charAt(0).toUpperCase() + weekdayShort.slice(1),
      weekdayFull: weekdayFull.charAt(0).toUpperCase() + weekdayFull.slice(1),
      monthShort: monthShort.charAt(0).toUpperCase() + monthShort.slice(1),
      year: d.getFullYear(),
      isToday: dateStr === todayStr,
      isWeekend,
    });
  }

  return days;
}

/**
 * Formats a readable interval label in Portuguese
 * e.g., "22 a 28 de setembro de 2026 (7 dias)"
 */
export function formatOperationalDateRange(days: CalendarDayItem[]): string {
  if (days.length === 0) return '';
  const first = days[0];
  const last = days[days.length - 1];

  const firstMonth = first.date.toLocaleDateString('pt-PT', { month: 'long' });
  const lastMonth = last.date.toLocaleDateString('pt-PT', { month: 'long' });

  if (first.year === last.year) {
    if (firstMonth === lastMonth) {
      return `${first.dayNum} a ${last.dayNum} de ${firstMonth} de ${first.year} (${days.length} dias)`;
    }
    return `${first.dayNum} de ${firstMonth} a ${last.dayNum} de ${lastMonth} de ${first.year} (${days.length} dias)`;
  }

  return `${first.dayNum} de ${firstMonth} de ${first.year} a ${last.dayNum} de ${lastMonth} de ${last.year} (${days.length} dias)`;
}

/**
 * Checks whether a task is active and scheduled on the given date (YYYY-MM-DD)
 * Supports single dates and multi-day spans (startDate to endDate)
 */
export function isTaskOnDate(task: Task, dateStr: string): boolean {
  if (!task || task.deleted) return false;
  const targetDate = normalizeDateStr(dateStr);
  if (!targetDate) return false;

  const estDate = normalizeDateStr(task.estimatedDate);
  const startDate = normalizeDateStr(task.startDate);
  const endDate = normalizeDateStr(task.endDate);

  // Date span matches (startDate to endDate, or estDate to endDate)
  if (startDate && endDate) {
    return targetDate >= startDate && targetDate <= endDate;
  }
  if (estDate && endDate && endDate > estDate) {
    return targetDate >= estDate && targetDate <= endDate;
  }

  // Single date matches
  if (estDate && estDate === targetDate) return true;
  if (startDate && startDate === targetDate) return true;
  if (endDate && endDate === targetDate) return true;

  return false;
}

/**
 * Matches user id safely
 */
export function matchUserId(idA?: string | null, idB?: string | null): boolean {
  if (!idA || !idB) return false;
  if (idA === idB) return true;
  return idA.replace(/[-]/g, '').toLowerCase() === idB.replace(/[-]/g, '').toLowerCase();
}

/**
 * Checks whether a user is assigned to a task
 */
export function isUserAssignedToTask(task: Task, userId: string): boolean {
  if (!task) return false;
  const ids = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
  if (ids.some(aid => matchUserId(aid, userId))) return true;

  // Single assigneeId backwards compatibility
  const singleId = (task as any).assigneeId || (task as any).userId || (task as any).user_id;
  if (singleId && matchUserId(singleId, userId)) return true;

  return false;
}

/**
 * Returns active tasks for a specific user and date, applying optional project and status filters
 */
export function getUserDayTasks(
  tasks: Task[],
  userId: string,
  dateStr: string,
  filters?: { projectId?: string; statusId?: string }
): Task[] {
  if (!tasks || !Array.isArray(tasks)) return [];

  const seenIds = new Set<string>();
  const result: Task[] = [];

  for (const task of tasks) {
    if (task.deleted) continue;
    if (seenIds.has(task.id)) continue;

    if (!isUserAssignedToTask(task, userId)) continue;
    if (!isTaskOnDate(task, dateStr)) continue;

    if (filters?.projectId && task.projectId !== filters.projectId) continue;
    if (filters?.statusId && task.statusId !== filters.statusId) continue;

    seenIds.add(task.id);
    result.push(task);
  }

  return result;
}

/**
 * Finds user absence for a specific date
 */
export function getUserDayAbsence(absences: any[], userId: string, dateStr: string): any | undefined {
  if (!absences || !Array.isArray(absences)) return undefined;
  const targetDate = normalizeDateStr(dateStr);
  if (!targetDate) return undefined;

  return absences.find(abs => {
    if (abs.deleted) return false;
    const uMatch = matchUserId(abs.userId, userId) || matchUserId(abs.user_id, userId);
    if (!uMatch) return false;

    const rawStart = abs.absenceStartDate || abs.startDate || abs.start_date;
    const rawEnd = abs.absenceEndDate || abs.endDate || abs.end_date || rawStart;
    if (!rawStart) return false;

    const start = normalizeDateStr(rawStart);
    const end = normalizeDateStr(rawEnd || rawStart);

    return targetDate >= start && targetDate <= end;
  });
}

/**
 * Detects conflicts for a user on a given day:
 * - Absent with assigned tasks
 * - Multiple tasks on the same day
 * - Absence
 */
export function getOperationalDayConflicts(
  userTasks: Task[],
  userAbsence: any | undefined,
  userName: string = 'Utilizador',
  dateFormatted: string = ''
): DayConflictInfo {
  const isAbsent = !!userAbsence;
  const taskCount = userTasks.length;
  const hasMultipleTasks = taskCount > 1;

  if (isAbsent && taskCount > 0) {
    const taskWord = taskCount === 1 ? 'tarefa' : 'tarefas';
    return {
      hasConflict: true,
      isAbsent: true,
      hasMultipleTasks,
      taskCount,
      badgeText: `⚠️ AUSENTE (${taskCount} ${taskWord})`,
      tooltipText: `⚠️ Conflito crítico: ${userName} está ausente em ${dateFormatted} mas tem ${taskCount} ${taskWord} atribuída(s).`,
    };
  }

  if (isAbsent) {
    const reason = userAbsence?.reason || 'Ausente';
    return {
      hasConflict: false,
      isAbsent: true,
      hasMultipleTasks: false,
      taskCount: 0,
      badgeText: 'AUSENTE',
      tooltipText: `${userName} está ausente (${reason}) em ${dateFormatted}.`,
    };
  }

  if (hasMultipleTasks) {
    return {
      hasConflict: true,
      isAbsent: false,
      hasMultipleTasks: true,
      taskCount,
      badgeText: `⚠️ ${taskCount} tarefas`,
      tooltipText: `Aviso operacional: ${userName} tem ${taskCount} tarefas planeadas para ${dateFormatted}.`,
    };
  }

  return {
    hasConflict: false,
    isAbsent: false,
    hasMultipleTasks: false,
    taskCount,
  };
}
