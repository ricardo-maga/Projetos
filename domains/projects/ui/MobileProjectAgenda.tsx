'use client';

import type { Client, Project, Task, User, UserAbsence, SpecialDay } from '@/lib/types';
import type { ProjectTimelineEvents } from '@/domains/projects/modules/projectTimeline';
import type { CalendarDayItem, DayConflictInfo } from '@/domains/calendar/modules/operationalCalendar';
import { getProjectStatusStyle, getTaskStatusStyle, formatHoursToHHMM } from '@/lib/utils';
import { parseTaskHoursToFloat } from '@/domains/tasks/modules/taskOperations';
import { Button } from '@/components/ui/Button';
import { TaskPlanningBadge } from '@/domains/tasks/ui/TaskPlanningBadge';
import { Badge } from '@/components/ui/Badge';

type OtherDay = { otherTasks: Task[]; absentUsers: { user: User; absence: UserAbsence; conflict: DayConflictInfo }[] };

export default function MobileProjectAgenda({ projects, clients, users, projectStatuses, taskStatuses, days, events, undatedTasks,
  otherDays, otherUndatedTasks, conflictTaskIds, specialDays, expanded, onToggle, onHide, onOpenProject, onOpenTask, onCreate }: {
  projects: Project[]; clients: Client[]; users: User[]; projectStatuses: any[]; taskStatuses: any[];
  days: CalendarDayItem[]; events: ProjectTimelineEvents; undatedTasks: Map<string, Task[]>;
  otherDays: Map<string, OtherDay>; otherUndatedTasks: Task[]; conflictTaskIds: Map<string, Set<string>>; specialDays: SpecialDay[];
  expanded: Set<string>; onToggle: (id: string) => void; onHide: (id: string) => void;
  onOpenProject: (id: string) => void; onOpenTask: (task: Task) => void; onCreate?: (date: string, projectId?: string) => void;
}) {
  const renderTask = (task: Task, date?: string) => {
    const status = getTaskStatusStyle(task.statusId, taskStatuses);
    const names = (task.assigneeIds || []).map(id => users.find(user => user.id === id)?.name || 'Utilizador indisponível');
    return <button key={task.id} type="button" onClick={() => onOpenTask(task)}
      className="block min-h-11 w-full min-w-0 space-y-1 py-2 text-left [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <span className="block font-semibold text-text-primary">{task.title}</span>
      <span className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary"><Badge className={status.badgeClass}>{status.name}</Badge><TaskPlanningBadge planningStatus={task.planningStatus} /><span>{formatHoursToHHMM(parseTaskHoursToFloat(task.estimatedHours))} h previstas</span></span>
      <span className="block text-caption text-text-secondary">{names.length ? names.join(', ') : 'Sem utilizador alocado'}</span>
      {date && conflictTaskIds.get(date)?.has(task.id) && <span className="block text-body-sm text-error">Conflito de planeamento</span>}
      {!date && Boolean(task.startDate?.trim() || task.endDate?.trim()) && <span className="block text-body-sm text-warning">Data incompleta</span>}
    </button>;
  };
  const dateHeading = (day: CalendarDayItem) => <h4 className="text-body-sm font-bold text-text-secondary">
    {day.weekdayFull} · {day.dateStr.split('-').reverse().join('/')}
    {specialDays.find(s => s.date === day.dateStr)?.name && <span className="block">{specialDays.find(s => s.date === day.dateStr)?.name}</span>}
  </h4>;
  const otherVisible = days.filter(day => otherDays.get(day.dateStr)?.otherTasks.length || otherDays.get(day.dateStr)?.absentUsers.length);
  return <section aria-label="Agenda de projetos" className="mobile-controls min-w-0 divide-y divide-border px-3 md:hidden">
    <section aria-label="Outras tarefas" className="space-y-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-text-primary">Outras tarefas</h3>
        {onCreate && <Button variant="outline" onClick={() => onCreate(days[0].dateStr)}>Nova tarefa sem projeto</Button>}</div>
      {!otherVisible.length && !otherUndatedTasks.length && <p className="text-body-sm text-text-secondary">Sem tarefas ou ausências neste período.</p>}
      {otherVisible.map(day => <div key={day.dateStr} className="space-y-1">
        {dateHeading(day)}
        {otherDays.get(day.dateStr)?.absentUsers.map(({ user, absence, conflict }) => <div key={user.id} className="text-body-sm text-text-secondary">
          <p>{user.name}: AUSENTE · {absence.reason || 'Ausente'}</p>
          {conflict.hasConflict && <p className="text-error">{conflict.tooltipText}</p>}
        </div>)}
        <div className="divide-y divide-border">{otherDays.get(day.dateStr)?.otherTasks.map(task => renderTask(task, day.dateStr))}</div>
      </div>)}
      {otherUndatedTasks.length > 0 && <section aria-label="Tarefas sem data">
        <h4 className="font-bold text-text-secondary">Tarefas sem data</h4>
        <div className="divide-y divide-border">{otherUndatedTasks.map(task => renderTask(task))}</div>
      </section>}
    </section>
    {projects.map(project => {
      const pending = undatedTasks.get(project.id) || [];
      const status = getProjectStatusStyle(project.statusId, projectStatuses);
      const open = expanded.has(project.id);
      const visibleDays = days.filter(day => events.get(project.id)?.get(day.dateStr)?.length);
      return <section key={project.id} aria-label={`Agenda de ${project.title}`} className="min-w-0 py-3 space-y-2">
        <button type="button" aria-expanded={open} onClick={() => onToggle(project.id)} className="min-h-11 w-full min-w-0 space-y-1 text-left [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <span className="block text-body-sm text-primary-ink">{clients.find(client => client.id === project.clientId)?.clientName || 'Cliente N/D'}</span>
          <span className="block font-bold text-text-primary">{project.title} <span aria-hidden="true">{open ? '−' : '+'}</span></span>
          <span className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">{project.installProjectNo && <span>{project.installProjectNo}</span>}<Badge className={status.badgeClass}>{status.name}</Badge></span>
          {pending.length > 0 && <span className="block text-body-sm text-warning">{pending.length} {pending.length === 1 ? 'tarefa sem data' : 'tarefas sem data'}</span>}
        </button>
        {open && <div className="space-y-3">
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => onOpenProject(project.id)}>Abrir projeto</Button>
            {onCreate && <Button variant="outline" onClick={() => onCreate(days[0].dateStr, project.id)}>Nova tarefa</Button>}
            <Button variant="ghost" onClick={() => onHide(project.id)}>Ocultar projeto</Button></div>
          {!visibleDays.length && <p className="text-body-sm text-text-secondary">Sem eventos com data neste período.</p>}
          {visibleDays.map(day => <div key={day.dateStr} className="space-y-1">
            {dateHeading(day)}
            <div className="divide-y divide-border">{events.get(project.id)?.get(day.dateStr)?.map((event, index) => event.kind === 'task'
              ? renderTask(event.task, day.dateStr)
              : <Button key={`${event.kind}-${index}`} variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => onOpenProject(project.id)}>{event.title}</Button>)}</div>
          </div>)}
          {pending.length > 0 && <section aria-label={`Tarefas sem data de ${project.title}`}><h4 className="font-bold text-text-secondary">Tarefas sem data</h4><div className="divide-y divide-border">{pending.map(task => renderTask(task))}</div></section>}
        </div>}
      </section>;
    })}
  </section>;
}
