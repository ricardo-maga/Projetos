'use client';

import { ChevronLeft, ChevronRight, Copy, Plus } from 'lucide-react';
import type { Client, Project, SpecialDay, Task, User, UserAbsence } from '@/lib/types';
import { formatDateToYYYYMMDD, getOperationalDayConflicts } from '@/domains/calendar/modules/operationalCalendar';
import { formatHoursToHHMM, getTaskStatusStyle } from '@/lib/utils';
import { parseTaskHoursToFloat } from '@/domains/tasks/modules/taskOperations';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export default function MobileDayAgenda({ date, onDateChange, users, tasksByUserDay, absencesByUserDay, projects, clients, taskStatuses,
  specialDays, onOpen, onCreate, onDuplicate }: {
  date: Date; onDateChange: (date: Date) => void; users: User[];
  tasksByUserDay: Map<string, Task[]>; absencesByUserDay: Map<string, UserAbsence>;
  projects: Project[]; clients: Client[]; taskStatuses: any[]; specialDays: SpecialDay[];
  onOpen: (task: Task) => void; onCreate?: (userId: string, date: string) => void; onDuplicate?: (task: Task) => void;
}) {
  const dateStr = formatDateToYYYYMMDD(date);
  const special = specialDays.find(day => day.date === dateStr);
  const shift = (offset: number) => { const next = new Date(date); next.setDate(next.getDate() + offset); onDateChange(next); };
  return <section aria-label="Agenda diária" className="mobile-controls min-w-0 space-y-4 p-3 md:hidden">
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" aria-label="Dia anterior" onClick={() => shift(-1)}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></Button>
      <label className="min-w-0 flex-1 text-caption text-text-secondary">Data
        <input type="date" aria-label="Data da agenda" value={dateStr} className="block min-h-11 w-full min-w-0 rounded-control border border-border bg-surface px-2 text-body text-text-primary"
          onChange={event => { if (event.target.value) onDateChange(new Date(`${event.target.value}T12:00:00`)); }} />
      </label>
      <Button variant="outline" aria-label="Dia seguinte" onClick={() => shift(1)}><ChevronRight aria-hidden="true" className="h-4 w-4" /></Button>
      <Button variant="outline" onClick={() => onDateChange(new Date())}>Hoje</Button>
    </div>
    <p aria-live="polite" className="text-body-sm font-semibold text-text-primary">{date.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    {(special || date.getDay() === 0 || date.getDay() === 6) && <p className="text-body-sm text-text-secondary">{special?.name || 'Fim de semana'}</p>}
    {!users.length && <p className="text-body-sm text-text-secondary">Nenhum utilizador visível no calendário. Selecione os utilizadores acima.</p>}
    {users.map(user => {
      const key = `${user.id}_${dateStr}`;
      const tasks = tasksByUserDay.get(key) || [];
      const absence = absencesByUserDay.get(key);
      const conflict = getOperationalDayConflicts(tasks, absence, user.name, dateStr.split('-').reverse().join('/'));
      return <section key={user.id} aria-label={`Agenda de ${user.name}`} className="min-w-0 border-t border-border pt-3 space-y-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h3 className="min-w-0 font-bold text-text-primary [overflow-wrap:anywhere]">{user.name} <span className="text-caption font-normal text-text-secondary">({tasks.length})</span></h3>
          {onCreate && <Button variant="ghost" aria-label={`Criar tarefa para ${user.name}`} onClick={() => onCreate(user.id, dateStr)}><Plus aria-hidden="true" className="h-4 w-4" /></Button>}
        </div>
        {absence && <p className="text-body-sm font-semibold text-text-secondary">Ausente: {absence.reason || 'Ausente'}</p>}
        {conflict.hasConflict && <p role="status" className="text-body-sm text-error">{conflict.tooltipText}</p>}
        {!tasks.length && <p className="text-body-sm text-text-muted">Sem tarefas neste dia.</p>}
        <ul className="divide-y divide-border">
          {tasks.map(task => {
            const project = projects.find(item => item.id === task.projectId);
            const client = clients.find(item => item.id === project?.clientId);
            const status = getTaskStatusStyle(task.statusId, taskStatuses);
            return <li key={task.id} className="flex min-w-0 items-start gap-2 py-2">
              <button type="button" onClick={() => onOpen(task)} className="min-h-11 min-w-0 flex-1 space-y-1 text-left [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span className="block text-caption text-primary-ink">{project ? `${client?.clientName || 'Sem cliente'} · ${project.title}` : 'Sem projeto'}</span>
                <span className="block text-body font-semibold text-text-primary">{task.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary"><Badge className={status.badgeClass}>{status.name}</Badge><span>Previstas: {formatHoursToHHMM(parseTaskHoursToFloat(task.estimatedHours))} h</span></span>
              </button>
              {onDuplicate && <Button variant="ghost" aria-label={`Duplicar tarefa ${task.title}`} onClick={() => onDuplicate(task)}><Copy aria-hidden="true" className="h-4 w-4" /></Button>}
            </li>;
          })}
        </ul>
      </section>;
    })}
  </section>;
}
