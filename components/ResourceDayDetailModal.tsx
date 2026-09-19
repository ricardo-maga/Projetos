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
  FileText
} from 'lucide-react';
import { User, Task, Project } from '../lib/types';
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
  onNewAllocation: (resourceId: string, dateStr: string) => void;
  onEditAllocation: (allocation: PlanningAllocationDTO) => void;
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
  onNewAllocation,
  onEditAllocation,
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

  // Separate active vs cancelled
  const activeAllocations = dayAllocations.filter(a => a.status !== 'CANCELLED');
  const confirmedAllocations = dayAllocations.filter(a => a.status === 'CONFIRMED');
  const draftAllocations = dayAllocations.filter(a => a.status === 'DRAFT');
  const cancelledAllocations = dayAllocations.filter(a => a.status === 'CANCELLED');

  // Math calculations respecting FASE 23D-C formulas
  const capacityMinutes = capacityDetail 
    ? capacityDetail.operationalCapacityMinutes 
    : 480;

  const confirmedMinutes = confirmedAllocations.reduce(
    (acc, a) => acc + (a.durationMinutes || 0), 
    0
  );

  const draftMinutes = draftAllocations.reduce(
    (acc, a) => acc + (a.durationMinutes || 0), 
    0
  );

  // Planned = DRAFT + CONFIRMED
  const plannedMinutes = confirmedMinutes + draftMinutes;

  // Free Capacity = Capacity - CONFIRMED
  const freeCapacityMinutes = Math.max(0, capacityMinutes - confirmedMinutes);

  // Excess = max(0, Planned - Capacity)
  const excessMinutes = Math.max(0, plannedMinutes - capacityMinutes);

  // Utilization = CONFIRMED / Capacity
  const utilizationPercent = capacityMinutes > 0
    ? Math.round((confirmedMinutes / capacityMinutes) * 1000) / 10
    : null;

  const isZeroCap = capacityMinutes === 0;
  const isOverCapacity = excessMinutes > 0;

  // Handlers for cancel and delete
  const handleExecuteCancel = async () => {
    if (!confirmCancelAlloc || !onCancelAllocation) return;
    setActionLoadingId(confirmCancelAlloc.id);
    setActionError(null);
    try {
      const res = await onCancelAllocation(confirmCancelAlloc.id, confirmCancelAlloc.version);
      if (res && !res.success) {
        setActionError(res.error || 'Erro ao cancelar a alocação.');
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

  // Availability categorical determination (server-aligned)
  const getAvailabilityStatus = (): { label: string; colorClass: string } => {
    if (isZeroCap) {
      return { 
        label: 'Indisponível', 
        colorClass: 'bg-slate-100 text-slate-600 border-slate-300' 
      };
    }
    if (freeCapacityMinutes === 0) {
      return { 
        label: 'Ocupação Completa', 
        colorClass: 'bg-blue-50 text-blue-700 border-blue-200' 
      };
    }
    if (confirmedMinutes > 0) {
      return { 
        label: 'Parcialmente Disponível', 
        colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' 
      };
    }
    return { 
      label: 'Totalmente Disponível', 
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' 
    };
  };

  const availability = getAvailabilityStatus();

  // Format date display
  const formatDateHeader = (dStr: string) => {
    try {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('pt-PT', { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric' 
        });
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

  return (
    <div 
      id="resource-day-detail-overlay"
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        id="resource-day-detail-modal"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              {getInitials(resource.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800 truncate">
                  {resource.name}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${availability.colorClass}`}>
                  {availability.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 capitalize flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {formatDateHeader(dateStr)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canWriteCalendar && (
              <button
                id="btn-day-detail-new-allocation"
                type="button"
                onClick={() => onNewAllocation(resource.id, dateStr)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova Alocação
              </button>
            )}
            <button
              id="btn-day-detail-close"
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
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
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start justify-between gap-3 text-xs text-rose-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Erro na Operação:</span> {actionError}
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setActionError(null)}
                className="text-rose-500 hover:text-rose-800 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Capacity Metrics Cards */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Resumo Operacional de Capacidade
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              {/* Capacidade Líquida */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Capacidade
                </span>
                <span className={`text-base font-extrabold mt-1 block ${isZeroCap ? 'text-slate-400' : 'text-slate-800'}`}>
                  {isZeroCap ? '0h (Indisp.)' : formatHoursDisplay(capacityMinutes / 60)}
                </span>
              </div>

              {/* Confirmado (Consumo) */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Confirmado
                </span>
                <span className="text-base font-extrabold text-blue-700 mt-1 block">
                  {formatHoursDisplay(confirmedMinutes / 60)}
                </span>
              </div>

              {/* Planeado (DRAFT + CONFIRMED) */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Planeado
                </span>
                <span className="text-base font-extrabold text-slate-800 mt-1 block">
                  {formatHoursDisplay(plannedMinutes / 60)}
                </span>
                {draftMinutes > 0 && (
                  <span className="text-[9px] text-amber-600 font-semibold block mt-0.5">
                    ({formatHoursDisplay(draftMinutes / 60)} rascunho)
                  </span>
                )}
              </div>

              {/* Capacidade Livre */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Livre
                </span>
                <span className={`text-base font-extrabold mt-1 block ${
                  freeCapacityMinutes > 0 ? 'text-emerald-700' : 'text-slate-400'
                }`}>
                  {formatHoursDisplay(freeCapacityMinutes / 60)}
                </span>
              </div>

              {/* Excesso */}
              <div className={`rounded-xl p-3 text-center border ${
                isOverCapacity 
                  ? 'bg-amber-50 border-amber-300 text-amber-900' 
                  : 'bg-slate-50 border-slate-200/80 text-slate-400'
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  Excesso
                </span>
                <span className={`text-base font-extrabold mt-1 block ${
                  isOverCapacity ? 'text-amber-900' : 'text-slate-400'
                }`}>
                  {isOverCapacity ? `+${formatHoursDisplay(excessMinutes / 60)}` : '0h'}
                </span>
              </div>

              {/* Utilização */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Utilização
                </span>
                <span className={`text-base font-extrabold mt-1 block ${
                  utilizationPercent === null 
                    ? 'text-slate-400' 
                    : utilizationPercent > 100 
                    ? 'text-amber-800' 
                    : utilizationPercent >= 90 
                    ? 'text-blue-800' 
                    : 'text-slate-800'
                }`}>
                  {utilizationPercent !== null ? `${utilizationPercent}%` : 'N/A'}
                </span>
              </div>
            </div>

            {/* Over-allocation warning banner */}
            {isOverCapacity && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Aviso de Sobrecarga Planeada: </span>
                  O total planeado ({formatHoursDisplay(plannedMinutes / 60)}) excede a capacidade diária ({formatHoursDisplay(capacityMinutes / 60)}) em {formatHoursDisplay(excessMinutes / 60)}.
                  {draftMinutes > 0 && confirmedMinutes <= capacityMinutes && (
                    <span className="block text-[11px] text-amber-800 mt-0.5">
                      Nota: A carga confirmada não excede a capacidade, mas a inclusão de alocações em rascunho (DRAFT) gera excesso potencial.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Daily Allocations List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Alocações de Trabalho ({activeAllocations.length})
              </div>
              {cancelledAllocations.length > 0 && (
                <span className="text-[11px] text-slate-400">
                  {cancelledAllocations.length} cancelada(s)
                </span>
              )}
            </div>

            {dayAllocations.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-3">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-sm font-semibold text-slate-700">
                  Nenhuma alocação para este técnico nesta data
                </div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Este recurso não tem reservas de capacidade para o dia selecionado. Pode criar uma nova alocação clicando abaixo.
                </p>
                {canWriteCalendar && (
                  <button
                    type="button"
                    onClick={() => onNewAllocation(resource.id, dateStr)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer mt-1"
                  >
                    <Plus className="w-4 h-4" />
                    Criar Alocação
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {dayAllocations.map(alloc => {
                  const allocTask = tasks.find(t => t.id === alloc.taskId) || (alloc.task ? {
                    id: alloc.task.id,
                    title: alloc.task.title,
                    projectId: alloc.task.projectId,
                  } as Task : null);

                  const allocProject = projects.find(p => p.id === allocTask?.projectId) || null;
                  const isAllocCancelled = alloc.status === 'CANCELLED';
                  const isAllocDraft = alloc.status === 'DRAFT';
                  const isAllocConfirmed = alloc.status === 'CONFIRMED';
                  const durationHours = (alloc.durationMinutes || 0) / 60;

                  return (
                    <div
                      key={alloc.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isAllocCancelled
                          ? 'bg-slate-50/70 border-slate-200 text-slate-400 opacity-75'
                          : isAllocDraft
                          ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
                          : 'bg-white border-slate-200 hover:border-blue-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        {/* Allocation Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {alloc.startTime.substring(0, 5)} — {alloc.endTime.substring(0, 5)}
                            </span>
                            <span className="text-xs font-semibold text-slate-600">
                              ({formatHoursDisplay(durationHours)})
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isAllocConfirmed
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isAllocDraft
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200 line-through'
                            }`}>
                              {isAllocConfirmed ? 'CONFIRMADO' : isAllocDraft ? 'RASCUNHO' : 'CANCELADO'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">
                            <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-700 truncate">
                              {allocProject ? allocProject.title : 'Projeto não associado'}
                            </span>
                          </div>

                          <div className="text-sm font-bold text-slate-800 truncate">
                            {allocTask ? allocTask.title : 'Tarefa não especificada'}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                          {allocTask && (
                            <button
                              type="button"
                              onClick={() => {
                                onViewTask(allocTask);
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              title="Ver detalhes da tarefa"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Ver Tarefa
                            </button>
                          )}

                          {canWriteCalendar && !isAllocCancelled && (
                            <button
                              type="button"
                              onClick={() => onEditAllocation(alloc)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              title="Editar alocação"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Editar
                            </button>
                          )}

                          {canWriteCalendar && isAllocConfirmed && onCancelAllocation && (
                            <button
                              type="button"
                              onClick={() => setConfirmCancelAlloc(alloc)}
                              disabled={actionLoadingId === alloc.id}
                              className="px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Cancelar alocação confirmada"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Cancelar
                            </button>
                          )}

                          {canWriteCalendar && isAllocDraft && onDeleteAllocation && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAlloc(alloc)}
                              disabled={actionLoadingId === alloc.id}
                              className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Eliminar rascunho de planeamento"
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
            )}
          </div>
        </div>

        {/* Cancel Confirmation Modal */}
        {confirmCancelAlloc && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
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
                  <span className="text-slate-800 font-bold">{resource.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Data:</span>
                  <span className="text-slate-800 font-semibold">{dateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Horário:</span>
                  <span className="text-slate-800 font-semibold">{confirmCancelAlloc.startTime} — {confirmCancelAlloc.endTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Duração:</span>
                  <span className="text-slate-800 font-bold">{formatHoursDisplay((confirmCancelAlloc.durationMinutes || 0) / 60)}</span>
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
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
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
                  <span className="text-slate-800 font-bold">{resource.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Data:</span>
                  <span className="text-slate-800 font-semibold">{dateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Duração:</span>
                  <span className="text-slate-800 font-bold">{formatHoursDisplay((confirmDeleteAlloc.durationMinutes || 0) / 60)}</span>
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
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {dayAllocations.length} alocação(ões) registada(s) para este dia.
          </div>
          <button
            id="btn-day-detail-dismiss"
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
