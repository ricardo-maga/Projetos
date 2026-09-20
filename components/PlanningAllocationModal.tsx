'use client';

import React, { useState, useEffect } from 'react';
import { 
  Calendar, Clock, User as UserIcon, AlertTriangle, CheckCircle2, 
  X, AlertCircle, Trash2, Ban, ShieldAlert, FileText, Check 
} from 'lucide-react';
import { User, Task, Project } from '../lib/types';
import { 
  PlanningAllocationDTO, 
  PlanningAllocationCreateInput, 
  PlanningAllocationUpdateInput, 
  PlanningWarning 
} from '../lib/planning/types';
import { parseHoursToNumber, formatHoursDisplay } from '../lib/planning/summary';
import { getAuthHeaders } from '../lib/clientAuth';

interface PlanningAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  // If invoked for a specific task
  task?: Task | null;
  tasks?: Task[];
  // If editing an existing allocation
  allocation?: PlanningAllocationDTO | null;
  // Options
  users: User[];
  projects?: Project[];
  initialResourceId?: string;
  initialDate?: string;
  contextCapacity?: {
    capacityHours?: string | number;
    confirmedHours?: string | number;
    plannedHours?: string | number;
    freeHours?: string | number;
    excessHours?: string | number;
  };
  // Actions from useERP (supports both naming patterns)
  onCreateAllocation?: (input: PlanningAllocationCreateInput) => Promise<{
    success: boolean;
    data?: PlanningAllocationDTO;
    warnings?: PlanningWarning[];
    error?: string;
    status?: number;
  }>;
  onUpdateAllocation?: (id: string, input: PlanningAllocationUpdateInput) => Promise<{
    success: boolean;
    data?: PlanningAllocationDTO;
    warnings?: PlanningWarning[];
    error?: string;
    isConflict?: boolean;
    status?: number;
  }>;
  onCancelAllocation?: (id: string, version: number) => Promise<{
    success: boolean;
    data?: PlanningAllocationDTO;
    error?: string;
    isConflict?: boolean;
    status?: number;
  }>;
  onDeleteAllocation?: (id: string) => Promise<{
    success: boolean;
    error?: string;
    status?: number;
  }>;
  createPlanningAllocation?: (input: PlanningAllocationCreateInput) => Promise<any>;
  updatePlanningAllocation?: (id: string, updates: any) => Promise<any>;
  cancelPlanningAllocation?: (id: string, version: number) => Promise<any>;
  deletePlanningAllocation?: (id: string) => Promise<any>;
  onSuccess?: (allocation: PlanningAllocationDTO) => void;
  onRefetch?: () => void;
}

