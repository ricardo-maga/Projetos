'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2, Plus, Search, ShieldAlert, X } from 'lucide-react';
import type { Client, Project, ProjectRiskItem, SpecialDay, Task, User } from '../lib/types';
import { buildProjectTimelineEvents, filterProjectTimeline, type TimelineHorizon } from '../lib/projectTimeline';
import { getOperationalCalendarDays, formatOperationalDateRange } from '../lib/operationalCalendar';
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

interface ProjectTimelineProps {
  projects: Project[]; clients: Client[]; tasks: Task[]; projectStatuses: any[]; taskStatuses: any[];
  users?: User[];
  projectRiskItems?: ProjectRiskItem[]; specialDays?: SpecialDay[]; canCreate: boolean;
  onSelectProject?: (id: string) => void; onSelectTask: (task: Task) => void; onCreateTask: (date: string, projectId: string) => void;
}
const PAGE_SIZE = 50;
export default function ProjectTimeline({ projects, clients, tasks, users = [], projectStatuses, taskStatuses, projectRiskItems = [], specialDays = [],
  canCreate, onSelectProject, onSelectTask, onCreateTask }: ProjectTimelineProps) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [periodDays, setPeriodDays] = useState<7 | 14>(7);
  const [horizon, setHorizon] = useState<TimelineHorizon>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [includeRiskReviews, setIncludeRiskReviews] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(new Set());
  const masterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === masterRef.current);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement) setFullscreen(false); };
    document.addEventListener('fullscreenchange', change);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', change); document.removeEventListener('keydown', escape); };
  }, []);
  const toggleFullscreen = async () => {
    if (fullscreen) {
      if (document.fullscreenElement === masterRef.current) await document.exitFullscreen();
      setFullscreen(false);
    } else {
      if (masterRef.current?.requestFullscreen) {
        try { await masterRef.current.requestFullscreen(); setFullscreen(true); }
        catch { setFullscreen(true); }
      } else setFullscreen(true);
    }
  };
  // Existing dialogs live in the parent section, outside the native fullscreen root.
  const openOutsideTimeline = async (action: () => void) => {
    if (typeof document !== 'undefined' && document.fullscreenElement && document.fullscreenElement === masterRef.current) await document.exitFullscreen();
    setFullscreen(false);
    action();
  };
  const days = useMemo(() => getOperationalCalendarDays(anchor, periodDays), [anchor, periodDays]);
  const events = useMemo(() => buildProjectTimelineEvents(projects, tasks, projectRiskItems, includeRiskReviews), [projects, tasks, projectRiskItems, includeRiskReviews]);
  const filtered = filterProjectTimeline(projects, clients, projectStatuses, events, { search, horizon, showCompleted })
    .filter(project => !hiddenProjectIds.has(project.id));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), validPage = Math.min(page, pages);
  const start = (validPage - 1) * PAGE_SIZE, visibleProjects = filtered.slice(start, start + PAGE_SIZE);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const shift = (offset: number) => setAnchor(previous => { const next = new Date(previous); next.setDate(next.getDate() + offset); return next; });
  const dayStyle = (date: string, weekend: boolean) => specialDays.some(s => s.date === date) || weekend ? 'bg-surface-muted' : 'bg-surface';
  const compactDays = new Set(days.filter(day => (day.isWeekend || specialDays.some(s => s.date === day.dateStr)) &&
    !visibleProjects.some(project => (events.get(project.id)?.get(day.dateStr) || []).some(event => event.kind === 'task'))
  ).map(day => day.dateStr));
  const timelineMinWidth = 260 + days.reduce((width, day) => width + (compactDays.has(day.dateStr) ? 64 : 150), 0);
  return <div ref={masterRef} data-project-timeline-master className={fullscreen
    ? 'fixed inset-0 z-50 h-screen overflow-y-auto bg-background p-4 sm:p-6 space-y-4'
    : 'space-y-4'}>
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-5 bg-surface-muted/60 border-b border-border/80 space-y-4">
        <M3SectionHeader title="Timeline de projetos" description="Eventos por projeto, tarefas e datas de entrega."
          actions={<Button variant="outline" size="sm" onClick={toggleFullscreen} aria-pressed={fullscreen}>
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}{fullscreen ? 'Sair do ecrã cheio' : 'Ecrã cheio'}
          </Button>} />
        <DateViewNavigator periodDays={periodDays} onPeriodDaysChange={setPeriodDays} onPrev={() => shift(-periodDays)} onNext={() => shift(periodDays)}
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
      {/* Intrinsic table height: only horizontal scrolling here; the master owns vertical scrolling. */}
      <div className="overflow-x-auto overflow-y-hidden" data-project-timeline-scroll>
        <table className="w-full table-fixed text-body-sm" style={{ minWidth: timelineMinWidth }}>
          <caption className="sr-only">Timeline de projetos · {formatOperationalDateRange(days)}</caption>
          <colgroup><col style={{ width: 260 }} />{days.map(day => <col key={day.dateStr} style={compactDays.has(day.dateStr) ? { width: 64 } : undefined} />)}</colgroup>
          <thead className="text-body-sm font-semibold text-text-secondary bg-surface-muted"><tr>
            <th scope="col" className="p-3 text-left text-body-sm font-semibold">Projeto</th>
            {days.map(day => <th scope="col" key={day.dateStr} className={`p-3 border-l border-border text-left text-body-sm font-semibold ${dayStyle(day.dateStr, day.isWeekend)} ${day.isToday ? 'ring-1 ring-inset ring-primary' : ''}`}>
              <span className="block">{day.weekdayShort.slice(0, 3).toUpperCase()} {day.dayNum}/{day.date.getMonth() + 1}</span>
              {specialDays.find(s => s.date === day.dateStr) && <span className="block text-caption font-normal text-text-secondary break-words">{specialDays.find(s => s.date === day.dateStr)?.name}</span>}
            </th>)}
          </tr></thead>
          <tbody>{visibleProjects.map(project => { const style = getProjectStatusStyle(project.statusId, projectStatuses); const expanded = expandedProjects.has(project.id); return <tr key={project.id} className="border-t border-border align-top">
            <th scope="row" className="p-3 text-left font-medium text-text-primary space-y-1">
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
              {project.installProjectNo && <span className="block text-caption text-text-secondary">{project.installProjectNo}</span>}
              <Badge className={style.badgeClass}>{style.name}</Badge>
              </div>}
            </th>
            {days.map(day => <td key={day.dateStr} className={`p-2 border-l border-border ${dayStyle(day.dateStr, day.isWeekend)}`}>
              {!expanded && <div className="space-y-1">
                {(events.get(project.id)?.get(day.dateStr) || []).filter(event => event.kind === 'task').map((event, index) => {
                  const status = getTaskStatusStyle(event.task.statusId, taskStatuses);
                  const assigneeIds = event.task.assigneeIds || [];
                  return <Button key={`compact-task-${index}`} variant="ghost" size="sm" title={event.title} aria-label={`Abrir tarefa ${event.title}`}
                    className={`w-full min-h-9 h-auto px-1 py-1 justify-start bg-surface border border-border border-l-4 ${status.dotClass.replace('bg-', 'border-l-')}`}
                    onClick={() => openOutsideTimeline(() => onSelectTask(event.task))}>
                    <span className="flex items-center gap-1 min-w-0">
                      {assigneeIds.slice(0, 2).map(id => { const name = users.find(user => user.id === id)?.name || 'Utilizador indisponível'; return <span key={id} title={name} aria-label={name} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-caption font-bold shrink-0">{getUserInitials(name)}</span>; })}
                      {!assigneeIds.length && <span className={`w-3 h-3 rounded-full ${status.dotClass}`} aria-label={status.name} />}
                      {assigneeIds.length > 2 && <span className="text-caption">+{assigneeIds.length - 2}</span>}
                      <span className="min-w-0 flex-1 truncate text-caption text-text-primary">{event.title}</span>
                    </span>
                  </Button>;
                })}
              </div>}
              {expanded && <div className="space-y-2">
                {(events.get(project.id)?.get(day.dateStr) || []).map((event, index) => {
                  const status = event.kind === 'task' ? getTaskStatusStyle(event.task.statusId, taskStatuses) : undefined;
                  return <Button key={`${event.kind}-${index}`} variant="ghost" size="sm" className={`w-full h-auto min-h-9 px-2 py-2 whitespace-normal text-left justify-start bg-surface border border-border ${status ? `border-l-4 ${status.dotClass.replace('bg-', 'border-l-')}` : ''}`}
                    onClick={() => openOutsideTimeline(() => event.kind === 'task' ? onSelectTask(event.task) : onSelectProject?.(project.id))}>
                    <span className="flex flex-col gap-1 min-w-0 break-words">
                      <span className="text-body-sm font-semibold">{event.kind === 'risk' && <ShieldAlert className="inline w-3.5 h-3.5 mr-1" />}{event.title}</span>
                      {event.kind === 'task' ? <><span className="text-caption text-text-secondary">{parseTaskHoursToFloat(event.task.estimatedHours)} h previstas</span>
                        <span className="flex items-center gap-1" aria-label="Técnicos alocados">
                          {(event.task.assigneeIds || []).slice(0, 2).map(id => { const name = users.find(user => user.id === id)?.name || 'Utilizador indisponível'; return <span key={id} title={name} aria-label={name} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-caption font-bold shrink-0">{getUserInitials(name)}</span>; })}
                          {(event.task.assigneeIds || []).length > 2 && <span className="text-caption">+{event.task.assigneeIds.length - 2}</span>}
                        </span>
                        <span className="text-caption text-text-secondary">{(event.task.assigneeIds || []).map(id => users.find(user => user.id === id)?.name).filter(Boolean).join(', ') || 'Sem utilizador alocado'}</span></>
                        : <span className="text-caption text-text-secondary">{event.kind === 'risk' ? 'Revisão de risco' : 'Evento do projeto'}</span>}
                    </span>
                  </Button>;
                })}
                {canCreate && <IconButton size="sm" aria-label={`Criar tarefa em ${project.title} no dia ${day.dateStr}`} onClick={() => openOutsideTimeline(() => onCreateTask(day.dateStr, project.id))}><Plus className="w-4 h-4" /></IconButton>}
              </div>}
            </td>)}
          </tr>; })}</tbody>
        </table>
      </div>
      {!filtered.length && <p className="p-6 text-body-sm text-text-secondary">Nenhum projeto encontrado para os filtros selecionados.</p>}
      <div className="p-4 border-t border-border bg-surface-muted/60 flex flex-wrap justify-between items-center gap-3">
        <p className="text-caption text-text-secondary">{filtered.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} de ${filtered.length} projetos` : '0 projetos'} · até 50 por página</p>
        <nav aria-label="Paginação da timeline" className="flex items-center gap-2">
          <IconButton size="sm" aria-label="Página anterior de projetos" disabled={validPage <= 1} onClick={() => setPage(validPage - 1)}><ChevronLeft className="w-4 h-4" /></IconButton>
          <span className="text-caption text-text-secondary" aria-live="polite">{validPage} / {pages}</span>
          <IconButton size="sm" aria-label="Página seguinte de projetos" disabled={validPage >= pages} onClick={() => setPage(validPage + 1)}><ChevronRight className="w-4 h-4" /></IconButton>
        </nav>
      </div>
    </Card>
  </div>;
}
