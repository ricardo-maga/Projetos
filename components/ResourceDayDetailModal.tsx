import React, { useState } from 'react';
import { 
  X, 
  Plus, 
  Calendar, 
  Clock, 
  Briefcase, 
  AlertCircle, 
  CheckCircle2, 
  Layers, 
  ExternalLink,
  Edit3,
  Ban,
  Trash2,
  AlertTriangle,
  User as UserIcon,
  FileText,
  Check
} from 'lucide-react';
import { User, Task, Project, UserAbsence, TaskStatus } from '../lib/types';
import { 
  PlanningAllocationDTO, 
  ResourceCapacityDetail, 
  ResourceLoadSummary 
} from '../lib/planning/types';
import { 
  formatHoursDisplay, 
  groupResourceDayAllocationsByTask,
  ResourceDayTaskGroup 
} from '../lib/planning/summary';

interface ResourceDayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: User | null;
  dateStr: string | null;
  capacityDetail?: ResourceCapacityDetail | null;
  loadDetail?: ResourceLoadSummary | null;
  allocations: PlanningAllocationDTO[];
  tasks: Task[];
  projects: Project[];
  users?: User[];
  userAbsences?: UserAbsence[];
  taskStatuses?: TaskStatus[];
  onNewAllocation: (resourceId: string, dateStr: string) => void;
  onEditAllocation: (allocation: PlanningAllocationDTO) => void;
  onConfirmAllocation?: (id: string, version: number) => Promise<any>;
  onCancelAllocation?: (id: string, version: number) => Promise<any>;
  onDeleteAllocation?: (id: string) => Promise<any>;
  onViewTask: (task: Task) => void;
  onSelectProject?: (projectId: string) => void;
  canWriteCalendar?: boolean;
}

