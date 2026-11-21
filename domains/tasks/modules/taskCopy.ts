import type { Task, TaskType } from '@/lib/types';
import type { TaskCreateInput } from './taskOperations';
import { getDefaultTaskStatusId } from '@/lib/utils';

export function buildPlannedTaskCopy(task: Task, date: string, projectId: string | null,
  statuses: { id: string; scale?: number; deleted?: boolean }[], types: TaskType[]): TaskCreateInput {
  if (task.deleted || (task.projectId && task.projectId !== projectId)) throw new Error('Destino inválido para copiar a tarefa.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data de destino inválida.');
  if (!types.some(type => type.id === task.taskTypeId && !type.deleted)) throw new Error('A tarefa não tem um tipo válido. Edite-a antes de copiar.');
  if (!statuses.some(status => !status.deleted && status.scale === 1)) throw new Error('Configure um estado inicial para as tarefas antes de copiar.');
  return { projectId, copiedFromTaskId: task.id, title: task.title, description: task.description, notes: task.notes,
    taskTypeId: task.taskTypeId, priorityId: task.priorityId || null, estimatedHours: task.estimatedHours,
    assigneeIds: [...task.assigneeIds], estimatedDate: date, statusId: getDefaultTaskStatusId(statuses),
    actualHours: null, startDate: '', startTime: '', endDate: '', endTime: '', completedDate: null };
}
