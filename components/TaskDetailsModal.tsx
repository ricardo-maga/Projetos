import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Calendar, 
  Users, 
  Plus, 
  Clock, 
  AlertTriangle, 
  Edit2, 
  ChevronDown, 
  ChevronUp, 
  User as UserIcon,
  Layers,
  FolderKanban,
  ExternalLink,
  Target,
  BarChart3
} from 'lucide-react';
import { Task, Project, Client, TaskType, User } from '../lib/types';
import { AssigneeSelector } from './AssigneeSelector';
import { getTaskTypeName, formatToOnlyHours } from '../lib/utils';
import { getAuthHeaders } from '../lib/clientAuth';
import { 
  PlanningAllocationDTO, 
  PlanningAllocationCreateInput, 
  PlanningAllocationUpdateInput, 
  PlanningAllocationFilters 
} from '../lib/planning/types';
import { 
  computePlanningSummary, 
  formatHoursDisplay,
  groupTaskAllocationsByDate,
  groupTaskAllocationsByResource,
  computeTaskPlanningImpact,
  getTaskPlanningLoadStatus,
  TaskPlanningLoadStatus,
  computeProjectPlanningImpact,
  ProjectPlanningSummary,
  computeProjectPlanningVsEstimate,
  ProjectPlanningVsEstimateSummary,
  getTaskPlanningEstimateStatusMeta,
  computeProjectPlanningIndicators,
  ProjectPlanningIndicators,
  TaskPlanningEstimateStatus
} from '../lib/planning/summary';
import PlanningAllocationModal from './PlanningAllocationModal';

interface TaskDetailsModalProps {
  task: Task | null;
  onClose: () => void;
  updateTask?: (id: string, updates: any) => void;
  taskStatuses: any[];
  taskTypes?: TaskType[];
  users: User[];
  userGroups?: any[];
  appConfig?: any;
  projects: Project[];
  clients: Client[];
  // Planning Allocations (FASE 23C)
  planningAllocations?: PlanningAllocationDTO[];
  onCreateAllocation?: (input: PlanningAllocationCreateInput) => Promise<any>;
  onUpdateAllocation?: (id: string, input: PlanningAllocationUpdateInput) => Promise<any>;
  onCancelAllocation?: (id: string, version: number) => Promise<any>;
  onDeleteAllocation?: (id: string) => Promise<any>;
  onFetchAllocations?: (filters?: PlanningAllocationFilters) => Promise<any>;
  createPlanningAllocation?: (input: any) => Promise<any>;
  updatePlanningAllocation?: (id: string, updates: any) => Promise<any>;
  cancelPlanningAllocation?: (id: string, version: number) => Promise<any>;
  deletePlanningAllocation?: (id: string) => Promise<any>;
  // Optional task navigation / list (FASE 23E-C3I)
  tasks?: Task[];
  onSelectTask?: (task: Task) => void;
  onViewTask?: (task: Task) => void;
}

