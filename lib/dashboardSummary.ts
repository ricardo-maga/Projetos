import type { Project, Task, TaskStatus } from './types';
import { buildProjectAnalytics } from './projectAnalytics';
import { matchTaskStatusId } from './utils';

export function buildDashboardSummary(projects: Project[], tasks: Task[], projectStatuses: any[], taskStatuses: TaskStatus[], now = new Date()) {
  // Reuse Projects analysis: configured scales and scheduled → estimated → delivery priority.
  const analytics = buildProjectAnalytics(projects, projectStatuses, [], 30, now);
  const openTasks = tasks.filter(task => {
    if (task.deleted) return false;
    const status = taskStatuses.find(status => status.id === task.statusId || matchTaskStatusId(status.id, task.statusId));
    return status?.scale === 1 || status?.scale === 2;
  });
  return {
    activeProjects: analytics.active.length,
    currentMonthProjects: analytics.currentMonth.length,
    nextMonthProjects: analytics.nextMonth.length,
    openTasks: openTasks.length,
    currentMonthName: now.toLocaleString('pt-PT', { month: 'long' }),
    nextMonthName: new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString('pt-PT', { month: 'long' }),
  };
}
