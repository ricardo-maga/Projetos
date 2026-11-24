import type { TaskPlanningStatus } from '@/lib/types';

export const TASK_PLANNING_STATUSES = ['planned', 'provisional'] as const;

export function normalizeTaskPlanningStatus(value: unknown): TaskPlanningStatus {
  return value === 'provisional' ? 'provisional' : 'planned';
}

export function countsTowardsPlanning(task: { planningStatus?: TaskPlanningStatus }): boolean {
  return task.planningStatus !== 'provisional';
}
