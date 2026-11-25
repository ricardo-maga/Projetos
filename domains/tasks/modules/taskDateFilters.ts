import type { Task, TaskStatus } from '@/lib/types';
import { getTaskEffectiveDate, matchTaskStatusId } from '@/lib/utils';
import { addCivilDays, formatDateToYYYYMMDD, getMondayOfWeek, normalizeDateStr } from '@/domains/calendar/modules/operationalCalendar';

export type TaskDateFilter = 'all' | 'no_date' | 'today' | 'tomorrow' | 'this_week' | 'overdue' | 'completed' | 'completed_this_week';

const defaultStatusIds = ['ts-1', 'ts-2', 'ts-3', 'ts-4'];

export function getOperationalTaskScale(
  statusId: string,
  statuses: readonly Pick<TaskStatus, 'id' | 'scale'>[],
): number | undefined {
  const configuredScale = statuses.find(status => matchTaskStatusId(status.id, statusId))?.scale;
  if (typeof configuredScale === 'number') return configuredScale;

  const defaultIndex = defaultStatusIds.findIndex(id => matchTaskStatusId(id, statusId));
  return defaultIndex === -1 ? undefined : defaultIndex + 1;
}

export function isOpenTaskStatus(scale: number | undefined): boolean {
  return scale === 1 || scale === 2;
}

export function getTaskFilterDates(now: Date) {
  const today = formatDateToYYYYMMDD(now);
  const weekStart = formatDateToYYYYMMDD(getMondayOfWeek(now));

  return {
    today,
    tomorrow: addCivilDays(today, 1),
    weekStart,
    weekEnd: addCivilDays(weekStart, 6),
    recentStart: addCivilDays(today, -6),
  };
}

export type TaskFilterDates = ReturnType<typeof getTaskFilterDates>;

export function matchesTaskDateFilter(
  task: Pick<Task, 'estimatedDate' | 'startDate' | 'endDate'>,
  scale: number | undefined,
  filter: TaskDateFilter,
  dates: TaskFilterDates,
): boolean {
  const planned = normalizeDateStr(task.estimatedDate);
  const open = isOpenTaskStatus(scale);

  switch (filter) {
    case 'all':
      return open;
    case 'no_date':
      return open && !planned;
    case 'today':
      return open && planned === dates.today;
    case 'tomorrow':
      return open && planned === dates.tomorrow;
    case 'this_week':
      return (open || scale === 3) && planned >= dates.weekStart && planned <= dates.weekEnd;
    case 'overdue':
      return open && Boolean(planned) && planned < dates.today;
    case 'completed':
      return scale === 3;
    case 'completed_this_week': {
      if (scale !== 3) return false;
      const effective = normalizeDateStr(getTaskEffectiveDate(task));
      return (planned >= dates.recentStart && planned <= dates.today)
        || (effective >= dates.recentStart && effective <= dates.today);
    }
  }
}
