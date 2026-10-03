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

import { hasPermission } from '../lib/permissions';
import { getTaskStatusName, matchTaskStatusId, getTaskTypeName, formatToOnlyHours, getTaskEffectiveDate, getTaskStatusStyle, getUserInitials, cn } from '../lib/utils';
import { parseTaskHoursToFloat } from '../lib/taskOperations';
import { Button, IconButton, Badge, Tabs } from './ui';


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
  }, [search, filterAssignee, datePreset, pageSize, sortBy, groupByProject]);

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
    if (statusId === 'ts-1' || statusId === '99999999-9999-9999-9999-999999999901') return 1;
    if (statusId === 'ts-2' || statusId === '99999999-9999-9999-9999-999999999902') return 2;
    if (statusId === 'ts-3' || statusId === '99999999-9999-9999-9999-999999999903') return 3;
    if (statusId === 'ts-4' || statusId === '99999999-9999-9999-9999-999999999904') return 4;
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

      return matchesSearch && matchesAssignee && matchesPreset;
    });
  }, [activeTasks, search, filterAssignee, datePreset, projectMap, clientMap, getTaskScale, todayStr, tomorrowStr, weekRange, users]);

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
      return <span className="text-slate-400 italic text-xs">Sem atribuição</span>;
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
            <span 
              key={uid} 
              className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 font-extrabold text-xs rounded-md shadow-2xs"
              title={userName}
            >
              {initials}
            </span>
          );
        })}
        {remainingCount > 0 && (
          <span 
            className="px-1.5 py-0.5 bg-slate-200 border border-slate-300 text-slate-700 font-extrabold text-xs rounded-md shadow-2xs"
            title={`${remainingCount} outro(s) responsável(eis)`}
          >
            +{remainingCount}
          </span>
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
            { id: 'lista', label: 'Lista Operacional de Tarefas', icon: <ListTodo className="w-4.5 h-4.5" /> },
            { id: 'analise', label: 'Análise de Tarefas', icon: <BarChart2 className="w-4.5 h-4.5" /> }
          ]}
          activeTabId={activeTaskViewTab}
          onChange={(id) => setActiveTaskViewTab(id as 'lista' | 'analise')}
          variant="line"
          className="mb-4"
        />

        {/* OPERATIONAL KPI CARDS */}
        {activeTaskViewTab === 'lista' && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 select-none">
            {/* 1. Para Hoje */}
            <button
              type="button"
              onClick={() => setFilterDatePreset(datePreset === 'today' ? 'all' : 'today')}
              className={cn(
                "text-left p-3.5 rounded-card border transition-all cursor-pointer",
                datePreset === 'today'
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "bg-surface border-border hover:border-border-primary"
              )}
            >
              <div className="text-caption font-bold text-text-muted uppercase tracking-wider">Para Hoje</div>
              <div className="text-xl font-black text-text-primary mt-1 flex items-center gap-2">
                <span className="font-mono tabular-nums">{operationalStats.todayCount}</span>
                <Badge variant="primary" className="text-xs">tarefas</Badge>
              </div>
            </button>

            {/* 2. Esta semana */}
            <button
              type="button"
              onClick={() => setFilterDatePreset(datePreset === 'this_week' ? 'all' : 'this_week')}
              className={cn(
                "text-left p-3.5 rounded-card border transition-all cursor-pointer",
                datePreset === 'this_week'
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "bg-surface border-border hover:border-border-primary"
              )}
            >
              <div className="text-caption font-bold text-text-muted uppercase tracking-wider">Esta semana</div>
              <div className="text-xl font-black text-text-primary mt-1 flex items-center gap-2">
                <span className="font-mono tabular-nums">{operationalStats.thisWeekCount}</span>
                <Badge variant="primary" className="text-xs">ativas</Badge>
              </div>
            </button>

            {/* 3. Atrasadas */}
            <button
              type="button"
              onClick={() => setFilterDatePreset(datePreset === 'overdue' ? 'all' : 'overdue')}
              className={cn(
                "text-left p-3.5 rounded-card border transition-all cursor-pointer",
                datePreset === 'overdue'
                  ? "border-error bg-error/10 ring-1 ring-error"
                  : "bg-surface border-border hover:border-border-primary"
              )}
            >
              <div className="text-caption font-bold text-text-muted uppercase tracking-wider">Atrasadas</div>
              <div className="text-xl font-black text-text-primary mt-1 flex items-center gap-2">
                <span className="font-mono tabular-nums text-error">{operationalStats.overdueCount}</span>
                {operationalStats.overdueCount > 0 && (
                  <Badge variant="error" className="text-xs">atraso</Badge>
                )}
              </div>
            </button>

            {/* 4. Concluídas esta semana */}
            <button
              type="button"
              onClick={() => setFilterDatePreset(datePreset === 'completed_this_week' ? 'all' : 'completed_this_week')}
              className={cn(
                "text-left p-3.5 rounded-card border transition-all cursor-pointer",
                datePreset === 'completed_this_week'
                  ? "border-success bg-success/10 ring-1 ring-success"
                  : "bg-surface border-border hover:border-border-primary"
              )}
            >
              <div className="text-caption font-bold text-text-muted uppercase tracking-wider">Concluídas esta semana</div>
              <div className="text-xl font-black text-text-primary mt-1 flex items-center gap-2">
                <span className="font-mono tabular-nums">{operationalStats.completedThisWeekCount}</span>
                <Badge variant="success" className="text-xs">feitas</Badge>
              </div>
            </button>

            {/* 5. Horas prev. semana */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Horas prev. semana</div>
              <div className="text-xl font-black text-slate-900 mt-1 flex items-center gap-1">
                <span className="font-mono tabular-nums">{operationalStats.weekHoursSum}</span>
                <span className="text-xs font-bold text-slate-500">h</span>
              </div>
            </div>
          </div>
        )}

        {/* Shared Filters Bar */}
        {activeTaskViewTab === 'lista' && (
          <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            {/* Quick Date Presets Row */}
            <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-slate-100">
              <span className="text-xs font-extrabold text-slate-500 mr-1">Filtros Rápidos:</span>

              <button
                type="button"
                onClick={() => setFilterDatePreset('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  datePreset === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todas
              </button>

              <button
                type="button"
                onClick={() => setFilterDatePreset('today')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  datePreset === 'today'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Hoje
              </button>

              <button
                type="button"
                onClick={() => setFilterDatePreset('tomorrow')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  datePreset === 'tomorrow'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Amanhã
              </button>

              <button
                type="button"
                onClick={() => setFilterDatePreset('this_week')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  datePreset === 'this_week'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Esta Semana
              </button>

              <button
                type="button"
                onClick={() => setFilterDatePreset('overdue')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  datePreset === 'overdue'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <AlertTriangle className={`w-3.5 h-3.5 ${datePreset === 'overdue' ? 'text-rose-200' : 'text-rose-600'}`} />
                <span>Atrasadas</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterDatePreset('completed_this_week')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  datePreset === 'completed_this_week'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Concluídas esta semana
              </button>

              <button
                type="button"
                onClick={() => setFilterDatePreset('completed')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  datePreset === 'completed'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Concluídas
              </button>

              {datePreset !== 'all' && (
                <button
                  type="button"
                  onClick={() => setFilterDatePreset('all')}
                  className="ml-auto text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>Limpar preset</span>
                </button>
              )}
            </div>

            {/* Detailed Filters Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Search Input - expands to fill space */}
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar por título, cliente ou projeto..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
                />
              </div>

              {/* Assignee Filter */}
              <select 
                value={filterAssignee}
                onChange={e => setFilterAssignee(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              >
                <option value="">Qualquer Responsável</option>
                {usersWithTasks.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* LISTA DE TAREFAS */}
        {activeTaskViewTab === 'lista' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/60 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">Lista Operacional de Tarefas</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
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
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/60">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Mostrar:</span>
                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Ordenar por:</span>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as 'estimatedDate' | 'status')}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="estimatedDate">Data prevista (padrão)</option>
                      <option value="status">Estado</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer select-none hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={groupByProject}
                      onChange={e => setGroupByProject(e.target.checked)}
                      className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 cursor-pointer"
                    />
                    <span>Agrupar por Projeto</span>
                  </label>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  Total: <span className="font-bold text-slate-800">{totalTasks}</span> {totalTasks === 1 ? 'tarefa' : 'tarefas'}
                </div>
              </div>
            </div>

            {/* Table List Output */}
            <div className="overflow-x-auto w-full">
              {paginatedTasks.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-medium text-xs space-y-2">
                  <ListTodo className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700">Nenhuma tarefa encontrada.</p>
                  <p className="text-slate-500 text-[11px]">Tente ajustar a pesquisa ou limpar os filtros operacionais selecionados.</p>
                </div>
              ) : (
                <table className="w-full min-w-[850px] text-left border-collapse">
                  <thead className="bg-slate-50/90 text-xs font-bold text-slate-500 border-b border-slate-200/80 whitespace-nowrap select-none">
                    <tr>
                      <th className="px-3 py-3 text-center w-10"></th>
                      <th className="px-4 py-3 text-left">Data</th>
                      <th className="px-4 py-3 text-left">Tarefa</th>
                      <th className="px-4 py-3 text-left">Responsáveis</th>
                      <th className="px-4 py-3 text-center">Horas prev./Reais</th>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-slate-100">
                    {paginatedTasks.map(t => {
                      const scale = getTaskScale(t.statusId);
                      const tStyle = getTaskStatusStyle(t.statusId, taskStatuses);
                      const statusName = tStyle.name;
                      const estHours = formatToOnlyHours(t.estimatedHours) || '0';
                      const actHours = formatToOnlyHours(t.actualHours) || '0';
                      const targetDate = getTaskEffectiveDate(t);
                      const isOverdue = Boolean(targetDate && targetDate < todayStr && scale !== 3);

                      const statusBadgeStyle = tStyle.badgeClass;

                      return (
                        <tr 
                          key={t.id} 
                          onClick={() => openTaskModal(t, canWriteTasks ? 'edit' : 'view')}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        >
                          {/* 1. Execução */}
                          <td className="px-3 py-3.5 text-center whitespace-nowrap w-10">
                            {canWriteTasks ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTaskModal(t, 'execute');
                                }}
                                className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                title="Registar execução da tarefa"
                                aria-label="Registar execução da tarefa"
                              >
                                <PlayCircle className="w-4 h-4 text-amber-600" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="p-1.5 bg-slate-50 text-slate-300 rounded-lg cursor-not-allowed inline-flex items-center justify-center opacity-40"
                                title="Não tem permissão para registar execução"
                                aria-label="Registar execução da tarefa"
                              >
                                <PlayCircle className="w-4 h-4 text-slate-400" />
                              </button>
                            )}
                          </td>

                          {/* 2. Data (Linha 1: Data + Alerta atraso, Linha 2: Badge Estado) */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-sm font-bold font-mono text-slate-800">
                              <span>{targetDate ? targetDate.split('-').reverse().join('/') : '—'}</span>
                              {isOverdue && (
                                <span className="p-0.5 rounded text-rose-600 bg-rose-50 inline-flex items-center" title="Tarefa atrasada">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                            <div className="mt-1">
                              <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border ${statusBadgeStyle}`}>
                                {statusName}
                              </span>
                            </div>
                          </td>

                          {/* 3. Tarefa (Linha 1: Cliente · Projeto, Linha 2: Título da Tarefa) */}
                          <td className="px-4 py-3.5">
                            <div className="text-xs font-bold text-blue-700 truncate max-w-[340px]">
                              {getProjectTitle(t.projectId)}
                            </div>
                            <div className="text-sm font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors mt-0.5">
                              {t.title}
                            </div>
                            {t.description && (
                              <div className="text-xs text-slate-500 italic line-clamp-1 mt-0.5">
                                {t.description}
                              </div>
                            )}
                          </td>

                          {/* 4. Responsáveis */}
                          <td className="px-4 py-3.5">
                            {renderAssignees(t.assigneeIds)}
                          </td>

                          {/* 5. Horas prev./Reais */}
                          <td className="px-4 py-3.5 text-center font-bold text-xs whitespace-nowrap text-slate-800">
                            <span className="text-slate-700">{estHours} h</span>
                            <span className="text-slate-300 mx-1.5">/</span>
                            <span className={parseTaskHoursToFloat(actHours) > 0 ? "text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-extrabold" : "text-slate-600"}>
                              {actHours} h
                            </span>
                          </td>

                          {/* 6. Tipo */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {t.taskTypeId ? (
                              <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-md text-xs font-semibold">
                                {getTaskTypeName(t.taskTypeId, taskTypes)}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>

                          {/* 7. Ações (Apenas ícones: Editar, Duplicar, Eliminar) */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                              {/* Edit */}
                              {canWriteTasks && (
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTaskModal(t, 'edit');
                                  }}
                                  className="p-1.5 hover:bg-blue-50 hover:text-blue-700 rounded-lg text-slate-400 transition-colors cursor-pointer"
                                  title="Editar Tarefa"
                                  aria-label="Editar Tarefa"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}

                              {/* Duplicar Tarefa */}
                              {canWriteTasks && (
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTaskModal(t, 'create');
                                  }}
                                  className="p-1.5 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg text-slate-400 transition-colors cursor-pointer"
                                  title="Duplicar Tarefa"
                                  aria-label="Duplicar Tarefa"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              )}

                              {/* Delete */}
                              {canDeleteTasks && (
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    askConfirmation(
                                      'Confirmar Eliminação de Tarefa',
                                      'Tem a certeza que deseja eliminar esta tarefa? Esta ação não pode ser anulada.',
                                      () => deleteTask(t.id)
                                    );
                                  }}
                                  className="p-1.5 hover:bg-rose-50 hover:text-rose-700 rounded-lg text-slate-400 transition-colors cursor-pointer"
                                  title="Eliminar Tarefa"
                                  aria-label="Eliminar Tarefa"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
              <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 bg-slate-50/70 border-t border-slate-200/80 text-xs gap-3 font-medium">
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                  <span>
                    A mostrar <span className="font-bold text-slate-700">{startIndex + 1}</span> a{' '}
                    <span className="font-bold text-slate-700">{endIndex}</span> de{' '}
                    <span className="font-bold text-slate-700">{totalTasks}</span> tarefas
                  </span>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={validCurrentPage === 1}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </button>
                    
                    <div className="flex items-center gap-1 mx-1">
                      {getPaginationPages(validCurrentPage, totalPages).map((p, idx) => (
                        p === '...' ? (
                          <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 font-bold">...</span>
                        ) : (
                          <button
                            key={`page-${p}`}
                            onClick={() => setCurrentPage(Number(p))}
                            className={`min-w-[28px] h-7 px-1.5 flex items-center justify-center rounded-lg font-bold text-xs transition-colors ${
                              validCurrentPage === p
                                ? 'bg-slate-900 text-white'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      ))}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={validCurrentPage === totalPages}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <span>Seguinte</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
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
