'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Task, Project, Client, TaskType } from '../lib/types';
import { Plus, Search, Trash2, Edit2, Clock, Calendar, CheckSquare, PlusCircle, X, Users, Link2, Maximize2, Minimize2, ChevronLeft, ChevronRight, BarChart2, AlertTriangle } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { AssigneeSelector } from './AssigneeSelector';
import TaskDetailsModal from './TaskDetailsModal';
import { TaskAnalytics } from './TaskAnalytics';

import { hasPermission } from '../lib/permissions';
import { getTaskStatusName, getDefaultTaskStatusId, matchTaskStatusId, getTaskTypeName, getDefaultTaskTypeId, formatToOnlyHours } from '../lib/utils';
import { getTaskConflictWarnings } from '../lib/taskConflicts';

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
  planningAllocations = [],
  createPlanningAllocation,
  updatePlanningAllocation,
  cancelPlanningAllocation,
  deletePlanningAllocation,
}: TaskSectionProps) {
  const canReadTasks = hasPermission(currentUser, 'tasks_read', userGroups);
  const canWriteTasks = hasPermission(currentUser, 'tasks_write', userGroups);
  const canDeleteTasks = hasPermission(currentUser, 'tasks_delete', userGroups);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatusGroup, setFilterStatusGroup] = useState<'pending' | 'completed' | 'all'>('pending');
  const [filterAssignee, setFilterAssignee] = useState('');

  // Pagination & Sorting state
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<'estimatedDate' | 'status'>('estimatedDate');
  const [groupByProject, setGroupByProject] = useState<boolean>(false);

  const [activeTaskViewTab, setActiveTaskViewTab] = useState<'lista' | 'analise'>('lista');

  // Reset pagination when filter/sorting/grouping variables change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterProject, filterStatus, filterStatusGroup, filterAssignee, pageSize, sortBy, groupByProject]);
  
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

  // Unified Task Modal State (FASE 30)
  const [taskModalState, setTaskModalState] = useState<{
    isOpen: boolean;
    task: Task | null;
    mode: 'create' | 'edit' | 'view';
  }>({
    isOpen: false,
    task: null,
    mode: 'edit',
  });

  const openTaskModal = (task: Task | null, mode: 'create' | 'edit' | 'view' = 'edit') => {
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
    const proj = projectMap.get(projId);
    if (!proj) return '';
    const client = clientMap.get(proj.clientId);
    const clientName = client ? client.clientName : 'Desconhecido';
    const ipPart = proj.installProjectNo ? ` (${proj.installProjectNo})` : '';
    return `${clientName} - ${proj.title}${ipPart}`;
  };

  // Filter tasks (only include tasks for active projects with deleted === false)
  const activeTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.deleted) return false;
      const proj = projectMap.get(t.projectId);
      if (!proj || proj.deleted) return false;
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

  const matchesStatusGroup = React.useCallback((statusId: string) => {
    if (filterStatusGroup === 'all') return true;
    const scale = getTaskScale(statusId);
    if (filterStatusGroup === 'pending') return scale === 1 || scale === 2;
    if (filterStatusGroup === 'completed') return scale === 3;
    return true;
  }, [filterStatusGroup, getTaskScale]);

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

  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase().trim();
    return activeTasks.filter(t => {
      const proj = projectMap.get(t.projectId);
      const client = proj ? clientMap.get(proj.clientId) : null;
      const clientName = client ? (client.clientName || '').toLowerCase() : '';
      const clientShortName = client ? (client.shortName || '').toLowerCase() : '';
      const projTitle = proj ? (proj.title || '').toLowerCase() : '';
      const taskTitle = (t.title || '').toLowerCase();
      const taskDesc = (t.description || '').toLowerCase();

      const matchesSearch = !q || 
                            taskTitle.includes(q) || 
                            taskDesc.includes(q) ||
                            clientName.includes(q) ||
                            clientShortName.includes(q) ||
                            projTitle.includes(q);
      const matchesProject = filterProject ? t.projectId === filterProject : true;
      const matchesType = filterType ? t.taskTypeId === filterType : true;
      const matchesStatus = matchesStatusGroup(t.statusId);
      const matchesAssignee = filterAssignee ? t.assigneeIds.some(id => matchUserId(id, filterAssignee)) : true;
      return matchesSearch && matchesProject && matchesType && matchesStatus && matchesAssignee;
    });
  }, [activeTasks, search, filterProject, filterType, matchesStatusGroup, filterAssignee, projectMap, clientMap]);

  const sortTasks = (taskList: Task[]) => {
    return [...taskList].sort((a, b) => {
      if (sortBy === 'estimatedDate') {
        const dateA = a.estimatedDate || '';
        const dateB = b.estimatedDate || '';
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
    filteredTasks.forEach(t => {
      if (!tasksByProject[t.projectId]) {
        tasksByProject[t.projectId] = [];
      }
      tasksByProject[t.projectId].push(t);
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
  } else {
    processedTasks = sortTasks(filteredTasks);
  }

  const totalTasks = processedTasks.length;
  const totalPages = Math.ceil(totalTasks / pageSize) || 1;
  const validCurrentPage = Math.min(currentPage, totalPages);
  
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalTasks);
  const paginatedTasks = processedTasks.slice(startIndex, endIndex);

  const getProjectTitle = (projId: string) => {
    const proj = projects.find(p => p.id === projId);
    if (!proj) return 'Projeto';
    const client = clients.find(c => c.id === proj.clientId);
    const clientName = client ? client.clientName : 'Desconhecido';
    return `${clientName} - ${proj.title}`;
  };
  const getStatusName = (id: string) => getTaskStatusName(id, taskStatuses);

  const getUserName = (id: string) => users.find(u => matchUserId(u.id, id))?.name || 'N/A';

  const getUserInitials = (fullName: string) => {
    if (!fullName || fullName === 'N/A') return 'N/A';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) {
      return parts[0][0].toUpperCase();
    }
    const firstInitial = parts[0][0].toUpperCase();
    const lastInitial = parts[parts.length - 1][0].toUpperCase();
    return `${firstInitial}${lastInitial}`;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* View Selection Tabs */}
        <div className="flex border-b border-slate-200 gap-6 mb-2">
          <button
            onClick={() => setActiveTaskViewTab('lista')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTaskViewTab === 'lista'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Lista de Tarefas
          </button>
          <button
            onClick={() => setActiveTaskViewTab('analise')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTaskViewTab === 'analise'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Análise de Tarefas
          </button>
        </div>

          {/* Shared Filters Bar (Only for Lista and Kanban views) */}
          {activeTaskViewTab !== 'analise' && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            {/* Search Input */}
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <input 
                type="text" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              />
            </div>

            {/* Task Status Filter Buttons (Only in Lista view) */}
            {activeTaskViewTab === 'lista' && (
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setFilterStatusGroup('pending')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    filterStatusGroup === 'pending'
                      ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pendente
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatusGroup('completed')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    filterStatusGroup === 'completed'
                      ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Concluídas
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatusGroup('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    filterStatusGroup === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas
                </button>
              </div>
            )}

            {/* Task Type Filter */}
            <select 
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
            >
              <option value="">Todos os Tipos</option>
              {taskTypes.filter(tt => !tt.deleted).map(tt => (
                <option key={tt.id} value={tt.id}>{tt.name}</option>
              ))}
            </select>

            {/* Assignee Filter (Only users with assigned tasks) */}
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
          )}

          {activeTaskViewTab === 'lista' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden animate-fade-in">
            
            <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/60 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Lista de tarefas</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Monitorize o estado de cada tarefa, horas estimadas e horas reais consumidas.</p>
                </div>
                {canWriteTasks && (
                  <button 
                    type="button"
                    onClick={() => openTaskModal(null, 'create')}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" /> Criar Tarefa
                  </button>
                )}
              </div>

              {/* Pagination, Sorting and Grouping controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/60">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Registos por página */}
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

                  {/* Ordenar por */}
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

                  {/* Agrupar por projeto */}
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
                <div className="p-10 text-center text-slate-400 font-medium text-xs">Nenhuma tarefa encontrada.</div>
              ) : (
                <table className="w-full min-w-[750px] text-left border-collapse">
                  <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200/80 whitespace-nowrap select-none">
                    <tr>
                      <th className="px-5 py-3.5 text-left">Tarefa / Projeto</th>
                      <th className="px-5 py-3.5 text-left">Responsáveis</th>
                      <th className="px-5 py-3.5 text-left">Data prevista</th>
                      <th className="px-5 py-3.5 text-left w-[200px] whitespace-nowrap">Estado</th>
                      <th className="px-5 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-slate-100">
                    {paginatedTasks.map(t => (
                      <tr 
                        key={t.id} 
                        onClick={() => openTaskModal(t, canWriteTasks ? 'edit' : 'view')}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-800 text-sm">{t.title}</span>
                            {t.taskTypeId && (
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-bold">
                                {getTaskTypeName(t.taskTypeId, taskTypes)}
                              </span>
                            )}
                          </div>
                          <div className="text-blue-600 font-medium mt-0.5 line-clamp-1">{getProjectTitle(t.projectId)}</div>
                          <div className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic">{t.description}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {t.assigneeIds && t.assigneeIds.length > 0 ? (
                              t.assigneeIds.map(uid => (
                                <span key={uid} className="px-1.5 py-0.5 bg-slate-200 text-slate-700 font-bold rounded-md text-[9px]">
                                  {getUserName(uid)}
                                </span>
                              ))
                            ) : <span className="text-slate-400 italic">Não alocado</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-500 font-medium font-mono">
                          {t.estimatedDate || 'N/A'}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            getTaskScale(t.statusId) === 3 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            getTaskScale(t.statusId) === 2 ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                            getTaskScale(t.statusId) === 4 ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {getStatusName(t.statusId)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyTaskLink(t.id);
                              }}
                              className={`p-1.5 rounded-md ${copiedLinkId === t.id ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'}`}
                              title="Copiar Link"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                            {canWriteTasks && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTaskModal(t, 'edit');
                                }}
                                className="p-1.5 hover:bg-blue-50 hover:text-blue-700 rounded-md text-slate-500"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDeleteTasks && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!canDeleteTasks) {
                                    alert('Não tem permissão para eliminar tarefas.');
                                    return;
                                  }
                                  askConfirmation(
                                    'Confirmar Eliminação de Tarefa',
                                    'Tem a certeza que deseja eliminar esta tarefa do projeto? Esta ação terá um efeito permanente.',
                                    () => deleteTask(t.id)
                                  );
                                }}
                                className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-md text-slate-500"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
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
                  <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                    <span className="text-slate-400">Por página:</span>
                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
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

      {/* Unified Task Modal (FASE 30) */}
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
