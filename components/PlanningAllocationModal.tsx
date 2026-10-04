'use client';

import React, { useState, useEffect } from 'react';
import { 
  Calendar, Clock, User as UserIcon, AlertTriangle, CheckCircle2, 
  AlertCircle, Trash2, Ban, ShieldAlert, FileText, Check 
} from 'lucide-react';
import { User, Task, Project } from '../lib/types';
import { 
  PlanningAllocationDTO, 
  PlanningAllocationCreateInput, 
  PlanningAllocationUpdateInput, 
  PlanningWarning 
} from '../lib/planning/types';
import { formatHoursDisplay, isAllocationOutsideTaskWindow } from '../lib/planning/summary';
import { getAuthHeaders } from '../lib/clientAuth';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Checkbox } from './ui/Checkbox';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';

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
  const activeUsers = React.useMemo(() => users.filter(u => !u.deleted), [users]);

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
    let isCancelledRequest = false;
    const fetchDayCap = async () => {
      setLoadingCapacityInfo(true);
      try {
        const res = await fetch(`/api/v1/planning/capacity?resourceId=${selectedResourceId}&dateFrom=${date}&dateTo=${date}`, {
          headers: getAuthHeaders(),
        });
        const json = await res.json().catch(() => null);
        if (!isCancelledRequest && res.ok && json?.success && Array.isArray(json.data) && json.data.length > 0) {
          setDayCapacityInfo(json.data[0]);
        } else if (!isCancelledRequest) {
          setDayCapacityInfo(null);
        }
      } catch {
        if (!isCancelledRequest) setDayCapacityInfo(null);
      } finally {
        if (!isCancelledRequest) setLoadingCapacityInfo(false);
      }
    };
    fetchDayCap();
    return () => {
      isCancelledRequest = true;
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
      setStartTime(allocation.startTime ? allocation.startTime.substring(0, 5) : '09:00');
      setEndTime(allocation.endTime ? allocation.endTime.substring(0, 5) : '17:00');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, allocation?.id, task?.id, initialResourceId, initialDate]);

  if (!isOpen) return null;

  // Selected task and project metadata
  const currentTask = task || tasks.find(t => t.id === selectedTaskId);
  const currentProject = projects.find(p => p.id === currentTask?.projectId);
  const isOutsideTaskWindow = isAllocationOutsideTaskWindow(date, currentTask);

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

  const modalTitle = isCancelled
    ? 'Alocação Cancelada (Histórico)'
    : isEditing 
    ? 'Editar Planeamento de Capacidade' 
    : 'Nova Alocação de Planeamento';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      className="max-w-xl"
    >
      <div id="planning-allocation-modal" className="space-y-4 text-left">
        {/* Subtitle context */}
        <p className="text-caption text-text-muted -mt-2">
          {isCancelled 
            ? 'Registo histórico imutável'
            : 'Reserva temporal no motor autoritativo de capacidade'}
        </p>

        {/* Cancelled Banner */}
        {isCancelled && (
          <Card className="p-3 bg-surface-muted border-border flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-text-secondary shrink-0 mt-0.5" />
            <div className="text-caption text-text-secondary">
              <span className="font-semibold text-text-primary">Alocação CANCELADA:</span> Este registo é puramente histórico e não consome capacidade. De acordo com as regras de negócio, alocações canceladas são imutáveis e não podem ser reativadas, editadas ou eliminadas.
            </div>
          </Card>
        )}

        {/* Server Error Alert */}
        {errorMessage && (
          <Card className="p-3 bg-error/5 border-error/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
            <div className="text-caption text-error flex-1">
              <span className="font-semibold">Erro de Validação do Servidor:</span>
              <p className="mt-0.5">{errorMessage}</p>
              {isConflictError && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onRefetch?.();
                    onClose();
                  }}
                  className="mt-2 text-caption font-semibold underline text-error hover:bg-error/10 p-0 h-auto"
                >
                  Recarregar dados atualizados do servidor
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Server Warnings */}
        {serverWarnings.length > 0 && (
          <Card className="p-3 bg-warning/5 border-warning/20 space-y-1.5">
            <div className="flex items-center gap-2 text-caption font-semibold text-warning">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Avisos do Motor de Validação:
            </div>
            {serverWarnings.map((w, idx) => (
              <div key={idx} className="text-caption text-text-secondary pl-6 list-item">
                {w.message}
              </div>
            ))}
          </Card>
        )}

        {/* Temporal Window Warning */}
        {isOutsideTaskWindow && (
          <div id="warning-outside-task-window">
            <Card className="p-3 bg-warning/5 border-warning/20 flex items-center gap-2 text-caption font-semibold text-warning">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
              <span>⚠ Alocação fora da janela temporal da tarefa</span>
            </Card>
          </div>
        )}

        {/* Form Body */}
        <form id="planning-allocation-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Resource & Date Planning Context (FASE 23E-B) */}
          {(initialResourceId || initialDate || contextCapacity) && (
            <Card className="p-3.5 bg-surface-muted/50 border-border space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap text-caption">
                <div className="flex items-center gap-1.5 font-bold text-text-primary">
                  <UserIcon className="w-3.5 h-3.5 text-primary" />
                  <span>Recurso: {activeUsers.find(u => u.id === (selectedResourceId || initialResourceId))?.name || 'Técnico selecionado'}</span>
                </div>
                {date && (
                  <div className="flex items-center gap-1.5 font-semibold text-primary">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    <span>Data: {date}</span>
                  </div>
                )}
              </div>

              {contextCapacity && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-border text-caption">
                  <div className="bg-surface rounded-control p-1.5 text-center border border-border">
                    <span className="text-caption text-text-muted font-semibold block uppercase">Capacidade</span>
                    <span className="font-bold text-text-primary">{contextCapacity.capacityHours}</span>
                  </div>
                  <div className="bg-surface rounded-control p-1.5 text-center border border-border">
                    <span className="text-caption text-text-muted font-semibold block uppercase">Confirmado</span>
                    <span className="font-bold text-primary">{contextCapacity.confirmedHours}</span>
                  </div>
                  <div className="bg-surface rounded-control p-1.5 text-center border border-border">
                    <span className="text-caption text-text-muted font-semibold block uppercase">Planeado</span>
                    <span className="font-bold text-text-primary">{contextCapacity.plannedHours}</span>
                  </div>
                  <div className="bg-surface rounded-control p-1.5 text-center border border-border">
                    <span className="text-caption text-text-muted font-semibold block uppercase">Livre</span>
                    <span className="font-bold text-success">{contextCapacity.freeHours}</span>
                  </div>
                  <div className="bg-surface rounded-control p-1.5 text-center border border-border">
                    <span className="text-caption text-text-muted font-semibold block uppercase">Excesso</span>
                    <span className={`font-bold ${contextCapacity.excessHours && contextCapacity.excessHours !== '0h' ? 'text-warning' : 'text-text-muted'}`}>
                      {contextCapacity.excessHours || '0h'}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Associated Task */}
          <div>
            {task ? (
              <div className="space-y-1.5 text-left">
                <label className="block text-label font-semibold text-text-secondary select-none">
                  Tarefa Associada <span className="text-error">*</span>
                </label>
                <Card className="p-3 bg-surface-muted/40 border-border">
                  <div className="text-body-sm font-semibold text-text-primary flex items-center gap-2">
                    <FileText className="w-4 h-4 text-text-secondary" />
                    {task.title}
                  </div>
                  {currentProject && (
                    <div className="text-caption text-text-muted mt-0.5 ml-6">
                      Projeto: {currentProject.title}
                    </div>
                  )}
                </Card>
              </div>
            ) : (
              <Select
                id="planning-task-select"
                label="Tarefa Associada *"
                disabled={isCancelled || submitting}
                value={selectedTaskId}
                onChange={e => setSelectedTaskId(e.target.value)}
                required
              >
                <option value="">Selecione uma tarefa...</option>
                {tasks.map(t => {
                  const projLabel = t.projectId
                    ? (projects.find(p => p.id === t.projectId)?.title || 'Projeto não encontrado')
                    : 'Sem projeto';
                  return (
                    <option key={t.id} value={t.id}>
                      {t.title} ({projLabel})
                    </option>
                  );
                })}
              </Select>
            )}
          </div>

          {/* Resource Selector */}
          <div>
            <Select
              id="planning-resource-select"
              label="Recurso / Técnico *"
              disabled={isCancelled || isEditing || submitting}
              value={selectedResourceId}
              onChange={e => setSelectedResourceId(e.target.value)}
              required
            >
              <option value="">Selecione um recurso...</option>
              {activeUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email || u.type})
                </option>
              ))}
            </Select>
            {isEditing && (
              <p className="text-caption text-text-muted mt-1">
                O recurso está associado a esta reserva. Para planear outro técnico, crie uma nova alocação.
              </p>
            )}
            <p className="text-caption text-text-muted mt-1">
              Nota: O recurso alocado não necessita de ser assignee formal da tarefa.
            </p>
          </div>

          {/* Date & Time Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              id="planning-date-input"
              type="date"
              label="Data *"
              disabled={isCancelled || submitting}
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />

            <Input
              id="planning-start-time"
              type="time"
              label="Hora Início *"
              disabled={isCancelled || submitting}
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              required
            />

            <Input
              id="planning-end-time"
              type="time"
              label="Hora Fim *"
              disabled={isCancelled || submitting}
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              required
            />
          </div>

          {/* Duration Feedback */}
          <Card className="flex items-center justify-between text-caption px-3 py-2 bg-surface-muted/40 border-border">
            <span className="text-text-secondary flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-text-muted" />
              Duração Calculada:
            </span>
            <span className={`font-semibold ${durationHours > 0 ? 'text-text-primary' : 'text-error'}`}>
              {durationHours > 0 ? formatHoursDisplay(durationHours) : 'Horário inválido'}
            </span>
          </Card>

          {/* Daily Capacity Context Preview (FASE 23D) */}
          {selectedResourceId && date && (
            <Card className="p-3 bg-surface-muted/40 border-border space-y-2 text-caption">
              <div className="flex items-center justify-between font-bold text-text-primary">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  Capacidade Diária do Recurso
                </span>
                <span className="text-caption text-text-muted font-medium">
                  {new Date(date + 'T00:00:00').toLocaleDateString('pt-PT')}
                </span>
              </div>
              {loadingCapacityInfo ? (
                <div className="text-text-muted text-center py-1">A carregar capacidade...</div>
              ) : dayCapacityInfo ? (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-surface p-2 rounded-control border border-border">
                    <div className="text-caption text-text-muted uppercase font-bold">Capacidade</div>
                    <div className="font-extrabold text-text-primary text-body-sm mt-0.5">{formatHoursDisplay(dayCapacityInfo.operationalCapacityMinutes / 60)}</div>
                  </div>
                  <div className="bg-surface p-2 rounded-control border border-border">
                    <div className="text-caption text-primary uppercase font-bold">Confirmado</div>
                    <div className="font-extrabold text-primary text-body-sm mt-0.5">{formatHoursDisplay(dayCapacityInfo.confirmedAllocationMinutes / 60)}</div>
                  </div>
                  <div className="bg-surface p-2 rounded-control border border-border">
                    <div className="text-caption text-success uppercase font-bold">Livre</div>
                    <div className="font-extrabold text-success text-body-sm mt-0.5">{formatHoursDisplay(Math.max(0, dayCapacityInfo.availableMinutes / 60))}</div>
                  </div>
                  <div className={`bg-surface p-2 rounded-control border ${dayCapacityInfo.overAllocatedMinutes > 0 ? 'border-warning/40 bg-warning/5' : 'border-border'}`}>
                    <div className={`text-caption uppercase font-bold ${dayCapacityInfo.overAllocatedMinutes > 0 ? 'text-warning' : 'text-text-muted'}`}>Excesso</div>
                    <div className={`font-extrabold text-body-sm mt-0.5 ${dayCapacityInfo.overAllocatedMinutes > 0 ? 'text-warning' : 'text-text-primary'}`}>
                      {formatHoursDisplay(dayCapacityInfo.overAllocatedMinutes / 60)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-text-muted text-center py-1">Sem dados de capacidade para esta data.</div>
              )}
            </Card>
          )}

          {/* Status Selection (DRAFT vs CONFIRMED) */}
          {!isCancelled && (
            <div className="space-y-1.5 text-left">
              <label className="block text-label font-semibold text-text-secondary select-none">
                Estado do Planeamento <span className="text-error">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div 
                  onClick={() => !submitting && setStatus('CONFIRMED')}
                  className={`cursor-pointer flex flex-col p-3 rounded-control border transition-colors select-none ${
                    status === 'CONFIRMED'
                      ? 'border-primary bg-primary/10 text-primary shadow-flat'
                      : 'border-border hover:border-text-disabled bg-surface text-text-secondary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-body-sm font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      CONFIRMADO
                    </span>
                    <input
                      type="radio"
                      name="status"
                      value="CONFIRMED"
                      checked={status === 'CONFIRMED'}
                      onChange={() => setStatus('CONFIRMED')}
                      disabled={submitting}
                      className="sr-only"
                    />
                    <Badge variant={status === 'CONFIRMED' ? 'primary' : 'neutral'}>
                      {status === 'CONFIRMED' ? 'Ativo' : 'Opção'}
                    </Badge>
                  </div>
                  <span className="text-caption text-text-muted">
                    Consome capacidade formal do recurso e bloqueia a disponibilidade.
                  </span>
                </div>

                <div 
                  onClick={() => !submitting && setStatus('DRAFT')}
                  className={`cursor-pointer flex flex-col p-3 rounded-control border transition-colors select-none ${
                    status === 'DRAFT'
                      ? 'border-warning bg-warning/10 text-warning shadow-flat'
                      : 'border-border hover:border-text-disabled bg-surface text-text-secondary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-body-sm font-bold flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-warning" />
                      RASCUNHO (DRAFT)
                    </span>
                    <input
                      type="radio"
                      name="status"
                      value="DRAFT"
                      checked={status === 'DRAFT'}
                      onChange={() => setStatus('DRAFT')}
                      disabled={submitting}
                      className="sr-only"
                    />
                    <Badge variant={status === 'DRAFT' ? 'warning' : 'neutral'}>
                      {status === 'DRAFT' ? 'Ativo' : 'Opção'}
                    </Badge>
                  </div>
                  <span className="text-caption text-text-muted">
                    Visível no planeamento, mas NÃO consome capacidade nem bloqueia horário.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Override Work Schedule Flag */}
          {!isCancelled && (
            <div className="pt-1">
              <Checkbox
                id="override-work-schedule-checkbox"
                label="Permitir alocação fora do horário habitual / feriado (override de horário)"
                checked={overrideWorkSchedule}
                onChange={e => setOverrideWorkSchedule(e.target.checked)}
                disabled={submitting}
              />
            </div>
          )}
        </form>

        {/* Cancel Confirmation Prompt for CONFIRMED allocations */}
        {confirmCancelPrompt && (
          <Card className="p-4 bg-error/5 border-error/20 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-caption font-semibold text-error">
              <AlertTriangle className="w-4 h-4 text-error" />
              Pretende cancelar esta alocação de planeamento?
            </div>
            <p className="text-caption text-text-secondary">
              O cancelamento liberta a capacidade consumida do técnico e torna o registo histórico imutável. Esta operação não pode ser revertida.
            </p>
            <div className="flex justify-end gap-2 mt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmCancelPrompt(false)}
                disabled={submitting}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleCancelConfirmed}
                disabled={submitting}
                isLoading={submitting}
              >
                Sim, Cancelar Alocação
              </Button>
            </div>
          </Card>
        )}

        {/* Modal Footer */}
        <div className="pt-4 border-t border-border flex items-center justify-between gap-2 flex-wrap">
          <div>
            {/* Action buttons for existing allocation */}
            {isEditing && !isCancelled && !confirmCancelPrompt && (
              <div className="flex items-center gap-2">
                {allocation?.status === 'DRAFT' && onDeleteAllocation && (
                  <Button
                    type="button"
                    id="delete-draft-allocation-btn"
                    variant="danger"
                    size="sm"
                    onClick={handleDeleteDraft}
                    disabled={submitting}
                    className="flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar Rascunho
                  </Button>
                )}
                {allocation?.status === 'CONFIRMED' && onCancelAllocation && (
                  <Button
                    type="button"
                    id="cancel-confirmed-allocation-btn"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmCancelPrompt(true)}
                    disabled={submitting}
                    className="flex items-center gap-1.5"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Cancelar Alocação
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              id="cancel-planning-modal-btn"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              {isCancelled ? 'Fechar' : 'Cancelar'}
            </Button>

            {!isCancelled && (
              <Button
                type="submit"
                form="planning-allocation-form"
                id="submit-planning-allocation-btn"
                variant="primary"
                size="sm"
                disabled={submitting || durationHours <= 0}
                isLoading={submitting}
                className="flex items-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                {isEditing ? 'Guardar Alterações' : 'Criar Alocação'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