export default function PlanningAllocationModal({
  isOpen,
  onClose,
  task,
  tasks = [],
  allocation,
  users,
  projects = [],
  initialResourceId,
  initialDate,
  contextCapacity,
  onCreateAllocation,
  onUpdateAllocation,
  onCancelAllocation,
  onDeleteAllocation,
  createPlanningAllocation,
  updatePlanningAllocation,
  cancelPlanningAllocation,
  deletePlanningAllocation,
  onSuccess,
  onRefetch,
}: PlanningAllocationModalProps) {
  const isEditing = !!allocation;
  const isCancelled = allocation?.status === 'CANCELLED';

  const doCreate = onCreateAllocation || createPlanningAllocation;
  const doUpdate = onUpdateAllocation || updatePlanningAllocation;
  const doCancel = onCancelAllocation || cancelPlanningAllocation;
  const doDelete = onDeleteAllocation || deletePlanningAllocation;

  // Active users only, excluding deleted users (respecting global project rule)
  const activeUsers = users.filter(u => !u.deleted);

  // Form State
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('17:00');
  const [status, setStatus] = useState<'DRAFT' | 'CONFIRMED'>('CONFIRMED');
  const [overrideWorkSchedule, setOverrideWorkSchedule] = useState<boolean>(false);

  // UI state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverWarnings, setServerWarnings] = useState<PlanningWarning[]>([]);
  const [isConflictError, setIsConflictError] = useState<boolean>(false);
  const [confirmCancelPrompt, setConfirmCancelPrompt] = useState<boolean>(false);
  const [dayCapacityInfo, setDayCapacityInfo] = useState<any>(null);
  const [loadingCapacityInfo, setLoadingCapacityInfo] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !selectedResourceId || !date) {
      setDayCapacityInfo(null);
      return;
    }
    let isCancelled = false;
    const fetchDayCap = async () => {
      setLoadingCapacityInfo(true);
      try {
        const res = await fetch(`/api/v1/planning/capacity?resourceId=${selectedResourceId}&dateFrom=${date}&dateTo=${date}`, {
          headers: getAuthHeaders(),
        });
        const json = await res.json().catch(() => null);
        if (!isCancelled && res.ok && json?.success && Array.isArray(json.data) && json.data.length > 0) {
          setDayCapacityInfo(json.data[0]);
        } else if (!isCancelled) {
          setDayCapacityInfo(null);
        }
      } catch {
        if (!isCancelled) setDayCapacityInfo(null);
      } finally {
        if (!isCancelled) setLoadingCapacityInfo(false);
      }
    };
    fetchDayCap();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, selectedResourceId, date]);

  // Initialize or reset form when modal opens or target changes
  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      setServerWarnings([]);
      setIsConflictError(false);
      setConfirmCancelPrompt(false);
      return;
    }

    if (allocation) {
      setSelectedTaskId(allocation.taskId);
      setSelectedResourceId(allocation.resourceId);
      setDate(allocation.date);
      setStartTime(allocation.startTime.substring(0, 5));
      setEndTime(allocation.endTime.substring(0, 5));
      setStatus(allocation.status === 'CANCELLED' ? 'DRAFT' : allocation.status);
      setErrorMessage(null);
      setServerWarnings([]);
    } else {
      const defaultTaskId = task?.id || (tasks.length > 0 ? tasks[0].id : '');
      setSelectedTaskId(defaultTaskId);

      // Default resource: initialResourceId, or preferred assignee, or first active user
      const defaultUser = initialResourceId
        ? activeUsers.find(u => u.id === initialResourceId) || activeUsers[0]
        : task?.assigneeIds && task.assigneeIds.length > 0
        ? activeUsers.find(u => task.assigneeIds?.includes(u.id)) || activeUsers[0]
        : activeUsers[0];
      setSelectedResourceId(defaultUser?.id || initialResourceId || '');

      // Default date: initialDate, or task start/estimated date, or today
      const today = new Date().toISOString().split('T')[0];
      const defaultDate = initialDate || task?.startDate || task?.estimatedDate || today;
      setDate(defaultDate);

      setStartTime('08:00');
      setEndTime('12:00');
      setStatus('CONFIRMED');
      setOverrideWorkSchedule(false);
      setErrorMessage(null);
      setServerWarnings([]);
    }
  }, [isOpen, allocation, task, tasks, activeUsers, initialResourceId, initialDate]);

  if (!isOpen) return null;

  // Selected task and project metadata
  const currentTask = task || tasks.find(t => t.id === selectedTaskId);
  const currentProject = projects.find(p => p.id === currentTask?.projectId);

  // Calculate local duration for feedback
  const getDurationHours = (): number => {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const sMin = sh * 60 + sm;
    const eMin = eh * 60 + em;
    if (eMin <= sMin) return 0;
    return (eMin - sMin) / 60;
  };
  const durationHours = getDurationHours();

  // Submit Handler (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setServerWarnings([]);
    setIsConflictError(false);

    if (!selectedTaskId) {
      setErrorMessage('Por favor selecione a Tarefa associada.');
      return;
    }
    if (!selectedResourceId) {
      setErrorMessage('Por favor selecione o Recurso/Técnico.');
      return;
    }
    if (!date) {
      setErrorMessage('Por favor defina a data de alocação.');
      return;
    }
    if (!startTime || !endTime) {
      setErrorMessage('Por favor defina o horário inicial e final.');
      return;
    }
    if (durationHours <= 0) {
      setErrorMessage('A hora de fim deve ser estritamente posterior à hora de início.');
      return;
    }

    setSubmitting(true);

    try {
      if (isEditing && allocation) {
        if (!doUpdate) return;

        const updatePayload: PlanningAllocationUpdateInput = {
          version: allocation.version,
          date,
          startTime,
          endTime,
          status,
          overrideWorkSchedule,
        };

        const res = await doUpdate(allocation.id, updatePayload);

        if (res.success && res.data) {
          if (res.warnings && res.warnings.length > 0) {
            setServerWarnings(res.warnings);
          }
          onSuccess?.(res.data);
          onClose();
        } else {
          setErrorMessage(res.error || 'Erro ao atualizar o planeamento no servidor.');
          if (res.isConflict) {
            setIsConflictError(true);
          }
        }
      } else {
        if (!doCreate) return;

        const createPayload: PlanningAllocationCreateInput = {
          taskId: selectedTaskId,
          resourceId: selectedResourceId,
          date,
          startTime,
          endTime,
          status,
          overrideWorkSchedule,
        };

        const res = await doCreate(createPayload);

        if (res.success && res.data) {
          if (res.warnings && res.warnings.length > 0) {
            setServerWarnings(res.warnings);
          }
          onSuccess?.(res.data);
          onClose();
        } else {
          setErrorMessage(res.error || 'Erro ao criar alocação de planeamento no servidor.');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel Confirmed Allocation Handler
  const handleCancelConfirmed = async () => {
    if (!allocation || !doCancel) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await doCancel(allocation.id, allocation.version);
      if (res.success && res.data) {
        onSuccess?.(res.data);
        onClose();
      } else {
        setErrorMessage(res.error || 'Erro ao cancelar a alocação.');
        if (res.isConflict) setIsConflictError(true);
      }
    } finally {
      setSubmitting(false);
      setConfirmCancelPrompt(false);
    }
  };

  // Delete Draft Allocation Handler
  const handleDeleteDraft = async () => {
    if (!allocation || !doDelete) return;
    if (!confirm('Tem a certeza que pretende eliminar este rascunho de planeamento?')) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await doDelete(allocation.id);
      if (res.success) {
        onRefetch?.();
        onClose();
      } else {
        setErrorMessage(res.error || 'Erro ao eliminar o rascunho.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div 
        id="planning-allocation-modal"
        className="w-full max-w-xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isCancelled 
                ? 'bg-slate-200 text-slate-700'
                : status === 'CONFIRMED' 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-amber-100 text-amber-700'
            }`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {isCancelled
                  ? 'Alocação Cancelada (Histórico)'
                  : isEditing 
                  ? 'Editar Planeamento de Capacidade' 
                  : 'Nova Alocação de Planeamento'}
              </h2>
              <p className="text-xs text-slate-500">
                {isCancelled 
                  ? 'Registo histórico imutável'
                  : 'Reserva temporal no motor autoritativo de capacidade'}
              </p>
            </div>
          </div>
          <button
            id="close-planning-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cancelled Banner */}
        {isCancelled && (
          <div className="mx-6 mt-4 p-3 bg-slate-100 border border-slate-300 rounded-lg flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700">
              <span className="font-semibold">Alocação CANCELADA:</span> Este registo é puramente histórico e não consome capacidade. De acordo com as regras de negócio, alocações canceladas são imutáveis e não podem ser reativadas, editadas ou eliminadas.
            </div>
          </div>
        )}

        {/* Server Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 flex-1">
              <span className="font-semibold">Erro de Validação do Servidor:</span>
              <p className="mt-0.5">{errorMessage}</p>
              {isConflictError && (
                <button
                  type="button"
                  onClick={() => {
                    onRefetch?.();
                    onClose();
                  }}
                  className="mt-2 text-xs font-semibold underline text-rose-900 hover:text-rose-950"
                >
                  Recarregar dados atualizados do servidor
                </button>
              )}
            </div>
          </div>
        )}

        {/* Server Warnings */}
        {serverWarnings.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Avisos do Motor de Validação:
            </div>
            {serverWarnings.map((w, idx) => (
              <div key={idx} className="text-xs text-amber-800 pl-6 list-item">
                {w.message}
              </div>
            ))}
          </div>
        )}

        {/* Form Body */}
        <form id="planning-allocation-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Resource & Date Planning Context (FASE 23E-B) */}
          {(initialResourceId || initialDate || contextCapacity) && (
            <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 font-bold text-blue-950">
                  <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Recurso: {activeUsers.find(u => u.id === (selectedResourceId || initialResourceId))?.name || 'Técnico selecionado'}</span>
                </div>
                {date && (
                  <div className="flex items-center gap-1.5 font-semibold text-blue-800">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Data: {date}</span>
                  </div>
                )}
              </div>

              {contextCapacity && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-blue-200/60 text-[11px]">
                  <div className="bg-white/80 rounded-lg p-1.5 text-center border border-blue-100">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Capacidade</span>
                    <span className="font-bold text-slate-800">{contextCapacity.capacityHours}</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-1.5 text-center border border-blue-100">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Confirmado</span>
                    <span className="font-bold text-blue-700">{contextCapacity.confirmedHours}</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-1.5 text-center border border-blue-100">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Planeado</span>
                    <span className="font-bold text-slate-800">{contextCapacity.plannedHours}</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-1.5 text-center border border-blue-100">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Livre</span>
                    <span className="font-bold text-emerald-700">{contextCapacity.freeHours}</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-1.5 text-center border border-blue-100">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Excesso</span>
                    <span className={`font-bold ${contextCapacity.excessHours && contextCapacity.excessHours !== '0h' ? 'text-amber-800' : 'text-slate-500'}`}>
                      {contextCapacity.excessHours || '0h'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Associated Task */}
          <div>
            <label htmlFor="planning-task-select" className="block text-xs font-medium text-slate-700 mb-1">
              Tarefa Associada <span className="text-rose-500">*</span>
            </label>
            {task ? (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  {task.title}
                </div>
                {currentProject && (
                  <div className="text-xs text-slate-500 mt-0.5 ml-6">
                    Projeto: {currentProject.title}
                  </div>
                )}
              </div>
            ) : (
              <select
                id="planning-task-select"
                disabled={isCancelled || submitting}
                value={selectedTaskId}
                onChange={e => setSelectedTaskId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                required
              >
                <option value="">Selecione uma tarefa...</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({projects.find(p => p.id === t.projectId)?.title || 'Sem projeto'})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Resource Selector */}
          <div>
            <label htmlFor="planning-resource-select" className="block text-xs font-medium text-slate-700 mb-1">
              Recurso / Técnico <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                id="planning-resource-select"
                disabled={isCancelled || isEditing || submitting}
                value={selectedResourceId}
                onChange={e => setSelectedResourceId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                required
              >
                <option value="">Selecione um recurso...</option>
                {activeUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email || u.type})
                  </option>
                ))}
              </select>
              {isEditing && (
                <p className="text-[11px] text-slate-400 mt-1">
                  O recurso está associado a esta reserva. Para planear outro técnico, crie uma nova alocação.
                </p>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Nota: O recurso alocado não necessita de ser assignee formal da tarefa.
            </p>
          </div>

          {/* Date & Time Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="planning-date-input" className="block text-xs font-medium text-slate-700 mb-1">
                Data <span className="text-rose-500">*</span>
              </label>
              <input
                id="planning-date-input"
                type="date"
                disabled={isCancelled || submitting}
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                required
              />
            </div>

            <div>
              <label htmlFor="planning-start-time" className="block text-xs font-medium text-slate-700 mb-1">
                Hora Início <span className="text-rose-500">*</span>
              </label>
              <input
                id="planning-start-time"
                type="time"
                disabled={isCancelled || submitting}
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                required
              />
            </div>

            <div>
              <label htmlFor="planning-end-time" className="block text-xs font-medium text-slate-700 mb-1">
                Hora Fim <span className="text-rose-500">*</span>
              </label>
              <input
                id="planning-end-time"
                type="time"
                disabled={isCancelled || submitting}
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                required
              />
            </div>
          </div>

          {/* Duration Feedback */}
          <div className="flex items-center justify-between text-xs px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-slate-600 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Duração Calculada:
            </span>
            <span className={`font-semibold ${durationHours > 0 ? 'text-slate-800' : 'text-rose-600'}`}>
              {durationHours > 0 ? formatHoursDisplay(durationHours) : 'Horário inválido'}
            </span>
          </div>

          {/* Daily Capacity Context Preview (FASE 23D) */}
          {selectedResourceId && date && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  Capacidade Diária do Recurso
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {new Date(date + 'T00:00:00').toLocaleDateString('pt-PT')}
                </span>
              </div>
              {loadingCapacityInfo ? (
                <div className="text-slate-400 text-center py-1">A carregar capacidade...</div>
              ) : dayCapacityInfo ? (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Capacidade</div>
                    <div className="font-extrabold text-slate-800 text-xs sm:text-sm mt-0.5">{formatHoursDisplay(dayCapacityInfo.operationalCapacityMinutes / 60)}</div>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-blue-600 uppercase font-bold">Confirmado</div>
                    <div className="font-extrabold text-blue-900 text-xs sm:text-sm mt-0.5">{formatHoursDisplay(dayCapacityInfo.confirmedAllocationMinutes / 60)}</div>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-emerald-600 uppercase font-bold">Livre</div>
                    <div className="font-extrabold text-emerald-900 text-xs sm:text-sm mt-0.5">{formatHoursDisplay(Math.max(0, dayCapacityInfo.availableMinutes / 60))}</div>
                  </div>
                  <div className={`bg-white p-2 rounded-lg border ${dayCapacityInfo.overAllocatedMinutes > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
                    <div className={`text-[10px] uppercase font-bold ${dayCapacityInfo.overAllocatedMinutes > 0 ? 'text-amber-700' : 'text-slate-400'}`}>Excesso</div>
                    <div className={`font-extrabold text-xs sm:text-sm mt-0.5 ${dayCapacityInfo.overAllocatedMinutes > 0 ? 'text-amber-900' : 'text-slate-800'}`}>
                      {formatHoursDisplay(dayCapacityInfo.overAllocatedMinutes / 60)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-center py-1">Sem dados de capacidade para esta data.</div>
              )}
            </div>
          )}

          {/* Status Selection (DRAFT vs CONFIRMED) */}
          {!isCancelled && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Estado do Planeamento <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`cursor-pointer flex flex-col p-3 rounded-lg border transition-all ${
                  status === 'CONFIRMED'
                    ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      CONFIRMADO
                    </span>
                    <input
                      type="radio"
                      name="status"
                      value="CONFIRMED"
                      checked={status === 'CONFIRMED'}
                      onChange={() => setStatus('CONFIRMED')}
                      disabled={submitting}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Consome capacidade formal do recurso e bloqueia a disponibilidade.
                  </span>
                </label>

                <label className={`cursor-pointer flex flex-col p-3 rounded-lg border transition-all ${
                  status === 'DRAFT'
                    ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-600" />
                      RASCUNHO (DRAFT)
                    </span>
                    <input
                      type="radio"
                      name="status"
                      value="DRAFT"
                      checked={status === 'DRAFT'}
                      onChange={() => setStatus('DRAFT')}
                      disabled={submitting}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Visível no planeamento, mas NÃO consome capacidade nem bloqueia horário.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Override Work Schedule Flag */}
          {!isCancelled && (
            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="override-work-schedule-checkbox"
                  type="checkbox"
                  checked={overrideWorkSchedule}
                  onChange={e => setOverrideWorkSchedule(e.target.checked)}
                  disabled={submitting}
                  className="rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-700">
                  Permitir alocação fora do horário habitual / feriado (override de horário)
                </span>
              </label>
            </div>
          )}
        </form>

        {/* Cancel Confirmation Prompt for CONFIRMED allocations */}
        {confirmCancelPrompt && (
          <div className="p-4 bg-rose-50 border-t border-rose-200 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Pretende cancelar esta alocação de planeamento?
            </div>
            <p className="text-xs text-rose-700">
              O cancelamento liberta a capacidade consumida do técnico e torna o registo histórico imutável. Esta operação não pode ser revertida.
            </p>
            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setConfirmCancelPrompt(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleCancelConfirmed}
                disabled={submitting}
                className="px-3 py-1.5 text-xs font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700"
              >
                {submitting ? 'A cancelar...' : 'Sim, Cancelar Alocação'}
              </button>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            {/* Action buttons for existing allocation */}
            {isEditing && !isCancelled && !confirmCancelPrompt && (
              <div className="flex items-center gap-2">
                {allocation?.status === 'DRAFT' && onDeleteAllocation && (
                  <button
                    type="button"
                    id="delete-draft-allocation-btn"
                    onClick={handleDeleteDraft}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar Rascunho
                  </button>
                )}
                {allocation?.status === 'CONFIRMED' && onCancelAllocation && (
                  <button
                    type="button"
                    id="cancel-confirmed-allocation-btn"
                    onClick={() => setConfirmCancelPrompt(true)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 hover:text-amber-900 hover:bg-amber-50 rounded-lg border border-amber-300 transition-colors"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Cancelar Alocação
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="cancel-planning-modal-btn"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {isCancelled ? 'Fechar' : 'Cancelar'}
            </button>

            {!isCancelled && (
              <button
                type="submit"
                form="planning-allocation-form"
                id="submit-planning-allocation-btn"
                disabled={submitting || durationHours <= 0}
                className="px-5 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {submitting ? (
                  <>A processar...</>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {isEditing ? 'Guardar Alterações' : 'Criar Alocação'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
