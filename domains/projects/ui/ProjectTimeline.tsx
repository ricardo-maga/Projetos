'use client';
import MobileProjectAgenda from './MobileProjectAgenda';
import MobileViewToggle from '@/components/ui/MobileViewToggle';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2, Plus, Search, ShieldAlert, X } from 'lucide-react';
import type { Client, Project, ProjectRiskItem, SpecialDay, Task, User, UserAbsence } from '@/lib/types';
import { buildProjectTimelineEvents, buildUndatedProjectTasks, canDropTimelineTask, computeTimelineTaskDropUpdates, filterProjectTimeline, getOtherTimelineTasks, type TimelineHorizon } from '@/domains/projects/modules/projectTimeline';
import { getOperationalCalendarDays, formatOperationalDateRange, getOperationalDayConflicts, getUserDayAbsence, isTaskOnDate, isUserAssignedToTask } from '@/domains/calendar/modules/operationalCalendar';
import { parseTaskHoursToFloat } from '@/domains/tasks/modules/taskOperations';
import { cn, getTaskStatusStyle, getProjectStatusStyle, getUserInitials } from '@/lib/utils';
import { M3SectionHeader, M3SegmentedControl } from '@/components/M3';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import DateViewNavigator from '@/components/ui/DateViewNavigator';
import ExpandedView from '@/components/ui/ExpandedView';
import TimelineAbsenceBadge from './TimelineAbsenceBadge';

