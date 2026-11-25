'use client';
import ListEmptyState from '@/components/ui/ListEmptyState';
import { useFeedback } from '@/components/ApplicationFeedback';
import MobileTaskList from './MobileTaskList';

import React, { useState, useEffect, useMemo } from 'react';
import { Task, Project, Client, TaskType, ProjectPriority, ProjectStatus } from '@/lib/types';
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  Clock,
  Calendar,
  CheckSquare,
  X,
  Users,
  Link2,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  AlertTriangle,
  PlayCircle,
  Briefcase,
  Filter,
  CheckCircle2,
  CalendarDays,
  ListTodo,
  Copy
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import TaskDetailsModal, { TaskModalMode } from '@/domains/tasks/ui/TaskDetailsModal';
import { TaskAnalytics } from '@/domains/tasks/ui/TaskAnalytics';

import { hasPermission } from '@/lib/permissions';
import { getTaskStatusName, getTaskTypeName, getTaskEffectiveDate, getTaskStatusStyle, getUserInitials, cn } from '@/lib/utils';
import { parseTaskHoursToFloat } from '@/domains/tasks/modules/taskOperations';
import { TaskPlanningBadge } from '@/domains/tasks/ui/TaskPlanningBadge';
import { countsTowardsPlanning, normalizeTaskPlanningStatus } from '../modules/taskPlanning';
import { getOperationalTaskScale, getTaskFilterDates, matchesTaskDateFilter, type TaskDateFilter } from '../modules/taskDateFilters';
import { getTaskDisplayHours } from '@/lib/tasks/displayHours';
import { Button, IconButton, Badge, Tabs, Select, Checkbox, Card, Input } from '@/components/ui';


const getPaginationPages = (current: number, total: number): (number | string)[] => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
};

interface TaskSectionProps {
  tasks: Task[];
  projects: Project[];
  clients: Client[];
  users: any[];
  absences?: any[];
  taskStatuses: any[];
  projectStatuses: ProjectStatus[];
  taskTypes?: TaskType[];
  projectPriorities?: ProjectPriority[];
  addTask: (t: any) => void;
  updateTask: (id: string, updates: any) => void;
  deleteTask: (id: string) => Promise<boolean>;
  currentUser?: any;
  userGroups?: any[];
  appConfig?: any;
}

const matchUserId = (idA: string, idB: string) => {
  if (!idA || !idB) return false;
  if (idA === idB) return true;
  const mappings: Record<string, string> = {
    'u-1': '11111111-1111-1111-1111-111111111111',
    'u-2': '11111111-1111-1111-1111-111111111112',
    'u-3': '11111111-1111-1111-1111-111111111113',
    'u-4': '11111111-1111-1111-1111-111111111114',
    'u-5': '11111111-1111-1111-1111-111111111115',
  };
  const normA = mappings[idA] || idA;
  const normB = mappings[idB] || idB;
  return normA === normB;
};