export default function ResourceDayDetailModal({
  isOpen,
  onClose,
  resource,
  dateStr,
  capacityDetail,
  loadDetail,
  allocations,
  tasks,
  projects,
  users = [],
  userAbsences = [],
  taskStatuses = [],
  onNewAllocation,
  onEditAllocation,
  onConfirmAllocation,
  onCancelAllocation,
  onDeleteAllocation,
  onViewTask,
  onSelectProject,
  canWriteCalendar = true,
}: ResourceDayDetailModalProps) {
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmCancelAlloc, setConfirmCancelAlloc] = useState<PlanningAllocationDTO | null>(null);
  const [confirmDeleteAlloc, setConfirmDeleteAlloc] = useState<PlanningAllocationDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // FASE 23E-C3M-C: Group active allocations by Task (deterministic sorting: CONFIRMED first, then DRAFT, then Project/Task name)
  // Hook called unconditionally at top level
  const taskGroups: ResourceDayTaskGroup[] = React.useMemo(() => {
    if (!resource || !dateStr) return [];
    return groupResourceDayAllocationsByTask(
      resource.id,
      dateStr,
      allocations,
      tasks,
      projects
    );
  }, [resource, dateStr, allocations, tasks, projects]);

  if (!isOpen || !resource || !dateStr) return null;

  // Filter allocations strictly for this resource and date
  const dayAllocations = allocations.filter(
    a => a.resourceId === resource.id && a.date === dateStr
  );

  // Separate active vs cancelled, confirmed vs draft
  const activeAllocations = dayAllocations.filter(a => a.status !== 'CANCELLED');
  const confirmedAllocations = dayAllocations.filter(a => a.status === 'CONFIRMED');
  const draftAllocations = dayAllocations.filter(a => a.status === 'DRAFT');
  const cancelledAllocations = dayAllocations.filter(a => a.status === 'CANCELLED');

  // Chronological sorting: 1. start time, 2. end time, 3. status
  const sortAllocations = (list: PlanningAllocationDTO[]) => {
    return [...list].sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.endTime !== b.endTime) return a.endTime.localeCompare(b.endTime);
      return a.status.localeCompare(b.status);
    });
  };

  const sortedConfirmed = sortAllocations(confirmedAllocations);
  const sortedDraft = sortAllocations(draftAllocations);
  const sortedCancelled = sortAllocations(cancelledAllocations);

  // Canonical calculations (Priority to capacityDetail/loadDetail, no arbitrary 480 fallback)
  const capacityMinutes = capacityDetail 
    ? capacityDetail.operationalCapacityMinutes 
    : (loadDetail ? loadDetail.operationalCapacityMinutes : 0);

  const localConfirmedMinutes = confirmedAllocations.reduce(
    (acc, a) => acc + (a.durationMinutes || 0), 
    0
  );

  const confirmedMinutes = capacityDetail
    ? capacityDetail.confirmedAllocationMinutes
    : localConfirmedMinutes;

  const draftMinutes = draftAllocations.reduce(
    (acc, a) => acc + (a.durationMinutes || 0), 
    0
  );

  // Planned = CONFIRMED (canonical if available) + DRAFT
  const plannedMinutes = confirmedMinutes + draftMinutes;

  // Free Capacity = Canonical availableMinutes if available, else max(0, Capacity - CONFIRMED)
  const freeCapacityMinutes = capacityDetail
    ? capacityDetail.availableMinutes
    : (loadDetail ? loadDetail.availableMinutes : Math.max(0, capacityMinutes - confirmedMinutes));

  // Excess = Canonical overAllocatedMinutes if available, else max(0, CONFIRMED - Capacity)
  // The canonical excess considers only capacity debited by CONFIRMED, DRAFT cannot create excess
  const excessMinutes = capacityDetail
    ? capacityDetail.overAllocatedMinutes
    : (loadDetail ? loadDetail.overAllocatedMinutes : Math.max(0, confirmedMinutes - capacityMinutes));

  // Utilization = Canonical utilizationPercent if available, else CONFIRMED / Capacity
  const utilizationPercent = capacityDetail
    ? capacityDetail.utilizationPercent
    : (loadDetail 
        ? loadDetail.utilizationPercent 
        : (capacityMinutes > 0
            ? Math.round((confirmedMinutes / capacityMinutes) * 1000) / 10
            : null));

  const isZeroCap = capacityMinutes === 0;
  const isOverCapacity = excessMinutes > 0;
  const hasDraft = draftMinutes > 0;
  const hasConfirmed = confirmedMinutes > 0;

  // FASE 23E-C3M-A: Canonical Operational State matching C3L
  let cellOpState: 
    | 'EXCESSO CONFIRMADO' 
    | 'SEM CAPACIDADE' 
    | 'DRAFT PENDENTE' 
    | 'CAPACIDADE TOTALMENTE OCUPADA' 
    | 'CAPACIDADE DISPONÍVEL' 
    | 'SEM CAPACIDADE OPERACIONAL';

  if (isOverCapacity) {
    cellOpState = 'EXCESSO CONFIRMADO';
  } else if (isZeroCap && (hasConfirmed || hasDraft || activeAllocations.length > 0)) {
    cellOpState = 'SEM CAPACIDADE';
  } else if (hasDraft) {
    cellOpState = 'DRAFT PENDENTE';
  } else if (!isZeroCap && confirmedMinutes === capacityMinutes) {
    cellOpState = 'CAPACIDADE TOTALMENTE OCUPADA';
  } else if (!isZeroCap && confirmedMinutes < capacityMinutes) {
    cellOpState = 'CAPACIDADE DISPONÍVEL';
  } else {
    cellOpState = 'SEM CAPACIDADE OPERACIONAL';
  }

  // Handlers for confirm, cancel and delete
  const handleExecuteConfirm = async (alloc: PlanningAllocationDTO) => {
    if (!onConfirmAllocation) return;
    setActionLoadingId(alloc.id);
    setActionError(null);
    try {
      const res = await onConfirmAllocation(alloc.id, alloc.version);
      if (res && !res.success) {
        if (res.status === 409 || res.isConflict) {
          setActionError('Conflito de concorrência: A alocação foi alterada por outro utilizador. Por favor feche e reabra o detalhe para obter os dados mais recentes.');
        } else {
          setActionError(res.error || 'Erro ao confirmar a alocação.');
        }
      }
    } catch (err: any) {
      setActionError(err?.message || 'Erro inesperado ao confirmar.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExecuteCancel = async () => {
    if (!confirmCancelAlloc || !onCancelAllocation) return;
    setActionLoadingId(confirmCancelAlloc.id);
    setActionError(null);
    try {
      const res = await onCancelAllocation(confirmCancelAlloc.id, confirmCancelAlloc.version);
      if (res && !res.success) {
        if (res.status === 409 || res.isConflict) {
          setActionError('Conflito de concorrência: A alocação foi alterada por outro utilizador. Por favor feche e reabra o detalhe para obter os dados mais recentes.');
        } else {
          setActionError(res.error || 'Erro ao cancelar a alocação.');
        }
      } else {
        setConfirmCancelAlloc(null);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Erro inesperado ao cancelar.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExecuteDelete = async () => {
    if (!confirmDeleteAlloc || !onDeleteAllocation) return;
    setActionLoadingId(confirmDeleteAlloc.id);
    setActionError(null);
    try {
      const res = await onDeleteAllocation(confirmDeleteAlloc.id);
      if (res && !res.success) {
        setActionError(res.error || 'Erro ao eliminar o rascunho.');
      } else {
        setConfirmDeleteAlloc(null);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Erro inesperado ao eliminar.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Compact operational status badge & text (FASE 23E-C3M-A - Multi-sensory, zero color exclusivity)
  const getOperationalStatusInfo = () => {
    switch (cellOpState) {
      case 'EXCESSO CONFIRMADO':
        return {
          label: 'EXCESSO',
          badgeText: 'EXCESSO CONFIRMADO',
          colorClass: 'bg-rose-100 text-rose-900 border-rose-300 ring-1 ring-rose-300/60',
          bannerClass: 'bg-rose-50 border-rose-300 text-rose-950',
          icon: AlertTriangle,
          description: 'Excesso de planeamento confirmado (requer intervenção)',
        };
      case 'SEM CAPACIDADE':
        return {
          label: 'SEM CAPACIDADE',
          badgeText: 'SEM CAPACIDADE',
          colorClass: 'bg-rose-100/90 text-rose-900 border-dashed border-rose-300',
          bannerClass: 'bg-rose-50/80 border-dashed border-rose-300 text-rose-900',
          icon: AlertCircle,
          description: 'Alocações registadas em dia sem capacidade operacional (0h)',
        };
      case 'DRAFT PENDENTE':
        return {
          label: 'DRAFT',
          badgeText: 'DRAFT PENDENTE',
          colorClass: 'bg-amber-100 text-amber-950 border-dashed border-amber-300',
          bannerClass: 'bg-amber-50 border-dashed border-amber-300 text-amber-950',
          icon: Clock,
          description: 'Planeamento em rascunho pendente de confirmação',
        };
      case 'CAPACIDADE TOTALMENTE OCUPADA':
        return {
          label: '100%',
          badgeText: 'CAPACIDADE TOTALMENTE OCUPADA',
          colorClass: 'bg-blue-100 text-blue-900 border-blue-300',
          bannerClass: 'bg-blue-50 border-blue-200 text-blue-950',
          icon: CheckCircle2,
          description: 'Capacidade diária 100% ocupada sem excesso',
        };
      case 'CAPACIDADE DISPONÍVEL':
        return {
          label: 'DISPONÍVEL',
          badgeText: 'CAPACIDADE DISPONÍVEL',
          colorClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          bannerClass: 'bg-emerald-50 border-emerald-200 text-emerald-950',
          icon: CheckCircle2,
          description: 'Existe capacidade diária livre para trabalho adicional',
        };
      case 'SEM CAPACIDADE OPERACIONAL':
      default:
        return {
          label: 'SEM CAPACIDADE',
          badgeText: 'SEM CAPACIDADE OPERACIONAL',
          colorClass: 'bg-slate-100 text-slate-700 border-slate-300',
          bannerClass: 'bg-slate-50 border-slate-200 text-slate-700',
          icon: AlertCircle,
          description: 'Dia não útil ou sem capacidade operacional configurada',
        };
    }
  };

  const statusInfo = getOperationalStatusInfo();

  // Portuguese date formatting (Requirement 2)
  const formatDateHeader = (dStr: string) => {
    try {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const wDay = weekdays[d.getDay()];
        const dayNum = d.getDate();
        const monthName = months[d.getMonth()];
        const year = d.getFullYear();
        return `${wDay}, ${dayNum} de ${monthName} de ${year}`;
      }
    } catch {
      // fallback
    }
    return dStr;
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Check existing warnings (Requirement 8)
  const contextWarnings: string[] = [];
  if (excessMinutes > 0) {
    contextWarnings.push(`Excesso de planeamento: a carga confirmada (${formatHoursDisplay(confirmedMinutes / 60)}) excede a capacidade diária (${formatHoursDisplay(capacityMinutes / 60)}) em ${formatHoursDisplay(excessMinutes / 60)}.`);
  }
  if (isZeroCap) {
    contextWarnings.push('O recurso encontra-se sem capacidade operacional (0h) configurada para este dia.');
  }
  const resourceAbsence = userAbsences.find(
    abs => abs.userId === resource.id && dateStr >= abs.absenceStartDate && dateStr <= abs.absenceEndDate
  );
  if (resourceAbsence) {
    contextWarnings.push(`Ausência registada para este recurso (${resourceAbsence.reason || 'Ausência/Férias'}) no período.`);
  }

  // Visual summary bar calculation (Requirement 4)
  const totalBarBase = Math.max(capacityMinutes, plannedMinutes, 1);
  const confirmedBarPct = Math.min(100, (confirmedMinutes / totalBarBase) * 100);
  const draftBarPct = Math.min(100 - confirmedBarPct, (draftMinutes / totalBarBase) * 100);
  const freeBarPct = Math.max(0, 100 - confirmedBarPct - draftBarPct);

  return (
    <div 
      id="resource-day-detail-overlay"
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        id="resource-day-detail-modal"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/90 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              {getInitials(resource.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-slate-900 truncate">
                  {resource.name}
                </h3>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusInfo.colorClass}`}>
                  {React.createElement(statusInfo.icon, { className: 'w-3 h-3 shrink-0' })}
                  <span>{statusInfo.badgeText}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-1 flex-wrap">
                <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="text-slate-800 font-bold capitalize">{formatDateHeader(dateStr)}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{resource.email || resource.type}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canWriteCalendar && (
              <button
                id="btn-day-detail-new-allocation"
                type="button"
                onClick={() => onNewAllocation(resource.id, dateStr)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                aria-label={`Criar nova alocação para ${resource.name} em ${dateStr}`}
              >
                <Plus className="w-4 h-4" />
                Nova Alocação
              </button>
            )}
            <button
              id="btn-day-detail-close"
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
              aria-label="Fechar janela"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Action Error Alert */}
          {actionError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start justify-between gap-3 text-xs text-rose-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Erro na Operação:</span> {actionError}
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setActionError(null)}
                className="text-rose-500 hover:text-rose-800 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Operational Status Banner */}
          <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${statusInfo.bannerClass}`}>
            <div className="flex items-center gap-2.5">
              {React.createElement(statusInfo.icon, { className: 'w-4 h-4 shrink-0' })}
              <div>
                <span className="font-extrabold uppercase tracking-wide mr-1.5">[{statusInfo.badgeText}]</span>
                <span className="font-medium">{statusInfo.description}</span>
              </div>
            </div>
            <div className="text-[11px] font-mono font-bold text-slate-600 shrink-0">
              {dateStr}
            </div>
          </div>

          {/* Context Warnings */}
          {contextWarnings.length > 0 && (
            <div className="space-y-2">
              {contextWarnings.map((warn, idx) => (
                <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="font-medium">
                    <span className="font-bold">Aviso Operacional: </span>
                    {warn}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Daily Capacity & Planning Summary Cards (Canonical metrics, no artificial hour grid) */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider font-extrabold text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Resumo Diário Operacional
              </div>
              <div className="text-xs font-bold text-slate-600">
                Utilização: <span className="font-extrabold text-slate-900">{utilizationPercent !== null ? `${utilizationPercent}%` : 'N/A'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              {/* Capacidade */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-3 text-center shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Capacidade
                </span>
                <span className={`text-base font-black mt-1 block ${isZeroCap ? 'text-slate-400' : 'text-slate-900'}`}>
                  {isZeroCap ? '0h (Indisp.)' : formatHoursDisplay(capacityMinutes / 60)}
                </span>
              </div>

              {/* Confirmado */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-3 text-center shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  CONFIRMED
                </span>
                <span className="text-base font-black text-blue-700 mt-1 block">
                  {formatHoursDisplay(confirmedMinutes / 60)}
                </span>
              </div>

              {/* DRAFT */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-3 text-center shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  DRAFT
                </span>
                <span className={`text-base font-black mt-1 block ${draftMinutes > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {formatHoursDisplay(draftMinutes / 60)}
                </span>
              </div>

              {/* Planeado */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-3 text-center shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Planeado
                </span>
                <span className="text-base font-black text-slate-900 mt-1 block">
                  {formatHoursDisplay(plannedMinutes / 60)}
                </span>
              </div>

              {/* Livre */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-3 text-center shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Livre
                </span>
                <span className={`text-base font-black mt-1 block ${
                  freeCapacityMinutes > 0 ? 'text-emerald-700' : 'text-slate-400'
                }`}>
                  {formatHoursDisplay(freeCapacityMinutes / 60)}
                </span>
              </div>

              {/* Excesso */}
              <div className={`rounded-xl p-3 text-center border shadow-2xs ${
                isOverCapacity 
                  ? 'bg-rose-50 border-rose-300 text-rose-900 ring-1 ring-rose-200' 
                  : 'bg-white border-slate-200/90 text-slate-400'
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  Excesso
                </span>
                <span className={`text-base font-black mt-1 block ${
                  isOverCapacity ? 'text-rose-700' : 'text-slate-400'
                }`}>
                  {isOverCapacity ? `+${formatHoursDisplay(excessMinutes / 60)}` : '0h'}
                </span>
              </div>
            </div>

            {/* Visual Capacity Summary Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[11px] font-bold text-slate-600">
                <span>Distribuição da Carga Diária</span>
                <span>Capacidade Total: {formatHoursDisplay(capacityMinutes / 60)}</span>
              </div>
              <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                {confirmedBarPct > 0 && (
                  <div 
                    style={{ width: `${confirmedBarPct}%` }} 
                    className="bg-blue-600 h-full transition-all" 
                    title={`Confirmado: ${formatHoursDisplay(confirmedMinutes / 60)}`}
                  />
                )}
                {draftBarPct > 0 && (
                  <div 
                    style={{ width: `${draftBarPct}%` }} 
                    className="bg-amber-400 h-full transition-all" 
                    title={`Rascunho (Draft): ${formatHoursDisplay(draftMinutes / 60)}`}
                  />
                )}
                {freeBarPct > 0 && (
                  <div 
                    style={{ width: `${freeBarPct}%` }} 
                    className="bg-emerald-500 h-full transition-all" 
                    title={`Livre: ${formatHoursDisplay(freeCapacityMinutes / 60)}`}
                  />
                )}
              </div>
              <div className="flex items-center gap-4 text-[10px] font-semibold text-slate-500 pt-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Confirmado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Rascunho (Draft)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Capacidade Livre
                </span>
              </div>
            </div>
          </div>

          {/* Planned Work List for the Day (Trabalho do Dia - FASE 23E-C3M-C Agrupamento por Tarefa) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="text-xs uppercase tracking-wider font-extrabold text-slate-800 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-600" />
                Trabalho do Dia ({taskGroups.length} tarefa{taskGroups.length === 1 ? '' : 's'} · {activeAllocations.length} alocação{activeAllocations.length === 1 ? '' : 'ões'})
              </div>
              {cancelledAllocations.length > 0 && (
                <span className="text-xs font-semibold text-slate-400">
                  {cancelledAllocations.length} cancelada(s)
                </span>
              )}
            </div>

            {taskGroups.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
                <Clock className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="text-sm font-bold text-slate-800">
                  Nenhum trabalho planeado para este técnico nesta data
                </div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Este recurso não tem trabalho planeado nem alocações ativas registadas para o dia selecionado.
                </p>
                {canWriteCalendar && (
                  <button
                    type="button"
                    onClick={() => onNewAllocation(resource.id, dateStr)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer mt-1"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Alocação
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {taskGroups.map(group => {
                  const task = group.task;
                  const project = group.project;
                  const taskStatus = taskStatuses?.find(s => s.id === task?.statusId);
                  const taskAssignees = task?.assigneeIds 
                    ? users.filter(u => task.assigneeIds.includes(u.id))
                    : [];
                  const isResourceAssignee = (task?.assigneeIds || []).includes(resource.id);

                  return (
                    <div
                      key={group.taskId}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 shadow-2xs transition-all space-y-3.5"
                    >
                      {/* Header da Tarefa: Projeto, Nome da Tarefa, Status Contextual e Botão "Ver Tarefa" */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Projeto e Estado da Tarefa (Contexto) */}
                          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                            <div className="flex items-center gap-1.5 font-extrabold text-slate-700 uppercase tracking-wide text-[11px]">
                              <Briefcase className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>{project ? project.title : 'Projeto não associado'}</span>
                            </div>
                            {taskStatus && (
                              <span 
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold border"
                                style={{
                                  backgroundColor: taskStatus.color ? `${taskStatus.color}15` : '#f1f5f9',
                                  color: taskStatus.color || '#334155',
                                  borderColor: taskStatus.color ? `${taskStatus.color}40` : '#cbd5e1'
                                }}
                              >
                                {taskStatus.name}
                              </span>
                            )}
                          </div>

                          {/* Nome / Título da Tarefa */}
                          <h4 className="text-sm font-black text-slate-900 leading-tight">
                            {task ? task.title : 'Tarefa não especificada'}
                          </h4>
                        </div>

                        {/* Ação: Ver Tarefa (Fecha o modal diário e abre o TaskDetailsModal) */}
                        {task && (
                          <button
                            type="button"
                            id={`btn-view-task-${task.id}`}
                            onClick={() => {
                              onClose();
                              onViewTask(task);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 self-start"
                            title="Ver detalhes da tarefa"
                            aria-label={`Ver detalhes da tarefa ${task.title}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Ver tarefa</span>
                          </button>
                        )}
                      </div>

                      {/* Resumo de Horas do Dia para a Tarefa (Secção 4 & 12 do Caderno) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {group.hasConfirmed && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                            <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider">CONFIRMADO</span>
                            <span className="font-black text-blue-900">{formatHoursDisplay(group.confirmedHours)}</span>
                          </div>
                        )}

                        {group.hasDraft && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 border-dashed text-xs">
                            <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">DRAFT</span>
                            <span className="font-black text-amber-900">{formatHoursDisplay(group.draftHours)}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs">
                          <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">PLANEADO</span>
                          <span className="font-black text-slate-900">{formatHoursDisplay(group.plannedHours)}</span>
                        </div>
                      </div>

                      {/* Contexto de Pessoas: Técnico Planeado vs Responsável da Tarefa (Secção 8 do Caderno) */}
                      <div className="flex items-center gap-2.5 text-[11px] text-slate-600 flex-wrap bg-slate-50/80 p-2 rounded-lg border border-slate-200/70">
                        <div className="inline-flex items-center gap-1 text-slate-800 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                          <span>Técnico: {resource.name}</span>
                          {isResourceAssignee && (
                            <span className="text-[9px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.2 rounded-md ml-0.5">
                              Responsável
                            </span>
                          )}
                        </div>

                        {!isResourceAssignee && taskAssignees.length > 0 && (
                          <>
                            <span className="text-slate-300">•</span>
                            <div className="inline-flex items-center gap-1 text-slate-500">
                              <UserIcon className="w-3 h-3 text-slate-400" />
                              <span>
                                Responsável: <strong className="text-slate-700 font-medium">{taskAssignees.map(u => u.name).join(', ')}</strong>
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Lista de Alocações desta Tarefa no Dia (Secundário com Ações) */}
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                          Alocações ({group.allocations.length})
                        </div>

                        <div className="space-y-1.5">
                          {group.allocations.map(alloc => {
                            const isConfirmed = alloc.status === 'CONFIRMED';
                            const isDraft = alloc.status === 'DRAFT';
                            const durationHours = (alloc.durationMinutes || 0) / 60;

                            return (
                              <div
                                key={alloc.id}
                                className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-colors ${
                                  isConfirmed
                                    ? 'bg-blue-50/40 border-blue-200 hover:bg-blue-50/70'
                                    : 'bg-amber-50/30 border-dashed border-amber-300 hover:bg-amber-50/60'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider ${
                                    isConfirmed
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-amber-200 text-amber-950 border border-amber-300'
                                  }`}>
                                    {isConfirmed ? 'CONFIRMADO' : 'DRAFT'}
                                  </span>

                                  <span className="font-extrabold text-slate-800">
                                    {formatHoursDisplay(durationHours)}
                                  </span>

                                  {/* Horário secundário */}
                                  <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {alloc.startTime.substring(0, 5)}–{alloc.endTime.substring(0, 5)}
                                  </span>
                                </div>

                                {/* Ações da Alocação */}
                                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                                  {isDraft && canWriteCalendar && onConfirmAllocation && (
                                    <button
                                      type="button"
                                      onClick={() => handleExecuteConfirm(alloc)}
                                      disabled={actionLoadingId === alloc.id}
                                      className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                                      aria-label="Confirmar alocação em rascunho"
                                    >
                                      {actionLoadingId === alloc.id ? (
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <Check className="w-3 h-3" />
                                      )}
                                      <span>Confirmar</span>
                                    </button>
                                  )}

                                  {canWriteCalendar && (
                                    <button
                                      type="button"
                                      onClick={() => onEditAllocation(alloc)}
                                      className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                      aria-label="Editar alocação"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Editar</span>
                                    </button>
                                  )}

                                  {isConfirmed && canWriteCalendar && onCancelAllocation && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelAlloc(alloc)}
                                      disabled={actionLoadingId === alloc.id}
                                      className="px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-white hover:bg-amber-50 border border-amber-300 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                                      aria-label="Cancelar alocação confirmada"
                                    >
                                      <Ban className="w-3 h-3" />
                                      <span>Cancelar</span>
                                    </button>
                                  )}

                                  {isDraft && canWriteCalendar && onDeleteAllocation && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteAlloc(alloc)}
                                      disabled={actionLoadingId === alloc.id}
                                      className="px-2.5 py-1 text-[11px] font-bold text-rose-800 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                                      aria-label="Eliminar rascunho"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Eliminar</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3. CANCELLED SECTION */}
            {sortedCancelled.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <div className="text-xs font-bold text-slate-500 px-1 flex items-center justify-between">
                  <span>Histórico / Canceladas no Dia ({sortedCancelled.length})</span>
                </div>
                <div className="space-y-2 opacity-75">
                  {sortedCancelled.map(alloc => {
                    const allocTask = tasks.find(t => t.id === alloc.taskId) || null;
                    const allocProject = projects.find(p => p.id === allocTask?.projectId) || null;
                    const durationHours = (alloc.durationMinutes || 0) / 60;
                    return (
                      <div key={alloc.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">
                              {allocProject?.title || 'Projeto'} / {allocTask?.title || 'Tarefa'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 line-through">
                              CANCELADO
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Duração: {formatHoursDisplay(durationHours)} • Horário: {alloc.startTime.substring(0, 5)}–{alloc.endTime.substring(0, 5)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {allocTask && (
                            <button
                              type="button"
                              id={`btn-alloc-task-${alloc.id}`}
                              onClick={() => {
                                onClose();
                                onViewTask(allocTask);
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-blue-700 hover:bg-white border border-slate-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs bg-white/80"
                              aria-label="Ver detalhes da tarefa associada"
                              title="Ver detalhes da tarefa associada"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Ver Tarefa
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cancel Confirmation Modal */}
        {confirmCancelAlloc && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Cancelar Alocação Confirmada
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Esta alocação deixará de consumir capacidade diária do recurso e passará para o estado histórico CANCELLED.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Recurso:</span>
                  <span className="text-slate-900 font-bold">{resource.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Data:</span>
                  <span className="text-slate-900 font-semibold">{dateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Horário:</span>
                  <span className="text-slate-900 font-semibold">{confirmCancelAlloc.startTime} — {confirmCancelAlloc.endTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Duração:</span>
                  <span className="text-slate-900 font-bold">{formatHoursDisplay((confirmCancelAlloc.durationMinutes || 0) / 60)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmCancelAlloc(null)}
                  disabled={actionLoadingId === confirmCancelAlloc.id}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCancel}
                  disabled={actionLoadingId === confirmCancelAlloc.id}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {actionLoadingId === confirmCancelAlloc.id ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      A cancelar...
                    </>
                  ) : (
                    <>
                      <Ban className="w-3.5 h-3.5" />
                      Confirmar Cancelamento
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete DRAFT Confirmation Modal */}
        {confirmDeleteAlloc && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-rose-100 text-rose-800 rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Eliminar Rascunho de Planeamento
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Esta alocação em rascunho (DRAFT) será eliminada permanentemente.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Recurso:</span>
                  <span className="text-slate-900 font-bold">{resource.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Data:</span>
                  <span className="text-slate-900 font-semibold">{dateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Duração:</span>
                  <span className="text-slate-900 font-bold">{formatHoursDisplay((confirmDeleteAlloc.durationMinutes || 0) / 60)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAlloc(null)}
                  disabled={actionLoadingId === confirmDeleteAlloc.id}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDelete}
                  disabled={actionLoadingId === confirmDeleteAlloc.id}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {actionLoadingId === confirmDeleteAlloc.id ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      A eliminar...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar Rascunho
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/90 flex items-center justify-between">
          <div className="text-xs font-medium text-slate-500">
            {dayAllocations.length} alocação(ões) registada(s) para este dia.
          </div>
          <button
            id="btn-day-detail-dismiss"
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
            aria-label="Fechar janela"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