export default function TaskDetailsModal({
  task,
  onClose,
  updateTask,
  taskStatuses = [],
  taskTypes = [],
  users = [],
  userGroups = [],
  appConfig,
  projects = [],
  clients = [],
  planningAllocations = [],
  onCreateAllocation,
  onUpdateAllocation,
  onCancelAllocation,
  onDeleteAllocation,
  createPlanningAllocation,
  updatePlanningAllocation,
  cancelPlanningAllocation,
  deletePlanningAllocation,
  onFetchAllocations,
  tasks = [],
  onSelectTask,
  onViewTask,
}: TaskDetailsModalProps) {
  const effectiveCreate = onCreateAllocation || createPlanningAllocation;
  const effectiveUpdate = onUpdateAllocation || updatePlanningAllocation;
  const effectiveCancel = onCancelAllocation || cancelPlanningAllocation;
  const effectiveDelete = onDeleteAllocation || deletePlanningAllocation;

  // Active task state allowing seamless switching via "Ver tarefa" (Requirement 10)
  const [activeTask, setActiveTask] = useState<Task | null>(task);
  useEffect(() => {
    setActiveTask(task);
  }, [task]);

  const [taskEditStatus, setTaskEditStatus] = useState('');
  const [taskEditTypeId, setTaskEditTypeId] = useState('');
  const [taskEditActualHours, setTaskEditActualHours] = useState('');
  const [taskEditNotes, setTaskEditNotes] = useState('');
  const [taskEditStartDate, setTaskEditStartDate] = useState('');
  const [taskEditStartTime, setTaskEditStartTime] = useState('');
  const [taskEditEndDate, setTaskEditEndDate] = useState('');
  const [taskEditEndTime, setTaskEditEndTime] = useState('');
  const [taskEditAssignees, setTaskEditAssignees] = useState<string[]>([]);

  // Planning State (FASE 23C)
  const [internalAllocations, setInternalAllocations] = useState<PlanningAllocationDTO[]>([]);
  const [isPlanningModalOpen, setIsPlanningModalOpen] = useState<boolean>(false);
  const [selectedAllocationForEdit, setSelectedAllocationForEdit] = useState<PlanningAllocationDTO | null>(null);
  const [showCancelledHistory, setShowCancelledHistory] = useState<boolean>(false);
  const [showProjectPlanning, setShowProjectPlanning] = useState<boolean>(true);
  const [showProjectEstimateControl, setShowProjectEstimateControl] = useState<boolean>(true);
  const [showProjectIndicators, setShowProjectIndicators] = useState<boolean>(true);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<TaskPlanningEstimateStatus | 'ALL'>('ALL');
  const [expandedProjectDays, setExpandedProjectDays] = useState<Record<string, boolean>>({});

  // Fetch allocations for this task directly or via prop
  const fetchTaskAllocations = useCallback(async () => {
    if (!activeTask?.id) return;
    try {
      if (onFetchAllocations) {
        const res = await onFetchAllocations({ taskId: activeTask.id });
        if (res?.data) {
          setInternalAllocations(res.data);
          return;
        }
      }
      const res = await fetch(`/api/v1/planning-allocations?taskId=${activeTask.id}&pageSize=100`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && Array.isArray(json.data)) {
        setInternalAllocations(json.data);
      }
    } catch (err) {
      console.warn('Erro ao carregar allocations da tarefa:', err);
    }
  }, [activeTask?.id, onFetchAllocations]);

  useEffect(() => {
    if (activeTask?.id) {
      fetchTaskAllocations();
    }
  }, [activeTask?.id, fetchTaskAllocations]);

  // Canonical task planning allocations source (FASE 23E-C3M-E)
  const taskPlanningAllocations = React.useMemo(() => {
    if (!activeTask) return [];

    const map = new Map<string, PlanningAllocationDTO>();

    // 1. Add allocations for this task passed via planningAllocations prop
    if (Array.isArray(planningAllocations)) {
      for (const alloc of planningAllocations) {
        if (alloc && alloc.taskId === activeTask.id) {
          map.set(alloc.id, alloc);
        }
      }
    }

    // 2. Overwrite/supplement with internalAllocations (fetched specifically for this task)
    if (Array.isArray(internalAllocations)) {
      for (const alloc of internalAllocations) {
        if (alloc && alloc.taskId === activeTask.id) {
          map.set(alloc.id, alloc);
        }
      }
    }

    // Sort deterministically by date ascending, then startTime
    return Array.from(map.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });
  }, [activeTask, planningAllocations, internalAllocations]);

  const activeAllocations = React.useMemo(() => {
    return taskPlanningAllocations.filter(a => a.status !== 'CANCELLED');
  }, [taskPlanningAllocations]);

  const cancelledAllocations = React.useMemo(() => {
    return taskPlanningAllocations.filter(a => a.status === 'CANCELLED');
  }, [taskPlanningAllocations]);

  // Authoritative Planning Summary
  const planningSummary = React.useMemo(() => {
    return computePlanningSummary(activeTask?.estimatedHours, taskPlanningAllocations);
  }, [activeTask?.estimatedHours, taskPlanningAllocations]);

  // Operational planning load status (FASE 23E-C3M-D)
  const taskLoadStatus = React.useMemo(() => {
    return getTaskPlanningLoadStatus(planningSummary);
  }, [planningSummary]);

  // Group active allocations by day (FASE 23E-C3M-B)
  const dailyPlanningGroups = React.useMemo(() => {
    return groupTaskAllocationsByDate(activeAllocations);
  }, [activeAllocations]);

  // Consolidated resources involved in task (FASE 23E-C3M-D)
  const involvedResources = React.useMemo(() => {
    return groupTaskAllocationsByResource(
      activeAllocations, 
      users, 
      activeTask?.assigneeIds || []
    );
  }, [activeAllocations, users, activeTask?.assigneeIds]);

  // Task Daily Planning Impact (FASE 23E-C3F)
  const planningImpact = React.useMemo(() => {
    return computeTaskPlanningImpact(
      activeAllocations,
      activeTask?.estimatedHours,
      users,
      activeTask?.assigneeIds || []
    );
  }, [activeAllocations, activeTask?.estimatedHours, users, activeTask?.assigneeIds]);

  // All available allocations combined for Project Planning Impact (FASE 23E-C3I)
  const allAvailableAllocations = React.useMemo(() => {
    const map = new Map<string, PlanningAllocationDTO>();
    if (Array.isArray(planningAllocations)) {
      for (const a of planningAllocations) {
        if (a?.id) map.set(a.id, a);
      }
    }
    if (Array.isArray(internalAllocations)) {
      for (const a of internalAllocations) {
        if (a?.id) map.set(a.id, a);
      }
    }
    return Array.from(map.values());
  }, [planningAllocations, internalAllocations]);

  // Consolidated Project Planning Impact (FASE 23E-C3I)
  const projectPlanningImpact = React.useMemo<ProjectPlanningSummary | null>(() => {
    if (!activeTask?.projectId) return null;
    return computeProjectPlanningImpact(
      activeTask.projectId,
      allAvailableAllocations,
      tasks,
      users,
      projects
    );
  }, [activeTask?.projectId, allAvailableAllocations, tasks, users, projects]);

  // Consolidated Project Planning vs Estimate (FASE 23E-C3J)
  const projectPlanningVsEstimate = React.useMemo<ProjectPlanningVsEstimateSummary | null>(() => {
    if (!activeTask?.projectId) return null;
    return computeProjectPlanningVsEstimate(
      activeTask.projectId,
      allAvailableAllocations,
      tasks,
      projects
    );
  }, [activeTask?.projectId, allAvailableAllocations, tasks, projects]);

  // Consolidated Project Planning Indicators (FASE 23E-C3K)
  const projectPlanningIndicators = React.useMemo<ProjectPlanningIndicators | null>(() => {
    if (!projectPlanningVsEstimate) return null;
    return computeProjectPlanningIndicators(projectPlanningVsEstimate);
  }, [projectPlanningVsEstimate]);

  // Filtered Tasks for C3J list based on C3K status filter
  const filteredProjectVsEstimateTasks = React.useMemo(() => {
    if (!projectPlanningVsEstimate) return [];
    if (selectedStatusFilter === 'ALL') return projectPlanningVsEstimate.tasks;
    return projectPlanningVsEstimate.tasks.filter(t => t.status === selectedStatusFilter);
  }, [projectPlanningVsEstimate, selectedStatusFilter]);

  const toggleProjectDayExpanded = (dateStr: string) => {
    setExpandedProjectDays(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  const handleNavigateToTask = (targetTaskId: string) => {
    const targetTaskObj = tasks.find(t => t.id === targetTaskId) || null;
    if (targetTaskObj) {
      if (onSelectTask) onSelectTask(targetTaskObj);
      if (onViewTask) onViewTask(targetTaskObj);
      setActiveTask(targetTaskObj);
    }
  };

  useEffect(() => {
    if (activeTask) {
      setTaskEditStatus(activeTask.statusId || '');
      setTaskEditTypeId(activeTask.taskTypeId || '');
      setTaskEditActualHours(formatToOnlyHours(activeTask.actualHours));
      setTaskEditNotes(activeTask.notes || '');
      setTaskEditStartDate(activeTask.startDate || '');
      setTaskEditStartTime(activeTask.startTime || '');
      setTaskEditEndDate(activeTask.endDate || '');
      setTaskEditEndTime(activeTask.endTime || '');
      setTaskEditAssignees(activeTask.assigneeIds || []);
    }
  }, [activeTask]);

  if (!activeTask) return null;

  const taskProj = projects.find(p => p.id === activeTask.projectId);
  const clientObj = taskProj ? clients.find(c => c.id === taskProj.clientId) : null;
  const taskClientName = clientObj ? (clientObj.clientName || clientObj.shortName || 'N/A') : 'N/A';
  const taskProjTitle = taskProj ? taskProj.title : 'N/A';

  const getUserName = (userId: string) => {
    const u = users.find(usr => usr.id === userId);
    return u ? u.name : userId;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (updateTask && activeTask) {
      updateTask(activeTask.id, {
        statusId: taskEditStatus,
        taskTypeId: taskEditTypeId || '',
        actualHours: formatToOnlyHours(taskEditActualHours),
        notes: taskEditNotes,
        startDate: taskEditStartDate,
        startTime: taskEditStartTime,
        endDate: taskEditEndDate,
        endTime: taskEditEndTime,
        assigneeIds: taskEditAssignees,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all duration-300">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <span className="text-[10px] uppercase font-extrabold text-blue-600 tracking-wider block">
              Visualização Individual de Tarefa
            </span>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              Cliente: <strong className="text-slate-800 font-bold">{taskClientName}</strong> | Projeto: <strong className="text-slate-800 font-bold">{taskProjTitle}</strong>
            </div>
            <h3 className="font-extrabold text-slate-900 text-base leading-snug mt-0.5">
              {task.title}
            </h3>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Read-only Task Info */}
        <div className="px-5 py-4 bg-blue-50/40 border-b border-blue-50 text-xs text-slate-600 space-y-2 shrink-0">
          {task.description && (
            <p className="font-medium text-slate-700 italic bg-white p-2.5 rounded-xl border border-slate-100">
              &quot;{task.description}&quot;
            </p>
          )}
          <div className="flex flex-wrap gap-4 text-[11px] font-semibold text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              Atribuído: <span className="text-slate-700 font-bold">
                {task.assigneeIds && task.assigneeIds.length > 0
                  ? task.assigneeIds.map(id => getUserName(id)).join(', ')
                  : 'Ninguém'}
              </span>
            </span>
            {task.estimatedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Data Prevista: <span className="text-slate-700 font-bold">{new Date(task.estimatedDate + 'T00:00:00').toLocaleDateString('pt-PT')}</span>
              </span>
            )}
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Task Status Dropdown */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Estado da Tarefa</label>
            <select 
              value={taskEditStatus}
              onChange={e => setTaskEditStatus(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-xs font-semibold text-slate-800"
            >
              {taskStatuses.filter(s => !s.deleted).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Task Type */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Tipo de Tarefa</label>
            <div className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 select-none">
              {getTaskTypeName(taskEditTypeId || task.taskTypeId, taskTypes) || 'Não definido'}
            </div>
          </div>

          {/* Consumed Hours */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Horas Consumidas Efetivas (Horas)</label>
            <input 
              type="number" 
              min="0"
              step="1"
              required
              value={taskEditActualHours}
              onChange={e => setTaskEditActualHours(e.target.value)}
              placeholder="Ex: 8"
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
            />
            <p className="text-[10px] text-slate-400 font-medium">Indique o número de horas efetivamente gastas nesta tarefa.</p>
          </div>

          {/* Date & Time grids */}
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Planeamento de Execução Efetiva</span>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">Data de Início Efetiva</label>
                <input 
                  type="date" 
                  value={taskEditStartDate}
                  onChange={e => setTaskEditStartDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">Hora de Início Efetiva</label>
                <input 
                  type="time" 
                  value={taskEditStartTime}
                  onChange={e => setTaskEditStartTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">Data de Fim Efetiva</label>
                <input 
                  type="date" 
                  value={taskEditEndDate}
                  onChange={e => setTaskEditEndDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">Hora de Fim Efetiva</label>
                <input 
                  type="time" 
                  value={taskEditEndTime}
                  onChange={e => setTaskEditEndTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Alocação de Técnicos */}
          <div className="border-t border-slate-100 pt-3">
            <AssigneeSelector
              users={users}
              userGroups={userGroups}
              allowedGroupIds={appConfig?.taskAssigneeGroupIds}
              selectedIds={taskEditAssignees}
              onChange={setTaskEditAssignees}
              filterTeamOnly
            />
          </div>

          {/* Execution Notes */}
          <div className="space-y-1 border-t border-slate-100 pt-3">
            <label className="block text-xs font-bold text-slate-700">Notas de Execução / Observações</label>
            <textarea 
              rows={3}
              value={taskEditNotes}
              onChange={e => setTaskEditNotes(e.target.value)}
              placeholder="Descreva detalhes da intervenção técnica realizada..."
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
            />
          </div>

          {/* Planeamento Diário e Carga da Tarefa (FASE 23E-C3M-D) */}
          <div className="border-t border-slate-200 pt-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    Carga Planeada
                  </span>
                  {/* Operational Status of the Task Planning */}
                  {taskLoadStatus === 'EXCESSO' && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 border border-rose-200">
                      EXCESSO
                    </span>
                  )}
                  {taskLoadStatus === 'PLANEAMENTO_PENDENTE' && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                      PLANEAMENTO PENDENTE
                    </span>
                  )}
                  {taskLoadStatus === 'PLANEAMENTO_COMPLETO' && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                      PLANEAMENTO COMPLETO
                    </span>
                  )}
                  {taskLoadStatus === 'SEM_PLANEAMENTO' && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                      SEM PLANEAMENTO
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Distribuição diária de trabalho por recurso e consumo da estimativa
                </p>
              </div>
              <button
                type="button"
                id="add-planning-allocation-btn"
                onClick={() => {
                  setSelectedAllocationForEdit(null);
                  setIsPlanningModalOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar planeamento
              </button>
            </div>

            {/* Resumo de Carga da Tarefa (6 Métricas / Cards) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {/* 1. Estimativa */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[9px] uppercase font-extrabold text-slate-500 tracking-wider">Estimativa</div>
                <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                  {formatHoursDisplay(planningSummary.estimatedHours)}
                </div>
                <div className="text-[9px] text-slate-400 font-medium mt-0.5">Previsto</div>
              </div>

              {/* 2. CONFIRMED */}
              <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg">
                <div className="text-[9px] uppercase font-extrabold text-blue-800 tracking-wider">Confirmado</div>
                <div className="text-sm font-extrabold text-blue-900 mt-0.5">
                  {formatHoursDisplay(planningSummary.confirmedHours)}
                </div>
                <div className="text-[9px] text-blue-600 font-medium mt-0.5">CONFIRMED</div>
              </div>

              {/* 3. DRAFT */}
              <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg">
                <div className="text-[9px] uppercase font-extrabold text-amber-800 tracking-wider">Rascunho</div>
                <div className="text-sm font-extrabold text-amber-900 mt-0.5">
                  {formatHoursDisplay(planningSummary.draftHours)}
                </div>
                <div className="text-[9px] text-amber-700 font-medium mt-0.5">DRAFT</div>
              </div>

              {/* 4. Total Planeado */}
              <div className="p-2.5 bg-indigo-50/60 border border-indigo-200 rounded-lg">
                <div className="text-[9px] uppercase font-extrabold text-indigo-800 tracking-wider">Total Planeado</div>
                <div className="text-sm font-extrabold text-indigo-950 mt-0.5">
                  {formatHoursDisplay(planningSummary.plannedHours)}
                </div>
                <div className="text-[9px] text-indigo-600 font-medium mt-0.5">Conf + Rasc</div>
              </div>

              {/* 5. Falta Planear */}
              <div className={`p-2.5 border rounded-lg ${
                planningSummary.remainingHours === 0 && planningSummary.estimatedHours > 0
                  ? 'bg-emerald-50/70 border-emerald-300'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`text-[9px] uppercase font-extrabold tracking-wider ${
                  planningSummary.remainingHours === 0 && planningSummary.estimatedHours > 0
                    ? 'text-emerald-800'
                    : 'text-slate-500'
                }`}>
                  Falta Planear
                </div>
                <div className={`text-sm font-extrabold mt-0.5 ${
                  planningSummary.remainingHours === 0 && planningSummary.estimatedHours > 0
                    ? 'text-emerald-900'
                    : 'text-slate-800'
                }`}>
                  {formatHoursDisplay(planningSummary.remainingHours)}
                </div>
                <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                  {planningSummary.remainingHours === 0 && planningSummary.estimatedHours > 0 ? 'Concluído' : 'Restante'}
                </div>
              </div>

              {/* 6. Excesso */}
              <div className={`p-2.5 border rounded-lg ${
                planningSummary.isOverAllocated
                  ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-300/60'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`text-[9px] uppercase font-extrabold tracking-wider ${
                  planningSummary.isOverAllocated ? 'text-rose-800' : 'text-slate-400'
                }`}>
                  Excesso
                </div>
                <div className={`text-sm font-extrabold mt-0.5 ${
                  planningSummary.isOverAllocated ? 'text-rose-900' : 'text-slate-500'
                }`}>
                  {planningSummary.isOverAllocated ? `+${formatHoursDisplay(planningSummary.excessHours)}` : '0h'}
                </div>
                <div className={`text-[9px] font-medium mt-0.5 ${
                  planningSummary.isOverAllocated ? 'text-rose-700 font-semibold' : 'text-slate-400'
                }`}>
                  {planningSummary.isOverAllocated ? 'Acima estimativa' : 'Sem excesso'}
                </div>
              </div>
            </div>

            {/* Visual Warning Banner if Planeado > Estimado */}
            {planningSummary.isOverAllocated && (
              <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg flex items-center gap-2 text-xs text-rose-950">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>Aviso de Planeamento:</strong> O tempo total planeado ({formatHoursDisplay(planningSummary.plannedHours)}) excede a estimativa da tarefa ({formatHoursDisplay(planningSummary.estimatedHours)}) em <strong>+{formatHoursDisplay(planningSummary.excessHours)}</strong>.
                </span>
              </div>
            )}

            {/* Impacto da Tarefa no Planeamento Diário (FASE 23E-C3F) */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>Impacto no Planeamento</span>
                </div>
                {activeAllocations.length > 0 && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    {activeAllocations.length} {activeAllocations.length === 1 ? 'alocação ativa' : 'alocações ativas'}
                  </span>
                )}
              </div>

              {/* Top Overview & Comparison (FASE 23E-C3F Section 7) */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 font-medium text-slate-700">
                    <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Dias planeados: <strong className="font-extrabold text-slate-900">{planningImpact.totalPlannedDays}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 font-medium text-slate-700">
                    <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Recursos envolvidos: <strong className="font-extrabold text-slate-900">{planningImpact.totalInvolvedResources}</strong></span>
                  </div>
                </div>
                {planningImpact.totalPlannedDays > 0 && planningImpact.firstDateLabel && (
                  <div className="text-[11px] text-slate-500 font-medium">
                    Período: <strong className="text-slate-800 font-bold">{planningImpact.firstDateLabel}</strong>
                    {planningImpact.firstDate !== planningImpact.lastDate && planningImpact.lastDateLabel && (
                      <> → <strong className="text-slate-800 font-bold">{planningImpact.lastDateLabel}</strong></>
                    )}
                  </div>
                )}
              </div>

              {planningImpact.dailyGroups.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700">Nenhum planeamento diário registado</div>
                  <p className="text-[11px] text-slate-500">
                    Clique em <strong>&quot;Adicionar planeamento&quot;</strong> para alocar trabalho a técnicos em dias específicos.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {planningImpact.dailyGroups.map(dayGroup => (
                    <div 
                      key={dayGroup.date}
                      className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2.5"
                    >
                      {/* Day Group Header & Totals */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-200/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 capitalize text-sm">
                            {dayGroup.dateLabel}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            ({dayGroup.date})
                          </span>
                        </div>

                        {/* Day Summary Line (FASE 23E-C3F Section 2) */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-blue-800 font-bold text-[11px]">
                            CONFIRMADO {formatHoursDisplay(dayGroup.confirmedHours)}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-amber-800 font-bold text-[11px]">
                            DRAFT {formatHoursDisplay(dayGroup.draftHours)}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-extrabold text-slate-900 text-[11px] bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                            PLANEADO {formatHoursDisplay(dayGroup.plannedHours)}
                          </span>
                        </div>
                      </div>

                      {/* Visual Progress Bar of task's hours on this day (FASE 23E-C3F Section 6) */}
                      {planningSummary.estimatedHours > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                            <span>Horas da tarefa neste dia</span>
                            <span className="font-semibold text-slate-700">
                              {formatHoursDisplay(dayGroup.plannedHours)} / {formatHoursDisplay(planningSummary.estimatedHours)} ({dayGroup.percentageOfEstimate}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-600 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, (dayGroup.plannedHours / planningSummary.estimatedHours) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Resources involved on this Day (FASE 23E-C3F Section 4) */}
                      <div className="space-y-2 pl-1">
                        {dayGroup.resources.map(res => (
                          <div 
                            key={res.resourceId}
                            className="bg-white rounded-lg border border-slate-200/90 p-2.5 space-y-2 shadow-2xs"
                          >
                            {/* Resource Header within Day */}
                            <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100">
                              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{res.resourceName}</span>
                                {res.isAssignee && (
                                  <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1 py-0.2 rounded" title="Responsável atribuído à tarefa">
                                    Responsável
                                  </span>
                                )}
                              </div>

                              {/* Resource Day Totals */}
                              <div className="flex items-center gap-1.5 text-[11px]">
                                {res.confirmedHours > 0 && (
                                  <span className="text-blue-700 font-semibold">
                                    {formatHoursDisplay(res.confirmedHours)} CONFIRMADO
                                  </span>
                                )}
                                {res.confirmedHours > 0 && res.draftHours > 0 && (
                                  <span className="text-slate-300">·</span>
                                )}
                                {res.draftHours > 0 && (
                                  <span className="text-amber-700 font-semibold">
                                    {formatHoursDisplay(res.draftHours)} DRAFT
                                  </span>
                                )}
                                <span className="text-slate-300">·</span>
                                <span className="font-extrabold text-slate-800 bg-slate-100 px-1.5 py-0.2 rounded">
                                  {formatHoursDisplay(res.plannedHours)} PLANEADO
                                </span>
                              </div>
                            </div>

                            {/* Resource Allocation Items on this Day */}
                            <div className="space-y-1">
                              {res.allocations.map(alloc => {
                                const isConfirmed = alloc.status === 'CONFIRMED';
                                const durationHours = (alloc.durationMinutes || 0) / 60;

                                return (
                                  <div
                                    key={alloc.id}
                                    className={`p-1.5 rounded-md flex items-center justify-between text-xs transition-colors ${
                                      isConfirmed
                                        ? 'bg-blue-50/40 border border-blue-100'
                                        : 'bg-amber-50/30 border border-dashed border-amber-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wider ${
                                        isConfirmed
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-amber-200 text-amber-950 border border-amber-300'
                                      }`}>
                                        {isConfirmed ? 'Confirmado' : 'Rascunho'}
                                      </span>

                                      <div className="text-[11px] text-slate-600 flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        <span>{alloc.startTime.substring(0, 5)} - {alloc.endTime.substring(0, 5)}</span>
                                        <span className="font-bold text-slate-800 ml-0.5">
                                          ({formatHoursDisplay(durationHours)})
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedAllocationForEdit(alloc);
                                          setIsPlanningModalOpen(true);
                                        }}
                                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                        title="Editar Alocação"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resumo Global de Recursos Envolvidos (FASE 23E-C3M-D) */}
            {involvedResources.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Recursos Envolvidos ({involvedResources.length})</span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Totais da Tarefa
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {involvedResources.map(res => (
                    <div 
                      key={res.resourceId}
                      className="p-2.5 bg-slate-50/90 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
                          <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{res.resourceName}</span>
                          {res.isAssignee && (
                            <span className="text-[9px] font-semibold text-slate-500 bg-white border border-slate-200 px-1 py-0.2 rounded shrink-0" title="Responsável pela tarefa">
                              Responsável
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="text-blue-700 font-semibold">{formatHoursDisplay(res.confirmedHours)} confirmado</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-amber-700 font-semibold">{formatHoursDisplay(res.draftHours)} draft</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                          {formatHoursDisplay(res.plannedHours)}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5">planeado</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cancelled Allocations Accordion / Toggle */}
            {cancelledAllocations.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowCancelledHistory(!showCancelledHistory)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                >
                  {showCancelledHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{showCancelledHistory ? 'Ocultar' : 'Mostrar'} histórico de cancelados ({cancelledAllocations.length})</span>
                </button>

                {showCancelledHistory && (
                  <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-slate-200">
                    {cancelledAllocations.map(alloc => (
                      <div
                        key={alloc.id}
                        className="p-2 rounded-lg bg-slate-100/70 border border-slate-200 flex items-center justify-between text-xs text-slate-500 opacity-75"
                      >
                        <div className="flex items-center gap-2">
                          <span className="line-through text-slate-600">
                            {new Date(alloc.date + 'T00:00:00').toLocaleDateString('pt-PT')} ({alloc.startTime.substring(0, 5)} - {alloc.endTime.substring(0, 5)})
                          </span>
                          <span className="text-[10px] uppercase font-bold text-slate-500 px-1.5 py-0.5 bg-slate-200 rounded">
                            Cancelado
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {getUserName(alloc.resourceId)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAllocationForEdit(alloc);
                            setIsPlanningModalOpen(true);
                          }}
                          className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                        >
                          Ver Detalhe
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SECÇÃO: PLANEAMENTO DO PROJETO (FASE 23E-C3I) */}
            {projectPlanningImpact && (
              <div className="pt-4 border-t-2 border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100">
                      <FolderKanban className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>Planeamento do Projeto</span>
                        <span className="text-slate-400 font-normal">({taskProjTitle})</span>
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                      projectPlanningImpact.status === 'CONFIRMADO'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : projectPlanningImpact.status === 'PARCIALMENTE_CONFIRMADO'
                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        : projectPlanningImpact.status === 'DRAFT'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {projectPlanningImpact.statusLabel}
                    </span>

                    <button
                      type="button"
                      onClick={() => setShowProjectPlanning(!showProjectPlanning)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer transition-colors"
                      aria-expanded={showProjectPlanning}
                      aria-label={showProjectPlanning ? 'Recolher secção de planeamento do projeto' : 'Expandir secção de planeamento do projeto'}
                    >
                      {showProjectPlanning ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {showProjectPlanning && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* Resumo Global do Projeto (FASE 23E-C3I Requirement 3 & 9) */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          <span className="font-bold text-slate-800">{projectPlanningImpact.daysCount} dias planeados</span>
                          <span className="text-slate-300">•</span>
                          <span>{projectPlanningImpact.resourcesCount} {projectPlanningImpact.resourcesCount === 1 ? 'recurso' : 'recursos'}</span>
                          <span className="text-slate-300">•</span>
                          <span>{projectPlanningImpact.tasksCount} {projectPlanningImpact.tasksCount === 1 ? 'tarefa' : 'tarefas'}</span>
                          <span className="text-slate-300">•</span>
                          <span>{projectPlanningImpact.allocationsCount} {projectPlanningImpact.allocationsCount === 1 ? 'alocação' : 'alocações'}</span>
                        </div>

                        {projectPlanningImpact.periodLabel && (
                          <div className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                            Período: {projectPlanningImpact.periodLabel}
                          </div>
                        )}
                      </div>

                      {/* Totais de Horas do Projeto */}
                      <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-slate-200/60">
                        <span className="text-blue-800 font-bold text-[11px]">
                          CONFIRMADO {formatHoursDisplay(projectPlanningImpact.totalConfirmedHours)}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-amber-800 font-bold text-[11px]">
                          DRAFT {formatHoursDisplay(projectPlanningImpact.totalDraftHours)}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="font-extrabold text-slate-900 text-[11px] bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                          PLANEADO {formatHoursDisplay(projectPlanningImpact.totalPlannedHours)}
                        </span>
                      </div>

                      {!projectPlanningImpact.isConsistent && (
                        <div className="text-[11px] text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Aviso: Discrepância na consolidação matemática do projeto.</span>
                        </div>
                      )}
                    </div>

                    {/* Distribuição Diária do Projeto (Dia -> Recurso -> Tarefa) */}
                    {projectPlanningImpact.days.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                        Nenhuma carga planeada para este projeto.
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                        {projectPlanningImpact.days.map(day => {
                          const isExpanded = expandedProjectDays[day.date] !== false; // default expanded

                          return (
                            <div 
                              key={day.date}
                              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
                            >
                              {/* Day Header */}
                              <div 
                                className="p-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-100/60 transition-colors"
                                onClick={() => toggleProjectDayExpanded(day.date)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleProjectDayExpanded(day.date); }}
                                aria-expanded={isExpanded}
                                aria-label={`Expandir ou recolher planeamento do dia ${day.dateLabel}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 text-xs capitalize">
                                    {day.dateLabel}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    ({day.date})
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                                    {day.resourceCount} {day.resourceCount === 1 ? 'recurso' : 'recursos'} • {day.taskCount} {day.taskCount === 1 ? 'tarefa' : 'tarefas'}
                                  </span>
                                  <span className="font-bold text-slate-900 text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                                    {formatHoursDisplay(day.plannedHours)}
                                  </span>
                                  <button
                                    type="button"
                                    className="p-0.5 text-slate-400 hover:text-slate-600 rounded"
                                    onClick={e => {
                                      e.stopPropagation();
                                      toggleProjectDayExpanded(day.date);
                                    }}
                                  >
                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>

                              {/* Resources within Day */}
                              {isExpanded && (
                                <div className="p-2.5 space-y-2.5 bg-white">
                                  {day.resources.map(res => (
                                    <div 
                                      key={res.resourceId}
                                      className="p-2 bg-slate-50/60 border border-slate-200/80 rounded-lg space-y-1.5 text-xs"
                                    >
                                      {/* Resource Header */}
                                      <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                          <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                                          <span>{res.resourceName}</span>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-[11px]">
                                          {res.confirmedHours > 0 && (
                                            <span className="text-blue-700 font-bold">
                                              {formatHoursDisplay(res.confirmedHours)} CONF
                                            </span>
                                          )}
                                          {res.confirmedHours > 0 && res.draftHours > 0 && (
                                            <span className="text-slate-300">·</span>
                                          )}
                                          {res.draftHours > 0 && (
                                            <span className="text-amber-700 font-bold">
                                              {formatHoursDisplay(res.draftHours)} DRAFT
                                            </span>
                                          )}
                                          <span className="text-slate-300">·</span>
                                          <span className="font-extrabold text-slate-800 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                                            {formatHoursDisplay(res.plannedHours)}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Tasks List within Resource */}
                                      <div className="space-y-1 pl-1">
                                        {res.tasks.map(t => {
                                          const isCurrentTask = t.taskId === activeTask.id;

                                          return (
                                            <div 
                                              key={t.taskId}
                                              className={`p-1.5 rounded-md border flex items-center justify-between gap-2 text-xs transition-colors ${
                                                isCurrentTask
                                                  ? 'bg-blue-50/50 border-blue-200'
                                                  : 'bg-white border-slate-200'
                                              }`}
                                            >
                                              <div className="min-w-0 space-y-0.5">
                                                <div className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                                                  <span className="truncate">{t.taskTitle}</span>
                                                  {isCurrentTask && (
                                                    <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1 py-0.2 rounded shrink-0">
                                                      Esta tarefa
                                                    </span>
                                                  )}
                                                </div>

                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 flex-wrap">
                                                  <span className="font-bold text-slate-700">
                                                    {formatHoursDisplay(t.plannedHours)} planeado
                                                  </span>
                                                  <span className="text-slate-300">•</span>
                                                  <span className="text-blue-700 font-medium">
                                                    {formatHoursDisplay(t.confirmedHours)} CONF
                                                  </span>
                                                  {t.draftHours > 0 && (
                                                    <>
                                                      <span className="text-slate-300">•</span>
                                                      <span className="text-amber-700 font-medium">
                                                        {formatHoursDisplay(t.draftHours)} DRAFT
                                                      </span>
                                                    </>
                                                  )}
                                                  <span className="text-slate-300">•</span>
                                                  <span>{t.allocationCount} {t.allocationCount === 1 ? 'alocação' : 'alocações'}</span>

                                                  {t.estimatedHours !== undefined && t.estimatedHours > 0 && (
                                                    <>
                                                      <span className="text-slate-300">|</span>
                                                      <span className="text-slate-600">
                                                        Estimativa: {formatHoursDisplay(t.estimatedHours)}
                                                      </span>
                                                      {t.remainingHours !== undefined && t.remainingHours > 0 && (
                                                        <span className="text-slate-500">
                                                          (Falta: {formatHoursDisplay(t.remainingHours)})
                                                        </span>
                                                      )}
                                                    </>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Action: Ver Tarefa (Requirement 10) */}
                                              {!isCurrentTask && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleNavigateToTask(t.taskId)}
                                                  className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                                                  aria-label={`Ver detalhes da tarefa ${t.taskTitle}`}
                                                  title="Ver detalhes da tarefa"
                                                >
                                                  <ExternalLink className="w-3 h-3" />
                                                  <span>Ver tarefa</span>
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECÇÃO: PLANEAMENTO VS ESTIMATIVA (FASE 23E-C3J) */}
            {projectPlanningVsEstimate && (
              <div className="pt-4 border-t-2 border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                      <Target className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>Planeamento vs Estimativa</span>
                        <span className="text-slate-400 font-normal">({taskProjTitle})</span>
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {projectPlanningVsEstimate.plannedPercentage !== null ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-blue-100 text-blue-800 border border-blue-200">
                        Planeado: {Math.round(projectPlanningVsEstimate.plannedPercentage)}%
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200">
                        Estimativa: N/A
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowProjectEstimateControl(!showProjectEstimateControl)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer transition-colors"
                      aria-expanded={showProjectEstimateControl}
                      aria-label={showProjectEstimateControl ? 'Recolher secção planeamento vs estimativa' : 'Expandir secção planeamento vs estimativa'}
                    >
                      {showProjectEstimateControl ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {showProjectEstimateControl && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {!projectPlanningVsEstimate.hasTasks ? (
                      <div className="p-3 text-center text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                        Sem tarefas para analisar.
                      </div>
                    ) : (
                      <>
                        {/* Resumo Global do Projeto vs Estimativa */}
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                            <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                              <span className="text-[10px] text-slate-400 font-semibold block uppercase">Estimativa</span>
                              <span className="font-bold text-slate-800 text-xs">
                                {projectPlanningVsEstimate.totalEstimatedHours !== null 
                                  ? formatHoursDisplay(projectPlanningVsEstimate.totalEstimatedHours) 
                                  : 'N/A'}
                              </span>
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                              <span className="text-[10px] text-blue-600 font-semibold block uppercase">Confirmado</span>
                              <span className="font-bold text-blue-800 text-xs">
                                {formatHoursDisplay(projectPlanningVsEstimate.totalConfirmedHours)}
                              </span>
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                              <span className="text-[10px] text-amber-600 font-semibold block uppercase">DRAFT</span>
                              <span className="font-bold text-amber-800 text-xs">
                                {formatHoursDisplay(projectPlanningVsEstimate.totalDraftHours)}
                              </span>
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                              <span className="text-[10px] text-slate-700 font-bold block uppercase">Planeado</span>
                              <span className="font-extrabold text-slate-900 text-xs">
                                {formatHoursDisplay(projectPlanningVsEstimate.totalPlannedHours)}
                              </span>
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Falta planear</span>
                              <span className={`font-bold text-xs ${
                                projectPlanningVsEstimate.totalRemainingHours !== null && projectPlanningVsEstimate.totalRemainingHours > 0
                                  ? 'text-amber-700'
                                  : 'text-slate-600'
                              }`}>
                                {projectPlanningVsEstimate.totalRemainingHours !== null 
                                  ? formatHoursDisplay(projectPlanningVsEstimate.totalRemainingHours) 
                                  : 'N/A'}
                              </span>
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                              <span className="text-[10px] text-rose-600 font-semibold block uppercase">Excesso</span>
                              <span className={`font-bold text-xs ${
                                projectPlanningVsEstimate.totalExcessHours !== null && projectPlanningVsEstimate.totalExcessHours > 0
                                  ? 'text-rose-700 font-extrabold'
                                  : 'text-slate-600'
                              }`}>
                                {projectPlanningVsEstimate.totalExcessHours !== null 
                                  ? formatHoursDisplay(projectPlanningVsEstimate.totalExcessHours) 
                                  : '0h'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                            <span>
                              Percentagem Planeada: {projectPlanningVsEstimate.plannedPercentage !== null ? `${Math.round(projectPlanningVsEstimate.plannedPercentage)}%` : 'N/A'}
                            </span>
                            {!projectPlanningVsEstimate.isConsistent && (
                              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1 text-[10px]">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Aviso de consistência</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Indicadores do Planeamento (FASE 23E-C3K) */}
                        {projectPlanningIndicators && (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                              <div className="flex items-center gap-1.5">
                                <BarChart3 className="w-3.5 h-3.5 text-slate-700" />
                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                  Indicadores do Planeamento
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {!projectPlanningIndicators.isConsistent && (
                                  <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    Aviso de consistência
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setShowProjectIndicators(!showProjectIndicators)}
                                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded cursor-pointer transition-colors"
                                  aria-expanded={showProjectIndicators}
                                  aria-label={showProjectIndicators ? 'Recolher indicadores do planeamento' : 'Expandir indicadores do planeamento'}
                                >
                                  {showProjectIndicators ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            {showProjectIndicators && (
                              <div className="space-y-3">
                                {/* Estado das Tarefas */}
                                <div>
                                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                    <span>Estado das Tarefas</span>
                                    {selectedStatusFilter !== 'ALL' && (
                                      <button
                                        type="button"
                                        onClick={() => setSelectedStatusFilter('ALL')}
                                        className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                                      >
                                        Limpar filtro
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 text-xs">
                                    {/* Total */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStatusFilter('ALL')}
                                      className={`px-2 py-1 rounded-lg border font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                        selectedStatusFilter === 'ALL'
                                          ? 'bg-slate-800 text-white border-slate-900 shadow-2xs'
                                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                      }`}
                                      title="Mostrar todas as tarefas"
                                    >
                                      <span className="text-slate-400 font-bold">Total:</span>
                                      <span className="font-extrabold">{projectPlanningIndicators.totalTasks}</span>
                                    </button>

                                    {/* Sem planeamento */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStatusFilter(f => f === 'SEM_PLANEAMENTO' ? 'ALL' : 'SEM_PLANEAMENTO')}
                                      className={`px-2 py-1 rounded-lg border font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                        selectedStatusFilter === 'SEM_PLANEAMENTO'
                                          ? 'bg-slate-700 text-white border-slate-800 shadow-2xs'
                                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                      }`}
                                      title="Filtrar por tarefas sem planeamento"
                                    >
                                      <span className="font-mono text-slate-400">—</span>
                                      <span>Sem planeamento:</span>
                                      <span className="font-bold">{projectPlanningIndicators.withoutPlanningCount}</span>
                                    </button>

                                    {/* DRAFT */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStatusFilter(f => f === 'DRAFT' ? 'ALL' : 'DRAFT')}
                                      className={`px-2 py-1 rounded-lg border font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                        selectedStatusFilter === 'DRAFT'
                                          ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                                          : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
                                      }`}
                                      title="Filtrar por tarefas apenas DRAFT"
                                    >
                                      <span className="font-mono text-amber-600">◷</span>
                                      <span>DRAFT:</span>
                                      <span className="font-bold">{projectPlanningIndicators.draftOnlyCount}</span>
                                    </button>

                                    {/* Parcial */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStatusFilter(f => f === 'PARCIAL' ? 'ALL' : 'PARCIAL')}
                                      className={`px-2 py-1 rounded-lg border font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                        selectedStatusFilter === 'PARCIAL'
                                          ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                                          : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-50'
                                      }`}
                                      title="Filtrar por tarefas parcialmente planeadas"
                                    >
                                      <span className="font-mono text-blue-600">◔</span>
                                      <span>Parcial:</span>
                                      <span className="font-bold">{projectPlanningIndicators.partialCount}</span>
                                    </button>

                                    {/* Planeada */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStatusFilter(f => f === 'PLANEADA' ? 'ALL' : 'PLANEADA')}
                                      className={`px-2 py-1 rounded-lg border font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                        selectedStatusFilter === 'PLANEADA'
                                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                          : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                                      }`}
                                      title="Filtrar por tarefas totalmente planeadas"
                                    >
                                      <span className="font-mono text-emerald-600">✓</span>
                                      <span>Planeada:</span>
                                      <span className="font-bold">{projectPlanningIndicators.plannedCount}</span>
                                    </button>

                                    {/* Excesso */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStatusFilter(f => f === 'EXCESSO' ? 'ALL' : 'EXCESSO')}
                                      className={`px-2 py-1 rounded-lg border font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                        selectedStatusFilter === 'EXCESSO'
                                          ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                                          : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-50'
                                      }`}
                                      title="Filtrar por tarefas com excesso de planeamento"
                                    >
                                      <span className="font-mono text-rose-600">!</span>
                                      <span>Excesso:</span>
                                      <span className="font-bold">{projectPlanningIndicators.excessCount}</span>
                                    </button>

                                    {/* Sem estimativa */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStatusFilter(f => f === 'SEM_ESTIMATIVA' ? 'ALL' : 'SEM_ESTIMATIVA')}
                                      className={`px-2 py-1 rounded-lg border font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                        selectedStatusFilter === 'SEM_ESTIMATIVA'
                                          ? 'bg-slate-600 text-white border-slate-700 shadow-2xs'
                                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                      }`}
                                      title="Filtrar por tarefas sem estimativa"
                                    >
                                      <span className="font-mono text-slate-400">?</span>
                                      <span>Sem estimativa:</span>
                                      <span className="font-bold">{projectPlanningIndicators.withoutEstimateCount}</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Esforço & Cobertura */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 text-xs">
                                  {/* Esforço */}
                                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 space-y-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Esforço
                                    </span>
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-slate-600">Falta planear:</span>
                                      <span className={`font-bold ${
                                        projectPlanningIndicators.totalRemainingHours !== null && projectPlanningIndicators.totalRemainingHours > 0
                                          ? 'text-amber-700'
                                          : 'text-slate-700'
                                      }`}>
                                        {projectPlanningIndicators.totalRemainingHours !== null
                                          ? formatHoursDisplay(projectPlanningIndicators.totalRemainingHours)
                                          : 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-slate-600">Excesso planeado:</span>
                                      <span className={`font-bold ${
                                        projectPlanningIndicators.totalExcessHours !== null && projectPlanningIndicators.totalExcessHours > 0
                                          ? 'text-rose-700 font-extrabold'
                                          : 'text-slate-700'
                                      }`}>
                                        {projectPlanningIndicators.totalExcessHours !== null
                                          ? (projectPlanningIndicators.totalExcessHours > 0 ? formatHoursDisplay(projectPlanningIndicators.totalExcessHours) : '0h')
                                          : 'N/A'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Cobertura */}
                                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 space-y-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Cobertura
                                    </span>
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-slate-600">Com planeamento:</span>
                                      <span className="font-bold text-slate-800">
                                        {projectPlanningIndicators.tasksWithPlanningCount} / {projectPlanningIndicators.totalTasks}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-blue-700 font-medium">Com CONFIRMED:</span>
                                      <span className="font-bold text-blue-800">
                                        {projectPlanningIndicators.tasksWithConfirmedCount} / {projectPlanningIndicators.totalTasks}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-amber-700 font-medium">Com DRAFT:</span>
                                      <span className="font-bold text-amber-800">
                                        {projectPlanningIndicators.tasksWithDraftCount} / {projectPlanningIndicators.totalTasks}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Lista de Tarefas do Projeto */}
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold text-slate-600 px-1 flex items-center justify-between">
                            <span>
                              Tarefas ({filteredProjectVsEstimateTasks.length} {selectedStatusFilter !== 'ALL' ? `de ${projectPlanningVsEstimate.tasks.length}` : ''})
                            </span>
                            {selectedStatusFilter !== 'ALL' && (
                              <span className="text-[10px] font-normal text-slate-500">
                                A filtrar por: <strong className="text-slate-800">{getTaskPlanningEstimateStatusMeta(selectedStatusFilter).label}</strong>
                              </span>
                            )}
                          </div>

                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {filteredProjectVsEstimateTasks.length === 0 ? (
                              <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                Nenhuma tarefa corresponde ao filtro selecionado.
                              </div>
                            ) : (
                              filteredProjectVsEstimateTasks.map(t => {
                                const meta = getTaskPlanningEstimateStatusMeta(t.status);
                                const isCurrentTask = t.taskId === activeTask.id;

                                return (
                                  <div 
                                    key={t.taskId}
                                    className={`p-2.5 rounded-xl border transition-colors ${
                                      isCurrentTask 
                                        ? 'bg-blue-50/40 border-blue-200 shadow-2xs' 
                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-semibold text-slate-800 text-xs truncate">
                                          {t.taskTitle}
                                        </span>
                                        {isCurrentTask && (
                                          <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded shrink-0">
                                            Esta tarefa
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${meta.badgeClass}`}>
                                          <span className="font-mono text-xs">{meta.symbol}</span>
                                          <span>{meta.label}</span>
                                        </span>

                                        {!isCurrentTask && (
                                          <button
                                            type="button"
                                            onClick={() => handleNavigateToTask(t.taskId)}
                                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                            aria-label={`Ver detalhes da tarefa ${t.taskTitle}`}
                                            title="Ver detalhes da tarefa"
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                            <span>Ver tarefa</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                                      <div>
                                        <span className="text-slate-400">Estimativa: </span>
                                        <span className="font-bold text-slate-800">
                                          {t.estimatedHours !== null ? formatHoursDisplay(t.estimatedHours) : 'N/A'}
                                        </span>
                                      </div>

                                      <span className="text-slate-200">•</span>

                                      <div>
                                        <span className="text-blue-700 font-semibold">CONF: </span>
                                        <span className="font-bold text-blue-800">{formatHoursDisplay(t.confirmedHours)}</span>
                                      </div>

                                      {t.draftHours > 0 && (
                                        <>
                                          <span className="text-slate-200">•</span>
                                          <div>
                                            <span className="text-amber-700 font-semibold">DRAFT: </span>
                                            <span className="font-bold text-amber-800">{formatHoursDisplay(t.draftHours)}</span>
                                          </div>
                                        </>
                                      )}

                                      <span className="text-slate-200">•</span>

                                      <div>
                                        <span className="text-slate-700 font-bold">Planeado: </span>
                                        <span className="font-extrabold text-slate-900">{formatHoursDisplay(t.plannedHours)}</span>
                                      </div>

                                      {t.remainingHours !== null && t.remainingHours > 0 && (
                                        <>
                                          <span className="text-slate-200">•</span>
                                          <div>
                                            <span className="text-amber-700 font-semibold">Falta: </span>
                                            <span className="font-bold text-amber-800">{formatHoursDisplay(t.remainingHours)}</span>
                                          </div>
                                        </>
                                      )}

                                      {t.excessHours !== null && t.excessHours > 0 && (
                                        <>
                                          <span className="text-slate-200">•</span>
                                          <div>
                                            <span className="text-rose-700 font-bold">Excesso: </span>
                                            <span className="font-extrabold text-rose-800">{formatHoursDisplay(t.excessHours)}</span>
                                          </div>
                                        </>
                                      )}

                                      {t.plannedPercentage !== null && (
                                        <>
                                          <span className="text-slate-200">•</span>
                                          <span className="text-slate-500 font-medium">
                                            ({Math.round(t.plannedPercentage)}%)
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100/60">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-colors cursor-pointer text-xs"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-colors cursor-pointer text-xs shadow-md shadow-slate-100"
            >
              Gravar
            </button>
          </div>
        </form>
      </div>

      {/* Dedicated Planning Allocation Modal */}
      {isPlanningModalOpen && (
        <PlanningAllocationModal
          isOpen={isPlanningModalOpen}
          onClose={() => {
            setIsPlanningModalOpen(false);
            setSelectedAllocationForEdit(null);
          }}
          task={task}
          allocation={selectedAllocationForEdit}
          users={users}
          projects={projects}
          onCreateAllocation={effectiveCreate}
          onUpdateAllocation={effectiveUpdate}
          onCancelAllocation={effectiveCancel}
          onDeleteAllocation={effectiveDelete}
          onSuccess={() => {
            fetchTaskAllocations();
          }}
          onRefetch={() => {
            fetchTaskAllocations();
          }}
        />
      )}
    </div>
  );
}
