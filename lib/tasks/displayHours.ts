import { parseTaskHoursToNumber } from './taskService';

export function getTaskDisplayHours(task: { actualHours?: string | number | null; estimatedHours?: string | number | null; assigneeIds?: string[] | null }) {
  const actualHours = parseTaskHoursToNumber(task.actualHours);
  const hasActualHours = actualHours > 0;
  const hours = hasActualHours
    ? actualHours * (task.assigneeIds || []).length
    : parseTaskHoursToNumber(task.estimatedHours);
  return { hours: Math.round(hours * 100) / 100, isActual: hasActualHours };
}
