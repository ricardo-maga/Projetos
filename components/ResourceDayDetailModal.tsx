'use client';

import React, { useState } from 'react';
import { 
  Plus, 
  Calendar, 
  Clock, 
  Briefcase, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink,
  Edit3,
  Ban,
  Trash2,
  AlertTriangle,
  User as UserIcon,
  Check,
  FolderKanban,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { User, Task, Project, UserAbsence, TaskStatus } from '../lib/types';
import { getTaskStatusStyle } from '../lib/utils';
import { 
  PlanningAllocationDTO, 
  ResourceCapacityDetail, 
  ResourceLoadSummary 
} from '../lib/planning/types';
import { 
  formatHoursDisplay, 
  groupResourceDayAllocationsByTask,
  ResourceDayTaskGroup,
  getTaskDailyOperationalStatus,
  computeResourceDayTaskConsistency,
  computeResourceDayProjectDistribution,
  isAllocationOutsideTaskWindow
} from '../lib/planning/summary';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';

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
  canWriteCalendar = true,
}: ResourceDayDetailModalProps) {
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmCancelAlloc, setConfirmCancelAlloc] = useState<PlanningAllocationDTO | null>(null);
  const [confirmDeleteAlloc, setConfirmDeleteAlloc] = useState<PlanningAllocationDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // FASE 23E-C3M-C: Group active allocations by Task (deterministic sorting: CONFIRMED first, then DRAFT, then Project/Task name)
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

  // FASE 23E-C3H: Group active allocations by Project for the daily project distribution
  const projectDistribution = React.useMemo(() => {
    if (!resource || !dateStr) {
      return {
        projects: [],
        totalConfirmedMinutes: 0,
        totalDraftMinutes: 0,
        totalPlannedMinutes: 0,
        totalConfirmedHours: 0,
        totalDraftHours: 0,
        totalPlannedHours: 0,
        isConsistent: true,
      };
    }
    return computeResourceDayProjectDistribution(
      resource.id,
      dateStr,
      allocations,
      tasks,
      projects
    );
  }, [resource, dateStr, allocations, tasks, projects]);

  const toggleProjectExpand = (projId: string) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projId]: !prev[projId],
    }));
  };

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

  // FASE 23E-C3G Consistency check (Secção 9):
  const taskConsistency = computeResourceDayTaskConsistency(
    taskGroups,
    localConfirmedMinutes,
    draftMinutes
  );

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

  // Operational status badge info
  const getOperationalStatusInfo = () => {
    switch (cellOpState) {
      case 'EXCESSO CONFIRMADO':
        return {
          label: 'EXCESSO',
          badgeText: 'EXCESSO CONFIRMADO',
          badgeVariant: 'error' as const,
          cardClass: 'bg-error/5 border-error/20 text-error',
          icon: AlertTriangle,
          description: 'Excesso de planeamento confirmado (requer intervenção)',
        };
      case 'SEM CAPACIDADE':
        return {
          label: 'SEM CAPACIDADE',
          badgeText: 'SEM CAPACIDADE',
          badgeVariant: 'error' as const,
          cardClass: 'bg-error/5 border-dashed border-error/20 text-error',
          icon: AlertCircle,
          description: 'Alocações registadas em dia sem capacidade operacional (0h)',
        };
      case 'DRAFT PENDENTE':
        return {
          label: 'DRAFT',
          badgeText: 'DRAFT PENDENTE',
          badgeVariant: 'warning' as const,
          cardClass: 'bg-warning/5 border-dashed border-warning/20 text-warning',
          icon: Clock,
          description: 'Planeamento em rascunho pendente de confirmação',
        };
      case 'CAPACIDADE TOTALMENTE OCUPADA':
        return {
          label: '100%',
          badgeText: 'CAPACIDADE TOTALMENTE OCUPADA',
          badgeVariant: 'primary' as const,
          cardClass: 'bg-primary/5 border-primary/20 text-primary',
          icon: CheckCircle2,
          description: 'Capacidade diária 100% ocupada sem excesso',
        };
      case 'CAPACIDADE DISPONÍVEL':
        return {
          label: 'DISPONÍVEL',
          badgeText: 'CAPACIDADE DISPONÍVEL',
          badgeVariant: 'success' as const,
          cardClass: 'bg-success/5 border-success/20 text-success',
          icon: CheckCircle2,
          description: 'Existe capacidade diária livre para trabalho adicional',
        };
      case 'SEM CAPACIDADE OPERACIONAL':
      default:
        return {
          label: 'SEM CAPACIDADE',
          badgeText: 'SEM CAPACIDADE OPERACIONAL',
          badgeVariant: 'neutral' as const,
          cardClass: 'bg-surface-muted border-border text-text-secondary',
          icon: AlertCircle,
          description: 'Dia não útil ou sem capacidade operacional configurada',
        };
    }
  };

  const statusInfo = getOperationalStatusInfo();

  // Portuguese date formatting
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

  // Check existing warnings
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

  // Visual summary bar calculation
  const totalBarBase = Math.max(capacityMinutes, plannedMinutes, 1);
  const confirmedBarPct = Math.min(100, (confirmedMinutes / totalBarBase) * 100);
  const draftBarPct = Math.min(100 - confirmedBarPct, (draftMinutes / totalBarBase) * 100);
  const freeBarPct = Math.max(0, 100 - confirmedBarPct - draftBarPct);

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title={resource.name}
        className="max-w-3xl"
      >
        <div id="resource-day-detail-modal" className="space-y-5 text-left -mt-2">
          {/* Resource Context Header Bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap pb-3 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-control bg-primary text-white flex items-center justify-center font-bold text-body-sm shadow-flat shrink-0">
                {getInitials(resource.name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={statusInfo.badgeVariant} className="flex items-center gap-1">
                    {React.createElement(statusInfo.icon, { className: 'w-3 h-3 shrink-0' })}
                    <span>{statusInfo.badgeText}</span>
                  </Badge>
                </div>
                <p className="text-caption text-text-secondary font-medium flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-text-primary font-bold capitalize">{formatDateHeader(dateStr)}</span>
                  <span className="text-text-disabled">•</span>
                  <span className="text-text-muted">{resource.email || resource.type}</span>
                </p>
              </div>
            </div>

            {canWriteCalendar && (
              <Button
                id="btn-day-detail-new-allocation"
                type="button"
                variant="primary"
                size="sm"
                onClick={() => onNewAllocation(resource.id, dateStr)}
                aria-label={`Criar nova alocação para ${resource.name} em ${dateStr}`}
                className="shrink-0"
              >
                <Plus className="w-4 h-4" />
                Nova Alocação
              </Button>
            )}
          </div>

          {/* Action Error Alert */}
          {actionError && (
            <Card className="p-3.5 bg-error/5 border-error/20 flex items-start justify-between gap-3 text-caption text-error">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Erro na Operação:</span> {actionError}
                </div>
              </div>
              <IconButton 
                type="button" 
                variant="ghost"
                size="sm"
                onClick={() => setActionError(null)}
                aria-label="Dispensar erro"
                className="w-6 h-6 p-0 text-error hover:bg-error/10"
              >
                <X className="w-3.5 h-3.5" />
              </IconButton>
            </Card>
          )}

          {/* Operational Status Banner */}
          <Card className={`p-3.5 flex items-center justify-between gap-3 text-caption ${statusInfo.cardClass}`}>
            <div className="flex items-center gap-2.5">
              {React.createElement(statusInfo.icon, { className: 'w-4 h-4 shrink-0' })}
              <div>
                <span className="font-extrabold uppercase tracking-wide mr-1.5">[{statusInfo.badgeText}]</span>
                <span className="font-medium">{statusInfo.description}</span>
              </div>
            </div>
            <div className="text-caption font-mono font-bold text-text-secondary shrink-0">
              {dateStr}
            </div>
          </Card>

          {/* Context Warnings */}
          {contextWarnings.length > 0 && (
            <div className="space-y-2">
              {contextWarnings.map((warn, idx) => (
                <Card key={idx} className="p-3 bg-warning/5 border-warning/20 flex items-start gap-2.5 text-caption text-warning">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div className="font-medium text-text-secondary">
                    <span className="font-bold text-warning">Aviso Operacional: </span>
                    {warn}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Daily Capacity & Planning Summary Cards */}
          <Card className="p-4 space-y-3.5 bg-surface-muted/30 border-border">
            <div className="flex items-center justify-between">
              <div className="text-caption uppercase tracking-wider font-extrabold text-text-secondary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Resumo Diário Operacional
              </div>
              <div className="text-caption font-bold text-text-secondary">
                Utilização: <span className="font-extrabold text-text-primary">{utilizationPercent !== null ? `${utilizationPercent}%` : 'N/A'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              {/* Capacidade */}
              <div className="bg-surface border border-border rounded-control p-3 text-center shadow-flat">
                <span className="text-caption font-bold text-text-muted uppercase tracking-wider block">
                  Capacidade
                </span>
                <span className={`text-body font-black mt-1 block ${isZeroCap ? 'text-text-muted' : 'text-text-primary'}`}>
                  {isZeroCap ? '0h (Indisp.)' : formatHoursDisplay(capacityMinutes / 60)}
                </span>
              </div>

              {/* Confirmado */}
              <div className="bg-surface border border-border rounded-control p-3 text-center shadow-flat">
                <span className="text-caption font-bold text-text-muted uppercase tracking-wider block">
                  CONFIRMED
                </span>
                <span className="text-body font-black text-primary mt-1 block">
                  {formatHoursDisplay(confirmedMinutes / 60)}
                </span>
              </div>

              {/* DRAFT */}
              <div className="bg-surface border border-border rounded-control p-3 text-center shadow-flat">
                <span className="text-caption font-bold text-text-muted uppercase tracking-wider block">
                  DRAFT
                </span>
                <span className={`text-body font-black mt-1 block ${draftMinutes > 0 ? 'text-warning' : 'text-text-muted'}`}>
                  {formatHoursDisplay(draftMinutes / 60)}
                </span>
              </div>

              {/* Planeado */}
              <div className="bg-surface border border-border rounded-control p-3 text-center shadow-flat">
                <span className="text-caption font-bold text-text-muted uppercase tracking-wider block">
                  Planeado
                </span>
                <span className="text-body font-black text-text-primary mt-1 block">
                  {formatHoursDisplay(plannedMinutes / 60)}
                </span>
              </div>

              {/* Livre */}
              <div className="bg-surface border border-border rounded-control p-3 text-center shadow-flat">
                <span className="text-caption font-bold text-text-muted uppercase tracking-wider block">
                  Livre
                </span>
                <span className={`text-body font-black mt-1 block ${
                  freeCapacityMinutes > 0 ? 'text-success' : 'text-text-muted'
                }`}>
                  {formatHoursDisplay(freeCapacityMinutes / 60)}
                </span>
              </div>

              {/* Excesso */}
              <div className={`rounded-control p-3 text-center border shadow-flat ${
                isOverCapacity 
                  ? 'bg-error/5 border-error/30 text-error' 
                  : 'bg-surface border-border text-text-muted'
              }`}>
                <span className="text-caption font-bold uppercase tracking-wider block">
                  Excesso
                </span>
                <span className={`text-body font-black mt-1 block ${
                  isOverCapacity ? 'text-error' : 'text-text-muted'
                }`}>
                  {isOverCapacity ? `+${formatHoursDisplay(excessMinutes / 60)}` : '0h'}
                </span>
              </div>
            </div>

            {/* Visual Capacity Summary Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-caption font-bold text-text-secondary">
                <span>Distribuição da Carga Diária</span>
                <span>Capacidade Total: {formatHoursDisplay(capacityMinutes / 60)}</span>
              </div>
              <div className="h-2.5 w-full bg-surface-muted border border-border rounded-full overflow-hidden flex">
                {confirmedBarPct > 0 && (
                  <div 
                    style={{ width: `${confirmedBarPct}%` }} 
                    className="bg-primary h-full transition-all" 
                    title={`Confirmado: ${formatHoursDisplay(confirmedMinutes / 60)}`}
                  />
                )}
                {draftBarPct > 0 && (
                  <div 
                    style={{ width: `${draftBarPct}%` }} 
                    className="bg-warning h-full transition-all" 
                    title={`Rascunho (Draft): ${formatHoursDisplay(draftMinutes / 60)}`}
                  />
                )}
                {freeBarPct > 0 && (
                  <div 
                    style={{ width: `${freeBarPct}%` }} 
                    className="bg-success h-full transition-all" 
                    title={`Livre: ${formatHoursDisplay(freeCapacityMinutes / 60)}`}
                  />
                )}
              </div>
              <div className="flex items-center gap-4 text-caption font-semibold text-text-muted pt-0.5 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" /> Confirmado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-warning inline-block" /> Rascunho (Draft)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-success inline-block" /> Capacidade Livre
                </span>
              </div>
            </div>
          </Card>

          {/* Planned Work List for the Day */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border pb-3">
              <div>
                <div className="text-label uppercase tracking-wider font-extrabold text-text-primary flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-primary" />
                  <span>Carga do Dia — Tarefas ({taskGroups.length} {taskGroups.length === 1 ? 'tarefa' : 'tarefas'} · {activeAllocations.length} {activeAllocations.length === 1 ? 'alocação ativa' : 'alocações ativas'})</span>
                </div>
                <p className="text-caption text-text-muted font-medium mt-0.5">
                  Distribuição do trabalho de <strong>{resource.name}</strong> em <strong>{formatDateHeader(dateStr)}</strong>
                </p>
              </div>

              {/* Consistency Information */}
              {taskGroups.length > 0 && (
                <div 
                  id="day-task-consistency-badge"
                  className="flex items-center gap-2 bg-surface-muted border border-border px-3 py-1.5 rounded-control text-caption font-semibold text-text-secondary flex-wrap"
                  title="Consistência entre a soma das tarefas e o total do dia"
                >
                  <span className="text-text-muted font-bold uppercase text-caption">Carga distribuída:</span>
                  <span className="font-extrabold text-text-primary">{formatHoursDisplay(taskConsistency.tasksPlannedHours)}</span>
                  <span className="text-text-disabled">•</span>
                  <span className="text-primary font-extrabold">{formatHoursDisplay(taskConsistency.tasksConfirmedHours)} CONF</span>
                  <span className="text-text-disabled">•</span>
                  <span className="text-warning font-extrabold">{formatHoursDisplay(taskConsistency.tasksDraftHours)} DRAFT</span>
                </div>
              )}
            </div>

            {taskGroups.length === 0 ? (
              <Card className="border-dashed border-border p-8 text-center space-y-3 bg-surface-muted/20">
                <Clock className="w-8 h-8 text-text-disabled mx-auto" />
                <div className="text-body-sm font-bold text-text-primary">
                  Nenhum trabalho planeado para este técnico nesta data
                </div>
                <p className="text-caption text-text-muted max-w-sm mx-auto">
                  Este recurso não tem trabalho planeado nem alocações ativas registadas para o dia selecionado.
                </p>
                {canWriteCalendar && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => onNewAllocation(resource.id, dateStr)}
                    className="mt-1"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Alocação
                  </Button>
                )}
              </Card>
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
                  const opStatus = getTaskDailyOperationalStatus(group, allocations);

                  return (
                    <Card
                      key={group.taskId}
                      className="p-4 bg-surface border-border hover:border-primary/40 transition-colors space-y-3.5"
                    >
                      {/* Header da Tarefa: Projeto, Nome da Tarefa, Status Contextual, Estado Operacional e Botão "Ver Tarefa" */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-border pb-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Projeto, Estado da Tarefa e Estado Operacional da Carga */}
                          <div className="flex items-center gap-2 flex-wrap text-caption text-text-secondary">
                            <div className="flex items-center gap-1.5 font-extrabold text-text-primary uppercase tracking-wide">
                              <Briefcase className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span>{project ? project.title : 'Projeto não associado'}</span>
                            </div>
                            {taskStatus && (() => {
                              const tStyle = getTaskStatusStyle(task?.statusId, taskStatuses);
                              return (
                                <Badge variant="neutral">
                                  {tStyle.name}
                                </Badge>
                              );
                            })()}
                            
                            {/* Indicador Operacional da Carga da Tarefa */}
                            <Badge variant="info">
                              {opStatus.label}
                            </Badge>

                            {/* Temporal Window Warning */}
                            {isAllocationOutsideTaskWindow(dateStr, task) && (
                              <Badge variant="warning" className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-warning shrink-0" />
                                <span>⚠ Alocação fora da janela temporal da tarefa</span>
                              </Badge>
                            )}
                          </div>

                          {/* Nome / Título da Tarefa */}
                          <h4 className="text-body-sm font-black text-text-primary leading-tight">
                            {task ? task.title : 'Tarefa não especificada'}
                          </h4>
                        </div>

                        {/* Ação: Ver Tarefa */}
                        {task && (
                          <Button
                            type="button"
                            id={`btn-view-task-${task.id}`}
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              onClose();
                              onViewTask(task);
                            }}
                            title="Ver detalhes da tarefa"
                            aria-label={`Ver detalhes da tarefa ${task.title}`}
                            className="shrink-0 self-start"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Ver tarefa</span>
                          </Button>
                        )}
                      </div>

                      {/* Resumo de Horas do Dia para a Tarefa */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {group.hasConfirmed && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-primary/5 border border-primary/20 text-caption">
                            <span className="font-bold text-primary uppercase tracking-wider">CONFIRMADO</span>
                            <span className="font-black text-primary">{formatHoursDisplay(group.confirmedHours)}</span>
                          </div>
                        )}

                        {group.hasDraft && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-warning/5 border border-warning/20 border-dashed text-caption">
                            <span className="font-bold text-warning uppercase tracking-wider">DRAFT</span>
                            <span className="font-black text-warning">{formatHoursDisplay(group.draftHours)}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-surface-muted border border-border text-caption">
                          <span className="font-bold text-text-secondary uppercase tracking-wider">PLANEADO</span>
                          <span className="font-black text-text-primary">{formatHoursDisplay(group.plannedHours)}</span>
                        </div>

                        {/* Número de alocações da tarefa no dia */}
                        <Badge variant="neutral" className="ml-auto">
                          {group.allocations.length} {group.allocations.length === 1 ? 'alocação' : 'alocações'}
                        </Badge>
                      </div>

                      {/* Contexto de Pessoas: Técnico Planeado vs Responsável da Tarefa */}
                      <div className="flex items-center gap-2.5 text-caption text-text-secondary flex-wrap bg-surface-muted/50 p-2 rounded-control border border-border">
                        <div className="inline-flex items-center gap-1 text-text-primary font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                          <span>Técnico: {resource.name}</span>
                          {isResourceAssignee && (
                            <Badge variant="primary" className="ml-0.5">
                              Responsável
                            </Badge>
                          )}
                        </div>

                        {!isResourceAssignee && taskAssignees.length > 0 && (
                          <>
                            <span className="text-text-disabled">•</span>
                            <div className="inline-flex items-center gap-1 text-text-secondary">
                              <UserIcon className="w-3 h-3 text-text-muted" />
                              <span>
                                Responsável: <strong className="text-text-primary font-medium">{taskAssignees.map(u => u.name).join(', ')}</strong>
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Lista de Alocações desta Tarefa no Dia */}
                      <div className="space-y-1.5 pt-1">
                        <div className="text-caption font-extrabold uppercase text-text-muted tracking-wider">
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
                                className={`p-2.5 rounded-control border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-caption transition-colors ${
                                  isConfirmed
                                    ? 'bg-primary/5 border-primary/20'
                                    : 'bg-warning/5 border-dashed border-warning/20'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <Badge variant={isConfirmed ? 'primary' : 'warning'}>
                                    {isConfirmed ? 'CONFIRMADO' : 'DRAFT'}
                                  </Badge>

                                  <span className="font-extrabold text-text-primary">
                                    {formatHoursDisplay(durationHours)}
                                  </span>

                                  {/* Horário secundário */}
                                  <span className="text-caption font-medium text-text-secondary flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-text-muted" />
                                    {alloc.startTime.substring(0, 5)}–{alloc.endTime.substring(0, 5)}
                                  </span>
                                </div>

                                {/* Ações da Alocação */}
                                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                                  {isDraft && canWriteCalendar && onConfirmAllocation && (
                                    <Button
                                      type="button"
                                      variant="success"
                                      size="sm"
                                      onClick={() => handleExecuteConfirm(alloc)}
                                      disabled={actionLoadingId === alloc.id}
                                      isLoading={actionLoadingId === alloc.id}
                                      aria-label="Confirmar alocação em rascunho"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Confirmar</span>
                                    </Button>
                                  )}

                                  {canWriteCalendar && (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => onEditAllocation(alloc)}
                                      aria-label="Editar alocação"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Editar</span>
                                    </Button>
                                  )}

                                  {isConfirmed && canWriteCalendar && onCancelAllocation && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setConfirmCancelAlloc(alloc)}
                                      disabled={actionLoadingId === alloc.id}
                                      aria-label="Cancelar alocação confirmada"
                                    >
                                      <Ban className="w-3 h-3" />
                                      <span>Cancelar</span>
                                    </Button>
                                  )}

                                  {isDraft && canWriteCalendar && onDeleteAllocation && (
                                    <Button
                                      type="button"
                                      variant="danger"
                                      size="sm"
                                      onClick={() => setConfirmDeleteAlloc(alloc)}
                                      disabled={actionLoadingId === alloc.id}
                                      aria-label="Eliminar rascunho"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Eliminar</span>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* FASE 23E-C3H — Distribuição por Projeto */}
            <div id="section-project-distribution" className="space-y-3 pt-3 border-t border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-label uppercase tracking-wider font-extrabold text-text-primary flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-primary" />
                    <span>Distribuição por Projeto ({projectDistribution.projects.length} {projectDistribution.projects.length === 1 ? 'projeto' : 'projetos'})</span>
                  </h3>
                  <p className="text-caption text-text-muted font-medium mt-0.5">
                    Das horas planeadas deste técnico neste dia, que parte pertence a cada projeto
                  </p>
                </div>

                {projectDistribution.projects.length > 0 && (
                  <div className="flex items-center gap-2 text-caption font-semibold text-text-secondary flex-wrap">
                    <span className="text-caption uppercase font-bold text-text-muted">Total planeado:</span>
                    <span className="font-extrabold text-text-primary">{formatHoursDisplay(projectDistribution.totalPlannedHours)}</span>
                    {isOverCapacity && (
                      <Badge variant="error">
                        Excesso recurso/dia: +{formatHoursDisplay(excessMinutes / 60)}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Inconsistency Warning */}
              {!projectDistribution.isConsistent && (
                <Card className="p-2.5 bg-warning/5 border-warning/20 flex items-center gap-2 text-caption text-warning">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                  <span className="font-medium">Dados de planeamento por projeto com discrepância operacional.</span>
                </Card>
              )}

              {/* Empty State */}
              {projectDistribution.projects.length === 0 ? (
                <Card className="border-dashed border-border p-5 text-center text-caption text-text-muted font-medium bg-surface-muted/20">
                  Sem carga planeada por projeto neste dia.
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {projectDistribution.projects.map(proj => {
                    const isExpanded = Boolean(expandedProjects[proj.projectId]);

                    return (
                      <Card
                        key={proj.projectId}
                        className="border-border bg-surface rounded-control overflow-hidden shadow-flat transition-colors hover:border-primary/40"
                      >
                        {/* Project Card Header (Accessible Expand/Collapse Button) */}
                        <div
                          id={`btn-toggle-project-${proj.projectId}`}
                          onClick={() => toggleProjectExpand(proj.projectId)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleProjectExpand(proj.projectId);
                            }
                          }}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} tarefas do projeto ${proj.projectTitle}`}
                          className="w-full text-left p-3 flex flex-col gap-2 hover:bg-surface-muted/50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <FolderKanban className="w-4 h-4 text-primary shrink-0" />
                              <span className="font-extrabold text-body-sm text-text-primary truncate">
                                {proj.projectTitle}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="primary">
                                {proj.percentageOfPlanned}%
                              </Badge>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-text-muted" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-text-muted" />
                              )}
                            </div>
                          </div>

                          {/* Secondary Metrics */}
                          <div className="flex items-center justify-between gap-2 text-caption text-text-secondary flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-text-primary">
                                {formatHoursDisplay(proj.plannedHours)} planeado
                              </span>
                              <span className="text-text-disabled">•</span>
                              <span className="text-primary font-bold">
                                {formatHoursDisplay(proj.confirmedHours)} CONF
                              </span>
                              {proj.draftHours > 0 && (
                                <>
                                  <span className="text-text-disabled">•</span>
                                  <span className="text-warning font-bold">
                                    {formatHoursDisplay(proj.draftHours)} DRAFT
                                  </span>
                                </>
                              )}
                            </div>

                            <Badge variant="neutral">
                              {proj.taskCount} {proj.taskCount === 1 ? 'tarefa' : 'tarefas'} · {proj.allocationCount} {proj.allocationCount === 1 ? 'alocação' : 'alocações'}
                            </Badge>
                          </div>

                          {/* Complementary Load Bar */}
                          <div className="h-1.5 w-full bg-surface-muted border border-border rounded-full overflow-hidden flex">
                            <div
                              style={{ width: `${Math.min(100, Math.max(0, proj.percentageOfPlanned))}%` }}
                              className="bg-primary h-full rounded-full transition-all"
                            />
                          </div>
                        </div>

                        {/* Expanded Tasks List */}
                        {isExpanded && (
                          <div className="border-t border-border bg-surface-muted/30 p-3 space-y-2">
                            <div className="text-caption font-extrabold uppercase text-text-muted tracking-wider">
                              Tarefas no Projeto ({proj.tasks.length})
                            </div>
                            <div className="space-y-1.5">
                              {proj.tasks.map(t => {
                                const matchedTask = t.task || tasks.find(x => x.id === t.taskId) || null;

                                return (
                                  <div
                                    key={t.taskId}
                                    className="p-2.5 rounded-control border border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-caption hover:border-text-disabled transition-all"
                                  >
                                    <div className="min-w-0 space-y-0.5">
                                      <div className="font-bold text-text-primary truncate">
                                        {t.taskTitle}
                                      </div>
                                      <div className="flex items-center gap-2 text-caption text-text-secondary flex-wrap">
                                        <span className="font-extrabold text-text-primary">
                                          {formatHoursDisplay(t.plannedHours)} planeado
                                        </span>
                                        <span className="text-text-disabled">•</span>
                                        <span className="text-primary font-bold">
                                          {formatHoursDisplay(t.confirmedHours)} CONF
                                        </span>
                                        {t.draftHours > 0 && (
                                          <>
                                            <span className="text-text-disabled">•</span>
                                            <span className="text-warning font-bold">
                                              {formatHoursDisplay(t.draftHours)} DRAFT
                                            </span>
                                          </>
                                        )}
                                        <span className="text-text-disabled">•</span>
                                        <span>
                                          {t.allocationCount} {t.allocationCount === 1 ? 'alocação' : 'alocações'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Action: Ver Tarefa */}
                                    {matchedTask && (
                                      <Button
                                        type="button"
                                        id={`btn-proj-view-task-${t.taskId}`}
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                          onClose();
                                          onViewTask(matchedTask);
                                        }}
                                        aria-label={`Ver detalhes da tarefa ${t.taskTitle}`}
                                        className="shrink-0 self-end sm:self-center"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>Ver tarefa</span>
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. CANCELLED SECTION */}
            {sortedCancelled.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-border">
                <div className="text-caption font-bold text-text-secondary px-1 flex items-center justify-between">
                  <span>Histórico / Canceladas no Dia ({sortedCancelled.length})</span>
                </div>
                <div className="space-y-2 opacity-75">
                  {sortedCancelled.map(alloc => {
                    const allocTask = tasks.find(t => t.id === alloc.taskId) || null;
                    const allocProject = projects.find(p => p.id === allocTask?.projectId) || null;
                    const durationHours = (alloc.durationMinutes || 0) / 60;
                    return (
                      <Card key={alloc.id} className="p-3 bg-surface-muted border-border text-caption flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-text-primary">
                              {allocProject?.title || 'Projeto'} / {allocTask?.title || 'Tarefa'}
                            </span>
                            <Badge variant="neutral" className="line-through">
                              CANCELADO
                            </Badge>
                          </div>
                          <div className="text-caption text-text-muted mt-0.5">
                            Duração: {formatHoursDisplay(durationHours)} • Horário: {alloc.startTime.substring(0, 5)}–{alloc.endTime.substring(0, 5)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {allocTask && (
                            <Button
                              type="button"
                              id={`btn-alloc-task-${alloc.id}`}
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                onClose();
                                onViewTask(allocTask);
                              }}
                              aria-label="Ver detalhes da tarefa associada"
                              title="Ver detalhes da tarefa associada"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Ver Tarefa
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-border flex items-center justify-between gap-2 flex-wrap">
            <div className="text-caption font-medium text-text-muted">
              {dayAllocations.length} alocação(ões) registada(s) para este dia.
            </div>
            <Button
              id="btn-day-detail-dismiss"
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              aria-label="Fechar janela"
            >
              Fechar
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel Confirmation Sub-Modal using Foundation Dialog */}
      <Dialog
        isOpen={Boolean(confirmCancelAlloc)}
        onClose={() => setConfirmCancelAlloc(null)}
        title="Cancelar Alocação Confirmada"
        className="max-w-md"
      >
        {confirmCancelAlloc && (
          <div className="space-y-4 text-left">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-warning/10 text-warning rounded-control">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <p className="text-caption text-text-secondary">
                Esta alocação deixará de consumir capacidade diária do recurso e passará para o estado histórico CANCELLED.
              </p>
            </div>

            <Card className="p-3 bg-surface-muted/40 border-border text-caption space-y-1.5">
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Recurso:</span>
                <span className="text-text-primary font-bold">{resource.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Data:</span>
                <span className="text-text-primary font-semibold">{dateStr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Horário:</span>
                <span className="text-text-primary font-semibold">{confirmCancelAlloc.startTime} — {confirmCancelAlloc.endTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Duração:</span>
                <span className="text-text-primary font-bold">{formatHoursDisplay((confirmCancelAlloc.durationMinutes || 0) / 60)}</span>
              </div>
            </Card>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmCancelAlloc(null)}
                disabled={actionLoadingId === confirmCancelAlloc.id}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleExecuteCancel}
                disabled={actionLoadingId === confirmCancelAlloc.id}
                isLoading={actionLoadingId === confirmCancelAlloc.id}
              >
                <Ban className="w-3.5 h-3.5" />
                Confirmar Cancelamento
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete DRAFT Confirmation Sub-Modal using Foundation Dialog */}
      <Dialog
        isOpen={Boolean(confirmDeleteAlloc)}
        onClose={() => setConfirmDeleteAlloc(null)}
        title="Eliminar Rascunho de Planeamento"
        className="max-w-md"
      >
        {confirmDeleteAlloc && (
          <div className="space-y-4 text-left">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-error/10 text-error rounded-control">
                <Trash2 className="w-5 h-5" />
              </div>
              <p className="text-caption text-text-secondary">
                Esta alocação em rascunho (DRAFT) será eliminada permanentemente.
              </p>
            </div>

            <Card className="p-3 bg-surface-muted/40 border-border text-caption space-y-1.5">
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Recurso:</span>
                <span className="text-text-primary font-bold">{resource.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Data:</span>
                <span className="text-text-primary font-semibold">{dateStr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Duração:</span>
                <span className="text-text-primary font-bold">{formatHoursDisplay((confirmDeleteAlloc.durationMinutes || 0) / 60)}</span>
              </div>
            </Card>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDeleteAlloc(null)}
                disabled={actionLoadingId === confirmDeleteAlloc.id}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleExecuteDelete}
                disabled={actionLoadingId === confirmDeleteAlloc.id}
                isLoading={actionLoadingId === confirmDeleteAlloc.id}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar Rascunho
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
