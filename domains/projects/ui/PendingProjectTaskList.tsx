'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { PendingProjectTask } from '@/domains/projects/modules/deliveredProjectsWithPendingTasks';

export default function PendingProjectTaskList({ tasks, onSelectTask }: {
  tasks: PendingProjectTask[];
  onSelectTask?: (id: string) => void;
}) {
  return <ul className="space-y-2" aria-label="Tarefas por concluir">
    {tasks.map(({ task, date, assignees }) => <li key={task.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
      <span className="text-text-secondary whitespace-nowrap">{date ? date.split('-').reverse().join('/') : 'Sem data prevista'} —</span>
      {onSelectTask ? <Button type="button" variant="ghost" size="sm"
        className="h-auto min-h-9 min-w-0 px-1 py-1 whitespace-normal break-words text-left justify-start text-text-primary"
        aria-label={`Abrir tarefa ${task.title}`} onClick={() => onSelectTask(task.id)}>{task.title}</Button>
        : <span className="min-w-0 break-words text-text-primary">{task.title}</span>}
      {assignees.length ? assignees.map(user => <Badge key={user.id} className="max-w-full whitespace-normal break-words">{user.name}</Badge>)
        : <span className="text-caption text-text-muted">Sem utilizadores atribuídos</span>}
    </li>)}
  </ul>;
}
