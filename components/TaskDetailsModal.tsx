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
  Layers
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
  getTaskPlanningLoadStatus,
  TaskPlanningLoadStatus
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
}: TaskDetailsModalProps) {
  const effectiveCreate = onCreateAllocation || createPlanningAllocation;
  const effectiveUpdate = onUpdateAllocation || updatePlanningAllocation;
  const effectiveCancel = onCancelAllocation || cancelPlanningAllocation;
  const effectiveDelete = onDeleteAllocation || deletePlanningAllocation;
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

  // Fetch allocations for this task directly or via prop
  const fetchTaskAllocations = useCallback(async () => {
    if (!task?.id) return;
    try {
      if (onFetchAllocations) {
        const res = await onFetchAllocations({ taskId: task.id });
        if (res?.data) {
          setInternalAllocations(res.data);
          return;
        }
      }
      const res = await fetch(`/api/v1/planning-allocations?taskId=${task.id}&pageSize=100`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && Array.isArray(json.data)) {
        setInternalAllocations(json.data);
      }
    } catch (err) {
      console.warn('Erro ao carregar allocations da tarefa:', err);
    }
  }, [task?.id, onFetchAllocations]);

  useEffect(() => {
    if (task?.id) {
      fetchTaskAllocations();
    }
  }, [task?.id, fetchTaskAllocations]);

  // Combine passed planningAllocations with internal allocations
  const taskAllocations = React.useMemo(() => {
    if (!task) return [];
    const source = (planningAllocations && planningAllocations.length > 0)
      ? planningAllocations.filter(a => a.taskId === task.id)
      : internalAllocations;
    // Sort by date ascending, then startTime
    return [...source].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });
  }, [task, planningAllocations, internalAllocations]);

  const activeAllocations = React.useMemo(() => {
    return taskAllocations.filter(a => a.status !== 'CANCELLED');
  }, [taskAllocations]);

  const cancelledAllocations = React.useMemo(() => {
    return taskAllocations.filter(a => a.status === 'CANCELLED');
  }, [taskAllocations]);

  // Authoritative Planning Summary
  const planningSummary = React.useMemo(() => {
    return computePlanningSummary(task?.estimatedHours, taskAllocations);
  }, [task?.estimatedHours, taskAllocations]);

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
      task?.assigneeIds || []
    );
  }, [activeAllocations, users, task?.assigneeIds]);

  useEffect(() => {
    if (task) {
      setTaskEditStatus(task.statusId || '');
      setTaskEditTypeId(task.taskTypeId || '');
      setTaskEditActualHours(formatToOnlyHours(task.actualHours));
      setTaskEditNotes(task.notes || '');
      setTaskEditStartDate(task.startDate || '');
      setTaskEditStartTime(task.startTime || '');
      setTaskEditEndDate(task.endDate || '');
      setTaskEditEndTime(task.endTime || '');
      setTaskEditAssignees(task.assigneeIds || []);
    }
  }, [task]);

  if (!task) return null;

  const taskProj = projects.find(p => p.id === task.projectId);
  const clientObj = taskProj ? clients.find(c => c.id === taskProj.clientId) : null;
  const taskClientName = clientObj ? (clientObj.clientName || clientObj.shortName || 'N/A') : 'N/A';
  const taskProjTitle = taskProj ? taskProj.title : 'N/A';

  const getUserName = (userId: string) => {
    const u = users.find(usr => usr.id === userId);
    return u ? u.name : userId;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (updateTask) {
      updateTask(task.id, {
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

            {/* Daily Planning Distribution List (FASE 23E-C3M-D) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  <span>Distribuição por Dia ({dailyPlanningGroups.length} {dailyPlanningGroups.length === 1 ? 'dia' : 'dias'})</span>
                </div>
                {activeAllocations.length > 0 && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    {activeAllocations.length} {activeAllocations.length === 1 ? 'alocação' : 'alocações'}
                  </span>
                )}
              </div>

              {dailyPlanningGroups.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700">Nenhum planeamento diário registado</div>
                  <p className="text-[11px] text-slate-500">
                    Clique em <strong>&quot;Adicionar planeamento&quot;</strong> para alocar trabalho a técnicos em dias específicos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {dailyPlanningGroups.map(dayGroup => {
                    const dateObj = new Date(dayGroup.date + 'T00:00:00');
                    const dayLabel = dateObj.toLocaleDateString('pt-PT', { 
                      weekday: 'short', 
                      day: 'numeric', 
                      month: 'short' 
                    });

                    // Subgroup allocations of this day by Resource
                    const resMapInDay = new Map<string, {
                      resourceId: string;
                      resourceName: string;
                      confirmedHours: number;
                      draftHours: number;
                      plannedHours: number;
                      allocs: PlanningAllocationDTO[];
                    }>();

                    for (const ra of dayGroup.resourceAllocations) {
                      const resId = ra.resourceId;
                      const existing = resMapInDay.get(resId) || {
                        resourceId: resId,
                        resourceName: getUserName(resId),
                        confirmedHours: 0,
                        draftHours: 0,
                        plannedHours: 0,
                        allocs: [],
                      };
                      existing.confirmedHours += ra.confirmedHours;
                      existing.draftHours += ra.draftHours;
                      existing.plannedHours += ra.plannedHours;
                      existing.allocs.push(ra.allocation);
                      resMapInDay.set(resId, existing);
                    }

                    const dayResources = Array.from(resMapInDay.values()).sort((a, b) => {
                      if (b.confirmedHours !== a.confirmedHours) return b.confirmedHours - a.confirmedHours;
                      if (b.draftHours !== a.draftHours) return b.draftHours - a.draftHours;
                      return a.resourceName.localeCompare(b.resourceName, 'pt-PT');
                    });

                    return (
                      <div 
                        key={dayGroup.date}
                        className="bg-slate-50/80 border border-slate-200 rounded-xl p-2.5 space-y-2.5"
                      >
                        {/* Day Group Header */}
                        <div className="flex items-center justify-between text-xs border-b border-slate-200/80 pb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 capitalize">
                              {dayLabel}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              ({dayGroup.date})
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            {dayGroup.confirmedHours > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 font-bold text-[10px]">
                                {formatHoursDisplay(dayGroup.confirmedHours)} CONF
                              </span>
                            )}
                            {dayGroup.draftHours > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                                {formatHoursDisplay(dayGroup.draftHours)} DRAFT
                              </span>
                            )}
                            <span className="font-extrabold text-slate-800 text-[11px] bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                              Total: {formatHoursDisplay(dayGroup.plannedHours)}
                            </span>
                          </div>
                        </div>

                        {/* Resources involved on this Day */}
                        <div className="space-y-2 pl-1">
                          {dayResources.map(res => {
                            const isAssignee = (task.assigneeIds || []).includes(res.resourceId);

                            return (
                              <div 
                                key={res.resourceId}
                                className="bg-white rounded-lg border border-slate-200/90 p-2 space-y-1.5 shadow-2xs"
                              >
                                {/* Resource Header within Day */}
                                <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100">
                                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                    <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>{res.resourceName}</span>
                                    {isAssignee && (
                                      <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1 py-0.2 rounded" title="Responsável atribuído à tarefa">
                                        Responsável
                                      </span>
                                    )}
                                  </div>

                                  {/* Resource Day Totals */}
                                  <div className="flex items-center gap-1.5 text-[11px]">
                                    {res.confirmedHours > 0 && (
                                      <span className="text-blue-700 font-semibold">
                                        {formatHoursDisplay(res.confirmedHours)} conf
                                      </span>
                                    )}
                                    {res.draftHours > 0 && (
                                      <span className="text-amber-700 font-semibold">
                                        {formatHoursDisplay(res.draftHours)} draft
                                      </span>
                                    )}
                                    <span className="font-extrabold text-slate-800 bg-slate-100 px-1.5 py-0.2 rounded">
                                      {formatHoursDisplay(res.plannedHours)}
                                    </span>
                                  </div>
                                </div>

                                {/* Resource Allocation Items on this Day */}
                                <div className="space-y-1">
                                  {res.allocs.map(alloc => {
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
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
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
