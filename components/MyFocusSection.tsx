'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Task, Project, Client, TaskStatus, ProjectStatus, User, SpecialDay, TaskType, ProjectRiskItem, RiskStatus
} from '../lib/types';
import { TASK_STATUS_ID_MAPPINGS, getTaskStatusStyle, getProjectStatusStyle } from '../lib/utils';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { assignedFocusRisks, focusHours, paginateFocus } from '../lib/myFocus';
import { FocusPagination, useFocusPagination, FOCUS_TASK_SIZES, FOCUS_PROJECT_SIZES } from './FocusPagination';
import TaskDetailsModal, { TaskModalMode } from './TaskDetailsModal';
import { hasPermission } from '../lib/permissions';
import { M3Button, M3IconButton, M3SegmentedControl } from './M3';
import { 
  CheckSquare, Briefcase, Play, ShieldAlert, Calendar as CalendarIcon, ChevronLeft,
  ChevronRight, Sparkles, Clock, ArrowRight,
  StickyNote, Plus, Trash2, FolderKanban, Flag, PartyPopper
} from 'lucide-react';

interface MyFocusSectionProps {
  currentUser: User;
  users?: User[];
  userGroups?: any[];
  tasks: Task[];
  projects: Project[];
  clients: Client[];
  specialDays?: SpecialDay[];
  projectRiskItems?: ProjectRiskItem[];
  riskStatuses?: RiskStatus[];
  taskStatuses: TaskStatus[];
  taskTypes?: TaskType[];
  userAbsences?: any[];
  projectStatuses: ProjectStatus[];
  addTask?: (t: any) => void;
  updateTask: (id: string, updates: any) => void;
  deleteTask?: (id: string) => void;
  onSelectProject: (id: string) => void;
  appConfig?: any;
}

