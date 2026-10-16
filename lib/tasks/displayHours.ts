import { parseTaskHoursToNumber } from './taskService';

export function getTaskDisplayHours(task: { actualHours?: string | number | null; estimatedHours?: string | number | null; assigneeIds?: string[] | null }) {
  const hasActualHours = task.actualHours !== undefined && task.actualHours !== null && String(task.actualHours).trim() !== '';
  const hours = hasActualHours
    ? parseTaskHoursToNumber(task.actualHours) * (task.assigneeIds || []).length
    : parseTaskHoursToNumber(task.estimatedHours);
  return { hours: Math.round(hours * 100) / 100, isActual: hasActualHours };
}

