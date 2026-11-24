'use client';

import { TaskPlanningBadge } from '@/domains/tasks/ui/TaskPlanningBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getUserInitials } from '@/lib/utils';
import type { PendingProjectTask } from '@/domains/projects/modules/deliveredProjectsWithPendingTasks';

export default function PendingProjectTaskList({ tasks, onSelectTask, compactDate = false }: {
  tasks: PendingProjectTask[];
  onSelectTask?: (id: string) => void;
  compactDate?: boolean;
}) {
  return <ul className="space-y-2" aria-label="Tarefas por concluir">
    {tasks.map(({ task, date, assignees }) => <li key={task.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
      <span className="text-text-secondary whitespace-nowrap">{date ? date.split('-').reverse().join('/') : compactDate ? 'Sem data' : 'Sem data prevista'}{compactDate ? '' : ' —'}</span>
      {onSelectTask ? <Button type="button" variant="ghost" size="sm"
        className="h-auto min-h-9 min-w-0 px-1 py-1 whitespace-normal break-words text-left justify-start text-text-primary"
        aria-label={`Abrir tarefa ${task.title}`} onClick={() => onSelectTask(task.id)}>{task.title}</Button>
        : <span className="min-w-0 break-words text-text-primary">{task.title}</span>}
      <TaskPlanningBadge planningStatus={task.planningStatus} />
      {assignees.map(user => <Badge key={user.id} title={user.name} className="w-8 h-8 p-0 justify-center rounded-full font-bold text-caption shadow-flat">
        <span aria-label={user.name}>{getUserInitials(user.name)}</span>
      </Badge>)}
    </li>)}
  </ul>;
}
