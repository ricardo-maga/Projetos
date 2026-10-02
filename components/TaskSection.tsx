'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Task, Project, Client, TaskType } from '../lib/types';
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
import ConfirmModal from './ConfirmModal';
import TaskDetailsModal, { TaskModalMode } from './TaskDetailsModal';
import { TaskAnalytics } from './TaskAnalytics';

// Reusable UI Foundation Components
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Badge from './ui/Badge';
import { Card } from './ui/Card';
import Tabs from './ui/Tabs';

import { hasPermission } from '../lib/permissions';
import { getTaskStatusName, matchTaskStatusId, getTaskTypeName, formatToOnlyHours, getTaskEffectiveDate, getTaskStatusStyle } from '../lib/utils';
import { parseTaskHoursToFloat } from '../lib/taskOperations';
import { cn } from '../lib/utils';

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
  taskTypes?: TaskType[];
  addTask: (t: any) => void;
  updateTask: (id: string, updates: any) => void;
  deleteTask: (id: string) => void;
  currentUser?: any;
  userGroups?: any[];
  appConfig?: any;
  planningAllocations?: any[];
  createPlanningAllocation?: (data: any) => Promise<any>;
  updatePlanningAllocation?: (id: string, updates: any) => Promise<any>;
  cancelPlanningAllocation?: (id: string, version: number) => Promise<any>;
  deletePlanningAllocation?: (id: string) => Promise<any>;
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
  taskTypes = [],
  addTask,
  updateTask,
  deleteTask,
  currentUser,
  userGroups = [],
  appConfig,
}: TaskSectionProps) {
  const canReadTasks = hasPermission(currentUser, 'tasks_read', userGroups);
  const canWriteTasks = hasPermission(currentUser, 'tasks_write', userGroups);
  const canDeleteTasks = hasPermission(currentUser, 'tasks_delete', userGroups);

  // Filters state
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [datePreset, setFilterDatePreset] = useState<'all' | 'today' | 'tomorrow' | 'this_week' | 'overdue' | 'completed'>('all');

  // Pagination & Sorting state
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<'estimatedDate' | 'status'>('estimatedDate');
  const [groupByProject, setGroupByProject] = useState<boolean>(false);

  const [activeTaskViewTab, setActiveTaskViewTab] = useState<'lista' | 'analise'>('lista');

  // Reset pagination when filter/sorting/grouping variables change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterProject, filterType, filterAssignee, datePreset, pageSize, sortBy, groupByProject]);

  // Dates computation
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const weekRange = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
    };
  }, []);

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

  // Helper to resolve scale for task status
  const getTaskScale = React.useCallback((statusId: string) => {
    const status = taskStatuses.find(s => s.id === statusId || matchTaskStatusId(s.id, statusId));
    if (status && typeof status.scale === 'number') return status.scale;
    if (statusId === 'ts-1' || statusId === '99999999-9999-9999-9999-999911111111') return 1;
    if (statusId === 'ts-2' || statusId === '99999999-9999-9999-9999-999922222222') return 2;
    if (statusId === 'ts-3' || statusId === '99999999-9999-9999-9999-999933333333') return 3;
    if (statusId === 'ts-4' || statusId === '99999999-9999-9999-9999-999944444444') return 4;
    return 1;
  }, [taskStatuses]);

  // Operational KPIs
  const operationalStats = useMemo(() => {
    let todayCount = 0;
    let thisWeekCount = 0;
    let overdueCount = 0;
    let completedThisWeekCount = 0;

    activeTasks.forEach(t => {
      const scale = getTaskScale(t.statusId);
      const targetDate = getTaskEffectiveDate(t);

      if (targetDate === todayStr && (scale === 1 || scale === 2 || scale === 3)) {
        todayCount++;
      }

      if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && (scale === 1 || scale === 2 || scale === 3)) {
        thisWeekCount++;
      }

      if (targetDate && targetDate < todayStr && (scale === 1 || scale === 2)) {
        overdueCount++;
      }

      if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && scale === 3) {
        completedThisWeekCount++;
      }
    });

    let weekHoursSum = 0;
    activeTasks.forEach(t => {
      const targetDate = getTaskEffectiveDate(t);
      if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end) {
        const isActualHoursFilled = t.actualHours !== undefined && t.actualHours !== null && String(t.actualHours).trim() !== '';
        const baseHours = isActualHoursFilled
          ? parseTaskHoursToFloat(t.actualHours)
          : parseTaskHoursToFloat(t.estimatedHours);
        const userCount = (t.assigneeIds || []).length;
        weekHoursSum += baseHours * userCount;
      }
    });

    return {
      todayCount,
      thisWeekCount,
      overdueCount,
      completedThisWeekCount,
      weekHoursSum: Math.round(weekHoursSum * 10) / 10,
    };
  }, [activeTasks, getTaskScale, todayStr, weekRange]);

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
  const filteredTasks = useMemo(() => {
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
      const matchesProject = filterProject ? t.projectId === filterProject : true;
      const matchesType = filterType ? t.taskTypeId === filterType : true;
      const matchesAssignee = filterAssignee ? t.assigneeIds.some(id => matchUserId(id, filterAssignee)) : true;

      // Date Preset Filter
      let matchesPreset = true;
      const targetDate = getTaskEffectiveDate(t);
      const scale = getTaskScale(t.statusId);

      if (datePreset === 'all') {
        matchesPreset = scale !== 3; // default: do NOT show level 3
      } else if (datePreset === 'today') {
        matchesPreset = targetDate === todayStr && (scale === 1 || scale === 2);
      } else if (datePreset === 'tomorrow') {
        matchesPreset = targetDate === tomorrowStr && (scale === 1 || scale === 2);
      } else if (datePreset === 'this_week') {
        matchesPreset = Boolean(targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && (scale === 1 || scale === 2));
      } else if (datePreset === 'overdue') {
        matchesPreset = Boolean(targetDate && targetDate < todayStr && (scale === 1 || scale === 2));
      } else if (datePreset === 'completed') {
        matchesPreset = scale === 3;
      } else if (datePreset === 'completed_this_week') {
        matchesPreset = Boolean(targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && scale === 3);
      }

      return matchesSearch && matchesProject && matchesType && matchesAssignee && matchesPreset;
    });
  }, [activeTasks, search, filterProject, filterType, filterAssignee, datePreset, projectMap, clientMap, getTaskScale, todayStr, tomorrowStr, weekRange, users]);

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
        const statusA = taskStatuses.find(s => s.id === a.statusId || matchTaskStatusId(s.id, a.statusId));
        const statusB = taskStatuses.find(s => s.id === b.statusId || matchTaskStatusId(s.id, b.statusId));
        const scaleA = statusA ? (statusA.scale ?? 999) : 999;
        const scaleB = statusB ? (statusB.scale ?? 999) : 999;
        return scaleA - scaleB;
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
    const proj = projects.find(p => p.id === projId);
    if (!proj) return 'Projeto não encontrado';
    const client = clients.find(c => c.id === proj.clientId);
    const clientName = client ? (client.clientName || client.shortName) : '';
    return clientName ? `${clientName} • ${proj.title}` : proj.title;
  };

  const getUserName = (id: string) => users.find(u => matchUserId(u.id, id))?.name || 'N/A';

  const viewTabsOptions = [
    { id: 'lista', label: 'Lista Operacional de Tarefas', icon: <ListTodo className="w-4.5 h-4.5" /> },
    { id: 'analise', label: 'Análise de Tarefas', icon: <BarChart2 className="w-4.5 h-4.5" /> }
  ];

  return (
    <div className="space-y-6">
      {/* View Selection Tabs */}
      <Tabs 
        tabs={viewTabsOptions} 
        activeTabId={activeTaskViewTab} 
        onChange={(id) => setActiveTaskViewTab(id as 'lista' | 'analise')}
        variant="line"
        className="mb-2"
      />

      {activeTaskViewTab === 'lista' && (
        <>
          {/* OPERATIONAL KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {/* 1. Para Hoje */}
            <Card 
              onClick={() => setFilterDatePreset(datePreset === 'today' ? 'all' : 'today')}
              className={cn(
                "p-4 cursor-pointer select-none border-l-[4px] transition-all",
                datePreset === 'today'
                  ? 'border-l-primary bg-primary/5 shadow-raised ring-1 ring-primary/10'
                  : 'border-l-primary/40 bg-surface hover:bg-surface-muted/30 border-border'
              )}
            >
              <div className="text-caption font-semibold text-text-muted uppercase tracking-wider">Para Hoje</div>
              <div className="text-heading-lg font-black text-text-primary mt-2 flex items-baseline gap-1.5">
                <span className="font-mono tabular-nums">{operationalStats.todayCount}</span>
                <span className="text-caption font-bold text-primary">tarefas</span>
              </div>
            </Card>

            {/* 2. Esta semana */}
            <Card 
              onClick={() => setFilterDatePreset(datePreset === 'this_week' ? 'all' : 'this_week')}
              className={cn(
                "p-4 cursor-pointer select-none border-l-[4px] transition-all",
                datePreset === 'this_week'
                  ? 'border-l-info bg-primary/5 shadow-raised ring-1 ring-primary/10'
                  : 'border-l-info/40 bg-surface hover:bg-surface-muted/30 border-border'
              )}
            >
              <div className="text-caption font-semibold text-text-muted uppercase tracking-wider">Esta semana</div>
              <div className="text-heading-lg font-black text-text-primary mt-2 flex items-baseline gap-1.5">
                <span className="font-mono tabular-nums">{operationalStats.thisWeekCount}</span>
                <span className="text-caption font-bold text-primary">ativas</span>
              </div>
            </Card>

            {/* 3. Atrasadas */}
            <Card 
              onClick={() => setFilterDatePreset(datePreset === 'overdue' ? 'all' : 'overdue')}
              className={cn(
                "p-4 cursor-pointer select-none border-l-[4px] transition-all",
                datePreset === 'overdue'
                  ? 'border-l-error bg-error/5 shadow-raised ring-1 ring-error/10'
                  : 'border-l-error/40 bg-surface hover:bg-surface-muted/30 border-border'
              )}
            >
              <div className="text-caption font-semibold text-text-muted uppercase tracking-wider">Atrasadas</div>
              <div className="text-heading-lg font-black text-error mt-2 flex items-baseline gap-2">
                <span className="font-mono tabular-nums">{operationalStats.overdueCount}</span>
                {operationalStats.overdueCount > 0 && (
                  <Badge variant="error" className="text-[10px] py-0 px-1.5">Atenção</Badge>
                )}
              </div>
            </Card>

            {/* 4. Concluídas esta semana */}
            <Card 
              onClick={() => setFilterDatePreset(datePreset === 'completed_this_week' ? 'all' : 'completed_this_week')}
              className={cn(
                "p-4 cursor-pointer select-none border-l-[4px] transition-all",
                datePreset === 'completed_this_week'
                  ? 'border-l-success bg-success/5 shadow-raised ring-1 ring-success/10'
                  : 'border-l-success/40 bg-surface hover:bg-surface-muted/30 border-border'
              )}
            >
              <div className="text-caption font-semibold text-text-muted uppercase tracking-wider">Concluídas esta semana</div>
              <div className="text-heading-lg font-black text-success mt-2 flex items-baseline gap-1.5">
                <span className="font-mono tabular-nums">{operationalStats.completedThisWeekCount}</span>
                <span className="text-caption font-bold text-success">feitas</span>
              </div>
            </Card>

            {/* 5. Horas prev. semana */}
            <Card className="p-4 border-l-[4px] border-l-text-muted bg-surface border-border">
              <div className="text-caption font-semibold text-text-muted uppercase tracking-wider">Horas prev. semana</div>
              <div className="text-heading-lg font-black text-text-primary mt-2 flex items-baseline gap-1.5">
                <span className="font-mono tabular-nums">{operationalStats.weekHoursSum}</span>
                <span className="text-caption font-bold text-text-secondary">h</span>
              </div>
            </Card>
          </div>

          {/* SHARED FILTERS BAR */}
          <div className="space-y-4 bg-surface p-5 rounded-card border border-border shadow-raised">
            {/* Quick Date Presets Row */}
            <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-border/60">
              <span className="text-body-sm font-extrabold text-text-secondary mr-2">Filtros Rápidos:</span>

              <Button
                variant={datePreset === 'all' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('all')}
                className="py-1.5 px-3 h-auto text-caption font-bold"
              >
                Todas
              </Button>

              <Button
                variant={datePreset === 'today' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('today')}
                className={cn(
                  "py-1.5 px-3 h-auto text-caption font-bold",
                  datePreset !== 'today' && "bg-primary/5 text-primary border-primary/10 hover:bg-primary/10"
                )}
              >
                Hoje
              </Button>

              <Button
                variant={datePreset === 'tomorrow' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('tomorrow')}
                className="py-1.5 px-3 h-auto text-caption font-bold"
              >
                Amanhã
              </Button>

              <Button
                variant={datePreset === 'this_week' ? 'primary' : 'secondary'}
                onClick={() => setFilterDatePreset('this_week')}
                className="py-1.5 px-3 h-auto text-caption font-bold"
              >
                Esta Semana
              </Button>

              <Button
                variant={datePreset === 'overdue' ? 'error' : 'secondary'}
                onClick={() => setFilterDatePreset('overdue')}
                className={cn(
                  "py-1.5 px-3 h-auto text-caption font-bold flex items-center gap-1.5",
                  datePreset !== 'overdue' && "bg-error/5 text-error border-error/10 hover:bg-error/10"
                )}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Atrasadas</span>
              </Button>

              <Button
                variant={datePreset === 'completed_this_week' ? 'success' : 'secondary'}
                onClick={() => setFilterDatePreset('completed_this_week')}
                className={cn(
                  "py-1.5 px-3 h-auto text-caption font-bold",
                  datePreset !== 'completed_this_week' && "bg-success/5 text-success border-success/10 hover:bg-success/10"
                )}
              >
                Concluídas esta semana
              </Button>

              <Button
                variant={datePreset === 'completed' ? 'success' : 'secondary'}
                onClick={() => setFilterDatePreset('completed')}
                className={cn(
                  "py-1.5 px-3 h-auto text-caption font-bold",
                  datePreset !== 'completed' && "bg-success/5 text-success border-success/10 hover:bg-success/10"
                )}
              >
                Concluídas
              </Button>

              {datePreset !== 'all' && (
                <button
                  type="button"
                  onClick={() => setFilterDatePreset('all')}
                  className="ml-auto text-caption font-semibold text-text-muted hover:text-text-primary flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar preset</span>
                </button>
              )}
            </div>

            {/* Detailed Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar..."
                  className="w-full pl-9 pr-4 h-10 bg-surface border border-border rounded-control text-body-sm font-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary transition-all"
                />
              </div>

              {/* Project Filter */}
              <select 
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-border rounded-control text-body-sm font-semibold text-text-secondary cursor-pointer outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary transition-all truncate"
              >
                <option value="">Todos os Projetos</option>
                {projects.filter(p => !p.deleted).map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>

              {/* Task Type Filter */}
              <select 
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-border rounded-control text-body-sm font-semibold text-text-secondary cursor-pointer outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary transition-all"
              >
                <option value="">Todos os Tipos</option>
                {taskTypes.filter(tt => !tt.deleted).map(tt => (
                  <option key={tt.id} value={tt.id}>{tt.name}</option>
                ))}
              </select>

              {/* Assignee Filter */}
              <select 
                value={filterAssignee}
                onChange={e => setFilterAssignee(e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-border rounded-control text-body-sm font-semibold text-text-secondary cursor-pointer outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary transition-all"
              >
                <option value="">Qualquer Responsável</option>
                {usersWithTasks.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* LISTA DE TAREFAS */}
          <div className="bg-surface rounded-card border border-border shadow-raised overflow-hidden">
            <div className="p-5 border-b border-border bg-surface-muted/50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-heading-sm font-bold text-text-primary">Lista Operacional de Tarefas</h2>
                  <p className="text-caption text-text-secondary mt-1">
                    Visualização rápida e direta das tarefas com controlo de datas, estado, horas previstas e horas reais consumidas.
                  </p>
                </div>
                {canWriteTasks && (
                  <Button 
                    onClick={() => openTaskModal(null, 'create')}
                    className="flex items-center gap-2 h-10"
                  >
                    <Plus className="w-4 h-4" /> Criar Tarefa
                  </Button>
                )}
              </div>

              {/* Controls: Page size, Sort & Group */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-border/50">
                <div className="flex flex-wrap items-center gap-4 text-body-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary font-semibold">Mostrar:</span>
                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2.5 py-1.5 bg-surface border border-border rounded-control text-caption font-bold text-text-secondary cursor-pointer outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary font-semibold">Ordenar por:</span>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as 'estimatedDate' | 'status')}
                      className="px-2.5 py-1.5 bg-surface border border-border rounded-control text-caption font-bold text-text-secondary cursor-pointer outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="estimatedDate">Data prevista (padrão)</option>
                      <option value="status">Estado</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-control text-caption font-bold text-text-secondary cursor-pointer select-none hover:bg-surface-muted transition-colors">
                    <input
                      type="checkbox"
                      checked={groupByProject}
                      onChange={e => setGroupByProject(e.target.checked)}
                      className="w-3.5 h-3.5 text-primary rounded border-border cursor-pointer focus:ring-0"
                    />
                    <span>Agrupar por Projeto</span>
                  </label>
                </div>

                <div className="text-body-sm text-text-secondary font-semibold">
                  Total: <span className="font-bold text-text-primary">{totalTasks}</span> {totalTasks === 1 ? 'tarefa' : 'tarefas'}
                </div>
              </div>
            </div>

            {/* Table List Output */}
            <div className="overflow-x-auto w-full">
              {paginatedTasks.length === 0 ? (
                <div className="p-12 text-center text-text-muted space-y-4">
                  <ListTodo className="w-10 h-10 text-text-muted/60 mx-auto" />
                  <div>
                    <p className="text-body-sm font-bold text-text-primary">Nenhuma tarefa encontrada.</p>
                    <p className="text-caption text-text-secondary mt-1">Tente ajustar a pesquisa ou limpar os filtros operacionais selecionados.</p>
                  </div>
                </div>
              ) : (
                <table className="w-full min-w-[850px] text-left border-collapse">
                  <thead className="bg-surface-muted/50 text-caption uppercase tracking-wider text-text-secondary font-bold border-b border-border select-none whitespace-nowrap">
                    <tr>
                      <th className="px-5 py-3 text-left">Data</th>
                      <th className="px-5 py-3 text-left">Estado</th>
                      <th className="px-5 py-3 text-left">Título da Tarefa</th>
                      <th className="px-5 py-3 text-left">Projeto / Cliente</th>
                      <th className="px-5 py-3 text-left">Responsáveis</th>
                      <th className="px-5 py-3 text-center">Horas prev./reais</th>
                      <th className="px-5 py-3 text-left">Tipo</th>
                      <th className="px-5 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="text-body-sm divide-y divide-border/60">
                    {paginatedTasks.map(t => {
                      const scale = getTaskScale(t.statusId);
                      const tStyle = getTaskStatusStyle(t.statusId, taskStatuses);
                      const statusName = tStyle.name;
                      const estHours = formatToOnlyHours(t.estimatedHours) || '0';
                      const actHours = formatToOnlyHours(t.actualHours) || '0';
                      const targetDate = getTaskEffectiveDate(t);
                      const isOverdue = Boolean(targetDate && targetDate < todayStr && scale !== 3);

                      const statusBadgeStyle = tStyle.badgeClass;

                      // Map badge style to Badge component variants
                      let badgeVar: 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info' = 'neutral';
                      if (scale === 3) badgeVar = 'success';
                      else if (scale === 2) badgeVar = 'primary';
                      else if (scale === 1) badgeVar = 'neutral';
                      else if (scale === 4) badgeVar = 'info';

                      return (
                        <tr 
                          key={t.id} 
                          onClick={() => openTaskModal(t, canWriteTasks ? 'edit' : 'view')}
                          className="hover:bg-surface-muted/35 transition-colors cursor-pointer group"
                        >
                          {/* Data */}
                          <td className="px-5 py-4 font-bold font-mono text-text-primary whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span>{targetDate ? targetDate.split('-').reverse().join('/') : 'N/A'}</span>
                              {isOverdue && (
                                <span className="p-0.5 rounded text-error bg-error/5 border border-error/10" title="Tarefa atrasada">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Estado */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <Badge variant={badgeVar} className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5">
                              {statusName}
                            </Badge>
                          </td>

                          {/* Título */}
                          <td className="px-5 py-4">
                            <div className="font-extrabold text-text-primary group-hover:text-primary transition-colors">
                              {t.title}
                            </div>
                            {t.description && (
                              <div className="text-caption text-text-muted italic line-clamp-1 mt-1">
                                {t.description}
                              </div>
                            )}
                          </td>

                          {/* Projeto */}
                          <td className="px-5 py-4">
                            {t.projectId ? (
                              <span className="text-primary font-bold text-caption">{getProjectTitle(t.projectId)}</span>
                            ) : (
                              <span className="text-text-muted font-medium italic text-caption">Sem projeto</span>
                            )}
                          </td>

                          {/* Responsáveis */}
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-1 max-w-[160px]">
                              {t.assigneeIds && t.assigneeIds.length > 0 ? (
                                t.assigneeIds.map(uid => (
                                  <Badge key={uid} variant="neutral" className="text-[10px] px-1.5 py-0">
                                    {getUserName(uid)}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-text-muted italic text-[10px]">Sem atribuição</span>
                              )}
                            </div>
                          </td>

                          {/* Horas prev./reais */}
                          <td className="px-5 py-4 text-center font-bold whitespace-nowrap text-text-secondary">
                            <span>{estHours} h</span>
                            <span className="text-border mx-2">/</span>
                            {parseTaskHoursToFloat(actHours) > 0 ? (
                              <span className="text-success bg-success/5 border border-success/10 px-1.5 py-0.5 rounded font-mono">
                                {actHours} h
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>

                          {/* Tipo */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            {t.taskTypeId ? (
                              <Badge variant="neutral" className="text-[10px] bg-surface-muted/80 text-text-primary font-semibold">
                                {getTaskTypeName(t.taskTypeId, taskTypes)}
                              </Badge>
                            ) : (
                              <span className="text-text-muted text-[10px]">—</span>
                            )}
                          </td>

                          {/* Ações */}
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            <div className="flex items-center gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                              {/* Quick Action: Registar Execução */}
                              {canWriteTasks && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTaskModal(t, 'execute');
                                  }}
                                  className="px-2.5 py-1.5 bg-warning/5 hover:bg-warning/10 text-warning border border-warning/10 rounded-control text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer h-8"
                                  title="Registar horas e execução"
                                >
                                  <PlayCircle className="w-3.5 h-3.5" />
                                  <span>Execução</span>
                                </button>
                              )}

                              {/* Link Copy */}
                              <IconButton 
                                variant="ghost"
                                onClick={() => handleCopyTaskLink(t.id)}
                                className={cn(
                                  "w-8 h-8 rounded-full",
                                  copiedLinkId === t.id ? 'text-success bg-success/5' : 'text-text-muted hover:bg-surface-muted'
                                )}
                                title="Copiar Link da Tarefa"
                                aria-label="Copiar Link da Tarefa"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                              </IconButton>

                              {/* Edit */}
                              {canWriteTasks && (
                                <IconButton 
                                  variant="ghost"
                                  onClick={() => openTaskModal(t, 'edit')}
                                  className="w-8 h-8 rounded-full text-text-muted hover:text-primary hover:bg-surface-muted"
                                  title="Editar Tarefa"
                                  aria-label="Editar Tarefa"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </IconButton>
                              )}

                              {/* Duplicar Tarefa */}
                              {canWriteTasks && (
                                <IconButton 
                                  variant="ghost"
                                  onClick={() => openTaskModal(t, 'create')}
                                  className="w-8 h-8 rounded-full text-text-muted hover:text-primary hover:bg-surface-muted"
                                  title="Duplicar Tarefa"
                                  aria-label="Duplicar Tarefa"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </IconButton>
                              )}

                              {/* Delete */}
                              {canDeleteTasks && (
                                <IconButton 
                                  variant="ghost"
                                  onClick={() => askConfirmation(
                                    'Confirmar Eliminação de Tarefa',
                                    'Tem a certeza que deseja eliminar esta tarefa? Esta ação não pode ser anulada.',
                                    () => deleteTask(t.id)
                                  )}
                                  className="w-8 h-8 rounded-full text-text-muted hover:text-error hover:bg-error/5"
                                  title="Eliminar Tarefa"
                                  aria-label="Eliminar Tarefa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </IconButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {totalTasks > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 bg-surface-muted/40 border-t border-border text-caption gap-4 font-semibold text-text-secondary">
                <div>
                  A mostrar <span className="font-bold text-text-primary">{startIndex + 1}</span> a{' '}
                  <span className="font-bold text-text-primary">{endIndex}</span> de{' '}
                  <span className="font-bold text-text-primary">{totalTasks}</span> tarefas
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={validCurrentPage === 1}
                      className="py-1.5 px-3 h-auto text-caption font-bold flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </Button>
                    
                    <div className="flex items-center gap-1 mx-1">
                      {getPaginationPages(validCurrentPage, totalPages).map((p, idx) => (
                        p === '...' ? (
                          <span key={`ellipsis-${idx}`} className="px-1.5 text-text-muted font-bold">...</span>
                        ) : (
                          <button
                            key={`page-${p}`}
                            onClick={() => setCurrentPage(Number(p))}
                            className={cn(
                              "min-w-[32px] h-8 px-2.5 flex items-center justify-center rounded-control font-bold text-caption transition-colors cursor-pointer select-none border",
                              validCurrentPage === p
                                ? 'bg-primary text-white border-primary shadow-raised'
                                : 'bg-surface border-border text-text-secondary hover:bg-surface-muted'
                            )}
                          >
                            {p}
                          </button>
                        )
                      ))}
                    </div>

                    <Button
                      variant="secondary"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={validCurrentPage === totalPages}
                      className="py-1.5 px-3 h-auto text-caption font-bold flex items-center gap-1"
                    >
                      <span>Seguinte</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ANÁLISE DE TAREFAS */}
      {activeTaskViewTab === 'analise' && (
        <TaskAnalytics 
          tasks={tasks}
          projects={projects}
          taskTypes={taskTypes || []}
          taskStatuses={taskStatuses}
          users={users}
          clients={clients}
        />
      )}

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
        users={users}
        userGroups={userGroups}
        appConfig={appConfig}
        projects={projects}
        clients={clients}
        absences={absences}
        tasks={tasks}
        canWrite={canWriteTasks}
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
