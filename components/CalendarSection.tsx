'use client';
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Project, Task, UserAbsence, User, Client, SpecialDay, ProjectRiskItem, TaskType } from '../lib/types';
import { hasPermission } from '../lib/permissions';
import { getOperationalCalendarDays, isTaskOnDate, formatOperationalDateRange } from '../lib/operationalCalendar';
import { parseTaskHoursToFloat } from '../lib/taskOperations';
import OperationalUserCalendar from './OperationalUserCalendar';
import TaskDetailsModal from './TaskDetailsModal';
import { M3SectionHeader, M3SegmentedControl } from './M3';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { Card } from './ui/Card';

interface CalendarSectionProps {
  projects: Project[]; tasks: Task[]; absences: UserAbsence[]; users: User[]; clients: Client[];
  specialDays?: SpecialDay[]; projectRiskItems?: ProjectRiskItem[]; projectStatuses?: any[];
  onSelectProject?: (id: string) => void;
  addTask?: (task: any) => any; updateTask?: (id: string, updates: any) => any; deleteTask?: (id: string) => any;
  taskStatuses: any[]; taskTypes?: TaskType[]; currentUser?: any; userGroups?: any[]; appConfig?: any;
}

// One daily planning source: canonical task dates, hours and assignees.
export default function CalendarSection({ projects = [], tasks = [], absences = [], users = [], clients = [],
  specialDays = [], onSelectProject, addTask, updateTask, deleteTask, taskStatuses = [], taskTypes = [],
  currentUser, userGroups = [], appConfig }: CalendarSectionProps) {
  const [view, setView] = useState<'users' | 'projects'>('users');
  const [anchor, setAnchor] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ task: Task | null; mode: 'create' | 'edit' | 'view'; date?: string; userId?: string; projectId?: string } | null>(null);
  const canRead = hasPermission(currentUser, 'calendar_read', userGroups);
  const canWriteTasks = hasPermission(currentUser, 'tasks_write', userGroups);
  const canWriteCalendar = hasPermission(currentUser, 'calendar_write', userGroups);
  const canCreate = canWriteTasks || canWriteCalendar;
  const days = useMemo(() => getOperationalCalendarDays(anchor, 7), [anchor]);
  const visibleProjects = projects.filter(p => !p.deleted && (!search.trim() || `${p.title} ${clients.find(c => c.id === p.clientId)?.clientName || ''}`.toLowerCase().includes(search.trim().toLowerCase())));
  const openTask = (task: Task) => setModal({ task, mode: canWriteTasks ? 'edit' : 'view' });
  const createTask = (date: string, userId?: string, projectId?: string) => {
    if (canCreate) setModal({ task: null, mode: 'create', date, userId, projectId });
  };
  const shiftWeek = (offset: number) => setAnchor(previous => {
    const next = new Date(previous); next.setDate(next.getDate() + offset); return next;
  });
  if (!canRead) return <Card className="p-6 text-body text-text-secondary">Sem permissão para consultar o calendário.</Card>;
  return <div className="space-y-6">
    <Card className="p-4 sm:p-5">
      <M3SectionHeader title="Calendário & Planeamento" description="Planeamento diário de tarefas, técnicos e horas previstas."
        actions={<M3SegmentedControl label="Vista do calendário" value={view} onChange={setView}
          options={[{ value: 'users', label: 'Calendário semanal' }, { value: 'projects', label: 'Timeline de projetos' }]} />} />
    </Card>
    {view === 'users' ? <OperationalUserCalendar tasks={tasks} users={users} projects={projects} clients={clients}
      absences={absences} taskStatuses={taskStatuses} taskTypes={taskTypes} specialDays={specialDays} userGroups={userGroups}
      onSelectTask={openTask} onQuickCreateTask={(userId, date, projectId) => createTask(date, userId, projectId)}
      canCreateTask={canCreate} canMoveTask={canWriteTasks && canWriteCalendar} updateTask={updateTask} appConfig={appConfig} currentUser={currentUser} />
    : <Card className="overflow-hidden">
      <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <Input aria-label="Pesquisar projetos" placeholder="Pesquisar projeto ou cliente…" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="flex items-center gap-2">
          <IconButton size="sm" aria-label="Semana anterior" onClick={() => shiftWeek(-7)}><ChevronLeft className="w-4 h-4" /></IconButton>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date())}>Hoje</Button>
          <IconButton size="sm" aria-label="Semana seguinte" onClick={() => shiftWeek(7)}><ChevronRight className="w-4 h-4" /></IconButton>
        </div>
        <p className="text-body-sm text-text-secondary">{formatOperationalDateRange(days)}</p>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-body-sm">
        <thead className="bg-surface-muted text-text-secondary"><tr><th className="p-3 text-left">Projeto</th>
          {days.map(day => <th key={day.dateStr} className="p-3 text-left">{day.weekdayShort} {day.dayNum}/{day.date.getMonth() + 1}</th>)}
        </tr></thead>
        <tbody>{visibleProjects.map(project => <tr key={project.id} className="border-t border-border align-top">
          <th className="p-3 text-left font-medium text-text-primary"><Button variant="ghost" size="sm" onClick={() => onSelectProject?.(project.id)}>{project.title}</Button></th>
          {days.map(day => <td key={day.dateStr} className="p-2 border-l border-border space-y-2">
            {tasks.filter(task => task.projectId === project.id && isTaskOnDate(task, day.dateStr)).map(task =>
              <Button key={task.id} variant="ghost" size="sm" className="w-full h-auto whitespace-normal text-left justify-start" onClick={() => openTask(task)}>
                <span className="flex flex-col gap-1"><span>{task.title}</span><span className="text-caption text-text-secondary">{parseTaskHoursToFloat(task.estimatedHours)} h previstas</span></span>
              </Button>)}
            {canCreate && <IconButton size="sm" aria-label={`Criar tarefa em ${project.title} no dia ${day.dateStr}`} onClick={() => createTask(day.dateStr, undefined, project.id)}><Plus className="w-4 h-4" /></IconButton>}
          </td>)}
        </tr>)}</tbody>
      </table>{visibleProjects.length === 0 && <p className="p-6 text-body-sm text-text-secondary">Nenhum projeto encontrado.</p>}</div>
    </Card>}
    {modal && <TaskDetailsModal isOpen task={modal.task} mode={modal.mode} initialDate={modal.date} initialAssigneeId={modal.userId} initialProjectId={modal.projectId}
      onClose={() => setModal(null)} createTask={addTask} updateTask={updateTask} deleteTask={deleteTask} taskStatuses={taskStatuses} taskTypes={taskTypes}
      users={users} userGroups={userGroups} appConfig={appConfig} projects={projects} clients={clients} absences={absences} tasks={tasks} canWrite={canCreate} />}
  </div>;
}