export default function TaskSection({
  tasks,
  projects,
  clients = [],
  users,
  absences = [],
  taskStatuses,
  projectStatuses,
  taskTypes = [],
  projectPriorities = [],
  addTask,
  updateTask,
  deleteTask,
  currentUser,
  userGroups = [],
  appConfig,
}: TaskSectionProps) {
  const canReadTasks = hasPermission(currentUser, 'tasks_read');
  const canWriteTasks = hasPermission(currentUser, 'tasks_write');
  const canDeleteTasks = hasPermission(currentUser, 'tasks_delete');

  // Filters state
  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPlanning, setFilterPlanning] = useState('');
  const [datePreset, setFilterDatePreset] = useState<TaskDateFilter>('all');

  // Pagination & Sorting state
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<'estimatedDate' | 'status'>('estimatedDate');
  const [groupByProject, setGroupByProject] = useState<boolean>(false);

  const [activeTaskViewTab, setActiveTaskViewTab] = useState<'lista' | 'analise'>('lista');

  // Reset pagination when filter/sorting/grouping variables change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterAssignee, filterPlanning, datePreset, pageSize, sortBy, groupByProject]);

  const filterDates = useMemo(() => getTaskFilterDates(new Date()), []);

  // Confirmation Modal state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm,
    });
  };

  // Unified Task Modal State
  const [taskModalState, setTaskModalState] = useState<{
    isOpen: boolean;
    task: Task | null;
    mode: TaskModalMode;
  }>({
    isOpen: false,
    task: null,
    mode: 'edit',
  });

  const feedback = useFeedback();
  const resume = feedback?.resume;
  React.useEffect(() => {
    if (resume?.kind !== 'task' || !canWriteTasks) return;
    setTaskModalState({
      isOpen: true,
      task: tasks.find(task => task.id === resume.recordId && !task.deleted) || null,
      mode: resume.mode || 'create',
    });
  }, [resume, tasks, canWriteTasks]);

  const openTaskModal = (task: Task | null, mode: TaskModalMode = 'edit') => {
    if (mode === 'create' && !canWriteTasks) {
      alert('Não tem permissão para criar novas tarefas.');
      return;
    }
    setTaskModalState({
      isOpen: true,
      task,
      mode,
    });
  };

  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const handleCopyTaskLink = (taskId: string) => {
    if (typeof window === 'undefined') return;
    let url = window.location.origin + window.location.pathname + '?tab=tarefas&task=' + taskId;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(taskId);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  // Pre-build O(1) Map lookups for projects and clients
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  const getProjectWithClientLabel = (projId: string) => {
    if (!projId) return 'Sem projeto';
    const proj = projectMap.get(projId);
    if (!proj) return 'Projeto não encontrado';
    const client = clientMap.get(proj.clientId);
    const clientName = client ? (client.clientName || client.shortName) : '';
    const ipPart = proj.installProjectNo ? ` (${proj.installProjectNo})` : '';
    return clientName ? `${clientName} - ${proj.title}${ipPart}` : `${proj.title}${ipPart}`;
  };

  // Filter active tasks (not deleted, and if associated with project, project must not be deleted)
  const activeTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.deleted) return false;
      if (t.projectId) {
        const proj = projectMap.get(t.projectId);
        if (proj && proj.deleted) return false;
      }
      return true;
    });
  }, [tasks, projectMap]);

  const getTaskScale = React.useCallback(
    (statusId: string) => getOperationalTaskScale(statusId, taskStatuses),
    [taskStatuses],
  );
  const matchesDateFilter = React.useCallback(
    (task: Task, filter: TaskDateFilter) => matchesTaskDateFilter(task, getTaskScale(task.statusId), filter, filterDates),
    [getTaskScale, filterDates],
  );

  // Users with at least 1 defined task assigned to them
  const usersWithTasks = useMemo(() => {
    const userIdsWithTasks = new Set<string>();
    activeTasks.forEach(t => {
      if (t.assigneeIds && t.assigneeIds.length > 0) {
        t.assigneeIds.forEach(id => userIdsWithTasks.add(id));
      }
    });

    return users.filter(u => !u.deleted && u.type === 'Team' && Array.from(userIdsWithTasks).some(tid => matchUserId(u.id, tid)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'));
  }, [activeTasks, users]);

  // Filtered tasks logic
  const tasksMatchingSearch = useMemo(() => {
    const q = search.toLowerCase().trim();
    return activeTasks.filter(t => {
      const proj = t.projectId ? projectMap.get(t.projectId) : null;
      const client = proj ? clientMap.get(proj.clientId) : null;
      const clientName = client ? (client.clientName || '').toLowerCase() : '';
      const clientShortName = client ? (client.shortName || '').toLowerCase() : '';
      const projTitle = proj ? (proj.title || '').toLowerCase() : '';
      const projIp = proj?.installProjectNo ? proj.installProjectNo.toLowerCase() : '';
      const taskTitle = (t.title || '').toLowerCase();
      const taskDesc = (t.description || '').toLowerCase();

      // Search by assigned technicians' names
      const hasMatchingAssignee = !q ? true : (t.assigneeIds || []).some(uid => {
        const uName = users.find(u => matchUserId(u.id, uid))?.name;
        return uName ? uName.toLowerCase().includes(q) : false;
      });

      const matchesSearch = !q ||
                            taskTitle.includes(q) ||
                            taskDesc.includes(q) ||
                            clientName.includes(q) ||
                            clientShortName.includes(q) ||
                            projTitle.includes(q) ||
                            projIp.includes(q) ||
                            hasMatchingAssignee;
      const matchesAssignee = filterAssignee ? t.assigneeIds.some(id => matchUserId(id, filterAssignee)) : true;

      const matchesPlanning = !filterPlanning || normalizeTaskPlanningStatus(t.planningStatus) === filterPlanning;
      return matchesSearch && matchesAssignee && matchesPlanning;
    });
  }, [activeTasks, search, filterAssignee, filterPlanning, projectMap, clientMap, users]);

  const filteredTasks = useMemo(
    () => tasksMatchingSearch.filter(task => matchesDateFilter(task, datePreset)),
    [tasksMatchingSearch, matchesDateFilter, datePreset],
  );

  const operationalStats = useMemo(() => {
    let todayCount = 0;
    let thisWeekCount = 0;
    let overdueCount = 0;
    let completedThisWeekCount = 0;

    tasksMatchingSearch.forEach(task => {
      if (matchesDateFilter(task, 'today')) todayCount++;
      if (matchesDateFilter(task, 'overdue')) overdueCount++;
      if (matchesDateFilter(task, 'completed_this_week')) completedThisWeekCount++;
      if (matchesDateFilter(task, 'this_week')) thisWeekCount++;
    });

    return {
      todayCount,
      thisWeekCount,
      overdueCount,
      completedThisWeekCount,
    };
  }, [tasksMatchingSearch, matchesDateFilter]);

  const weekHoursSum = useMemo(() => {
    const hours = activeTasks.reduce((sum, task) => {
      if (!countsTowardsPlanning(task) || !matchesDateFilter(task, 'this_week')) return sum;

      const actualHours = parseTaskHoursToFloat(task.actualHours);
      const hoursPerAssignee = actualHours > 0 ? actualHours : parseTaskHoursToFloat(task.estimatedHours);
      return sum + hoursPerAssignee * (task.assigneeIds?.length || 0);
    }, 0);
    return Math.round(hours * 10) / 10;
  }, [activeTasks, matchesDateFilter]);

  const sortTasks = (taskList: Task[]) => {
    return [...taskList].sort((a, b) => {
      if (sortBy === 'estimatedDate') {
        const dateA = getTaskEffectiveDate(a);
        const dateB = getTaskEffectiveDate(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.localeCompare(dateB);
      } else {
        return (getTaskScale(a.statusId) ?? 999) - (getTaskScale(b.statusId) ?? 999);
      }
    });
  };

  let processedTasks: Task[] = [];
  if (groupByProject) {
    const tasksByProject: Record<string, Task[]> = {};
    const noProjectTasks: Task[] = [];

    filteredTasks.forEach(t => {
      if (!t.projectId) {
        noProjectTasks.push(t);
      } else {
        if (!tasksByProject[t.projectId]) {
          tasksByProject[t.projectId] = [];
        }
        tasksByProject[t.projectId].push(t);
      }
    });

    const sortedProjectIds = Object.keys(tasksByProject).sort((idA, idB) => {
      const titleA = getProjectWithClientLabel(idA).toLowerCase();
      const titleB = getProjectWithClientLabel(idB).toLowerCase();
      return titleA.localeCompare(titleB);
    });

    sortedProjectIds.forEach(projId => {
      const sortedProjTasks = sortTasks(tasksByProject[projId]);
      processedTasks.push(...sortedProjTasks);
    });

    if (noProjectTasks.length > 0) {
      const sortedNoProjTasks = sortTasks(noProjectTasks);
      processedTasks.push(...sortedNoProjTasks);
    }
  } else {
    processedTasks = sortTasks(filteredTasks);
  }

  const totalTasks = processedTasks.length;
  const totalPages = Math.ceil(totalTasks / pageSize) || 1;
  const validCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalTasks);
  const paginatedTasks = processedTasks.slice(startIndex, endIndex);

  const getProjectTitle = (projId?: string | null) => {
    if (!projId) return 'Sem projeto';
    const proj = projectMap.get(projId);
    if (!proj) return 'Projeto não encontrado';
    const client = clientMap.get(proj.clientId);
    const clientName = client ? (client.clientName || client.shortName) : '';
    const ipPart = proj.installProjectNo ? ` (${proj.installProjectNo})` : '';
    const projectTitle = `${proj.title}${ipPart}`;
    return clientName ? `${clientName} · ${projectTitle}` : projectTitle;
  };

  const renderAssignees = (assigneeIds?: string[]) => {
    if (!assigneeIds || assigneeIds.length === 0) {
      return <span className="text-text-muted italic text-caption">Sem atribuição</span>;
    }

    const maxVisible = 3;
    const visibleIds = assigneeIds.slice(0, maxVisible);
    const remainingCount = assigneeIds.length - maxVisible;

    return (
      <div className="flex flex-wrap items-center gap-1">
        {visibleIds.map(uid => {
          const user = users.find(u => matchUserId(u.id, uid));
          const userName = user ? user.name : uid;
          const initials = getUserInitials(userName);
          return (
            <Badge
              key={uid}
              variant="neutral"
              className="w-8 h-8 p-0 justify-center rounded-full font-bold text-caption shadow-flat"
            >
              <span title={userName} aria-label={userName}>{initials}</span>
            </Badge>
          );
        })}
        {remainingCount > 0 && (
          <Badge
            variant="neutral"
            className="font-bold text-caption shadow-flat"
          >
            <span title={`${remainingCount} outro(s) responsável(eis)`}>+{remainingCount}</span>
          </Badge>
        )}
      </div>
    );
  };

  const getStatusName = (id: string) => getTaskStatusName(id, taskStatuses);

  const getUserName = (id: string) => users.find(u => matchUserId(u.id, id))?.name || 'N/A';

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* View Selection Tabs */}
        <Tabs
          tabs={[
            { id: 'lista', label: 'Lista de tarefas', icon: <ListTodo className="w-4.5 h-4.5" /> },
            { id: 'analise', label: 'Análise de Tarefas', icon: <BarChart2 className="w-4.5 h-4.5" /> }
          ]}
          activeTabId={activeTaskViewTab}
          onChange={(id) => setActiveTaskViewTab(id as 'lista' | 'analise')}
          variant="line"
          className="mb-4 mobile-operational-tabs"
        />

        {/* OPERATIONAL KPI CARDS */}
        {activeTaskViewTab === 'lista' && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 select-none">
            {/* 1. Para Hoje */}
            <Card
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => setFilterDatePreset(datePreset === 'today' ? 'all' : 'today')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFilterDatePreset(datePreset === 'today' ? 'all' : 'today');
                }
              }}
              className={cn(
                "p-3.5 text-left transition-all cursor-pointer select-none",
                datePreset === 'today'
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "bg-surface border-border hover:border-primary"
              )}
            >
              <div className="text-caption font-bold text-text-muted uppercase tracking-wider">Para Hoje</div>
              <div className="text-xl font-black text-text-primary mt-1 flex items-center gap-2">
                <span className="font-mono tabular-nums">{operationalStats.todayCount}</span>
                <Badge variant="primary" className="text-caption">tarefas</Badge>
              </div>
            </Card>

            {/* 2. Esta semana */}
            <Card
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => setFilterDatePreset(datePreset === 'this_week' ? 'all' : 'this_week')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFilterDatePreset(datePreset === 'this_week' ? 'all' : 'this_week');
                }
              }}
              className={cn(
                "p-3.5 text-left transition-all cursor-pointer select-none",
                datePreset === 'this_week'
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "bg-surface border-border hover:border-primary"
              )}
            >
              <div className="text-caption font-bold text-text-muted uppercase tracking-wider">Esta semana</div>
              <div className="text-xl font-black text-text-primary mt-1 flex items-center gap-2">
                <span className="font-mono tabular-nums">{operationalStats.thisWeekCount}</span>
                <Badge variant="primary" className="text-caption">tarefas</Badge>
              </div>
            </Card>

            {/* 3. Atrasadas */}
            <Card
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => setFilterDatePreset(datePreset === 'overdue' ? 'all' : 'overdue')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFilterDatePreset(datePreset === 'overdue' ? 'all' : 'overdue');
                }
              }}
              className={cn(
                "p-3.5 text-left transition-all cursor-pointer select-none",
                datePreset === 'overdue'
                  ? "border-error bg-error/10 ring-1 ring-error"
                  : "bg-surface border-border hover:border-primary"
              )}
            >
              <div className="text-caption font-bold text-text-muted uppercase tracking-wider">Atrasadas</div>
              <div className="text-xl font-black text-text-primary mt-1 flex items-center gap-2">
                <span className="font-mono tabular-nums text-error">{operationalStats.overdueCount}</span>
                {operationalStats.overdueCount > 0 && (
                  <Badge variant="error" className="text-caption">atraso</Badge>
                )}
              </div>
            </Card>

            {/* 4. Concluídas esta semana */}
            <Card
              hoverable
              role="button"
              tabIndex={0}
              title="Hoje e os seis dias anteriores"
              onClick={() => setFilterDatePreset(datePreset === 'completed_this_week' ? 'all' : 'completed_this_week')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFilterDatePreset(datePreset === 'completed_this_week' ? 'all' : 'completed_this_week');
                }
              }}
              className={cn(
                "p-3.5 text-left transition-all cursor-pointer select-none",
                datePreset === 'completed_this_week'
                  ? "border-success bg-success/10 ring-1 ring-success"
                  : "bg-surface border-border hover:border-primary"
              )}
            >
              <div className="text-caption font-bold text-text-muted uppercase tracking-wider">Concluídas esta semana</div>
              <div className="text-xl font-black text-text-primary mt-1 flex items-center gap-2">
                <span className="font-mono tabular-nums">{operationalStats.completedThisWeekCount}</span>
                <Badge variant="success" className="text-caption">feitas</Badge>
              </div>
            </Card>

            {/* 5. Horas prev. semana */}
            <Card className="p-3.5 col-span-2 sm:col-span-1 select-none">
              <div className="text-caption font-bold text-text-muted uppercase tracking-wider">Horas prev. semana</div>
              <div className="text-xl font-black text-text-primary mt-1 flex items-center gap-1">
                <span className="font-mono tabular-nums">{weekHoursSum}</span>
                <span className="text-body-sm font-bold text-text-secondary">h</span>
              </div>
            </Card>
          </div>
        )}

        {/* Shared Filters Bar */}
        {activeTaskViewTab === 'lista' && (
          <Card className="p-4 space-y-3 shadow-flat">
            {/* Quick Date Presets Row */}
            <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-border">
              <span className="text-label font-bold text-text-secondary mr-1">Filtros rápidos:</span>

              <Button
                type="button"
                size="sm"
                variant={datePreset === 'all' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('all')}
                className="h-8 px-3 text-caption font-bold"
              >
                Todas
              </Button>

              <Button
                type="button"
                size="sm"
                variant={datePreset === 'no_date' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('no_date')}
                className="h-8 px-3 text-caption font-bold"
              >
                Sem data
              </Button>

              <Button
                type="button"
                size="sm"
                variant={datePreset === 'today' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('today')}
                className="h-8 px-3 text-caption font-bold"
              >
                Hoje
              </Button>

              <Button
                type="button"
                size="sm"
                variant={datePreset === 'tomorrow' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('tomorrow')}
                className="h-8 px-3 text-caption font-bold"
              >
                Amanhã
              </Button>

              <Button
                type="button"
                size="sm"
                variant={datePreset === 'this_week' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('this_week')}
                className="h-8 px-3 text-caption font-bold"
              >
                Esta Semana
              </Button>

              <Button
                type="button"
                size="sm"
                variant={datePreset === 'overdue' ? 'danger' : 'secondary'}
                onClick={() => setFilterDatePreset('overdue')}
                className="h-8 px-3 text-caption font-bold gap-1"
              >
                <AlertTriangle className={cn("w-3.5 h-3.5", datePreset === 'overdue' ? 'text-inverse' : 'text-error')} />
                <span>Atrasadas</span>
              </Button>

              <Button
                type="button"
                size="sm"
                title="Hoje e os seis dias anteriores"
                variant={datePreset === 'completed_this_week' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('completed_this_week')}
                className="h-8 px-3 text-caption font-bold"
              >
                Concluídas esta semana
              </Button>

              <Button
                type="button"
                size="sm"
                variant={datePreset === 'completed' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('completed')}
                className="h-8 px-3 text-caption font-bold"
              >
                Concluídas
              </Button>

              {datePreset !== 'all' && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilterDatePreset('all')}
                  className="ml-auto text-caption font-bold text-text-muted hover:text-text-primary gap-1 h-8 px-2"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar preset</span>
                </Button>
              )}
            </div>

            {/* Detailed Filters Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Search Input - expands to fill space */}
              <div className="flex-1 min-w-0 sm:min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled w-4 h-4 pointer-events-none z-10" />
                <Input aria-label="Pesquisar tarefas"
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar por título, cliente ou projeto..."
                  className="pl-9 h-10 text-body-sm"
                />
              </div>

              <div className="w-full min-w-0 sm:w-auto sm:min-w-[180px]">
                <Select aria-label="Filtrar por planeamento" value={filterPlanning} onChange={e => setFilterPlanning(e.target.value)}
                  className="h-10 text-body-sm font-semibold" options={[
                    { value: '', label: 'Qualquer planeamento' },
                    { value: 'planned', label: 'Efetivas' },
                    { value: 'provisional', label: 'Provisórias' },
                  ]} />
              </div>

              {/* Assignee Filter */}
              <div className="w-full min-w-0 sm:w-auto sm:min-w-[220px]">
                <Select aria-label="Filtrar por responsável"
                  value={filterAssignee}
                  onChange={e => setFilterAssignee(e.target.value)}
                  className="h-10 text-body-sm font-semibold"
                  options={[
                    { value: '', label: 'Qualquer responsável' },
                    ...usersWithTasks.map(u => ({ value: u.id, label: u.name }))
                  ]}
                />
              </div>
            </div>
          </Card>
        )}

        {/* LISTA DE TAREFAS */}
        {activeTaskViewTab === 'lista' && (
          <Card className="mobile-task-section overflow-visible md:overflow-hidden shadow-flat">
            <div className="p-4 sm:p-5 border-b border-border bg-surface-muted/50 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-heading-sm text-text-primary">Lista de tarefas</h2>
                  <p className="text-body-sm text-text-secondary mt-0.5">
                    Visualização rápida e direta das tarefas com controlo de datas, estado, horas previstas e horas reais consumidas.
                  </p>
                </div>
                {canWriteTasks && (
                  <Button
                    type="button"
                    onClick={() => openTaskModal(null, 'create')}
                    variant="primary"
                    size="sm"
                    className="shrink-0"
                  >
                    <Plus className="w-4 h-4" /> Criar Tarefa
                  </Button>
                )}
              </div>

              {/* Controls: Page size, Sort & Group */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-secondary font-medium text-body-sm">Mostrar:</span>
                    <div className="w-20">
                      <Select
                        aria-label="Tarefas por página"
                        value={String(pageSize)}
                        onChange={e => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="h-9 py-1 px-2.5 text-body-sm font-semibold"
                        options={[
                          { value: '10', label: '10' },
                          { value: '25', label: '25' },
                          { value: '50', label: '50' },
                          { value: '100', label: '100' },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="flex w-full flex-col items-start gap-1.5 sm:w-auto sm:flex-row sm:items-center">
                    <span className="text-text-secondary font-medium text-body-sm">Ordenar por:</span>
                    <div className="w-full min-w-0 sm:w-auto sm:min-w-[180px]">
                      <Select
                        aria-label="Ordenar tarefas por"
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as 'estimatedDate' | 'status')}
                        className="h-9 py-1 pl-2.5 pr-10 text-body-sm font-semibold"
                        options={[
                          { value: 'estimatedDate', label: 'Data prevista (padrão)' },
                          { value: 'status', label: 'Estado' },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="px-2.5 py-1.5 bg-surface border border-border rounded-control flex items-center h-9">
                    <Checkbox
                      checked={groupByProject}
                      onChange={e => setGroupByProject(e.target.checked)}
                      label="Agrupar por Projeto"
                    />
                  </div>
                </div>

                <div className="text-body-sm text-text-secondary font-medium">
                  Total: <span className="font-bold text-text-primary">{totalTasks}</span> {totalTasks === 1 ? 'tarefa' : 'tarefas'}
                </div>
              </div>
            </div>

            {/* Table List Output */}
            <div className="w-full md:overflow-x-auto">
              {paginatedTasks.length === 0 ? (
                <div className="p-12 text-center text-text-muted font-medium text-body-sm space-y-2">
                  <ListTodo className="w-8 h-8 text-text-disabled mx-auto" />
                  <ListEmptyState
                    title={tasks.some(task => !task.deleted) ? 'Nenhuma tarefa corresponde aos filtros.' : 'Ainda não há tarefas registadas.'}
                    description={tasks.some(task => !task.deleted) ? 'Experimente alargar o período ou ajustar a pesquisa.' : undefined}
                    action={tasks.some(task => !task.deleted) && (search.trim() || filterAssignee || filterPlanning || datePreset !== 'all')
                      ? { label: 'Limpar filtros', run: () => { setSearch(''); setFilterAssignee(''); setFilterPlanning(''); setFilterDatePreset('all'); setCurrentPage(1); } }
                      : !tasks.some(task => !task.deleted) && canWriteTasks && !feedback?.writesBlocked
                        ? { label: 'Nova tarefa', run: () => openTaskModal(null, 'create') } : undefined}
                  />
                </div>
              ) : (
                <>
                <MobileTaskList tasks={paginatedTasks} taskStatuses={taskStatuses} projectLabel={getProjectTitle} isTaskOverdue={task => matchesDateFilter(task, 'overdue')}
                  onOpen={task => openTaskModal(task, canWriteTasks || canDeleteTasks ? 'edit' : 'view')}
                  onExecute={canWriteTasks ? task => openTaskModal(task, 'execute') : undefined}
                  onEdit={canWriteTasks ? task => openTaskModal(task, 'edit') : undefined}
                  onDuplicate={canWriteTasks ? task => openTaskModal(task, 'create') : undefined}
                  onDelete={canDeleteTasks ? task => askConfirmation('Confirmar Eliminação de Tarefa', 'Tem a certeza que deseja eliminar esta tarefa? Esta ação não pode ser anulada.', () => deleteTask(task.id)) : undefined} />
                <table className="hidden md:table w-full min-w-[850px] text-left border-collapse">
                  <thead className="bg-surface-muted text-label font-bold text-text-secondary border-b border-border whitespace-nowrap select-none">
                    <tr>
                      <th scope="col" className="px-3 py-3 text-center w-10"><span className="sr-only">Execução</span></th>
                      <th scope="col" className="px-4 py-3 text-left">Data</th>
                      <th scope="col" className="px-4 py-3 text-left">Tarefa</th>
                      <th scope="col" className="px-4 py-3 text-left">Responsáveis</th>
                      <th scope="col" className="px-4 py-3 text-center">Horas</th>
                      <th scope="col" className="px-4 py-3 text-left">Tipo</th>
                      <th scope="col" className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="text-body-sm divide-y divide-border">
                    {paginatedTasks.map(t => {
                      const tStyle = getTaskStatusStyle(t.statusId, taskStatuses);
                      const statusName = tStyle.name;
                      const displayHours = getTaskDisplayHours(t);
                      const targetDate = getTaskEffectiveDate(t);
                      const isOverdue = matchesDateFilter(t, 'overdue');

                      const statusBadgeStyle = tStyle.badgeClass;

                      return (
                        <tr
                          key={t.id}
                          onClick={() => openTaskModal(t, canWriteTasks || canDeleteTasks ? 'edit' : 'view')}
                          className="hover:bg-surface-muted/60 transition-colors cursor-pointer group"
                        >
                          {/* 1. Execução */}
                          <td className="px-3 py-3.5 text-center whitespace-nowrap w-10">
                            {canWriteTasks && countsTowardsPlanning(t) ? (
                              <IconButton
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTaskModal(t, 'execute');
                                }}
                                className="text-warning hover:text-warning hover:bg-warning/10"
                                title="Registar execução da tarefa"
                                aria-label="Registar execução da tarefa"
                              >
                                <PlayCircle className="w-5 h-5" />
                              </IconButton>
                            ) : (
                              <IconButton
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled
                                title={countsTowardsPlanning(t) ? 'Não tem permissão para registar execução' : 'Confirme o planeamento antes de executar'}
                                aria-label="Registar execução da tarefa"
                              >
                                <PlayCircle className="w-5 h-5 text-text-disabled" />
                              </IconButton>
                            )}
                          </td>

                          {/* 2. Data (Linha 1: Data + Alerta atraso, Linha 2: Badge Estado) */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-body-sm font-bold font-mono text-text-primary">
                              <span>{targetDate ? targetDate.split('-').reverse().join('/') : '—'}</span>
                              {isOverdue && (
                                <Badge variant="error" className="p-0.5" title="Tarefa atrasada">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <TaskPlanningBadge planningStatus={t.planningStatus} />
                              <Badge className={cn("uppercase tracking-wider font-bold text-caption", statusBadgeStyle)}>
                                {statusName}
                              </Badge>
                            </div>
                          </td>

                          {/* 3. Tarefa (Linha 1: Cliente · Projeto, Linha 2: Título da Tarefa) */}
                          <td className="px-4 py-3.5">
                            <div className="text-caption font-bold text-primary-ink truncate max-w-[340px]">
                              {getProjectTitle(t.projectId)}
                            </div>
                            <div className="text-body font-bold text-text-primary group-hover:text-primary-ink transition-colors mt-0.5">
                              {t.title}
                            </div>
                            {t.description && (
                              <div className="text-caption text-text-muted italic line-clamp-1 mt-0.5">
                                {t.description}
                              </div>
                            )}
                          </td>

                          {/* 4. Responsáveis */}
                          <td className="px-4 py-3.5">
                            {renderAssignees(t.assigneeIds)}
                          </td>

                          {/* 5. Horas reais preenchidas ou horas previstas */}
                          <td className="px-4 py-3.5 text-center font-bold text-body-sm whitespace-nowrap text-text-primary">
                            {displayHours.isActual ? (
                              <Badge variant="success" className="font-bold text-caption">
                                {displayHours.hours} h
                              </Badge>
                            ) : (
                              <span className="text-text-secondary">{displayHours.hours} h</span>
                            )}
                          </td>

                          {/* 6. Tipo */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {t.taskTypeId ? (
                              <Badge variant="neutral">
                                {getTaskTypeName(t.taskTypeId, taskTypes)}
                              </Badge>
                            ) : (
                              <span className="text-text-muted text-caption">—</span>
                            )}
                          </td>

                          {/* 7. Ações (Apenas ícones: Editar, Duplicar, Eliminar) */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                              {/* Edit */}
                              {canWriteTasks && (
                                <IconButton
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTaskModal(t, 'edit');
                                  }}
                                  title="Editar Tarefa"
                                  aria-label="Editar Tarefa"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </IconButton>
                              )}

                              {/* Duplicar Tarefa */}
                              {canWriteTasks && (
                                <IconButton
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTaskModal(t, 'create');
                                  }}
                                  title="Duplicar Tarefa"
                                  aria-label="Duplicar Tarefa"
                                >
                                  <Copy className="w-4 h-4" />
                                </IconButton>
                              )}

                              {/* Delete */}
                              {canDeleteTasks && (
                                <IconButton
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="hover:text-error focus-visible:text-error"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    askConfirmation(
                                      'Confirmar Eliminação de Tarefa',
                                      'Tem a certeza que deseja eliminar esta tarefa? Esta ação não pode ser anulada.',
                                      () => deleteTask(t.id)
                                    );
                                  }}
                                  title="Eliminar Tarefa"
                                  aria-label="Eliminar Tarefa"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </IconButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </>
              )}
            </div>

            {/* Pagination Controls */}
            {totalTasks > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 bg-surface-muted/50 border-t border-border text-body-sm gap-3 font-medium">
                <div className="flex items-center gap-3 text-text-secondary font-medium">
                  <span>
                    A mostrar <span className="font-bold text-text-primary">{startIndex + 1}</span> a{' '}
                    <span className="font-bold text-text-primary">{endIndex}</span> de{' '}
                    <span className="font-bold text-text-primary">{totalTasks}</span> tarefas
                  </span>
                </div>

                {totalPages > 1 && (
                  <div className="flex flex-wrap justify-center items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={validCurrentPage === 1}
                      className="gap-1 h-9 px-3 text-caption font-bold"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </Button>

                    <div className="flex flex-wrap justify-center items-center gap-1 mx-1">
                      {getPaginationPages(validCurrentPage, totalPages).map((p, idx) => (
                        p === '...' ? (
                          <span key={`ellipsis-${idx}`} className="px-1 text-text-muted font-bold">...</span>
                        ) : (
                          <Button
                            key={`page-${p}`}
                            type="button"
                            size="sm"
                            variant={validCurrentPage === p ? 'primary' : 'ghost'}
                            onClick={() => setCurrentPage(Number(p))}
                            className="min-w-9 h-9 px-2 text-caption font-bold"
                            aria-current={validCurrentPage === p ? 'page' : undefined}
                          >
                            {p}
                          </Button>
                        )
                      ))}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={validCurrentPage === totalPages}
                      className="gap-1 h-9 px-3 text-caption font-bold"
                    >
                      <span>Seguinte</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ANÁLISE DE TAREFAS */}
        {activeTaskViewTab === 'analise' && (
          <TaskAnalytics
            tasks={activeTasks}
            projects={projects}
            taskTypes={taskTypes || []}
            taskStatuses={taskStatuses}
            projectStatuses={projectStatuses}
            users={users}
            clients={clients}
          />
        )}
      </div>

      {/* Unified Task Modal */}
      <TaskDetailsModal
        isOpen={taskModalState.isOpen}
        task={taskModalState.task}
        mode={taskModalState.mode}
        onClose={() => setTaskModalState(prev => ({ ...prev, isOpen: false, task: null }))}
        createTask={addTask}
        updateTask={updateTask}
        deleteTask={deleteTask}
        taskStatuses={taskStatuses}
        taskTypes={taskTypes}
        projectPriorities={projectPriorities}
        users={users}
        userGroups={userGroups}
        appConfig={appConfig}
        projects={projects}
        clients={clients}
        absences={absences}
        tasks={tasks}
        canWrite={canWriteTasks}
        canDelete={canDeleteTasks}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
