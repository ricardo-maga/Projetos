'use client';
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2, Plus, Search, ShieldAlert, X } from 'lucide-react';
import type { Client, Project, ProjectRiskItem, SpecialDay, Task, User, UserAbsence } from '../lib/types';
import { buildProjectTimelineEvents, buildUndatedProjectTasks, canDropTimelineTask, computeTimelineTaskDropUpdates, filterProjectTimeline, getOtherTimelineTasks, type TimelineHorizon } from '../lib/projectTimeline';
import { getOperationalCalendarDays, formatOperationalDateRange, getOperationalDayConflicts, getUserDayAbsence, isUserAssignedToTask } from '../lib/operationalCalendar';
import { parseTaskHoursToFloat } from '../lib/taskOperations';
import { getTaskStatusStyle, getProjectStatusStyle, getUserInitials } from '../lib/utils';
import { M3SectionHeader, M3SegmentedControl } from './M3';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { Checkbox } from './ui/Checkbox';
import DateViewNavigator from './ui/DateViewNavigator';
import ExpandedView from './ui/ExpandedView';

interface ProjectTimelineProps {
  projects: Project[]; clients: Client[]; tasks: Task[]; projectStatuses: any[]; taskStatuses: any[];
  users?: User[];
  absences?: UserAbsence[];
  projectRiskItems?: ProjectRiskItem[]; specialDays?: SpecialDay[]; canCreate: boolean;
  onSelectProject?: (id: string) => void; onSelectTask: (task: Task) => void;
  onCreateTask: (date: string, projectId?: string) => void;
  updateTask?: (id: string, updates: Partial<Task>) => any;
}
const PAGE_SIZE = 50;
export default function ProjectTimeline({ projects, clients, tasks, users = [], absences = [], projectStatuses, taskStatuses, projectRiskItems = [], specialDays = [],
  canCreate, onSelectProject, onSelectTask, onCreateTask, updateTask }: ProjectTimelineProps) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [periodDays, setPeriodDays] = useState<7 | 14 | 21 | 28>(7);
  const [horizon, setHorizon] = useState<TimelineHorizon>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [includeRiskReviews, setIncludeRiskReviews] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(new Set());
  const [expandedUndatedProjects, setExpandedUndatedProjects] = useState<Set<string>>(new Set());
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [moveError, setMoveError] = useState('');
  const draggingTaskId = useRef<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const dockScrollRef = useRef<HTMLDivElement>(null);
  const canMove = canCreate && !!updateTask;
  const openOutsideTimeline = (action: () => void) => {
    setFullscreen(false);
    action();
  };
  const days = useMemo(() => getOperationalCalendarDays(anchor, periodDays), [anchor, periodDays]);
  const events = useMemo(() => buildProjectTimelineEvents(projects, tasks, projectRiskItems, includeRiskReviews), [projects, tasks, projectRiskItems, includeRiskReviews]);
  const undatedTasks = useMemo(() => buildUndatedProjectTasks(tasks), [tasks]);
  const filtered = filterProjectTimeline(projects, clients, projectStatuses, events, { search, horizon, showCompleted })
    .filter(project => !hiddenProjectIds.has(project.id));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), validPage = Math.min(page, pages);
  const start = (validPage - 1) * PAGE_SIZE, visibleProjects = filtered.slice(start, start + PAGE_SIZE);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const otherDays = useMemo(() => new Map(days.map(day => {
    const otherTasks = getOtherTimelineTasks(tasks, day.dateStr);
    const absentUsers = users.filter(user => !user.deleted).flatMap(user => {
      const absence = getUserDayAbsence(absences, user.id, day.dateStr);
      if (!absence) return [];
      const conflict = getOperationalDayConflicts(otherTasks.filter(task => isUserAssignedToTask(task, user.id)), absence,
        user.name, day.dateStr.split('-').reverse().join('/'));
      return [{ user, absence, conflict }];
    });
    return [day.dateStr, { otherTasks, absentUsers }] as const;
  })), [days, tasks, users, absences]);
  const shift = (offset: number) => setAnchor(previous => { const next = new Date(previous); next.setDate(next.getDate() + offset); return next; });
  const dragProps = (task: Task) => ({
    draggable: canMove,
    onDragStart: (event: React.DragEvent<HTMLButtonElement>) => {
      if (!canMove) { event.preventDefault(); return; }
      draggingTaskId.current = task.id;
      event.dataTransfer.setData('application/x-project-timeline-task', task.id);
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: () => { draggingTaskId.current = null; setDragOverCell(null); },
  });
  const scheduleTask = (task: Task, date: string, projectId: string | null) => {
    if (!canMove || !date) return;
    const updates = computeTimelineTaskDropUpdates(task, date, projectId);
    if (!updates) return;
    setMoveError('');
    try {
      Promise.resolve(updateTask!(task.id, updates)).catch(() => setMoveError('Não foi possível mover a tarefa. Tenta novamente.'));
    } catch {
      setMoveError('Não foi possível mover a tarefa. Tenta novamente.');
    }
  };
  const dropProps = (date: string, projectId: string | null) => {
    const key = `${projectId || 'other'}:${date}`;
    return {
      onDragOver: (event: React.DragEvent<HTMLTableCellElement>) => {
        const task = tasks.find(item => item.id === draggingTaskId.current);
        if (!canMove || !task || !canDropTimelineTask(task, projectId)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragOverCell(key);
      },
      onDragLeave: (event: React.DragEvent<HTMLTableCellElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverCell(null);
      },
      onDrop: (event: React.DragEvent<HTMLTableCellElement>) => {
        setDragOverCell(null);
        const id = event.dataTransfer.getData('application/x-project-timeline-task');
        if (!canMove || !id || id !== draggingTaskId.current) return;
        const task = tasks.find(item => item.id === id);
        if (!task) return;
        if (!canDropTimelineTask(task, projectId)) return;
        event.preventDefault();
        scheduleTask(task, date, projectId);
      },
      'data-timeline-drop-cell': key,
    };
  };
  const dayStyle = (date: string, weekend: boolean) => specialDays.some(s => s.date === date) || weekend ? 'bg-surface-muted' : 'bg-surface';
  const compactDays = new Set(days.filter(day => (day.isWeekend || specialDays.some(s => s.date === day.dateStr)) &&
    !otherDays.get(day.dateStr)?.otherTasks.length && !otherDays.get(day.dateStr)?.absentUsers.length &&
    !visibleProjects.some(project => (events.get(project.id)?.get(day.dateStr) || []).some(event => event.kind === 'task'))
  ).map(day => day.dateStr));
  const timelineMinWidth = 260 + days.reduce((width, day) => width + (compactDays.has(day.dateStr) ? 64 : 150), 0);
  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
  };
  return <ExpandedView open={fullscreen} onClose={() => setFullscreen(false)} title="Timeline de projetos">
    <div data-project-timeline-master className={fullscreen ? 'p-3 sm:p-5' : ''}>
    <Card className="overflow-visible">
      <div className="p-4 sm:p-5 bg-surface-muted/60 border-b border-border/80 space-y-4">
        <M3SectionHeader title="Timeline de projetos" description="Eventos por projeto, tarefas e datas de entrega."
          actions={<Button variant="outline" size="sm" onClick={() => setFullscreen(value => !value)} aria-pressed={fullscreen}>
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}{fullscreen ? 'Sair do ecrã cheio' : 'Ecrã cheio'}
          </Button>} />
        <DateViewNavigator periodDays={periodDays} periods={[7, 14, 21, 28]} navigationStepDays={7} onPeriodDaysChange={setPeriodDays} onPrev={() => shift(-7)} onNext={() => shift(7)}
          onToday={() => setAnchor(new Date())} />
        <div className="space-y-3">
          <p className="text-label font-semibold text-text-secondary">Mostrar projetos com eventos nos próximos dias</p>
          <M3SegmentedControl<TimelineHorizon> label="Projetos com eventos nos próximos dias" value={horizon}
            onChange={value => { setHorizon(value); setPage(1); }} options={[7, 14, 21, 28].map(value => ({ value: value as TimelineHorizon, label: `${value} dias` })).concat([{ value: 'all', label: 'Todos' }])} />
          <p className="text-caption text-text-secondary">Contado a partir de hoje. “Todos” inclui os projetos ativos dos níveis 1 a 4, mesmo sem eventos.</p>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-0 basis-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted z-10 pointer-events-none" />
              <Input aria-label="Pesquisar na timeline" placeholder="Pesquisar projeto, cliente ou nº IP…" className="pl-9 text-body-sm" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
            <Checkbox label="Mostrar projetos concluídos" checked={showCompleted} onChange={e => { setShowCompleted(e.target.checked); setPage(1); }} />
            <Checkbox label="Incluir revisões de risco" checked={includeRiskReviews} onChange={e => { setIncludeRiskReviews(e.target.checked); setPage(1); }} />
            {hiddenProjectIds.size > 0 && <Button variant="outline" size="sm" onClick={() => setHiddenProjectIds(new Set())}>Repor todos os projetos</Button>}
          </div>
        </div>
      </div>
      {/* The dock stays at the viewport bottom while the table passes through the vertical scroll area. */}
      <div className="relative">
      <div ref={tableScrollRef} onScroll={event => syncHorizontalScroll(event.currentTarget, dockScrollRef.current)}
        className="project-timeline-table-scroll overflow-x-auto overflow-y-hidden" data-project-timeline-scroll>
        <table className="w-full table-fixed text-body-sm" style={{ minWidth: timelineMinWidth }}>
          <caption className="sr-only">Timeline de projetos · {formatOperationalDateRange(days)}</caption>
          <colgroup><col style={{ width: 260 }} />{days.map(day => <col key={day.dateStr} style={compactDays.has(day.dateStr) ? { width: 64 } : undefined} />)}</colgroup>
          <thead className="text-body-sm font-semibold text-text-secondary bg-surface-muted"><tr>
            <th scope="col" className="p-3 text-left text-body-sm font-semibold bg-surface-muted lg:sticky lg:left-0 lg:z-30 lg:border-r lg:border-border">Projeto</th>
            {days.map(day => <th scope="col" key={day.dateStr} className={`p-3 border-l border-border text-left text-body-sm font-semibold ${dayStyle(day.dateStr, day.isWeekend)} ${day.isToday ? 'ring-1 ring-inset ring-primary' : ''}`}>
              <span className="block">{day.weekdayShort.slice(0, 3).toUpperCase()} {day.dayNum}/{day.date.getMonth() + 1}</span>
              {specialDays.find(s => s.date === day.dateStr) && <span className="block text-caption font-normal text-text-secondary break-words">{specialDays.find(s => s.date === day.dateStr)?.name}</span>}
            </th>)}
          </tr></thead>
          <tbody><tr className="border-t border-border align-top">
            <th scope="row" className="p-3 text-left font-medium text-text-primary bg-surface lg:sticky lg:left-0 lg:z-20 lg:border-r lg:border-border">Outras tarefas</th>
            {days.map(day => <td key={day.dateStr} {...dropProps(day.dateStr, null)} className={`p-2 border-l border-border ${dayStyle(day.dateStr, day.isWeekend)} ${dragOverCell === `other:${day.dateStr}` ? 'ring-2 ring-inset ring-primary' : ''}`}>
              <div className="space-y-1">
                {otherDays.get(day.dateStr)?.absentUsers.map(({ user, absence, conflict }) =>
                  <div key={user.id} title={conflict.tooltipText}
                    className={`rounded-md border px-2 py-1 text-caption font-semibold ${conflict.hasConflict ? 'bg-error/10 text-error border-error/20' : 'bg-surface-muted text-text-secondary border-border'}`}>
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />{user.name}: {conflict.badgeText}</span>
                    {absence.reason && <span className="block truncate font-normal">{absence.reason}</span>}
                  </div>)}
                {otherDays.get(day.dateStr)?.otherTasks.map(task => {
                const status = getTaskStatusStyle(task.statusId, taskStatuses);
                const assigneeIds = task.assigneeIds || [];
                return <Button key={task.id} {...dragProps(task)} variant="ghost" size="sm" title={task.title} aria-label={`Abrir tarefa ${task.title}`}
                  className={`w-full min-h-9 h-auto px-1 py-1 justify-start bg-surface border border-border border-l-4 ${status.dotClass.replace('bg-', 'border-l-')} ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  onClick={() => openOutsideTimeline(() => onSelectTask(task))}>
                  <span className="flex items-center gap-1 min-w-0">
                    {assigneeIds.slice(0, 2).map(id => { const name = users.find(user => user.id === id)?.name || 'Utilizador indisponível'; return <span key={id} title={name} aria-label={name} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-caption font-bold shrink-0">{getUserInitials(name)}</span>; })}
                    {!assigneeIds.length && <span className="w-3 h-3 rounded-full bg-error" aria-label="Sem utilizador alocado" title="Sem utilizador alocado" />}
                    {assigneeIds.length > 2 && <span className="text-caption">+{assigneeIds.length - 2}</span>}
                    <span className="min-w-0 flex-1 truncate text-caption text-text-primary">{task.title}</span>
                  </span>
                </Button>;
              })}</div>
              {canCreate && <div className="flex justify-end"><IconButton size="sm" aria-label={`Criar tarefa sem projeto no dia ${day.dateStr}`} title="Criar tarefa"
                onClick={() => openOutsideTimeline(() => onCreateTask(day.dateStr))}><Plus className="w-4 h-4" /></IconButton></div>}
            </td>)}
          </tr>{visibleProjects.map(project => { const style = getProjectStatusStyle(project.statusId, projectStatuses); const expanded = expandedProjects.has(project.id); const pending = undatedTasks.get(project.id) || []; const undatedOpen = expandedUndatedProjects.has(project.id); return <tr key={project.id} className="border-t border-border align-top">
            <th scope="row" className="p-3 text-left font-medium text-text-primary space-y-1 bg-surface lg:sticky lg:left-0 lg:z-20 lg:border-r lg:border-border">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-between px-0 text-left" aria-expanded={expanded}
                  aria-label={`${expanded ? 'Recolher' : 'Expandir'} projeto de ${clientMap.get(project.clientId)?.clientName || 'Cliente N/D'}`}
                  onClick={() => setExpandedProjects(previous => { const next = new Set(previous); if (next.has(project.id)) next.delete(project.id); else next.add(project.id); return next; })}>
                  <span className="truncate">{clientMap.get(project.clientId)?.clientName || 'Cliente N/D'}</span>
                  <ChevronDown aria-hidden="true" className={`w-4 h-4 shrink-0 ${expanded ? 'rotate-180' : ''}`} />
                </Button>
                {!expanded && <IconButton size="sm" aria-label={`Ocultar projeto ${project.title} da timeline`} onClick={() => setHiddenProjectIds(previous => new Set(previous).add(project.id))}><X className="w-4 h-4" /></IconButton>}
              </div>
              {expanded && <div className="space-y-1">
              <Button variant="ghost" size="sm" className="px-0 h-auto min-h-9 text-body whitespace-normal text-left justify-start" onClick={() => openOutsideTimeline(() => onSelectProject?.(project.id))}>{project.title}</Button>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {project.installProjectNo && <span className="text-caption text-text-secondary">{project.installProjectNo}</span>}
                <Badge className={`${style.badgeClass} px-1 py-0 text-[10px] leading-4`}>{style.name}</Badge>
              </div>
              </div>}
              {pending.length > 0 && <div className="pt-1">
                <Button variant="ghost" size="sm" className="w-full min-h-8 h-auto px-1 justify-between text-left text-caption" aria-expanded={undatedOpen}
                  aria-label={`${undatedOpen ? 'Recolher' : 'Mostrar'} ${pending.length} tarefas sem data de ${project.title}`}
                  onClick={() => setExpandedUndatedProjects(previous => { const next = new Set(previous); if (next.has(project.id)) next.delete(project.id); else next.add(project.id); return next; })}>
                  <span>Tarefas sem data</span><ChevronDown aria-hidden="true" className={`w-4 h-4 shrink-0 ${undatedOpen ? 'rotate-180' : ''}`} />
                </Button>
                {undatedOpen && <div className="max-h-32 overflow-y-auto space-y-2 pt-1" aria-label={`Tarefas sem data de ${project.title}`}>
                  {pending.map(task => { const taskStyle = getTaskStatusStyle(task.statusId, taskStatuses); const incomplete = Boolean(task.startDate?.trim() || task.endDate?.trim()); return <div key={task.id} className="rounded-control border border-border bg-surface-muted p-1 space-y-1">
                    <Button {...dragProps(task)} variant="ghost" size="sm" className={`w-full h-auto min-h-8 px-1 justify-start text-left ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      title={task.title} aria-label={`Abrir tarefa sem data ${task.title}`} onClick={() => openOutsideTimeline(() => onSelectTask(task))}>
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${task.assigneeIds?.length ? taskStyle.dotClass : 'bg-error'}`} aria-hidden="true" />
                      <span className="truncate">{task.title}</span>
                    </Button>
                    {incomplete && <span className="block text-caption text-warning">Data incompleta</span>}
                  </div>; })}
                </div>}
              </div>}
            </th>
            {days.map(day => <td key={day.dateStr} {...dropProps(day.dateStr, project.id)} className={`p-2 border-l border-border ${dayStyle(day.dateStr, day.isWeekend)} ${dragOverCell === `${project.id}:${day.dateStr}` ? 'ring-2 ring-inset ring-primary' : ''}`}>
              {!expanded && <div className="space-y-1">
                {(events.get(project.id)?.get(day.dateStr) || []).filter(event => event.kind === 'task').map((event, index) => {
                  const status = getTaskStatusStyle(event.task.statusId, taskStatuses);
                  const assigneeIds = event.task.assigneeIds || [];
                  return <Button key={`compact-task-${index}`} {...dragProps(event.task)} variant="ghost" size="sm" title={event.title} aria-label={`Abrir tarefa ${event.title}`}
                    className={`w-full min-h-9 h-auto px-1 py-1 justify-start bg-surface border border-border border-l-4 ${status.dotClass.replace('bg-', 'border-l-')} ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onClick={() => openOutsideTimeline(() => onSelectTask(event.task))}>
                    <span className="flex items-center gap-1 min-w-0">
                      {assigneeIds.slice(0, 2).map(id => { const name = users.find(user => user.id === id)?.name || 'Utilizador indisponível'; return <span key={id} title={name} aria-label={name} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-caption font-bold shrink-0">{getUserInitials(name)}</span>; })}
                      {!assigneeIds.length && <span className="w-3 h-3 rounded-full bg-error" aria-label="Sem utilizador alocado" title="Sem utilizador alocado" />}
                      {assigneeIds.length > 2 && <span className="text-caption">+{assigneeIds.length - 2}</span>}
                      <span className="min-w-0 flex-1 truncate text-caption text-text-primary">{event.title}</span>
                    </span>
                  </Button>;
                })}
              </div>}
              {expanded && <div className="space-y-2">
                {(events.get(project.id)?.get(day.dateStr) || []).map((event, index) => {
                  const status = event.kind === 'task' ? getTaskStatusStyle(event.task.statusId, taskStatuses) : undefined;
                  return <Button key={`${event.kind}-${index}`} {...(event.kind === 'task' ? dragProps(event.task) : {})} variant="ghost" size="sm" className={`w-full h-auto min-h-9 px-2 py-2 whitespace-normal text-left justify-start bg-surface border border-border ${status ? `border-l-4 ${status.dotClass.replace('bg-', 'border-l-')}` : ''} ${status && canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onClick={() => openOutsideTimeline(() => event.kind === 'task' ? onSelectTask(event.task) : onSelectProject?.(project.id))}>
                    <span className="flex flex-col gap-1 min-w-0 break-words">
                      <span className="text-body-sm font-semibold">{event.kind === 'risk' && <ShieldAlert className="inline w-3.5 h-3.5 mr-1" />}{event.title}</span>
                      {event.kind === 'task' ? <><span className="text-caption text-text-secondary">{parseTaskHoursToFloat(event.task.estimatedHours)} h previstas</span>
                        <span className="flex items-center gap-1" aria-label="Técnicos alocados">
                          {(event.task.assigneeIds || []).slice(0, 2).map(id => { const name = users.find(user => user.id === id)?.name || 'Utilizador indisponível'; return <span key={id} title={name} aria-label={name} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-caption font-bold shrink-0">{getUserInitials(name)}</span>; })}
                          {!event.task.assigneeIds?.length && <span className="w-3 h-3 rounded-full bg-error" aria-label="Sem utilizador alocado" title="Sem utilizador alocado" />}
                          {(event.task.assigneeIds || []).length > 2 && <span className="text-caption">+{event.task.assigneeIds.length - 2}</span>}
                        </span>
                        <span className="text-caption text-text-secondary">{(event.task.assigneeIds || []).map(id => users.find(user => user.id === id)?.name).filter(Boolean).join(', ') || 'Sem utilizador alocado'}</span></>
                        : <span className="text-caption text-text-secondary">{event.kind === 'risk' ? 'Revisão de risco' : 'Evento do projeto'}</span>}
                    </span>
                  </Button>;
                })}
              </div>}
              {canCreate && <div className="flex justify-end"><IconButton size="sm" aria-label={`Criar tarefa em ${project.title} no dia ${day.dateStr}`} title="Criar tarefa"
                onClick={() => openOutsideTimeline(() => onCreateTask(day.dateStr, project.id))}><Plus className="w-4 h-4" /></IconButton></div>}
            </td>)}
          </tr>; })}</tbody>
        </table>
      </div>
      {moveError && <p role="alert" className="p-3 text-body-sm text-error">{moveError}</p>}
      {!filtered.length && <p className="p-6 text-body-sm text-text-secondary">Nenhum projeto encontrado para os filtros selecionados.</p>}
      <div data-project-timeline-dock className="sticky bottom-0 z-40 border-t border-border bg-surface shadow-raised rounded-b-card">
      <div ref={dockScrollRef} onScroll={event => syncHorizontalScroll(event.currentTarget, tableScrollRef.current)}
        className="overflow-x-auto" tabIndex={0} aria-label="Deslocar timeline na horizontal"
        data-project-timeline-horizontal-scroll><div style={{ width: timelineMinWidth, height: 1 }} /></div>
      <div className="p-4 bg-surface-muted/60 flex flex-wrap justify-between items-center gap-3">
        <p className="text-caption text-text-secondary">{filtered.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} de ${filtered.length} projetos` : '0 projetos'} · até 50 por página</p>
        <nav aria-label="Paginação da timeline" className="flex items-center gap-2">
          <IconButton size="sm" aria-label="Página anterior de projetos" disabled={validPage <= 1} onClick={() => setPage(validPage - 1)}><ChevronLeft className="w-4 h-4" /></IconButton>
          <span className="text-caption text-text-secondary" aria-live="polite">{validPage} / {pages}</span>
          <IconButton size="sm" aria-label="Página seguinte de projetos" disabled={validPage >= pages} onClick={() => setPage(validPage + 1)}><ChevronRight className="w-4 h-4" /></IconButton>
        </nav>
      </div>
      </div>
      </div>
    </Card>
    </div>
  </ExpandedView>;
}
