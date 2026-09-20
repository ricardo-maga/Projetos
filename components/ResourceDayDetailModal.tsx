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
import { User, Task, Project, UserAbsence } from '../lib/types';
import { 
  PlanningAllocationDTO, 
  ResourceCapacityDetail, 
  ResourceLoadSummary 
} from '../lib/planning/types';
import { formatHoursDisplay } from '../lib/planning/summary';

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

  // Compact operational status badge & text (Requirement 5)
  const getOperationalStatusInfo = (): { label: string; colorClass: string; description: string } => {
    if (isZeroCap) {
      return { 
        label: 'Sem capacidade', 
        colorClass: 'bg-slate-100 text-slate-700 border-slate-300',
        description: 'Sem capacidade operacional'
      };
    }
    if (excessMinutes > 0) {
      return { 
        label: 'Excesso', 
        colorClass: 'bg-amber-100 text-amber-900 border-amber-300',
        description: 'Excesso de planeamento'
      };
    }
    if (draftMinutes > 0) {
      return {
        label: 'Pendente',
        colorClass: 'bg-amber-50 text-amber-800 border-amber-200',
        description: 'Planeamento pendente de confirmação'
      };
    }
    if (freeCapacityMinutes === 0) {
      return { 
        label: 'Ocupação Completa', 
        colorClass: 'bg-blue-50 text-blue-800 border-blue-200',
        description: 'Capacidade totalmente ocupada'
      };
    }
    return { 
      label: 'Disponível', 
      colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      description: 'Capacidade disponível'
    };
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
        {/* Header (Requirement 2) */}
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
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusInfo.colorClass}`}>
                  {statusInfo.description}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
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
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                aria-label="Criar nova alocação para este recurso e dia"
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

          {/* Context Warnings (Requirement 8) */}
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

          {/* Capacity Metrics Cards (Requirement 2 & 4) */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider font-extrabold text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Resumo Operacional de Capacidade Diária
              </div>
              <div className="text-xs font-bold text-slate-700">
                Data: <span className="font-mono text-slate-900">{dateStr}</span>
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
                  Confirmado
                </span>
                <span className="text-base font-black text-blue-700 mt-1 block">
                  {formatHoursDisplay(confirmedMinutes / 60)}
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
                {draftMinutes > 0 && (
                  <span className="text-[9px] text-amber-700 font-bold block mt-0.5">
                    ({formatHoursDisplay(draftMinutes / 60)} draft)
                  </span>
                )}
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
                  ? 'bg-amber-50 border-amber-300 text-amber-900' 
                  : 'bg-white border-slate-200/90 text-slate-400'
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  Excesso
                </span>
                <span className={`text-base font-black mt-1 block ${
                  isOverCapacity ? 'text-amber-900' : 'text-slate-400'
                }`}>
                  {isOverCapacity ? `+${formatHoursDisplay(excessMinutes / 60)}` : '0h'}
                </span>
              </div>

              {/* Utilização */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-3 text-center shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Utilização
                </span>
                <span className={`text-base font-black mt-1 block ${
                  utilizationPercent === null 
                    ? 'text-slate-400' 
                    : utilizationPercent > 100 
                    ? 'text-amber-900' 
                    : utilizationPercent >= 90 
                    ? 'text-blue-900' 
                    : 'text-slate-900'
                }`}>
                  {utilizationPercent !== null ? `${utilizationPercent}%` : 'N/A'}
                </span>
              </div>
            </div>

            {/* Visual Capacity Summary Bar (Requirement 4) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[11px] font-bold text-slate-600">
                <span>Distribuição de Carga</span>
                <span>Capacidade Total: {formatHoursDisplay(capacityMinutes / 60)}</span>
              </div>
              <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
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

          {/* Allocations Sections (Requirement 3 & 6 & 7) */}
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="text-xs uppercase tracking-wider font-extrabold text-slate-700 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Alocações do Dia ({activeAllocations.length} ativas)
              </div>
              {cancelledAllocations.length > 0 && (
                <span className="text-xs font-semibold text-slate-400">
                  {cancelledAllocations.length} cancelada(s)
                </span>
              )}
            </div>

            {dayAllocations.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
                <Clock className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="text-sm font-bold text-slate-800">
                  Nenhuma alocação registada para este técnico nesta data
                </div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Este recurso não tem reservas de capacidade para o dia selecionado. Pode criar uma nova alocação utilizando o botão abaixo.
                </p>
                {canWriteCalendar && (
                  <button
                    type="button"
                    onClick={() => onNewAllocation(resource.id, dateStr)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer mt-1"
                  >
                    <Plus className="w-4 h-4" />
                    Criar Alocação
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. CONFIRMED SECTION */}
                {sortedConfirmed.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-blue-900 bg-blue-50/80 px-3 py-1.5 rounded-xl border border-blue-200">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      <span>Alocações Confirmadas ({sortedConfirmed.length})</span>
                    </div>

                    <div className="space-y-2">
                      {sortedConfirmed.map(alloc => {
                        const allocTask = tasks.find(t => t.id === alloc.taskId) || (alloc.task ? {
                          id: alloc.task.id,
                          title: alloc.task.title,
                          projectId: alloc.task.projectId || '',
                          assigneeIds: [],
                          statusId: '',
                          estimatedDate: '',
                          description: '',
                          estimatedHours: '0',
                          actualHours: '0',
                          startDate: '',
                          startTime: '',
                          endDate: '',
                          endTime: '',
                          notes: '',
                          deleted: false,
                          createdDate: '',
                        } as Task : null);

                        const allocProject = projects.find(p => p.id === allocTask?.projectId) || null;
                        const durationHours = (alloc.durationMinutes || 0) / 60;

                        // Assignee lookup (Resource vs Assignee distinction - Requirement 7)
                        const taskAssignees = allocTask?.assigneeIds 
                          ? users.filter(u => allocTask.assigneeIds.includes(u.id))
                          : [];

                        return (
                          <div
                            key={alloc.id}
                            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 shadow-2xs transition-all space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg">
                                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                                    {alloc.startTime.substring(0, 5)} — {alloc.endTime.substring(0, 5)}
                                  </span>
                                  <span className="text-xs font-bold text-slate-600">
                                    ({formatHoursDisplay(durationHours)})
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black border bg-emerald-50 text-emerald-800 border-emerald-200">
                                    CONFIRMADO
                                  </span>
                                </div>

                                {/* Task Hierarchy: Project -> Task -> Assignee -> Planned Resource (Requirement 7) */}
                                <div className="text-xs space-y-1">
                                  <div className="flex items-center gap-1.5 text-slate-500">
                                    <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="font-bold text-slate-700">
                                      {allocProject ? allocProject.title : 'Projeto não associado'}
                                    </span>
                                  </div>

                                  <div className="text-sm font-black text-slate-900">
                                    {allocTask ? allocTask.title : 'Tarefa não especificada'}
                                  </div>

                                  <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-600 flex-wrap">
                                    <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                      <UserIcon className="w-3 h-3 text-slate-400" />
                                      <strong>Responsável (Assignee):</strong> {taskAssignees.length > 0 ? taskAssignees.map(u => u.name).join(', ') : 'Não atribuído'}
                                    </span>
                                    <span className="inline-flex items-center gap-1 bg-blue-50/60 px-2 py-0.5 rounded border border-blue-200 text-blue-900 font-bold">
                                      <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                      <strong>Recurso Planeado:</strong> {resource.name}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons (Requirement 9) */}
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                                {allocTask && (
                                  <button
                                    type="button"
                                    onClick={() => onViewTask(allocTask)}
                                    className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                    aria-label="Ver detalhes da tarefa"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Ver Tarefa
                                  </button>
                                )}

                                {canWriteCalendar && (
                                  <button
                                    type="button"
                                    onClick={() => onEditAllocation(alloc)}
                                    className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                    aria-label="Editar alocação"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Editar
                                  </button>
                                )}

                                {canWriteCalendar && onCancelAllocation && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelAlloc(alloc)}
                                    disabled={actionLoadingId === alloc.id}
                                    className="px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                                    aria-label="Cancelar alocação confirmada"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    Cancelar
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. DRAFT SECTION */}
                {sortedDraft.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Alocações em Rascunho / Pendentes (Draft) ({sortedDraft.length})</span>
                    </div>

                    <div className="space-y-2">
                      {sortedDraft.map(alloc => {
                        const allocTask = tasks.find(t => t.id === alloc.taskId) || (alloc.task ? {
                          id: alloc.task.id,
                          title: alloc.task.title,
                          projectId: alloc.task.projectId || '',
                          assigneeIds: [],
                          statusId: '',
                          estimatedDate: '',
                          description: '',
                          estimatedHours: '0',
                          actualHours: '0',
                          startDate: '',
                          startTime: '',
                          endDate: '',
                          endTime: '',
                          notes: '',
                          deleted: false,
                          createdDate: '',
                        } as Task : null);

                        const allocProject = projects.find(p => p.id === allocTask?.projectId) || null;
                        const durationHours = (alloc.durationMinutes || 0) / 60;

                        const taskAssignees = allocTask?.assigneeIds 
                          ? users.filter(u => allocTask.assigneeIds.includes(u.id))
                          : [];

                        return (
                          <div
                            key={alloc.id}
                            className="p-4 rounded-xl border border-amber-200 bg-amber-50/30 hover:border-amber-300 shadow-2xs transition-all space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-amber-200">
                                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                                    {alloc.startTime.substring(0, 5)} — {alloc.endTime.substring(0, 5)}
                                  </span>
                                  <span className="text-xs font-bold text-slate-600">
                                    ({formatHoursDisplay(durationHours)})
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black border bg-amber-100 text-amber-900 border-amber-300">
                                    RASCUNHO (DRAFT)
                                  </span>
                                </div>

                                <div className="text-xs space-y-1">
                                  <div className="flex items-center gap-1.5 text-slate-500">
                                    <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="font-bold text-slate-700">
                                      {allocProject ? allocProject.title : 'Projeto não associado'}
                                    </span>
                                  </div>

                                  <div className="text-sm font-black text-slate-900">
                                    {allocTask ? allocTask.title : 'Tarefa não especificada'}
                                  </div>

                                  <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-600 flex-wrap">
                                    <span className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-200">
                                      <UserIcon className="w-3 h-3 text-slate-400" />
                                      <strong>Responsável (Assignee):</strong> {taskAssignees.length > 0 ? taskAssignees.map(u => u.name).join(', ') : 'Não atribuído'}
                                    </span>
                                    <span className="inline-flex items-center gap-1 bg-amber-100/60 px-2 py-0.5 rounded border border-amber-200 text-amber-900 font-bold">
                                      <AlertCircle className="w-3 h-3 text-amber-600" />
                                      <strong>Recurso Planeado:</strong> {resource.name}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons (Requirement 9) */}
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                                {allocTask && (
                                  <button
                                    type="button"
                                    onClick={() => onViewTask(allocTask)}
                                    className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs bg-white"
                                    aria-label="Ver detalhes da tarefa"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Ver Tarefa
                                  </button>
                                )}

                                {canWriteCalendar && onConfirmAllocation && (
                                  <button
                                    type="button"
                                    onClick={() => handleExecuteConfirm(alloc)}
                                    disabled={actionLoadingId === alloc.id}
                                    className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                                    aria-label="Confirmar alocação em rascunho"
                                  >
                                    {actionLoadingId === alloc.id ? (
                                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5" />
                                    )}
                                    Confirmar
                                  </button>
                                )}

                                {canWriteCalendar && (
                                  <button
                                    type="button"
                                    onClick={() => onEditAllocation(alloc)}
                                    className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                    aria-label="Editar rascunho"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Editar
                                  </button>
                                )}

                                {canWriteCalendar && onDeleteAllocation && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteAlloc(alloc)}
                                    disabled={actionLoadingId === alloc.id}
                                    className="px-3 py-1.5 text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                                    aria-label="Eliminar rascunho"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Eliminar
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. CANCELLED SECTION */}
                {sortedCancelled.length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-bold text-slate-500 px-1">
                      Alocações Canceladas no Dia ({sortedCancelled.length})
                    </div>
                    <div className="space-y-2 opacity-75">
                      {sortedCancelled.map(alloc => {
                        const allocTask = tasks.find(t => t.id === alloc.taskId) || null;
                        const allocProject = projects.find(p => p.id === allocTask?.projectId) || null;
                        return (
                          <div key={alloc.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs flex items-center justify-between gap-3">
                            <div>
                              <span className="font-bold text-slate-500 line-through">
                                {alloc.startTime.substring(0, 5)} — {alloc.endTime.substring(0, 5)}
                              </span>
                              <span className="mx-2 text-slate-400">•</span>
                              <span className="text-slate-600 font-semibold">{allocProject?.title || 'Projeto'} / {allocTask?.title || 'Tarefa'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {allocTask && (
                                <button
                                  type="button"
                                  id={`btn-alloc-task-${alloc.id}`}
                                  onClick={() => onViewTask(allocTask)}
                                  className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-blue-700 hover:bg-white border border-slate-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs bg-white/80"
                                  aria-label="Ver detalhes da tarefa associada"
                                  title="Ver detalhes da tarefa associada"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Ver Tarefa
                                </button>
                              )}
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 line-through">
                                CANCELADO
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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
