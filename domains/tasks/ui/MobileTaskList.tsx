'use client';

import { useRef } from 'react';
import { MoreHorizontal, PlayCircle } from 'lucide-react';
import type { Task } from '@/lib/types';
import { TaskPlanningBadge } from '@/domains/tasks/ui/TaskPlanningBadge';
import { countsTowardsPlanning } from '@/domains/tasks/modules/taskPlanning';
import { getTaskEffectiveDate, getTaskStatusStyle } from '@/lib/utils';
import { formatDateToYYYYMMDD } from '@/domains/calendar/modules/operationalCalendar';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

function TaskActions({ task, onEdit, onDuplicate, onDelete }: {
  task: Task; onEdit?: (task: Task) => void; onDuplicate?: (task: Task) => void; onDelete?: (task: Task) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  if (!onEdit && !onDuplicate && !onDelete) return null;
  const act = (action: (task: Task) => void) => { if (ref.current) ref.current.open = false; action(task); };
  return <details ref={ref} className="relative shrink-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
  }}>
    <summary aria-label={`Ações da tarefa ${task.title}`} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"><MoreHorizontal aria-hidden="true" className="h-5 w-5" /></summary>
    <div className="absolute right-0 top-full z-30 w-40 rounded-control border border-border bg-surface p-1 shadow-raised">
      {onEdit && <Button variant="ghost" className="w-full justify-start" onClick={() => act(onEdit)}>Editar</Button>}
      {onDuplicate && <Button variant="ghost" className="w-full justify-start" onClick={() => act(onDuplicate)}>Duplicar</Button>}
      {onDelete && <Button variant="ghost" className="w-full justify-start text-error" onClick={() => act(onDelete)}>Eliminar</Button>}
    </div>
  </details>;
}

export default function MobileTaskList({ tasks, taskStatuses, projectLabel, getTaskScale, onOpen, onExecute, onEdit, onDuplicate, onDelete }: {
  tasks: Task[]; taskStatuses: any[]; projectLabel: (id?: string | null) => string;
  getTaskScale: (statusId: string) => number;
  onOpen: (task: Task) => void; onExecute?: (task: Task) => void; onEdit?: (task: Task) => void;
  onDuplicate?: (task: Task) => void; onDelete?: (task: Task) => void;
}) {
  const today = formatDateToYYYYMMDD(new Date());
  return <ul aria-label="Lista compacta de tarefas" className="mobile-controls divide-y divide-border md:hidden">
    {tasks.map(task => {
      const date = getTaskEffectiveDate(task);
      const status = getTaskStatusStyle(task.statusId, taskStatuses);
      const overdue = Boolean(date && date < today && getTaskScale(task.statusId) !== 3);
      return <li key={task.id} className="flex min-w-0 items-start gap-1 p-3">
        <button type="button" className="min-h-11 min-w-0 flex-1 space-y-1 text-left [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => onOpen(task)}>
          <span className="block text-caption text-primary-ink">{projectLabel(task.projectId)}</span>
          <span className="block text-body font-bold text-text-primary">{task.title}</span>
          <span className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
            <span>{date ? date.split('-').reverse().join('/') : 'Sem data'}</span>
            <Badge className={status.badgeClass}>{status.name}</Badge>
            <TaskPlanningBadge planningStatus={task.planningStatus} />
            {overdue && <Badge variant="error">Atrasada</Badge>}
          </span>
        </button>
        {onExecute && countsTowardsPlanning(task) && <Button type="button" variant="ghost" className="shrink-0 px-2" aria-label={`Registar execução de ${task.title}`} onClick={() => onExecute(task)}><PlayCircle aria-hidden="true" className="h-5 w-5" /></Button>}
        <TaskActions task={task} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
      </li>;
    })}
  </ul>;
}
