import React, { useState, useEffect, useCallback } from 'react';
import { X, Calendar, Users, Plus, Clock, AlertTriangle, Edit2, ChevronDown, ChevronUp, User as UserIcon } from 'lucide-react';
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
import { computePlanningSummary, formatHoursDisplay } from '../lib/planning/summary';
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

  const activeAllocations = taskAllocations.filter(a => a.status !== 'CANCELLED');
  const cancelledAllocations = taskAllocations.filter(a => a.status === 'CANCELLED');

  // Authoritative Planning Summary
  const planningSummary = computePlanningSummary(task?.estimatedHours, taskAllocations);

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

          {/* Planeamento de Capacidade (FASE 23C) */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Planeamento de Capacidade
                </span>
                <p className="text-[11px] text-slate-500">
                  Alocações temporais e consumo de capacidade no motor
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

            {/* Resumo de Capacidade (4 cards) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[10px] uppercase font-bold text-slate-500">Estimado</div>
                <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                  {formatHoursDisplay(planningSummary.estimatedHours)}
                </div>
              </div>

              <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg">
                <div className="text-[10px] uppercase font-bold text-blue-700">Planeado</div>
                <div className="text-sm font-extrabold text-blue-900 mt-0.5">
                  {formatHoursDisplay(planningSummary.plannedHours)}
                </div>
                <div className="text-[9px] text-blue-600 font-medium mt-0.5">DRAFT + CONFIRMED</div>
              </div>

              <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                <div className="text-[10px] uppercase font-bold text-emerald-700">Capacidade Consumida</div>
                <div className="text-sm font-extrabold text-emerald-900 mt-0.5">
                  {formatHoursDisplay(planningSummary.capacityConsumedHours)}
                </div>
                <div className="text-[9px] text-emerald-600 font-medium mt-0.5">Apenas CONFIRMED</div>
              </div>

              <div className={`p-2.5 border rounded-lg ${
                planningSummary.isOverAllocated
                  ? 'bg-amber-50/70 border-amber-300'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="text-[10px] uppercase font-bold text-slate-500">Restante</div>
                <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                  {formatHoursDisplay(planningSummary.remainingHours)}
                </div>
                {planningSummary.isOverAllocated && (
                  <div className="text-[9px] text-amber-700 font-bold mt-0.5">
                    Excesso: {formatHoursDisplay(planningSummary.excessHours)}
                  </div>
                )}
              </div>
            </div>

            {/* Visual Warning if Planeado > Estimado */}
            {planningSummary.isOverAllocated && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-2 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Aviso de Planeamento:</strong> O tempo total planeado ({formatHoursDisplay(planningSummary.plannedHours)}) excede a estimativa da tarefa ({formatHoursDisplay(planningSummary.estimatedHours)}) em <strong>{formatHoursDisplay(planningSummary.excessHours)}</strong>.
                </span>
              </div>
            )}

            {/* Active Allocations List */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700">
                Alocações Ativas ({activeAllocations.length})
              </div>

              {activeAllocations.length === 0 ? (
                <div className="p-3 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50 text-xs text-slate-500">
                  Nenhum planeamento registado para esta tarefa. Clique em <strong>&quot;Adicionar planeamento&quot;</strong> para reservar capacidade técnica.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {activeAllocations.map(alloc => (
                    <div
                      key={alloc.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between text-xs transition-colors ${
                        alloc.status === 'CONFIRMED'
                          ? 'bg-blue-50/40 border-blue-200 hover:bg-blue-50/70'
                          : 'bg-amber-50/30 border-dashed border-amber-300 hover:bg-amber-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          alloc.status === 'CONFIRMED'
                            ? 'bg-blue-600 text-white'
                            : 'bg-amber-200 text-amber-900 border border-amber-300'
                        }`}>
                          {alloc.status === 'CONFIRMED' ? 'Confirmado' : 'Rascunho'}
                        </span>

                        <div>
                          <div className="font-semibold text-slate-800 flex items-center gap-2">
                            <span>{new Date(alloc.date + 'T00:00:00').toLocaleDateString('pt-PT')}</span>
                            <span className="text-slate-400">•</span>
                            <span>{alloc.startTime.substring(0, 5)} - {alloc.endTime.substring(0, 5)}</span>
                            <span className="text-slate-500 font-normal">({formatHoursDisplay((alloc.durationMinutes || 0) / 60)})</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <UserIcon className="w-3 h-3 text-slate-400" />
                            <span>{getUserName(alloc.resourceId)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAllocationForEdit(alloc);
                            setIsPlanningModalOpen(true);
                          }}
                          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded transition-colors cursor-pointer"
                          title="Editar Alocação"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