export default function MyFocusSection({
  currentUser,
  users = [],
  userGroups = [],
  tasks = [],
  projects = [],
  clients = [],
  specialDays = [],
  projectRiskItems = [],
  riskStatuses = [],
  taskStatuses = [],
  taskTypes = [],
  userAbsences = [],
  projectStatuses = [],
  addTask,
  updateTask,
  deleteTask,
  onSelectProject,
  appConfig
}: MyFocusSectionProps) {
  // Task filter state
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  // Project filter state ('active' | 'all' | 'completed')
  const [projectFilter, setProjectFilter] = useState<'active' | 'all' | 'completed'>('active');

  // Task details modal state (Unified Task Modal FASE 30 / 30-A.2)
  const [taskModalState, setTaskModalState] = useState<{
    isOpen: boolean;
    task: Task | null;
    mode: TaskModalMode;
    initialDate?: string;
  }>({
    isOpen: false,
    task: null,
    mode: 'edit',
  });

  const openTaskDetailsModal = (task: Task, mode: TaskModalMode = 'edit') => {
    setTaskModalState({
      isOpen: true,
      task,
      mode,
    });
  };

  // Calendar state
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());
  
  // Format today YYYY-MM-DD
  const formatYMD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = useMemo(() => formatYMD(new Date()), []);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  // Personal calendar notes state (stored per user in localStorage)
  const [userNotes, setUserNotes] = useState<Record<string, string[]>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`focus_notes_${currentUser.id}`) || '{}');
      setUserNotes(saved && typeof saved === 'object' && !Array.isArray(saved)
        ? Object.fromEntries(Object.entries(saved).filter(([, value]) => Array.isArray(value) && value.every(n => typeof n === 'string'))) as Record<string, string[]> : {});
    } catch { setUserNotes({}); }
  }, [currentUser.id]);

  const [newNoteText, setNewNoteText] = useState('');

  const saveNotes = (updated: Record<string, string[]>) => {
    setUserNotes(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`focus_notes_${currentUser.id}`, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving focus notes:', e);
      }
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    const existing = userNotes[selectedDateStr] || [];
    const updated = {
      ...userNotes,
      [selectedDateStr]: [...existing, newNoteText.trim()]
    };
    saveNotes(updated);
    setNewNoteText('');
  };

  const handleDeleteNote = (dateStr: string, index: number) => {
    const existing = userNotes[dateStr] || [];
    const updatedList = existing.filter((_, i) => i !== index);
    const updated = {
      ...userNotes,
      [dateStr]: updatedList
    };
    saveNotes(updated);
  };

  // Helper clients map
  const clientsMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach(c => map.set(c.id, c));
    return map;
  }, [clients]);

  // Helper status maps
  const taskStatusMap = useMemo(() => {
    const map = new Map<string, TaskStatus>();
    taskStatuses.forEach(s => map.set(s.id, s));
    return map;
  }, [taskStatuses]);

  // Sorted task statuses by scale
  const sortedTaskStatuses = useMemo(() => {
    return [...taskStatuses].sort((a, b) => (a.scale || 0) - (b.scale || 0));
  }, [taskStatuses]);

  const getTaskScaleInfo = useCallback((statusId: string) => {
    const status = taskStatusMap.get(statusId) || (TASK_STATUS_ID_MAPPINGS[statusId] ? taskStatusMap.get(TASK_STATUS_ID_MAPPINGS[statusId]) : undefined);
    let scale = 1;

    if (status && typeof status.scale === 'number') {
      scale = status.scale;
    } else if (sortedTaskStatuses.length > 0) {
      const idx = sortedTaskStatuses.findIndex(s => s.id === statusId);
      if (idx >= 0) scale = idx + 1;
    }

    if (scale < 1) scale = 1;
    if (scale > 4) scale = ((scale - 1) % 4) + 1;

    const tStyle = getTaskStatusStyle(statusId, taskStatuses);
    return {
      scale,
      badgeClass: `${tStyle.badgeClass} border`,
      statusName: tStyle.name,
    };
  }, [taskStatusMap, sortedTaskStatuses, taskStatuses]);

  const projectStatusMap = useMemo(() => {
    const map = new Map<string, ProjectStatus>();
    projectStatuses.forEach(s => map.set(s.id, s));
    return map;
  }, [projectStatuses]);

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  // 1. User Assigned Tasks (sorted by expected date ascending, excluding soft-deleted projects and tasks)
  const myAssignedTasks = useMemo(() => {
    const assigned = tasks.filter(t => {
      if (t.deleted) return false;
      if (!t.assigneeIds || !t.assigneeIds.includes(currentUser.id)) return false;
      const proj = t.projectId ? projectMap.get(t.projectId) : undefined;
      if (!proj || proj.deleted) return false;
      return true;
    });
    
    // Sort by expected/estimated date ascending
    assigned.sort((a, b) => {
      const dateA = a.estimatedDate || a.startDate || a.endDate || '9999-99-99';
      const dateB = b.estimatedDate || b.startDate || b.endDate || '9999-99-99';
      return dateA.localeCompare(dateB);
    });

    return assigned;
  }, [tasks, currentUser.id, projectMap]);

  const filteredTasks = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    return myAssignedTasks.filter(t => {
      const scaleInfo = getTaskScaleInfo(t.statusId);
      const isCompleted = scaleInfo.scale === 3;
      if (isCompleted) {
        const completionDate = t.endDate || t.estimatedDate || t.startDate || '';
        if (completionDate && completionDate < thirtyDaysAgoStr) {
          return false;
        }
      }
      if (taskFilter === 'pending') return !isCompleted;
      if (taskFilter === 'completed') return isCompleted;
      return true;
    });
  }, [myAssignedTasks, taskFilter, getTaskScaleInfo]);

  const isLevel5Project = useCallback((proj: Project) => {
    const status = projectStatusMap.get(proj.statusId);
    if (!status) return false;
    if (typeof status.scale === 'number' && status.scale >= 5) return true;
    const lowerName = status.name.toLowerCase();
    return lowerName.includes('conclu') || lowerName.includes('entreg') || lowerName.includes('finaliz') || lowerName.includes('fechad');
  }, [projectStatusMap]);

  const getProjectEffectiveDeliveryDate = useCallback((proj: Project) => {
    return proj.scheduledDate || proj.estimatedDate || proj.deliveryDate || '';
  }, []);

  const getProjectDeliveryDateType = useCallback((proj: Project) => {
    if (proj.scheduledDate) return 'Agendada c/ Cliente';
    if (proj.estimatedDate) return 'Estimada Real';
    if (proj.deliveryDate) return 'Prazo de Entrega';
    return 'Data de Entrega';
  }, []);

  // 2. Projects managed by user (sorted by delivery date ascending)
  const allUserManagedProjects = useMemo(() => {
    return projects.filter(p => !p.deleted && p.projectManagerId === currentUser.id);
  }, [projects, currentUser.id]);

  const activeProjectsCount = useMemo(() => {
    return allUserManagedProjects.filter(p => !isLevel5Project(p)).length;
  }, [allUserManagedProjects, isLevel5Project]);

  const completedProjectsCount = useMemo(() => {
    return allUserManagedProjects.filter(p => isLevel5Project(p)).length;
  }, [allUserManagedProjects, isLevel5Project]);

  const myManagedProjects = useMemo(() => {
    const filtered = allUserManagedProjects.filter(p => {
      if (projectFilter === 'active') return !isLevel5Project(p);
      if (projectFilter === 'completed') return isLevel5Project(p);
      return true; // 'all'
    });
    
    // Sort by effective delivery date ascending
    filtered.sort((a, b) => {
      const dateA = getProjectEffectiveDeliveryDate(a) || '9999-99-99';
      const dateB = getProjectEffectiveDeliveryDate(b) || '9999-99-99';
      return dateA.localeCompare(dateB);
    });

    return filtered;
  }, [allUserManagedProjects, projectFilter, isLevel5Project, getProjectEffectiveDeliveryDate]);

  const taskPagination = useFocusPagination(currentUser.id, 'tasks', 10, FOCUS_TASK_SIZES);
  const projectPagination = useFocusPagination(currentUser.id, 'projects', 5, FOCUS_PROJECT_SIZES);
  const riskPagination = useFocusPagination(currentUser.id, 'risks', 10, FOCUS_TASK_SIZES);
  const taskPage = paginateFocus(filteredTasks, taskPagination.preference);
  const projectPage = paginateFocus(myManagedProjects, projectPagination.preference);
  const myRisks = useMemo(() => assignedFocusRisks(projectRiskItems, projects, currentUser.id), [projectRiskItems, projects, currentUser.id]);
  const riskPage = paginateFocus(myRisks, riskPagination.preference);

  // 4. Monthly Calendar Calculations
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth(); // 0-indexed

  const monthName = currentMonthDate.toLocaleString('pt-PT', { month: 'long', year: 'numeric' });

  // First day of month
  const firstDayOfMonth = new Date(year, month, 1);
  // Days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Day of week for 1st day (0=Sun, 1=Mon, ..., 6=Sat)
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek < 0) startDayOfWeek = 6;

  const calendarDays = useMemo(() => {
    const daysArr: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean }> = [];
    
    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const pm = month === 0 ? 11 : month - 1;
      const py = month === 0 ? year - 1 : year;
      const dateStr = `${py}-${String(pm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      daysArr.push({ dateStr, dayNum: d, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      daysArr.push({ dateStr, dayNum: d, isCurrentMonth: true });
    }

    // Next month padding to fill grid (multiple of 7)
    const remaining = 7 - (daysArr.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const nm = month === 11 ? 0 : month + 1;
        const ny = month === 11 ? year + 1 : year;
        const dateStr = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        daysArr.push({ dateStr, dayNum: d, isCurrentMonth: false });
      }
    }

    return daysArr;
  }, [year, month, startDayOfWeek, daysInMonth]);

  // Indexing items by date for quick calendar lookup
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    myAssignedTasks.forEach(t => {
      const d = t.estimatedDate || t.startDate || t.endDate;
      if (d) {
        const list = map.get(d) || [];
        list.push(t);
        map.set(d, list);
      }
    });
    return map;
  }, [myAssignedTasks]);

  const projectsByDate = useMemo(() => {
    const map = new Map<string, Array<{ project: Project; milestoneLabel: string }>>();
    
    myManagedProjects.forEach(p => {
      const addedDates = new Set<string>();

      if (p.scheduledDate) {
        const list = map.get(p.scheduledDate) || [];
        list.push({ project: p, milestoneLabel: 'Agendamento / Instalação' });
        map.set(p.scheduledDate, list);
        addedDates.add(p.scheduledDate);
      }

      if (p.deliveryDate && !addedDates.has(p.deliveryDate)) {
        const list = map.get(p.deliveryDate) || [];
        list.push({ project: p, milestoneLabel: 'Data de Entrega' });
        map.set(p.deliveryDate, list);
        addedDates.add(p.deliveryDate);
      }

      if (p.estimatedDate && !addedDates.has(p.estimatedDate)) {
        const list = map.get(p.estimatedDate) || [];
        list.push({ project: p, milestoneLabel: 'Previsão de Conclusão' });
        map.set(p.estimatedDate, list);
        addedDates.add(p.estimatedDate);
      }

      const effDelivery = getProjectEffectiveDeliveryDate(p);
      const effType = getProjectDeliveryDateType(p);
      if (effDelivery && !addedDates.has(effDelivery)) {
        const list = map.get(effDelivery) || [];
        list.push({ project: p, milestoneLabel: `Entrega (${effType})` });
        map.set(effDelivery, list);
        addedDates.add(effDelivery);
      }

      if (p.startDate && !addedDates.has(p.startDate)) {
        const list = map.get(p.startDate) || [];
        list.push({ project: p, milestoneLabel: 'Início de Projeto' });
        map.set(p.startDate, list);
        addedDates.add(p.startDate);
      }
    });
    return map;
  }, [myManagedProjects, getProjectEffectiveDeliveryDate, getProjectDeliveryDateType]);

  const selectedDateTasks = tasksByDate.get(selectedDateStr) || [];
  const selectedDateProjects = projectsByDate.get(selectedDateStr) || [];
  const selectedDateUserNotes = userNotes[selectedDateStr] || [];

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  const handleTodayMonth = () => {
    const now = new Date();
    setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDateStr(todayStr);
  };

  const pendingTasksCount = useMemo(() => {
    return myAssignedTasks.filter(t => {
      const scaleInfo = getTaskScaleInfo(t.statusId);
      return scaleInfo.scale !== 3;
    }).length;
  }, [myAssignedTasks, getTaskScaleInfo]);

  return (
    <div className="space-y-6 animate-fade-in" id="my-focus-section">
      
      {/* MOTIVATIONAL BANNER */}
      <div className="m3-focus-banner p-5 sm:p-6 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="m3-focus-banner__badge inline-flex items-center gap-2 px-3 py-1 rounded-full text-caption font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Espaço pessoal</span>
            </div>
            <h2 className="text-heading-lg md:text-heading-lg font-medium tracking-tight font-sans">
              Olá, <span className="m3-focus-banner__name">{currentUser.name}</span>!
            </h2>
            <p className="m3-focus-banner__description text-body-sm max-w-2xl">
              Acompanha as tuas tarefas prioritárias, gere os teus projetos e organiza a tua agenda.
            </p>
          </div>

          <div className="m3-focus-banner__stats flex flex-wrap md:flex-nowrap items-center gap-3 p-3 rounded-card">
            <div className="m3-focus-banner__stat text-center px-3 border-r">
              <p className="m3-focus-banner__label text-caption font-medium">Tarefas pendentes</p>
              <p className="m3-focus-banner__value text-heading-md font-semibold">{pendingTasksCount}</p>
            </div>
            <div className="m3-focus-banner__stat text-center px-3 border-r">
              <p className="m3-focus-banner__label text-caption font-medium">Projetos em gestão</p>
              <p className="m3-focus-banner__value text-heading-md font-semibold">{myManagedProjects.length}</p>
            </div>
            <div className="text-center px-3">
              <p className="m3-focus-banner__label text-caption font-medium">Riscos atribuídos</p>
              <p className="m3-focus-banner__value text-heading-md font-semibold">{myRisks.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* TWO COLUMN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: TASKS & MANAGED PROJECTS (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* SECTION 1: ASSIGNED TASKS */}
          <Card className="overflow-hidden" id="card-my-tasks">
            <div className="p-4 border-b border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary/10 text-primary rounded-card">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-text-primary text-body tracking-tight">As minhas tarefas</h3>
                  <p className="text-caption text-text-muted font-medium">Ordenadas por data</p>
                </div>
              </div>

              {/* FILTER BUTTONS */}
              <M3SegmentedControl<'pending' | 'all' | 'completed'>
                label="Filtrar as minhas tarefas"
                value={taskFilter}
                onChange={value => { setTaskFilter(value); taskPagination.update({ ...taskPagination.preference, page: 1 }); }}
                options={[
                  { value: 'pending', label: `Pendentes (${pendingTasksCount})` },
                  { value: 'all', label: `Todas (${myAssignedTasks.length})` },
                  { value: 'completed', label: 'Concluídas' },
                ]}
              />
            </div>

            {/* TASK LIST */}
            <div className="divide-y divide-border-subtle">
              {filteredTasks.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-12 h-12 bg-surface-muted text-text-muted rounded-card flex items-center justify-center mx-auto">
                    <CheckSquare className="w-6 h-6" />
                  </div>
                  <p className="text-body-sm font-bold text-text-secondary">Nenhuma tarefa encontrada</p>
                  <p className="text-caption text-text-muted max-w-xs mx-auto">
                    {taskFilter === 'pending' 
                      ? 'Parabéns! Não tens tarefas pendentes no teu plano de trabalho.' 
                      : 'Não existem tarefas atribuídas com o filtro selecionado.'}
                  </p>
                </div>
              ) : (
                taskPage.items.map(task => {
                  const proj = projects.find(p => p.id === task.projectId);
                  const client = proj ? clientsMap.get(proj.clientId) : null;
                  const scaleInfo = getTaskScaleInfo(task.statusId);
                  const isDone = scaleInfo.scale === 3;
                  const dateVal = task.estimatedDate || task.startDate || task.endDate;

                  return (
                    <div 
                      key={task.id}
                      tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTaskDetailsModal(task); } }}
                      onClick={() => openTaskDetailsModal(task)}
                      className={`p-4 hover:bg-surface/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group ${
                        isDone ? 'opacity-75 bg-surface/40' : ''
                      }`}
                      title="Clique para preencher ou editar a tarefa"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <IconButton size="sm" aria-label={`Executar tarefa ${task.title}`}
                            title="Executar tarefa" disabled={!hasPermission(currentUser, 'tasks_write', userGroups)}
                            onClick={e => { e.stopPropagation(); openTaskDetailsModal(task, 'execute'); }}>
                            <Play className="w-4 h-4" />
                          </IconButton>

                          <span className={`text-body-sm font-bold tracking-tight group-hover:text-primary transition-colors ${isDone ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                            {task.title}
                          </span>

                          <Badge className={scaleInfo.badgeClass}>
                            {scaleInfo.statusName}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-body-sm text-text-secondary flex-wrap pl-7">
                          {proj && (
                            <Button variant="ghost" size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectProject(proj.id);
                              }}
                              className="h-auto min-h-9 px-0 whitespace-normal text-left justify-start text-body-sm font-semibold text-primary hover:underline flex items-center gap-1"
                              title={`Aceder ao projeto ${proj.title}`}
                            >
                              <Briefcase className="w-3 h-3" />
                              {client && `${client.shortName || client.clientName}`} {proj.title}
                            </Button>
                          )}
                          
                          {task.estimatedHours && (
                            <span className="text-text-muted flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {focusHours(task.estimatedHours)}
                            </span>
                          )}
                        </div>

                        {task.notes && (
                          <p className="text-caption text-text-muted bg-warning/10 p-2 rounded-lg border border-warning/20 italic pl-7 mt-1">
                            &quot;{task.notes}&quot;
                          </p>
                        )}
                      </div>

                      {/* DUE DATE TAG */}
                      <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-border-subtle pt-2 sm:pt-0 pl-7 sm:pl-0">
                        <span className="text-caption text-text-muted font-bold uppercase tracking-wider">Data Prevista</span>
                        <div className={`text-caption font-black flex items-center gap-1 mt-0.5 ${
                          dateVal === todayStr 
                            ? 'text-warning bg-warning/10 px-2 py-0.5 rounded-md border border-warning/20'
                            : dateVal && dateVal < todayStr && !isDone
                              ? 'text-error bg-error/10 px-2 py-0.5 rounded-md border border-error/20'
                              : 'text-text-secondary'
                        }`}>
                          <CalendarIcon className="w-3.5 h-3.5" />
                          <span>
                            {dateVal 
                              ? new Date(dateVal + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
                              : 'Sem data'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <FocusPagination label="tarefas" total={filteredTasks.length} {...taskPage} {...taskPagination} allowed={FOCUS_TASK_SIZES} />
          </Card>

          {/* SECTION 2: MANAGED PROJECTS */}
          <Card className="overflow-hidden" id="card-managed-projects">
            <div className="p-4 border-b border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary/10 text-primary rounded-card">
                  <FolderKanban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-text-primary text-body tracking-tight">Os meus projetos</h3>
                  <p className="text-caption text-text-muted font-medium">Ordenados por data de entrega</p>
                </div>
              </div>

              {/* FILTER BUTTONS */}
              <M3SegmentedControl<'active' | 'all' | 'completed'>
                label="Filtrar os meus projetos"
                value={projectFilter}
                onChange={value => { setProjectFilter(value); projectPagination.update({ ...projectPagination.preference, page: 1 }); }}
                options={[
                  { value: 'active', label: `Ativos (${activeProjectsCount})` },
                  { value: 'all', label: `Todos (${allUserManagedProjects.length})` },
                  { value: 'completed', label: `Concluídos (${completedProjectsCount})` },
                ]}
              />
            </div>

            {/* PROJECTS LIST */}
            <div className="divide-y divide-border-subtle">
              {myManagedProjects.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-12 h-12 bg-surface-muted text-text-muted rounded-card flex items-center justify-center mx-auto">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <p className="text-body-sm font-bold text-text-secondary">Sem projetos</p>
                  <p className="text-caption text-text-muted max-w-xs mx-auto">
                    {projectFilter === 'completed'
                      ? 'Atualmente não figura como Project Leader em nenhum projeto concluído.'
                      : projectFilter === 'active'
                      ? 'Atualmente não figura como Project Leader em nenhum projeto ativo.'
                      : 'Atualmente não figura como Project Leader em nenhum projeto.'}
                  </p>
                </div>
              ) : (
                projectPage.items.map(proj => {
                  const client = clientsMap.get(proj.clientId);
                  const pStatus = projectStatusMap.get(proj.statusId);
                  
                  const deliveryDateVal = getProjectEffectiveDeliveryDate(proj);
                  const deliveryDateType = getProjectDeliveryDateType(proj);

                  return (
                    <div 
                      key={proj.id}
                      tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelectProject(proj.id); } }}
                      onClick={() => {
                        onSelectProject(proj.id);
                      }}
                      className="p-4 hover:bg-surface transition-colors cursor-pointer space-y-3 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-text-primary text-body-sm group-hover:text-primary transition-colors">
                              {client?.clientName || 'N/D'}
                            </h4>
                            {pStatus && (() => {
                              const pStyle = getProjectStatusStyle(proj.statusId, projectStatuses);
                              return (
                                <Badge className={pStyle.badgeClass}>
                                  {pStyle.name}
                                </Badge>
                              );
                            })()}
                          </div>
                          <p className="text-body-sm text-text-secondary font-medium">
                            <strong className="text-text-secondary">{proj.title}</strong>
                            {proj.installProjectNo && <span className="ml-2 text-text-muted">• N.º {proj.installProjectNo}</span>}
                          </p>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="text-caption text-text-muted font-bold uppercase tracking-wider block" title="Data prioritária: Agendada -> Estimada Real -> Prazo">
                            {deliveryDateType}
                          </span>
                          <span className={`text-caption font-black inline-flex items-center gap-1 ${
                            deliveryDateVal && deliveryDateVal < todayStr
                              ? 'text-error font-bold'
                              : 'text-success'
                          }`}>
                            <Flag className="w-3 h-3" />
                            {deliveryDateVal 
                              ? new Date(deliveryDateVal + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
                              : 'Não fixada'}
                          </span>
                        </div>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
            <FocusPagination label="projetos" total={myManagedProjects.length} {...projectPage} {...projectPagination} allowed={FOCUS_PROJECT_SIZES} />
          </Card>
          <Card className="overflow-hidden" id="card-my-risks">
            <div className="p-4 border-b border-border-subtle bg-surface-muted flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              <div><h3 className="text-heading-sm">Os meus riscos</h3><p className="text-caption text-text-secondary">Riscos atribuídos a ti, ordenados por data de revisão</p></div>
            </div>
            <ul className="divide-y divide-border-subtle">
              {riskPage.items.map(risk => {
                const proj = projectMap.get(risk.projectId);
                const client = proj ? clientsMap.get(proj.clientId) : undefined;
                return <li key={risk.id} className="p-4 flex flex-col sm:flex-row justify-between gap-3 hover:bg-surface-muted/50">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><ShieldAlert className="w-4 h-4 text-primary" /><span className="text-body-sm font-semibold">{risk.title}</span><Badge>{riskStatuses.find(s => s.id === risk.statusId)?.name || 'Sem estado'}</Badge></div>
                    <Button variant="ghost" size="sm" className="h-auto min-h-9 px-0 text-body-sm whitespace-normal text-left justify-start" onClick={() => onSelectProject(risk.projectId)}>
                      {client?.shortName || client?.clientName || 'Cliente N/D'} · {proj?.title}{proj?.installProjectNo && ` (${proj.installProjectNo})`}
                    </Button>
                    {risk.description && <p className="text-body-sm text-text-secondary">{risk.description}</p>}
                  </div>
                  <div className="text-caption text-text-secondary sm:text-right"><p>Data de revisão</p><Badge>{risk.reviewDate ? new Date(risk.reviewDate + 'T00:00:00').toLocaleDateString('pt-PT') : 'Sem data'}</Badge></div>
                </li>;
              })}
            </ul>
            {!myRisks.length && <p className="p-6 text-body-sm text-text-secondary">Sem riscos atribuídos.</p>}
            <FocusPagination label="riscos" total={myRisks.length} {...riskPage} {...riskPagination} allowed={FOCUS_TASK_SIZES} />
          </Card>

        </div>

        {/* RIGHT COLUMN: MONTHLY CALENDAR (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* SECTION 2: MONTHLY CALENDAR & NOTES */}
          <Card className="overflow-hidden" id="card-monthly-calendar">
            <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-success/10 text-success rounded-card">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-text-primary text-body tracking-tight">Calendário Mensal</h3>
                  <p className="text-caption text-text-muted font-medium">Tarefas e lembretes de projetos em agenda</p>
                </div>
              </div>

              <M3Button tone="tonal"
                onClick={handleTodayMonth}
              >
                Hoje
              </M3Button>
            </div>

            <div className="p-4 space-y-4">
              
              {/* MONTH HEADER NAVIGATION */}
              <div className="flex items-center justify-between">
                <M3IconButton label="Mês anterior"
                  onClick={handlePrevMonth}
                >
                  <ChevronLeft className="w-5 h-5" />
                </M3IconButton>
                <span aria-live="polite" className="font-semibold text-body-sm text-text-primary capitalize font-sans">
                  {monthName}
                </span>
                <M3IconButton label="Mês seguinte"
                  onClick={handleNextMonth}
                >
                  <ChevronRight className="w-5 h-5" />
                </M3IconButton>
              </div>

              {/* CALENDAR GRID */}
              <div className="border border-border rounded-control overflow-hidden">
                {/* DAYS OF WEEK HEADER */}
                <div className="grid grid-cols-7 bg-surface-muted border-b border-border-subtle text-center text-caption font-semibold uppercase select-none">
                  <span className="text-text-muted py-0.5">Seg</span>
                  <span className="text-text-muted py-0.5">Ter</span>
                  <span className="text-text-muted py-0.5">Qua</span>
                  <span className="text-text-muted py-0.5">Qui</span>
                  <span className="text-text-muted py-0.5">Sex</span>
                  <span className="text-text-muted bg-surface-muted/70 py-0.5 rounded-md font-bold">Sáb</span>
                  <span className="text-text-muted bg-surface-muted/70 py-0.5 rounded-md font-bold">Dom</span>
                </div>

                {/* DAYS MATRIX */}
                <div className="grid grid-cols-7">
                  {calendarDays.map((cell, idx) => {
                    const dayTasks = tasksByDate.get(cell.dateStr) || [];
                    const dayProjects = projectsByDate.get(cell.dateStr) || [];
                    const dayNotes = userNotes[cell.dateStr] || [];

                    const isToday = cell.dateStr === todayStr;
                    const isSelected = cell.dateStr === selectedDateStr;

                    const cellDate = new Date(cell.dateStr + 'T00:00:00');
                    const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
                    const specialDay = specialDays.find(sd => sd.date === cell.dateStr);
                    const isSpecial = !!specialDay;

                    const hasEvents = dayTasks.length > 0 || dayProjects.length > 0 || dayNotes.length > 0;

                    const cellStyleClass = isSelected
                      ? 'bg-primary/10 text-text-primary ring-2 ring-inset ring-primary z-10'
                      : !cell.isCurrentMonth ? 'bg-surface-muted/50 text-text-disabled'
                      : isSpecial ? 'bg-error/5 text-error'
                      : isWeekend ? 'bg-surface-muted/50 text-text-secondary' : 'bg-surface text-text-primary';

                    const tooltipText = specialDay 
                      ? `${specialDay.name} (${cell.dateStr})`
                      : isWeekend
                        ? `${cellDate.getDay() === 6 ? 'Sábado' : 'Domingo'} (${cell.dateStr})`
                        : cell.dateStr;

                    return (
                      <Button variant="ghost" size="sm"
                        key={idx}
                        onClick={() => setSelectedDateStr(cell.dateStr)}
                        className={`p-2 rounded-none border-b border-r border-border-subtle text-center flex flex-col items-start justify-between min-h-20 h-auto transition-colors relative ${cellStyleClass}`}
                        title={tooltipText}
                        aria-pressed={isSelected}
                        aria-label={`${tooltipText} · ${dayTasks.length} tarefas · ${dayProjects.length} projetos · ${dayNotes.length} notas`}
                      >
                        <div className="flex items-center justify-center w-full relative">
                          <span className={`text-body-sm ${isToday ? 'underline font-bold' : ''} ${isSpecial && !isSelected ? 'text-error font-extrabold' : ''}`}>
                            {cell.dayNum}
                          </span>
                          {isSpecial && cell.isCurrentMonth && !isSelected && (
                            <span 
                              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-error"
                              title={`Feriado / Dia Especial: ${specialDay?.name}`}
                            />
                          )}
                        </div>

                        {/* DOT INDICATORS */}
                        {hasEvents && (
                          <div className="flex items-center gap-0.5 mt-0.5">
                            {dayTasks.length > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            )}
                            {dayProjects.length > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-warning"></span>
                            )}
                            {dayNotes.length > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                            )}
                          </div>
                        )}
                      </Button>
                    );
                  })}
                </div>

                {/* CALENDAR LEGEND */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border-subtle text-caption text-text-muted font-medium flex-wrap px-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-surface-muted border border-border-subtle"></span>
                    <span>Fim de semana</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-error/10 border border-error/20 flex items-center justify-center text-caption text-error">●</span>
                    <span className="text-error font-semibold">Dia Especial / Feriado</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-warning/10 border border-warning/20"></span>
                    <span className="text-warning font-semibold">Hoje</span>
                  </div>
                </div>
              </div>

              {/* SELECTED DATE DETAIL / NOTES PANEL */}
              <div className="bg-surface rounded-card p-3.5 border border-border-subtle/80 space-y-3">
                <div className="flex items-center justify-between border-b border-border-subtle/60 pb-2">
                  <div className="flex items-center gap-1.5 text-caption font-bold text-text-primary">
                    <StickyNote className="w-4 h-4 text-primary" />
                    <span>
                      Atividades & Notas de {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  {selectedDateStr === todayStr && (
                    <span className="text-caption font-extrabold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      Hoje
                    </span>
                  )}
                </div>

                {/* SPECIAL DAY / WEEKEND BANNER */}
                {(() => {
                  const selSpecial = specialDays.find(sd => sd.date === selectedDateStr);
                  const selDate = new Date(selectedDateStr + 'T00:00:00');
                  const isSelWknd = selDate.getDay() === 0 || selDate.getDay() === 6;

                  if (selSpecial) {
                    return (
                      <div className="p-2.5 bg-error/10 border border-error/20 rounded-card flex items-center justify-between text-caption text-error font-medium">
                        <div className="flex items-center gap-2 font-bold">
                          <PartyPopper className="w-4 h-4 text-error shrink-0" />
                          <span>{selSpecial.name}</span>
                        </div>
                        <span className="text-caption uppercase tracking-wider bg-error/10 text-error px-2 py-0.5 rounded-full font-extrabold">
                          Dia Especial / Feriado
                        </span>
                      </div>
                    );
                  }

                  if (isSelWknd) {
                    return (
                      <div className="p-2 bg-surface-muted border border-border-subtle rounded-card flex items-center justify-between text-caption text-text-secondary">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <span>☕</span>
                          <span>Fim de Semana ({selDate.getDay() === 6 ? 'Sábado' : 'Domingo'})</span>
                        </div>
                        <span className="text-caption uppercase tracking-wider bg-surface-muted text-text-secondary px-2 py-0.5 rounded-full font-bold">
                          Não Útil
                        </span>
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* EVENTS & TASKS ON SELECTED DAY */}
                <div className="space-y-2">
                  {selectedDateTasks.length === 0 && selectedDateProjects.length === 0 && selectedDateUserNotes.length === 0 ? (
                    <p className="text-caption text-text-muted italic text-center py-2">
                      Nenhum compromisso ou nota gravada para este dia.
                    </p>
                  ) : (
                    <>
                      {/* TASKS */}
                      {selectedDateTasks.map(t => {
                        const proj = t.projectId ? projectMap.get(t.projectId) : undefined;
                        const client = proj ? clientsMap.get(proj.clientId) : null;
                        const scaleInfo = getTaskScaleInfo(t.statusId);

                        return (
                          <div 
                            key={t.id}
                            tabIndex={0}
                            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTaskDetailsModal(t); } }}
                            onClick={() => openTaskDetailsModal(t)}
                            className="p-2.5 bg-surface rounded-card border border-border-subtle hover:border-primary/20 hover:bg-primary/10 transition-all cursor-pointer text-caption space-y-1 group shadow-2xs"
                            title="Clique para preencher ou editar a tarefa"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <span className="font-bold text-text-primary group-hover:text-primary transition-colors flex items-center gap-1.5 truncate">
                                  <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                                  <span className="truncate">{t.title}</span>
                                </span>
                                <div className="text-caption font-medium text-text-secondary flex items-center gap-1 flex-wrap pl-5">
                                  <span className="text-text-primary font-bold">{client?.clientName || client?.shortName || 'Cliente N/D'}</span>
                                  <span className="text-text-disabled">•</span>
                                  <Button variant="ghost" size="sm"
                                    className="h-auto min-h-9 px-0 text-caption whitespace-normal text-left justify-start text-primary font-semibold hover:underline"
                                    onClick={(e) => {
                                      if (proj) {
                                        e.stopPropagation();
                                        onSelectProject(proj.id);
                                      }
                                    }}
                                    title={proj ? `Aceder ao projeto ${proj.title}` : undefined}
                                  >
                                    {proj?.title || 'Projeto N/D'}
                                  </Button>
                                  {proj?.installProjectNo && (
                                    <>
                                      <span className="text-text-disabled">•</span>
                                      <span className="text-text-muted">N.º {proj.installProjectNo}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <Badge className={scaleInfo.badgeClass}>
                                {scaleInfo.statusName}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}

                      {/* PROJECT MILESTONES & DATES */}
                      {selectedDateProjects.map((item, idx) => {
                        const p = item.project;
                        const client = clientsMap.get(p.clientId);
                        const pStatus = projectStatusMap.get(p.statusId);

                        return (
                          <div 
                            key={`proj-milestone-${p.id}-${idx}`}
                            tabIndex={0}
                            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelectProject(p.id); } }}
                            onClick={() => onSelectProject(p.id)}
                            className="p-2.5 bg-surface rounded-card border border-border-subtle hover:border-warning hover:bg-warning/10 transition-all cursor-pointer text-caption space-y-1 group shadow-2xs"
                            title={`Clique para aceder ao projeto: ${p.title}`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <span className="font-bold text-text-primary group-hover:text-warning transition-colors flex items-center gap-1.5 truncate">
                                  <Flag className="w-3.5 h-3.5 text-warning shrink-0" />
                                  <span className="truncate">{item.milestoneLabel}: {p.title}</span>
                                </span>
                                <div className="text-caption font-medium text-text-secondary flex items-center gap-1 flex-wrap pl-5">
                                  <span className="text-text-primary font-bold">{client?.clientName || client?.shortName || 'Cliente N/D'}</span>
                                  <span className="text-text-disabled">•</span>
                                  <span className="text-warning font-semibold group-hover:underline">{p.title}</span>
                                  {p.installProjectNo && (
                                    <>
                                      <span className="text-text-disabled">•</span>
                                      <span className="text-text-muted">N.º {p.installProjectNo}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {pStatus && (
                                  <Badge className={getProjectStatusStyle(p.statusId, projectStatuses).badgeClass}>
                                    {pStatus.name}
                                  </Badge>
                                )}
                                <span className="text-caption px-1.5 py-0.5 rounded-full font-extrabold bg-warning/10 text-warning border border-warning/20 flex items-center gap-1">
                                  <span>Projeto</span>
                                  <ArrowRight className="w-2.5 h-2.5 text-warning group-hover:translate-x-0.5 transition-transform" />
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* PERSONAL NOTES */}
                      {selectedDateUserNotes.map((note, idx) => (
                        <div key={idx} className="p-2 bg-success/10 rounded-lg border border-success/20 text-caption flex items-start justify-between gap-2">
                          <p className="text-success font-medium leading-tight flex-1">{note}</p>
                          <Button variant="ghost" size="sm"
                            onClick={() => handleDeleteNote(selectedDateStr, idx)}
                            className="text-success hover:text-error p-0.5"
                            title="Eliminar nota"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* ADD PERSONAL NOTE FORM */}
                <form onSubmit={handleAddNote} className="flex gap-1.5 pt-1">
                  <Input
                    aria-label="Nota pessoal para o dia selecionado"
                    type="text"
                    value={newNoteText}
                    onChange={e => setNewNoteText(e.target.value)}
                    placeholder="Adicionar nota para este dia..."
                    className="flex-1 p-2 bg-surface border border-border-subtle rounded-lg text-caption outline-none focus:ring-1 focus:ring-primary font-medium"
                  />
                  <Button variant="primary" size="sm"
                    type="submit"
                    className="p-2 bg-primary hover:bg-primary text-white rounded-lg text-caption font-bold transition-colors flex items-center justify-center"
                    title="Adicionar Nota"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </form>
              </div>

            </div>
          </Card>

        </div>

      </div>

      {/* TASK DETAILS MODAL (FASE 30 / 30-A.2) */}
      <TaskDetailsModal
        isOpen={taskModalState.isOpen}
        task={taskModalState.task}
        mode={taskModalState.mode}
        initialDate={taskModalState.initialDate}
        onClose={() => setTaskModalState(prev => ({ ...prev, isOpen: false, task: null }))}
        createTask={addTask}
        updateTask={updateTask}
        deleteTask={deleteTask}
        taskStatuses={taskStatuses}
        taskTypes={taskTypes}
        users={users}
        userGroups={userGroups}
        appConfig={appConfig}
        projects={projects}
        clients={clients}
        absences={userAbsences}
        tasks={tasks}
        canWrite={hasPermission(currentUser, 'tasks_write', userGroups)}
      />

    </div>
  );
}