interface ProjectTimelineProps {
  projects: Project[]; clients: Client[]; tasks: Task[]; projectStatuses: any[]; taskStatuses: any[];
  users?: User[];
  absences?: UserAbsence[];
  projectRiskItems?: ProjectRiskItem[]; specialDays?: SpecialDay[]; canCreate: boolean;
  onSelectProject?: (id: string) => void; onSelectTask: (task: Task) => void;
  onCreateTask: (date: string, projectId?: string) => void;
  canCopy?: boolean;
  onCopyTask?: (task: Task, date: string, projectId: string | null) => Promise<Task>;
  updateTask?: (id: string, updates: Partial<Task>) => any;
}
const PAGE_SIZE = 50;
type TimelineView = 7 | 14 | 28 | '56-hd';
const timelineViews: { value: TimelineView; label: string }[] = [
  ...([7, 14, 28] as const).map(value => ({ value, label: `${value} dias` })),
  { value: '56-hd', label: '56 Dias HD' },
];
const taskBorderColor: Record<string, string> = {
  vermelho: 'border-l-feedback-error-500',
  amarelo: 'border-l-feedback-warning-500',
  verde: 'border-l-feedback-success-500',
  azul: 'border-l-category-sky-500',
  laranja: 'border-l-feedback-attention-500',
  cinza: 'border-l-status-neutral-400',
};
const taskBorderClass = (status: ReturnType<typeof getTaskStatusStyle>) => taskBorderColor[status.id] || taskBorderColor.cinza;
export default function ProjectTimeline({ projects, clients, tasks, users = [], absences = [], projectStatuses, taskStatuses, projectRiskItems = [], specialDays = [],
  canCreate, canCopy = false, onCopyTask, onSelectProject, onSelectTask, onCreateTask, updateTask }: ProjectTimelineProps) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState<TimelineView>(7);
  const highDensity = typeof view === 'string';
  const periodDays = view === '56-hd' ? 56 : view;
  const [horizon, setHorizon] = useState<TimelineHorizon>(28);
  const [includeRiskReviews, setIncludeRiskReviews] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [mobileGrid, setMobileGrid] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(new Set());
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [moveError, setMoveError] = useState('');
  const dragContext = useRef<{ operation: 'copy' | 'move'; date: string | null } | null>(null);
  const copying = useRef(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [copyBusy, setCopyBusy] = useState(false);
  const draggingTaskId = useRef<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const dockScrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dockSlotRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [floatingDock, setFloatingDock] = useState<{ left: number; width: number; height: number } | null>(null);
  const [floatingHeader, setFloatingHeader] = useState<{ left: number; width: number; height: number } | null>(null);
  const floatingHeaderScrollRef = useRef<HTMLDivElement>(null);
  const canMove = canCreate && !!updateTask;
  const openOutsideTimeline = (action: () => void) => {
    setFullscreen(false);
    action();
  };
  const days = useMemo(() => getOperationalCalendarDays(anchor, periodDays), [anchor, periodDays]);
  const events = useMemo(() => buildProjectTimelineEvents(projects, tasks, projectRiskItems, includeRiskReviews), [projects, tasks, projectRiskItems, includeRiskReviews]);
  const undatedTasks = useMemo(() => buildUndatedProjectTasks(tasks), [tasks]);
  const filtered = filterProjectTimeline(projects, clients, projectStatuses, events, undatedTasks,
    { search, horizon, visibleStartDate: days[0].dateStr, visibleEndDate: days[days.length - 1].dateStr })
    .filter(project => !hiddenProjectIds.has(project.id));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), validPage = Math.min(page, pages);
  const start = (validPage - 1) * PAGE_SIZE, visibleProjects = filtered.slice(start, start + PAGE_SIZE);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const projectMap = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);
  const otherDays = useMemo(() => new Map(days.map(day => {
    const otherTasks = getOtherTimelineTasks(tasks, day.dateStr);
    const dayTasks = tasks.filter(task => isTaskOnDate(task, day.dateStr));
    const absentUsers = users.filter(user => !user.deleted).flatMap(user => {
      const absence = getUserDayAbsence(absences, user.id, day.dateStr);
      if (!absence) return [];
      const conflict = getOperationalDayConflicts(dayTasks.filter(task => isUserAssignedToTask(task, user.id)), absence,
        user.name, day.dateStr.split('-').reverse().join('/'));
      return [{ user, absence, conflict }];
    });
    return [day.dateStr, { otherTasks, absentUsers }] as const;
  })), [days, tasks, users, absences]);
  const conflictTaskIds = useMemo(() => new Map(days.map(day => {
    const dayTasks = tasks.filter(task => isTaskOnDate(task, day.dateStr));
    const ids = new Set<string>();
    for (const user of users.filter(user => !user.deleted)) {
      const assigned = dayTasks.filter(task => isUserAssignedToTask(task, user.id));
      const absence = getUserDayAbsence(absences, user.id, day.dateStr);
      if (getOperationalDayConflicts(assigned, absence).hasConflict) assigned.forEach(task => ids.add(task.id));
    }
    return [day.dateStr, ids] as const;
  })), [days, tasks, users, absences]);
  const shift = (offset: number) => setAnchor(previous => { const next = new Date(previous); next.setDate(next.getDate() + offset); return next; });
  const dragProps = (task: Task, sourceDate: string | null = null) => ({
    draggable: !copyBusy && (canMove || canCopy && !!onCopyTask),
    onDragStart: (event: React.DragEvent<HTMLButtonElement>) => {
      const operation = event.ctrlKey ? 'copy' : 'move';
      if (copying.current || (operation === 'copy' ? !canCopy || !onCopyTask : !canMove)) { event.preventDefault(); return; }
      dragContext.current = { operation, date: sourceDate };
      draggingTaskId.current = task.id;
      event.dataTransfer.setData('application/x-project-timeline-task', task.id);
      event.dataTransfer.effectAllowed = operation;
    },
    onDragEnd: () => { draggingTaskId.current = null; dragContext.current = null; setDragOverCell(null); },
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
    const createTask = () => openOutsideTimeline(() => onCreateTask(date, projectId || undefined));
    return {
      onDoubleClick: highDensity && canCreate ? (event: React.MouseEvent<HTMLTableCellElement>) => {
        if ((event.target as HTMLElement).closest?.('button,a,input,select,textarea,[role="button"]')) return;
        createTask();
      } : undefined,
      onKeyDown: highDensity && canCreate ? (event: React.KeyboardEvent<HTMLTableCellElement>) => {
        if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        createTask();
      } : undefined,
      tabIndex: highDensity && canCreate ? 0 : undefined,
      'aria-label': highDensity && canCreate ? `Criar tarefa ${projectId ? `em ${projectMap.get(projectId)?.title}` : 'sem projeto'} no dia ${date}: duplo clique ou Enter` : undefined,
      onDragOver: (event: React.DragEvent<HTMLTableCellElement>) => {
        const task = tasks.find(item => item.id === draggingTaskId.current);
        if (copying.current || !dragContext.current || (dragContext.current.operation === 'copy' ? !canCopy || !onCopyTask : !canMove) || !task || !canDropTimelineTask(task, projectId)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = dragContext.current.operation;
        setDragOverCell(key);
      },
      onDragLeave: (event: React.DragEvent<HTMLTableCellElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverCell(null);
      },
      onDrop: (event: React.DragEvent<HTMLTableCellElement>) => {
        setDragOverCell(null);
        const id = event.dataTransfer.getData('application/x-project-timeline-task');
        const context = dragContext.current;
        if (copying.current || !context || !id || id !== draggingTaskId.current) return;
        if (context.operation === 'copy' ? !canCopy || !onCopyTask : !canMove) return;
        const task = tasks.find(item => item.id === id);
        if (!task) return;
        if (!canDropTimelineTask(task, projectId)) return;
        event.preventDefault();
        draggingTaskId.current = null;
        dragContext.current = null;
        if (context.operation === 'copy') {
          if (context.date === date) return;
          copying.current = true; setCopyBusy(true); setMoveError(''); setCopyMessage('A copiar tarefa…');
          void Promise.resolve().then(() => onCopyTask!(task, date, projectId)).then(created => {
            if (!created?.id) throw new Error('O servidor não confirmou a criação da tarefa.');
            setCopyMessage('Tarefa copiada.');
          }).catch(error => { setCopyMessage(''); setMoveError(error instanceof Error ? error.message : 'Não foi possível copiar a tarefa.'); })
            .finally(() => { copying.current = false; setCopyBusy(false); });
        } else scheduleTask(task, date, projectId);
      },
      'data-timeline-drop-cell': key,
    };
  };
  const dayStyle = (date: string, weekend: boolean) => specialDays.some(s => s.date === date) || weekend ? 'bg-surface-muted' : 'bg-surface';
  const compactDays = new Set(days.filter(day => (day.isWeekend || specialDays.some(s => s.date === day.dateStr)) &&
    !otherDays.get(day.dateStr)?.otherTasks.length && !otherDays.get(day.dateStr)?.absentUsers.length &&
    !visibleProjects.some(project => (events.get(project.id)?.get(day.dateStr) || []).some(event => event.kind === 'task'))
  ).map(day => day.dateStr));
  const projectColumnWidth = highDensity ? 180 : 260;
  const dayWidth = (date: string) => compactDays.has(date) ? (highDensity ? 28 : 64) : (highDensity ? 36 : 150);
  const columnStyle = (date: string) => highDensity || compactDays.has(date) ? { width: dayWidth(date) } : undefined;
  const timelineMinWidth = projectColumnWidth + days.reduce((width, day) => width + dayWidth(day.dateStr), 0);
  const renderHdTask = (task: Task, key: React.Key, date: string) => {
    const names = (task.assigneeIds || []).map(id => users.find(user => user.id === id)?.name || 'Utilizador indisponível');
    return <Button key={key} {...dragProps(task, date)} variant="ghost" size="sm"
      data-timeline-hd-task={task.id} title={[task.title, ...names].join(' · ')}
      aria-label={`Abrir tarefa ${task.title}${names.length ? ` · ${names.join(', ')}` : ' · Sem utilizador alocado'}`}
      className={`w-full min-h-6 h-auto px-0.5 py-0.5 justify-start text-left bg-surface border border-border border-l-2 ${taskBorderClass(getTaskStatusStyle(task.statusId, taskStatuses))} ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onClick={() => openOutsideTimeline(() => onSelectTask(task))}>
      <span className="flex flex-wrap items-center gap-0.5 w-full min-w-0">
        {names.map((name, index) => <span key={index} aria-label={name} className="w-5 h-5 rounded-full bg-primary text-inverse flex items-center justify-center text-micro font-bold shrink-0">{getUserInitials(name)}</span>)}
        {!names.length && <span className="block w-3 h-3 rounded-full bg-error" aria-label="Sem utilizador alocado" />}
      </span>
    </Button>;
  };
  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
    if (floatingHeaderScrollRef.current) floatingHeaderScrollRef.current.scrollLeft = source.scrollLeft;
  };
  useEffect(() => {
    if (floatingHeaderScrollRef.current && tableScrollRef.current) floatingHeaderScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
  }, [floatingHeader]);
  useEffect(() => {
    const updateDock = () => {
      const table = tableScrollRef.current, card = cardRef.current, slot = dockSlotRef.current, dock = dockRef.current;
      if (!table || !card || !slot || !dock) return;
      const tableRect = table.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const height = dock.offsetHeight;
      const headerHeight = table.querySelector('thead')?.getBoundingClientRect().height || 0;
      const nextHeader = tableRect.top < 0 && tableRect.bottom > headerHeight
        ? { left: tableRect.left, width: tableRect.width, height: headerHeight } : null;
      setFloatingHeader(previous => previous?.left === nextHeader?.left && previous?.width === nextHeader?.width && previous?.height === nextHeader?.height ? previous : nextHeader);
      const shouldFloat = tableRect.top < window.innerHeight && tableRect.bottom > 0 && slotRect.top > window.innerHeight - height;
      const next = shouldFloat ? { left: cardRect.left, width: cardRect.width, height } : null;
      setFloatingDock(previous => previous?.left === next?.left && previous?.width === next?.width && previous?.height === next?.height ? previous : next);
    };
    updateDock();
    document.addEventListener('scroll', updateDock, true);
    window.addEventListener('resize', updateDock);
    const observer = new ResizeObserver(updateDock);
    for (const element of [tableScrollRef.current, cardRef.current, dockRef.current]) if (element) observer.observe(element);
    return () => { document.removeEventListener('scroll', updateDock, true); window.removeEventListener('resize', updateDock); observer.disconnect(); };
  }, [fullscreen, mobileGrid]);
  return <ExpandedView open={fullscreen} onClose={() => setFullscreen(false)} title="Timeline de projetos">
    <div data-project-timeline-master data-timeline-density={highDensity ? 'high' : 'normal'} className={fullscreen ? 'p-3 sm:p-5' : ''}>
    <Card ref={cardRef} className="mobile-timeline-section min-w-0 overflow-visible">
      <div className="p-4 sm:p-5 bg-surface-muted/60 border-b border-border/80 space-y-4">
        <M3SectionHeader title="Timeline de projetos" description="Eventos por projeto, tarefas e datas de entrega."
          actions={<Button variant="outline" size="sm" onClick={() => setFullscreen(value => !value)} aria-pressed={fullscreen}>
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}{fullscreen ? 'Sair do ecrã cheio' : 'Ecrã cheio'}
          </Button>} />
        <MobileViewToggle grid={mobileGrid} onChange={setMobileGrid} label="timeline" />
        <DateViewNavigator periodDays={periodDays} periods={[7, 14, 28]} navigationStepDays={7} periodLabelClassName="whitespace-nowrap sm:w-52 sm:shrink-0"
          onPeriodDaysChange={value => setView(value === 56 ? '56-hd' : value)}
          periodSelector={<M3SegmentedControl<TimelineView> className="project-timeline-view-options" label="Período de visualização" value={view} options={timelineViews} onChange={setView} />}
          onPrev={() => shift(-7)} onNext={() => shift(7)}
          onToday={() => setAnchor(new Date())} />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
          <span className={cn('text-label font-bold text-text-primary', 'whitespace-nowrap sm:w-52 sm:shrink-0')}>Com eventos em:</span>
          <M3SegmentedControl<TimelineHorizon> label="Com eventos em" value={horizon}
            onChange={value => { setHorizon(value); setPage(1); }} options={[7, 14, 21, 28].map(value => ({ value: value as TimelineHorizon, label: `${value} dias` })).concat([{ value: 'all', label: 'Todos' }])} />
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-0 basis-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted z-10 pointer-events-none" />
              <Input aria-label="Pesquisar na timeline" placeholder="Pesquisar projeto, cliente ou nº IP…" className="pl-9 text-body-sm" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
            <Checkbox label="Revisões de risco" checked={includeRiskReviews} onChange={e => { setIncludeRiskReviews(e.target.checked); setPage(1); }} />
            {hiddenProjectIds.size > 0 && <Button variant="outline" size="sm" onClick={() => setHiddenProjectIds(new Set())}>Repor todos os projetos</Button>}
          </div>
        </div>
      </div>
      {/* The dock stays at the viewport bottom while the table passes through the vertical scroll area. */}
      {!mobileGrid && <MobileProjectAgenda projects={visibleProjects} clients={clients} users={users} projectStatuses={projectStatuses}
        taskStatuses={taskStatuses} days={days} events={events} undatedTasks={undatedTasks} otherDays={otherDays}
        conflictTaskIds={conflictTaskIds} specialDays={specialDays} expanded={expandedProjects}
        onToggle={id => setExpandedProjects(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
        onHide={id => setHiddenProjectIds(previous => new Set(previous).add(id))}
        onOpenProject={id => openOutsideTimeline(() => onSelectProject?.(id))}
        onOpenTask={task => openOutsideTimeline(() => onSelectTask(task))}
        onCreate={canCreate ? (date, projectId) => openOutsideTimeline(() => onCreateTask(date, projectId)) : undefined} />}
      <div className="relative">
      <div ref={tableScrollRef} onScroll={event => syncHorizontalScroll(event.currentTarget, dockScrollRef.current)}
        className={`${mobileGrid ? '' : 'hidden md:block'} project-timeline-table-scroll overflow-x-auto overflow-y-hidden`} data-project-timeline-scroll>
        <table className="w-full table-fixed border-separate border-spacing-0 text-body-sm" style={{ minWidth: timelineMinWidth }}>
          <caption className="sr-only">Timeline de projetos · {formatOperationalDateRange(days)}</caption>
          <colgroup><col style={{ width: projectColumnWidth }} />{days.map(day => <col key={day.dateStr} style={columnStyle(day.dateStr)} />)}</colgroup>
          <thead className="text-body-sm font-semibold text-text-secondary bg-surface-muted"><tr>
            <th scope="col" className="p-3 border-b border-border text-left text-body-sm font-semibold bg-surface-muted lg:sticky lg:left-0 lg:z-30 lg:border-r lg:border-border">Projeto</th>
            {days.map(day => <th scope="col" key={day.dateStr} className={`${highDensity ? 'px-0 py-1 text-micro text-center' : 'p-3 text-body-sm text-left'} border-b border-l border-border font-semibold ${dayStyle(day.dateStr, day.isWeekend)} ${day.isToday ? 'ring-1 ring-inset ring-primary' : ''}`}>
              <span className="block">{day.weekdayShort.slice(0, 3).toUpperCase()}{highDensity ? <span className="block whitespace-nowrap">{day.dayNum}/{day.date.getMonth() + 1}</span> : ` ${day.dayNum}/${day.date.getMonth() + 1}`}</span>
              {specialDays.find(s => s.date === day.dateStr) && <span title={specialDays.find(s => s.date === day.dateStr)?.name} className="block truncate text-caption font-normal text-text-secondary">{specialDays.find(s => s.date === day.dateStr)?.name}</span>}
            </th>)}
          </tr></thead>
          <tbody><tr className="border-t border-border align-top">
            <th scope="row" className="p-3 border-b border-border text-left font-medium text-text-primary bg-surface lg:sticky lg:left-0 lg:z-20 lg:border-r lg:border-border">Outras tarefas</th>
            {days.map(day => <td key={day.dateStr} {...dropProps(day.dateStr, null)} className={`${highDensity ? 'p-0.5' : 'p-2'} border-b border-l border-border ${dayStyle(day.dateStr, day.isWeekend)} ${otherDays.get(day.dateStr)?.otherTasks.some(task => conflictTaskIds.get(day.dateStr)?.has(task.id)) || otherDays.get(day.dateStr)?.absentUsers.some(({ conflict }) => conflict.hasConflict) ? 'project-timeline-conflict-cell' : ''} ${dragOverCell === `other:${day.dateStr}` ? 'ring-2 ring-inset ring-primary' : ''}`}>
              <div className="space-y-1">
                {otherDays.get(day.dateStr)?.absentUsers.map(({ user, absence }) => highDensity
                  ? <TimelineAbsenceBadge key={user.id} name={user.name}
                      description={`${user.name} · ${day.dateStr.split('-').reverse().join('/')} · ${absence.reason || 'Ausente'}`} />
                  : <div key={user.id} title={`${user.name} · ${day.dateStr.split('-').reverse().join('/')} · ${absence.reason || 'Ausente'}`}
                    className="rounded-control border px-2 py-1 text-caption font-semibold bg-surface-muted text-text-secondary border-border">
                    <span className="block">{user.name}: AUSENTE</span>
                  </div>)}
                {otherDays.get(day.dateStr)?.otherTasks.map(task => {
                if (highDensity) return renderHdTask(task, task.id, day.dateStr);
                const status = getTaskStatusStyle(task.statusId, taskStatuses);
                const assigneeIds = task.assigneeIds || [];
                return <Button key={task.id} {...dragProps(task, day.dateStr)} variant="ghost" size="sm" title={task.title} aria-label={`Abrir tarefa ${task.title}`}
                  className={`w-full min-h-9 h-auto px-1 py-1 justify-start bg-surface border border-border border-l-4 ${taskBorderClass(status)} ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  onClick={() => openOutsideTimeline(() => onSelectTask(task))}>
                  <span className="flex items-center gap-1 min-w-0">
                    {assigneeIds.slice(0, 2).map(id => { const name = users.find(user => user.id === id)?.name || 'Utilizador indisponível'; return <span key={id} title={name} aria-label={name} className="w-6 h-6 rounded-full bg-primary text-inverse flex items-center justify-center text-caption font-bold shrink-0">{getUserInitials(name)}</span>; })}
                    {!assigneeIds.length && <span className="w-3 h-3 rounded-full bg-error" aria-label="Sem utilizador alocado" title="Sem utilizador alocado" />}
                    {assigneeIds.length > 2 && <span className="text-caption">+{assigneeIds.length - 2}</span>}
                    <span className="min-w-0 flex-1 truncate text-caption text-text-primary">{task.title}</span>
                    {task.estimatedHours != null && task.estimatedHours !== '' &&
                      <span className="text-caption text-text-secondary">{parseTaskHoursToFloat(task.estimatedHours)}h</span>}
                  </span>
                </Button>;
              })}</div>
              {canCreate && !highDensity && <div className="flex justify-end"><IconButton size="sm" aria-label={`Criar tarefa sem projeto no dia ${day.dateStr}`} title="Criar tarefa"
                onClick={() => openOutsideTimeline(() => onCreateTask(day.dateStr))}><Plus className="w-4 h-4" /></IconButton></div>}
            </td>)}
          </tr>{visibleProjects.map(project => { const style = getProjectStatusStyle(project.statusId, projectStatuses); const expanded = expandedProjects.has(project.id); const pending = undatedTasks.get(project.id) || []; const pendingLabel = `${pending.length} ${pending.length === 1 ? 'tarefa sem data' : 'tarefas sem data'} de ${project.title}`; return <tr key={project.id} className="align-top">
            <th scope="row" data-timeline-project-cell={project.id} className={`${highDensity ? 'p-1.5' : 'p-[0.6rem]'} relative border-b border-border text-left font-medium text-text-primary space-y-1 bg-surface lg:sticky lg:left-0 lg:z-20 lg:border-r lg:border-border`}>
              <div>
                <Button variant="ghost" size="sm" className="w-full min-w-0 h-auto min-h-9 px-0 py-0 text-left whitespace-normal" aria-expanded={expanded}
                  aria-label={`${expanded ? 'Recolher' : 'Expandir'} projeto de ${clientMap.get(project.clientId)?.clientName || 'Cliente N/D'}`}
                  aria-describedby={pending.length ? `timeline-undated-${project.id}` : undefined}
                  onClick={() => setExpandedProjects(previous => { const next = new Set(previous); if (next.has(project.id)) next.delete(project.id); else next.add(project.id); return next; })}>
                  <span className="min-w-0 flex-1 leading-5 [overflow-wrap:anywhere]" title={clientMap.get(project.clientId)?.clientName || 'Cliente N/D'}>
                    {pending.length > 0 && <span id={`timeline-undated-${project.id}`} role="img" aria-label={pendingLabel} title={pendingLabel} className="mr-1 inline-block align-text-bottom text-error"><CalendarDays aria-hidden="true" className="w-4 h-4" /></span>}
                    {clientMap.get(project.clientId)?.clientName || 'Cliente N/D'}
                    <ChevronDown aria-hidden="true" className={`ml-1 inline-block align-text-bottom w-4 h-4 ${expanded ? 'rotate-180' : ''}`} />
                  </span>
                </Button>
                {!expanded && <IconButton size="sm" className="absolute top-0 right-0 z-10 w-[27px] h-[27px]" title="Ocultar projeto da timeline" aria-label={`Ocultar projeto ${project.title} da timeline`} onClick={() => setHiddenProjectIds(previous => new Set(previous).add(project.id))}><X aria-hidden="true" className="w-3 h-3" /></IconButton>}
              </div>
              {expanded && <div className="space-y-1">
              <Button variant="ghost" size="sm" className="px-0 h-auto min-h-9 text-body whitespace-normal text-left justify-start" onClick={() => openOutsideTimeline(() => onSelectProject?.(project.id))}>{project.title}</Button>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {project.installProjectNo && <span className="text-caption text-text-secondary">{project.installProjectNo}</span>}
                <Badge className={`${style.badgeClass} px-1 py-0 text-micro leading-4`}>{style.name}</Badge>
              </div>
              </div>}
              {expanded && pending.length > 0 && <div className="max-h-32 overflow-y-auto space-y-2 pt-1" aria-label={`Tarefas sem data de ${project.title}`}>
                  {pending.map(task => { const taskStyle = getTaskStatusStyle(task.statusId, taskStatuses); const incomplete = Boolean(task.startDate?.trim() || task.endDate?.trim()); return <div key={task.id} className={`rounded-control border border-border border-l-4 ${taskBorderClass(taskStyle)} bg-surface-muted p-1 space-y-1`}>
                    <Button {...dragProps(task)} variant="ghost" size="sm" className={`w-full h-auto min-h-8 px-1 justify-start text-left ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      title={task.title} aria-label={`Abrir tarefa sem data ${task.title}`} onClick={() => openOutsideTimeline(() => onSelectTask(task))}>
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${task.assigneeIds?.length ? taskStyle.dotClass : 'bg-error'}`} aria-hidden="true" />
                      <span className="truncate">{task.title}</span>
                    </Button>
                    {incomplete && <span className="block text-caption text-warning">Data incompleta</span>}
                  </div>; })}
              </div>}
            </th>
            {days.map(day => <td key={day.dateStr} {...dropProps(day.dateStr, project.id)} className={`${highDensity ? 'p-0.5' : 'p-2'} border-b border-l border-border ${dayStyle(day.dateStr, day.isWeekend)} ${(events.get(project.id)?.get(day.dateStr) || []).some(event => event.kind === 'task' && conflictTaskIds.get(day.dateStr)?.has(event.task.id)) ? 'project-timeline-conflict-cell' : ''} ${dragOverCell === `${project.id}:${day.dateStr}` ? 'ring-2 ring-inset ring-primary' : ''}`}>
              {!expanded && <div className="space-y-1">
                {(events.get(project.id)?.get(day.dateStr) || []).filter(event => event.kind === 'task').map((event, index) => {
                  if (highDensity) return renderHdTask(event.task, `compact-task-${index}`, day.dateStr);
                  const status = getTaskStatusStyle(event.task.statusId, taskStatuses);
                  const assigneeIds = event.task.assigneeIds || [];
                  return <Button key={`compact-task-${index}`} {...dragProps(event.task, day.dateStr)} variant="ghost" size="sm" title={event.title} aria-label={`Abrir tarefa ${event.title}`}
                    className={`w-full min-h-9 h-auto px-1 py-1 justify-start bg-surface border border-border border-l-4 ${taskBorderClass(status)} ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onClick={() => openOutsideTimeline(() => onSelectTask(event.task))}>
                    <span className="flex items-center gap-1 min-w-0">
                      {assigneeIds.slice(0, 2).map(id => { const name = users.find(user => user.id === id)?.name || 'Utilizador indisponível'; return <span key={id} title={name} aria-label={name} className="w-6 h-6 rounded-full bg-primary text-inverse flex items-center justify-center text-caption font-bold shrink-0">{getUserInitials(name)}</span>; })}
                      {!assigneeIds.length && <span className="w-3 h-3 rounded-full bg-error" aria-label="Sem utilizador alocado" title="Sem utilizador alocado" />}
                      {assigneeIds.length > 2 && <span className="text-caption">+{assigneeIds.length - 2}</span>}
                      <span className="min-w-0 flex-1 truncate text-caption text-text-primary">{event.title}</span>
                      {event.task.estimatedHours != null && event.task.estimatedHours !== '' &&
                        <span className="text-caption text-text-secondary">{parseTaskHoursToFloat(event.task.estimatedHours)}h</span>}
                    </span>
                  </Button>;
                })}
              </div>}
              {expanded && <div className="space-y-2">
                {(events.get(project.id)?.get(day.dateStr) || []).map((event, index) => {
                  if (highDensity && event.kind === 'task') return renderHdTask(event.task, `task-${index}`, day.dateStr);
                  const status = event.kind === 'task' ? getTaskStatusStyle(event.task.statusId, taskStatuses) : undefined;
                  return <Button key={`${event.kind}-${index}`} {...(event.kind === 'task' ? dragProps(event.task, day.dateStr) : {})} variant="ghost" size="sm" className={`w-full h-auto min-h-9 ${highDensity ? 'px-1 py-1' : 'px-2 py-2'} whitespace-normal text-left justify-start bg-surface border border-border ${status ? `border-l-4 ${taskBorderClass(status)}` : ''} ${status && canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    title={event.title}
                    onClick={() => openOutsideTimeline(() => event.kind === 'task' ? onSelectTask(event.task) : onSelectProject?.(project.id))}>
                      <span className="flex flex-col gap-1 min-w-0 break-words">
                      <span title={event.title} className={`${event.kind === 'milestone' ? 'text-caption text-text-secondary' : 'text-body-sm font-semibold'} ${highDensity ? 'truncate' : event.kind === 'task' ? 'line-clamp-2' : ''}`}>{event.kind === 'risk' && <ShieldAlert className="inline w-3.5 h-3.5 mr-1" />}{event.title}</span>
                      {event.kind === 'task' ? <><span className="flex items-center gap-1" aria-label="Técnicos alocados">
                          {(event.task.assigneeIds || []).slice(0, 2).map(id => { const name = users.find(user => user.id === id)?.name || 'Utilizador indisponível'; return <span key={id} title={name} aria-label={name} className="w-6 h-6 rounded-full bg-primary text-inverse flex items-center justify-center text-caption font-bold shrink-0">{getUserInitials(name)}</span>; })}
                          {!event.task.assigneeIds?.length && <span className="w-3 h-3 rounded-full bg-error" aria-label="Sem utilizador alocado" title="Sem utilizador alocado" />}
                          {(event.task.assigneeIds || []).length > 2 && <span className="text-caption">+{event.task.assigneeIds.length - 2}</span>}
                          <span className="text-caption text-text-secondary">{parseTaskHoursToFloat(event.task.estimatedHours)}h</span>
                        </span>
                        </>
                        : event.kind === 'risk' ? <span className="text-caption text-text-secondary">Revisão de risco</span> : null}
                    </span>
                  </Button>;
                })}
              </div>}
              {canCreate && !highDensity && <div className="flex justify-end"><IconButton size="sm" aria-label={`Criar tarefa em ${project.title} no dia ${day.dateStr}`} title="Criar tarefa"
                onClick={() => openOutsideTimeline(() => onCreateTask(day.dateStr, project.id))}><Plus className="w-4 h-4" /></IconButton></div>}
            </td>)}
          </tr>; })}</tbody>
        </table>
      </div>
      {floatingHeader && <div ref={floatingHeaderScrollRef} data-project-timeline-fixed-header aria-hidden="true"
        className="fixed top-0 z-40 overflow-hidden pointer-events-none border-b border-border shadow-raised"
        style={{ left: floatingHeader.left, width: floatingHeader.width, height: floatingHeader.height }}>
        <table className="w-full table-fixed border-separate border-spacing-0 text-body-sm" style={{ minWidth: timelineMinWidth }}>
          <colgroup><col style={{ width: projectColumnWidth }} />{days.map(day => <col key={day.dateStr} style={columnStyle(day.dateStr)} />)}</colgroup>
          <thead className="text-body-sm font-semibold text-text-secondary bg-surface-muted"><tr>
            <th className="p-3 text-left text-body-sm font-semibold bg-surface-muted lg:sticky lg:left-0 lg:z-30 lg:border-r lg:border-border">Projeto</th>
            {days.map(day => <th key={day.dateStr} className={`${highDensity ? 'px-0 py-1 text-micro text-center' : 'p-3 text-body-sm text-left'} border-l border-border font-semibold ${dayStyle(day.dateStr, day.isWeekend)} ${day.isToday ? 'ring-1 ring-inset ring-primary' : ''}`}>
              <span className="block">{day.weekdayShort.slice(0, 3).toUpperCase()}{highDensity ? <span className="block whitespace-nowrap">{day.dayNum}/{day.date.getMonth() + 1}</span> : ` ${day.dayNum}/${day.date.getMonth() + 1}`}</span>
              {specialDays.find(s => s.date === day.dateStr) && <span title={specialDays.find(s => s.date === day.dateStr)?.name} className="block truncate text-caption font-normal text-text-secondary">{specialDays.find(s => s.date === day.dateStr)?.name}</span>}
            </th>)}
          </tr></thead>
        </table>
      </div>}
      {copyMessage && <p role="status" className="p-3 text-caption text-text-secondary">{copyMessage}</p>}
      {moveError && <p role="alert" className="p-3 text-body-sm text-error">{moveError}</p>}
      {!filtered.length && <p className="p-6 text-body-sm text-text-secondary">Nenhum projeto encontrado para os filtros selecionados.</p>}
      <div ref={dockSlotRef} style={floatingDock ? { height: floatingDock.height } : undefined}>
      <div ref={dockRef} data-project-timeline-dock className={`${floatingDock ? 'fixed bottom-0 z-40' : 'relative'} border-t border-border bg-surface shadow-raised rounded-b-card`}
        style={floatingDock ? { left: floatingDock.left, width: floatingDock.width } : undefined}>
      <div ref={dockScrollRef} onScroll={event => syncHorizontalScroll(event.currentTarget, tableScrollRef.current)}
        className={`${mobileGrid ? '' : 'hidden md:block'} overflow-x-auto`} tabIndex={0} aria-label="Deslocar timeline na horizontal"
        data-project-timeline-horizontal-scroll><div style={{ width: timelineMinWidth, height: 1 }} /></div>
      <div className="p-4 bg-surface-muted/60 flex flex-wrap justify-between items-center gap-3">
        <p className="text-caption text-text-secondary">{filtered.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} de ${filtered.length} projetos` : '0 projetos'}</p>
        <nav aria-label="Paginação da timeline" className="flex items-center gap-2">
          <IconButton size="sm" aria-label="Página anterior de projetos" disabled={validPage <= 1} onClick={() => setPage(validPage - 1)}><ChevronLeft className="w-4 h-4" /></IconButton>
          <span className="text-caption text-text-secondary" aria-live="polite">{validPage} / {pages}</span>
          <IconButton size="sm" aria-label="Página seguinte de projetos" disabled={validPage >= pages} onClick={() => setPage(validPage + 1)}><ChevronRight className="w-4 h-4" /></IconButton>
        </nav>
      </div>
      </div>
      </div>
      </div>
    </Card>
    </div>
  </ExpandedView>;
}
