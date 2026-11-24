import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useFeedback, useFormDraft } from '@/components/ApplicationFeedback';
import { useFieldErrors } from '@/hooks/useFieldErrors';
import {
  X,
  Calendar,
  Users,
  Clock,
  AlertTriangle,
  CheckSquare,
  Trash2,
  Briefcase,
  PlusCircle,
  FileText,
  PlayCircle,
  CheckCircle2,
  ListTodo,
  Search,
  Check,
  ChevronDown,
  Copy
} from 'lucide-react';
import { Task, Project, Client, TaskType, User, ProjectPriority, TaskPlanningStatus } from '@/lib/types';
import { AssigneeSelector } from '@/domains/tasks/ui/AssigneeSelector';
import { configuredRoleIds } from '@/lib/roleAssociations';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { SingleChoice } from '@/components/ui/SingleChoice';
import { getTaskTypeName, formatToOnlyHours, getDefaultTaskStatusId, getTaskStatusStyle, matchTaskStatusId } from '@/lib/utils';
import { countsTowardsPlanning, normalizeTaskPlanningStatus } from '@/domains/tasks/modules/taskPlanning';
import { TaskPlanningBadge } from './TaskPlanningBadge';
import { getTaskConflictWarnings } from '@/domains/tasks/modules/taskConflicts';
import { validateTaskExecutionTimes, parseTaskHoursToFloat } from '@/domains/tasks/modules/taskOperations';
import type { TaskUpdateInput } from '@/domains/tasks/modules/taskOperations';

export type TaskModalMode = 'create' | 'edit' | 'execute' | 'view';

// UI operation allowlist: execution must never resend the locked planning values.
export function getTaskUpdatePayload(mode: TaskModalMode, values: TaskUpdateInput): TaskUpdateInput {
  if (mode !== 'execute') return values;
  return {
    statusId: values.statusId,
    assigneeIds: values.assigneeIds,
    actualHours: values.actualHours,
    startDate: values.startDate,
    startTime: values.startTime,
    endDate: values.endDate,
    endTime: values.endTime,
    notes: values.notes,
  };
}

export interface TaskDetailsModalProps {
  task?: Task | null;
  isOpen?: boolean;
  mode?: TaskModalMode;
  initialDate?: string;
  initialAssigneeId?: string;
  initialAssigneeIds?: string[];
  initialProjectId?: string;
  onClose: () => void;
  onSaveSuccess?: (task: Task) => void;
  onDeleteSuccess?: (taskId: string) => void;
  createTask?: (payload: any) => Promise<any> | void;
  updateTask?: (id: string, updates: any) => Promise<any> | void;
  deleteTask?: (id: string) => Promise<boolean>;
  taskStatuses: any[];
  taskTypes?: TaskType[];
  projectPriorities?: ProjectPriority[];
  users: User[];
  userGroups?: any[];
  appConfig?: any;
  projects: Project[];
  clients: Client[];
  absences?: any[];
  tasks?: Task[];
  canWrite?: boolean;
  canDelete?: boolean;
  onSelectTask?: (task: Task) => void;
}

const getEffectiveAssignees = (t: any): string[] => {
  if (!t) return [];
  if (Array.isArray(t.assigneeIds) && t.assigneeIds.length > 0) return t.assigneeIds;
  if (Array.isArray(t.assignedUserIds) && t.assignedUserIds.length > 0) return t.assignedUserIds;
  return Array.isArray(t.assigneeIds) ? t.assigneeIds : [];
};

export default function TaskDetailsModal({
  task = null,
  isOpen,
  mode: initialMode,
  initialDate = '',
  initialAssigneeId,
  initialAssigneeIds,
  initialProjectId = '',
  onClose,
  onSaveSuccess,
  onDeleteSuccess,
  createTask,
  updateTask,
  deleteTask,
  taskStatuses,
  taskTypes = [],
  projectPriorities = [],
  users,
  userGroups = [],
  appConfig,
  projects,
  clients,
  absences = [],
  tasks = [],
  canWrite = true,
  canDelete = false,
  onSelectTask,
}: TaskDetailsModalProps) {
  // If isOpen is explicitly passed, respect it; otherwise consider open if task or initialMode is provided
  const isModalOpen = isOpen !== undefined ? isOpen : (Boolean(task) || Boolean(initialMode));

  // Mode defaults to edit if task is present, else create
  const activeTask = task;
  const wasProvisional = activeTask?.planningStatus === 'provisional';
  const effectiveMode: TaskModalMode = initialMode === 'execute' && wasProvisional
    ? 'edit'
    : initialMode || (task ? 'edit' : 'create');
  const isDuplication = effectiveMode === 'create' && Boolean(activeTask);

  // Client lookup map for fast O(1) client resolution
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  const getProjectDisplayLabel = useCallback((p: Project) => {
    const cl = clientMap.get(p.clientId);
    const fullName = cl?.clientName?.trim();
    const shortName = cl?.shortName?.trim();
    let clLabel = '';
    if (fullName && shortName && fullName.toLowerCase() !== shortName.toLowerCase()) {
      clLabel = `${fullName} (${shortName})`;
    } else {
      clLabel = fullName || shortName || '';
    }
    const clPart = clLabel ? ` • ${clLabel}` : '';
    const ipPart = p.installProjectNo ? ` #${p.installProjectNo}` : '';
    return `${p.title}${clPart}${ipPart}`;
  }, [clientMap]);

  // Form State
  const [formProjectId, setFormProjectId] = useState<string>('');
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>('');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatusId, setFormStatusId] = useState('');
  const [formPlanningStatus, setFormPlanningStatus] = useState<TaskPlanningStatus>('planned');
  const [formTypeId, setFormTypeId] = useState('');
  const [formPriorityId, setFormPriorityId] = useState('');
  const [formEstimatedDate, setFormEstimatedDate] = useState('');
  const [formEstimatedHours, setFormEstimatedHours] = useState('08:00');
  const [formActualHours, setFormActualHours] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAssignees, setFormAssignees] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Click outside to close project dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const feedback = useFeedback();
  const validation = useFieldErrors();
  const initializedForm = useRef<string | null>(null);
  const editingVersion = useRef<number | undefined>(undefined);

  // Initialize once per opening and task so a background refresh preserves edits.
  useEffect(() => {
    if (!isModalOpen) { initializedForm.current = null; return; }
    const formKey = JSON.stringify([effectiveMode, activeTask?.id, initialProjectId, initialDate, initialAssigneeId, initialAssigneeIds]);
    if (initializedForm.current === formKey) return;
    initializedForm.current = formKey;
    editingVersion.current = activeTask?.version;
    validation.clear();
    if (effectiveMode === 'create') {
      if (activeTask) {
        // DADOS PRÉ-PREENCHIDOS PARA DUPLICAÇÃO
        const projId = activeTask.projectId || '';
        setFormProjectId(projId);
        const pObj = projects.find(p => p.id === projId);
        setProjectSearchQuery(pObj ? getProjectDisplayLabel(pObj) : '');

        setFormTitle(activeTask.title || '');
        setFormDescription(activeTask.description || '');
        setFormPlanningStatus(normalizeTaskPlanningStatus(activeTask.planningStatus));
        setFormStatusId(getDefaultTaskStatusId(taskStatuses)); // Reset to default unstarted status on duplicate
        setFormTypeId(activeTask.taskTypeId || '');
        setFormPriorityId(activeTask.priorityId || projectPriorities.filter(p => !p.deleted).sort((a, b) => a.scale - b.scale)[0]?.id || '');
        setFormEstimatedDate(activeTask.estimatedDate || '');
        setFormEstimatedHours(formatToOnlyHours(activeTask.estimatedHours) || '08:00');
        setFormActualHours('');
        setFormStartDate(''); // Clear execution start date on duplicate
        setFormStartTime(''); // Clear execution start time on duplicate
        setFormEndDate(''); // Clear execution end date on duplicate
        setFormEndTime(''); // Clear execution end time on duplicate
        setFormNotes(activeTask.notes || '');
        setFormAssignees(getEffectiveAssignees(activeTask));
        setFormError(null);
      } else {
        // CRIAÇÃO NOVA LIMPA
        const defaultProj = initialProjectId || '';
        setFormProjectId(defaultProj);
        if (defaultProj) {
          const pObj = projects.find(p => p.id === defaultProj);
          setProjectSearchQuery(pObj ? getProjectDisplayLabel(pObj) : '');
        } else {
          setProjectSearchQuery('');
        }

        const defaultStatus = getDefaultTaskStatusId(taskStatuses);
        const defaultAssignees = initialAssigneeIds || (initialAssigneeId ? [initialAssigneeId] : []);

        setFormTitle('');
        setFormDescription('');
        setFormStatusId(defaultStatus);
        setFormPlanningStatus('planned');
        setFormTypeId('');
        setFormPriorityId(projectPriorities.filter(p => !p.deleted).sort((a, b) => a.scale - b.scale)[0]?.id || '');
        // "Data planeada" prevalece, sem datas reais de início e fim inicialmente preenchidas
        setFormEstimatedDate(initialDate || '');
        setFormEstimatedHours('08:00');
        setFormActualHours('');
        setFormStartDate('');
        setFormStartTime('');
        setFormEndDate('');
        setFormEndTime('');
        setFormNotes('');
        setFormAssignees(defaultAssignees);
        setFormError(null);
      }
    } else if (activeTask) {
      // EDIÇÃO / EXECUÇÃO / VISUALIZAÇÃO
      const projId = activeTask.projectId || '';
      setFormProjectId(projId);
      const pObj = projects.find(p => p.id === projId);
      setProjectSearchQuery(pObj ? getProjectDisplayLabel(pObj) : '');

      setFormTitle(activeTask.title || '');
      setFormDescription(activeTask.description || '');
      setFormStatusId(activeTask.statusId || getDefaultTaskStatusId(taskStatuses));
      setFormPlanningStatus(normalizeTaskPlanningStatus(activeTask.planningStatus));
      setFormTypeId(activeTask.taskTypeId || '');
      setFormPriorityId(activeTask.priorityId || '');
      setFormEstimatedDate(activeTask.estimatedDate || '');
      setFormEstimatedHours(formatToOnlyHours(activeTask.estimatedHours) || '0');
      setFormActualHours(activeTask.actualHours == null ? '' : formatToOnlyHours(activeTask.actualHours));
      setFormStartDate(activeTask.startDate || '');
      setFormStartTime(activeTask.startTime || '');
      setFormEndDate(activeTask.endDate || '');
      setFormEndTime(activeTask.endTime || '');
      setFormNotes(activeTask.notes || '');
      setFormAssignees(getEffectiveAssignees(activeTask));
      setFormError(null);

    }
  }, [isModalOpen, effectiveMode, activeTask, initialProjectId, initialDate, initialAssigneeId, initialAssigneeIds, projects, taskStatuses, getProjectDisplayLabel]);

  const draftValues = { formProjectId, projectSearchQuery, formTitle, formDescription, formStatusId, formPlanningStatus, formTypeId, formPriorityId, formEstimatedDate, formEstimatedHours, formActualHours, formStartDate, formStartTime, formEndDate, formEndTime, formNotes, formAssignees };
  const requestedDraft = feedback?.resume;
  useFormDraft('task', isModalOpen && canWrite && effectiveMode !== 'view' ? {
    kind: 'task', recordId: activeTask?.id ?? null, version: editingVersion.current,
    projectId: formProjectId || undefined, mode: effectiveMode, values: draftValues,
  } : null, draft => {
    editingVersion.current = draft.version;
    setFormProjectId(draft.values.formProjectId);
    setProjectSearchQuery(draft.values.projectSearchQuery);
    setFormTitle(draft.values.formTitle);
    setFormDescription(draft.values.formDescription);
    setFormStatusId(draft.values.formStatusId);
    setFormPlanningStatus(normalizeTaskPlanningStatus(draft.values.formPlanningStatus ?? activeTask?.planningStatus));
    setFormTypeId(draft.values.formTypeId);
    setFormPriorityId(draft.values.formPriorityId);
    setFormEstimatedDate(draft.values.formEstimatedDate);
    setFormEstimatedHours(draft.values.formEstimatedHours);
    setFormActualHours(draft.values.formActualHours);
    setFormStartDate(draft.values.formStartDate);
    setFormStartTime(draft.values.formStartTime);
    setFormEndDate(draft.values.formEndDate);
    setFormEndTime(draft.values.formEndTime);
    setFormNotes(draft.values.formNotes);
    setFormAssignees(draft.values.formAssignees);
  }, isModalOpen && canWrite && requestedDraft?.mode === effectiveMode &&
    requestedDraft.recordId === (activeTask?.id ?? null));

  // Fast suggestions filtering with early termination (designed for thousands of projects)
  const projectSuggestions = useMemo(() => {
    const q = projectSearchQuery.toLowerCase().trim();
    const activeProjects = projects.filter(p => !p.deleted);
    if (!q) {
      return activeProjects.slice(0, 20);
    }
    const results: Project[] = [];
    for (const p of activeProjects) {
      const pTitle = (p.title || '').toLowerCase();
      const cl = clientMap.get(p.clientId);
      const cFullName = (cl?.clientName || '').toLowerCase();
      const cShortName = (cl?.shortName || '').toLowerCase();
      const ipNo = (p.installProjectNo || '').toLowerCase();
      if (
        pTitle.includes(q) ||
        cFullName.includes(q) ||
        cShortName.includes(q) ||
        ipNo.includes(q)
      ) {
        results.push(p);
        if (results.length >= 25) break; // Terminação antecipada para máxima fluidez
      }
    }
    return results;
  }, [projects, clientMap, projectSearchQuery]);

  // Project Selection Handlers
  const handleSelectProject = (p: Project) => {
    setFormProjectId(p.id);
    setProjectSearchQuery(getProjectDisplayLabel(p));
    setIsProjectDropdownOpen(false);
    if (formError && formError.includes('projeto')) {
      setFormError(null);
    }
  };

  const handleProjectInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setProjectSearchQuery(val);
    setIsProjectDropdownOpen(true);

    // Se o texto não coincidir exatamente com o projeto atualmente selecionado, invalidar formProjectId
    const currentSelected = projects.find(p => p.id === formProjectId && !p.deleted);
    if (currentSelected && getProjectDisplayLabel(currentSelected) !== val) {
      setFormProjectId('');
    }
  };

  const handleClearProject = () => {
    setFormProjectId('');
    setProjectSearchQuery('');
    setIsProjectDropdownOpen(true);
    if (projectInputRef.current) {
      projectInputRef.current.focus();
    }
  };

  // Date handlers adhering to exact requirements
  const handleStartDateChange = (newStartDate: string) => {
    setFormStartDate(newStartDate);
    // "quando selecionar a data de início também deve alterar a data de fim para a mesma data, à posterior podemos mudar a data de fim"
    if (newStartDate) {
      setFormEndDate(newStartDate);
    }
    if (formError && (formError.includes('data de início') || formError.includes('data de fim'))) {
      setFormError(null);
    }
  };

  const handleEndDateChange = (newEndDate: string) => {
    // "Não podes permitir que a data de fim seja anterior à data de início no preenchimento da tarefa"
    if (formStartDate && newEndDate && newEndDate < formStartDate) {
      validation.show({ endDate: 'A data de fim não pode ser anterior à data de início.' });
      return;
    }
    setFormEndDate(newEndDate);
    if (formError && formError.includes('data de fim')) {
      setFormError(null);
    }
  };

  // Target date for conflict calculation: planned date prevails until both real start and end are filled
  const conflictWarnings = useMemo(() => {
    const targetDate = (formStartDate && formEndDate)
      ? formStartDate
      : (formEstimatedDate || formStartDate || formEndDate);

    return getTaskConflictWarnings({
      date: targetDate,
      planningStatus: formPlanningStatus,
      assigneeIds: formAssignees,
      currentTaskId: effectiveMode === 'create' ? null : activeTask?.id,
      tasks,
      users,
      absences,
      projects,
    });
  }, [formStartDate, formEndDate, formEstimatedDate, formPlanningStatus, effectiveMode, activeTask, formAssignees, tasks, users, absences, projects]);

  const selectedProject = projects.find(p => p.id === formProjectId && !p.deleted);
  const unscheduledProjectTasks = useMemo(() => {
    if (effectiveMode !== 'create' || !formProjectId || !onSelectTask) return [];
    return tasks.filter(candidate => {
      if (candidate.deleted || candidate.projectId !== formProjectId) return false;
      if (candidate.estimatedDate || candidate.startDate || candidate.endDate) return false;
      const status = taskStatuses.find(s => matchTaskStatusId(s.id, candidate.statusId));
      return status?.scale !== 3 && !matchTaskStatusId(candidate.statusId, 'ts-3');
    });
  }, [effectiveMode, formProjectId, onSelectTask, tasks, taskStatuses]);
  const activeClient = selectedProject ? clientMap.get(selectedProject.clientId) : null;
  const clientName = activeClient ? (activeClient.clientName || activeClient.shortName || 'N/A') : 'N/A';
  const projectTitle = selectedProject ? selectedProject.title : 'N/A';

  const getUserName = (userId: string) => {
    const u = users.find(usr => usr.id === userId);
    return u ? u.name : userId;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    validation.clear();

    if (effectiveMode === 'view') {
      onClose();
      return;
    }

    if (!canWrite || submittingRef.current || feedback?.writesBlocked) return;

    const fields: Record<string, string> = {};
    if (effectiveMode !== 'execute' && !formTitle.trim()) fields.title = 'Introduza o título da tarefa.';
    if (effectiveMode === 'create' && !formTypeId.trim()) fields.taskTypeId = 'Selecione o tipo de tarefa.';
    if (effectiveMode === 'create' && !formStatusId.trim()) fields.statusId = 'Selecione o estado da tarefa.';
    if (Object.keys(fields).length) { validation.show(fields); return; }

    // Resolve project ID: only assign if formProjectId matches a valid, non-deleted project.
    // If user cleared the selection or typed arbitrary text without selecting, projectId is null.
    let resolvedProjectId: string | null = null;
    if (formProjectId && formProjectId.trim()) {
      const matchedProject = projects.find(p => p.id === formProjectId.trim() && !p.deleted);
      if (matchedProject) {
        resolvedProjectId = matchedProject.id;
      }
    }

    // "Não podes permitir que a data de fim seja anterior à data de início no preenchimento da tarefa"
    if (formStartDate && formEndDate && formEndDate < formStartDate) {
      validation.show({ endDate: 'A data de fim não pode ser anterior à data de início.' });
      return;
    }

    // "se preenchermos data de início é obrigatório preencher data de fim"
    if (formStartDate && !formEndDate) {
      setFormError('Se preencher a data de início, é obrigatório preencher a data de fim.');
      return;
    }

    if (formEndDate && !formStartDate) {
      validation.show({ startDate: 'Introduza a data de início.' });
      return;
    }

    // Validate execution times using centralized helper if times are filled
    const timeVal = validateTaskExecutionTimes({
      startDate: formStartDate,
      startTime: formStartTime,
      endDate: formEndDate,
      endTime: formEndTime,
    });

    if (!timeVal.valid) {
      const field = !formStartTime ? 'startTime' : 'endTime';
      validation.show({ [field]: timeVal.error || 'Verifique a hora de fim.' });
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (effectiveMode === 'create') {
        const payload = {
          projectId: resolvedProjectId,
          title: formTitle.trim(),
          description: formDescription.trim(),
          statusId: formStatusId || undefined,
          planningStatus: formPlanningStatus,
          taskTypeId: formTypeId || undefined,
          priorityId: formPriorityId || undefined,
          estimatedDate: formEstimatedDate || undefined,
          estimatedHours: parseTaskHoursToFloat(formEstimatedHours),
          actualHours: formActualHours.trim() ? parseTaskHoursToFloat(formActualHours) || null : null,
          startDate: formStartDate || undefined,
          startTime: formStartTime || undefined,
          endDate: formEndDate || undefined,
          endTime: formEndTime || undefined,
          notes: formNotes.trim() || undefined,
          assigneeIds: formAssignees,
        };

        if (createTask) {
          const result = await createTask(payload);
          if (result?.id) {
            onSaveSuccess?.(result);
            feedback?.notify({ message: 'Tarefa criada.', target: { kind: 'task', id: result.id } });
          }
        }
        onClose();
      } else if (activeTask && updateTask) {
        const payload = getTaskUpdatePayload(effectiveMode, {
          projectId: resolvedProjectId,
          title: formTitle.trim(),
          description: formDescription.trim(),
          statusId: formStatusId || undefined,
          planningStatus: effectiveMode === 'execute' || formPlanningStatus === normalizeTaskPlanningStatus(activeTask.planningStatus)
            ? undefined : formPlanningStatus,
          taskTypeId: formTypeId || '',
          priorityId: formPriorityId || null,
          estimatedDate: formEstimatedDate || '',
          estimatedHours: parseTaskHoursToFloat(formEstimatedHours),
          actualHours: formActualHours.trim() ? parseTaskHoursToFloat(formActualHours) || null : null,
          startDate: formStartDate || '',
          startTime: formStartTime || '',
          endDate: formEndDate || '',
          endTime: formEndTime || '',
          notes: formNotes.trim() || '',
          assigneeIds: formAssignees,
        });

        const result = await updateTask(activeTask.id, payload);
        if (result) {
          onSaveSuccess?.(result);
          feedback?.notify({ message: 'Tarefa atualizada.', target: { kind: 'task', id: activeTask.id } });
        }
        onClose();
      } else {
        onClose();
      }
    } catch (err: any) {
      if (!validation.showApiError(err)) setFormError(err?.message || 'Não foi possível guardar a tarefa.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || !activeTask || activeTask.deleted || !deleteTask ||
        (effectiveMode !== 'edit' && effectiveMode !== 'execute') || submittingRef.current) return;
    const confirmDelete = window.confirm(`Tem a certeza que deseja eliminar a tarefa "${activeTask.title}"? As alterações não gravadas serão descartadas.`);
    if (!confirmDelete) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const deleted = await deleteTask(activeTask.id);
      if (deleted !== true) throw new Error('Não foi possível confirmar a eliminação da tarefa.');
      if (onDeleteSuccess) onDeleteSuccess(activeTask.id);
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao eliminar a tarefa.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isReadOnly = effectiveMode === 'view' || !canWrite || isSubmitting;
  const isPlanningReadOnly = isReadOnly || effectiveMode === 'execute';
  const isProvisional = !countsTowardsPlanning({ planningStatus: formPlanningStatus });
  const executionLocked = isProvisional || (wasProvisional && effectiveMode !== 'create');
  const started = (statusId?: string) => Boolean(statusId && !taskStatuses.some(status =>
    status.scale === 1 && matchTaskStatusId(status.id, statusId)) && !matchTaskStatusId(statusId, 'ts-1'));
  const hasExecution = started(formStatusId) || Boolean(formStartDate || formEndDate || formStartTime || formEndTime || parseTaskHoursToFloat(formActualHours));
  const savedExecution = activeTask && effectiveMode !== 'create' && (started(activeTask.statusId) || Boolean(
    activeTask.startDate || activeTask.endDate || activeTask.startTime || activeTask.endTime || activeTask.completedDate || parseTaskHoursToFloat(activeTask.actualHours)));

  if (!isModalOpen) {
    return null;
  }

  return (
    <Dialog
      isOpen={isModalOpen}
      onClose={() => { if (!submittingRef.current) onClose(); }}
      title={isDuplication
        ? `Nova Tarefa (Cópia de "${activeTask?.title}")`
        : effectiveMode === 'create'
        ? 'Nova tarefa'
        : activeTask?.title || 'Detalhes da Tarefa'}
      className="max-w-2xl max-h-[calc(100dvh-2rem)]"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0 max-h-none"
    >
      <form ref={validation.form} noValidate onChangeCapture={validation.clearChanged} onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
        {/* Read-only banner if in edit/view mode */}
        {effectiveMode !== 'create' && activeTask && (
          <div className="px-6 py-3 bg-primary/5 border-b border-primary/20 text-body-sm text-text-secondary space-y-1.5 shrink-0">
            {activeTask.description && (
              <p className="font-medium text-text-primary italic bg-surface p-2 rounded-control border border-border">
                &quot;{activeTask.description}&quot;
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-caption font-semibold text-text-secondary">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-text-muted" />
                Responsáveis: <span className="text-text-primary font-bold">
                  {getEffectiveAssignees(activeTask).length > 0
                    ? getEffectiveAssignees(activeTask).map(id => getUserName(id)).join(', ')
                    : 'Sem utilizadores'}
                </span>
              </span>
              {activeTask.estimatedDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" />
                  Data Planeada: <span className="text-text-primary font-bold">{activeTask.estimatedDate.split('-').reverse().join('/')}</span>
                </span>
              )}
              {Boolean(activeTask.estimatedHours) && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-text-muted" />
                  Horas Previstas: <span className="text-text-primary font-bold">{activeTask.estimatedHours} h</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Form Error Banner */}
        {formError && (
          <div className="mx-6 mt-4 p-3 bg-error/10 border border-error/20 rounded-control text-body-sm text-error font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-error shrink-0" />
            <span role="alert">{formError}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-label font-bold text-text-primary">Estado da tarefa {effectiveMode === 'create' ? '*' : ''}</p>
            <SingleChoice
              label="Estado da tarefa" field="statusId" error={validation.errors.statusId}
              value={taskStatuses.find(s => s.id === formStatusId || matchTaskStatusId(s.id, formStatusId))?.id || formStatusId}
              options={taskStatuses.filter(s => !s.deleted).map(s => ({
                value: s.id,
                label: s.name,
                className: getTaskStatusStyle(s.id, taskStatuses).badgeClass,
              }))}
              onChange={value => { setFormStatusId(value); validation.clearField('statusId'); }}
              disabled={isReadOnly || executionLocked}
            />
          </div>

          {/* Informative Conflict Warnings Banner */}
          {conflictWarnings.length > 0 && (
            <div className="p-3.5 bg-warning/10 border border-warning/30 rounded-control space-y-1 text-body-sm text-warning font-medium whitespace-pre-line shadow-subtle">
              <div className="font-bold flex items-center gap-1.5 text-warning text-body-sm">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                Aviso Informativo de Conflitos / Indisponibilidade
              </div>
              {conflictWarnings.map((warn, idx) => (
                <p key={idx} className="text-body-sm leading-relaxed">{warn}</p>
              ))}
            </div>
          )}

          {unscheduledProjectTasks.length > 0 && (
            <div className="p-3.5 bg-warning/10 border border-warning/30 rounded-control space-y-2 text-body-sm text-warning shadow-subtle">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Este projeto tem as seguintes tarefas por agendar:
              </p>
              <ul className="space-y-1 pl-5 list-disc">
                {unscheduledProjectTasks.map(candidate => (
                  <li key={candidate.id}>
                    <button type="button" disabled={isSubmitting} onClick={() => onSelectTask?.(candidate)}
                      className="text-left underline underline-offset-2 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">
                      {candidate.title}
                      <TaskPlanningBadge planningStatus={candidate.planningStatus} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ================= SECTION 1: PLANEAMENTO ================= */}
          <div className="bg-surface-muted p-4 rounded-card border border-border space-y-3.5">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-body-sm font-extrabold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-primary-ink" />
                Dados de planeamento
              </span>

            </div>

            <div className="space-y-1">
              <label htmlFor="task-planningStatus" className="block text-label font-bold text-text-primary">Planeamento</label>
              <Select id="task-planningStatus" value={formPlanningStatus} disabled={isPlanningReadOnly || Boolean(savedExecution) || hasExecution}
                onChange={event => setFormPlanningStatus(normalizeTaskPlanningStatus(event.target.value))}
                options={[{ value: 'planned', label: 'Efetiva' }, { value: 'provisional', label: 'Provisória' }]} />
              {executionLocked && <p className="text-caption text-text-secondary">Confirme o planeamento para registar a execução.</p>}
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label htmlFor="task-formTitle" className="block text-body-sm font-bold text-text-primary">
                Título da tarefa <span className="text-error">*</span>
              </label>
              <Input id="task-formTitle" name="title" error={validation.errors.title}
                type="text"
                required
                readOnly={isPlanningReadOnly}
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Ex: Preparação de sistema, Programação PLC, Eletrificar sistema..."
                className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 focus:border-primary/20 read-only:bg-surface-muted"
              />
            </div>

            {/* Project Selection with Autocomplete and Suggestions */}
            <div className="space-y-1 relative" ref={projectDropdownRef}>
              <div className="flex items-center justify-between">
                <label htmlFor="task-projectSearchQuery" className="block text-label font-bold text-text-primary">
                  Projeto
                </label>
                {selectedProject && (
                  <span className="text-caption text-success bg-success/10 px-2 py-0.5 rounded-badge font-bold border border-success/20 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Projeto selecionado
                  </span>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 z-10 pl-3 flex items-center pointer-events-none text-text-muted">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <Input id="task-projectSearchQuery" name="projectId" error={validation.errors.projectId}
                  ref={projectInputRef}
                  type="text"
                  readOnly={isPlanningReadOnly}
                  value={projectSearchQuery}
                  onChange={handleProjectInputChange}
                  onFocus={() => {
                    if (!isPlanningReadOnly) setIsProjectDropdownOpen(true);
                  }}
                  placeholder="Pesquisar por nome de projeto ou cliente..."
                  className={`w-full pl-9 pr-8 py-2.5 border rounded-control text-body-sm font-semibold focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors ${
                    formProjectId
                      ? 'border-primary/20 bg-primary/5 text-text-primary font-bold'
                      : 'border-border bg-surface text-text-primary'
                  } read-only:bg-surface-muted read-only:text-text-muted`}
                />
                {!isPlanningReadOnly && projectSearchQuery && (
                  <IconButton
                    type="button"
                    onClick={handleClearProject}
                    className="absolute top-1 right-1 text-text-muted hover:text-text-secondary"
                    title="Limpar seleção"
                    aria-label="Limpar seleção"
                  >
                    <X className="w-3.5 h-3.5" />
                  </IconButton>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {!isPlanningReadOnly && isProjectDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-surface border border-border rounded-control shadow-modal z-50 max-h-60 overflow-y-auto divide-y divide-border animate-in fade-in zoom-in-95 duration-100">
                  <div className="p-2 bg-surface-muted text-caption uppercase font-bold text-text-muted tracking-wider flex items-center justify-between">
                    <span>Projetos sugeridos ({projectSuggestions.length})</span>
                    <span className="font-normal lowercase">opcional</span>
                  </div>
                  {projectSuggestions.length === 0 ? (
                    <div className="p-3 text-body-sm text-text-muted italic text-center">
                      Nenhum projeto encontrado com &quot;{projectSearchQuery}&quot;
                    </div>
                  ) : (
                    projectSuggestions.map(p => {
                      const cl = clientMap.get(p.clientId);
                      const fullName = cl?.clientName?.trim();
                      const shortName = cl?.shortName?.trim();
                      const hasBoth = fullName && shortName && fullName.toLowerCase() !== shortName.toLowerCase();
                      const clDisplay = hasBoth ? `${fullName} (${shortName})` : (fullName || shortName || 'Sem cliente');
                      const isSelected = p.id === formProjectId;
                      return (
                        <Button
                          key={p.id}
                          variant="ghost"
                          type="button"
                          onClick={() => handleSelectProject(p)}
                          className={`h-auto min-h-11 w-full text-left px-3.5 py-2.5 hover:bg-primary/10 transition-colors flex items-center justify-between text-body-sm cursor-pointer ${
                            isSelected ? 'bg-primary/10 text-primary-ink font-bold' : 'text-text-primary font-medium'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-bold text-text-primary truncate">
                              {p.title}
                              {p.installProjectNo && (
                                <span className="ml-1 text-caption text-text-muted font-normal">
                                  #{p.installProjectNo}
                                </span>
                              )}
                            </div>
                            <div className="text-caption text-text-secondary flex items-center gap-1 truncate mt-0.5">
                              <Briefcase className="w-3 h-3 text-text-muted shrink-0" />
                              <span>{clDisplay}</span>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-primary-ink shrink-0 ml-2" />
                          )}
                        </Button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Planned Date & Estimated Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="task-formEstimatedDate" className="block text-label font-bold text-text-primary">
                  Data planeada <span className="text-caption text-text-muted font-normal"></span>
                </label>
                {formEstimatedDate && !isPlanningReadOnly && (
                  <Button type="button" variant="ghost" size="sm" disabled={isSubmitting}
                    onClick={() => setFormEstimatedDate('')}>
                    Limpar data
                  </Button>
                )}
                <Input id="task-formEstimatedDate" name="estimatedDate" error={validation.errors.estimatedDate}
                  type="date"
                  readOnly={isPlanningReadOnly}
                  value={formEstimatedDate}
                  onChange={e => setFormEstimatedDate(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 read-only:bg-surface-muted"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="task-formEstimatedHours" className="block text-body-sm font-bold text-text-primary">Horas previstas (h)</label>
                <Input id="task-formEstimatedHours" name="estimatedHours" error={validation.errors.estimatedHours}
                  type="text"
                  readOnly={isPlanningReadOnly}
                  value={formEstimatedHours}
                  onChange={e => setFormEstimatedHours(e.target.value)}
                  placeholder="Ex: 08:00 ou 8"
                  className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 read-only:bg-surface-muted"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="task-formPriorityId" className="block text-body-sm font-bold text-text-primary">Prioridade</label>
                <Select id="task-formPriorityId" name="priorityId" error={validation.errors.priorityId}
                  disabled={isPlanningReadOnly}
                  value={formPriorityId}
                  onChange={e => setFormPriorityId(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 disabled:bg-surface-muted cursor-pointer"
                >
                  <option value="">Sem prioridade</option>
                  {projectPriorities.filter(priority => !priority.deleted || priority.id === formPriorityId).sort((a, b) => a.scale - b.scale).map(priority => (
                    <option key={priority.id} value={priority.id}>{priority.name}</option>
                  ))}
                </Select>
              </div>
            {/* Task type shares the priority row. */}
              <div className="space-y-1">
                <label htmlFor="task-formTypeId" className="block text-body-sm font-bold text-text-primary">Tipo de tarefa {effectiveMode === 'create' ? '*' : ''}</label>
                <Select id="task-formTypeId" name="taskTypeId" error={validation.errors.taskTypeId}
                  disabled={isPlanningReadOnly}
                  value={formTypeId}
                  onChange={e => setFormTypeId(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 disabled:bg-surface-muted cursor-pointer"
                >
                  <option value="">Selecione o tipo de tarefa...</option>
                  {taskTypes.filter(tt => !tt.deleted).map(tt => (
                    <option key={tt.id} value={tt.id}>{getTaskTypeName(tt.id, taskTypes)}</option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Description (Instructions) */}
            <div className="space-y-1">
              <label htmlFor="task-formDescription" className="block text-body-sm font-bold text-text-primary">Descrição</label>
              <Textarea id="task-formDescription" name="description" error={validation.errors.description}
                rows={2}
                readOnly={isPlanningReadOnly}
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Detalhes adicionais ou instruções..."
                className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 read-only:bg-surface-muted"
              />
            </div>

          </div>

            {/* Native fieldset disables the existing selector in read-only modes. */}
            <fieldset disabled={isReadOnly || isSubmitting} className="min-w-0" data-field="assignedUserIds"
              tabIndex={-1} aria-invalid={!!validation.errors.assignedUserIds}
              aria-describedby={validation.errors.assignedUserIds ? 'task-assignees-error' : undefined}>
              <AssigneeSelector
                users={users}
                allowedGroupIds={configuredRoleIds(appConfig?.taskAssigneeGroupIds, appConfig?.taskAssigneeGroupId)}
                selectedIds={formAssignees}
                onChange={ids => { if (!isReadOnly) { setFormAssignees(ids); validation.clearField('assignedUserIds'); } }}
                filterTeamOnly
              />
              {validation.errors.assignedUserIds && <p id="task-assignees-error" className="text-caption text-error">{validation.errors.assignedUserIds}</p>}
            </fieldset>

          {/* ================= SECTION 2: EXECUÇÃO (Available in all modes) ================= */}
          <div className={`p-4 rounded-card border space-y-3.5 transition-all ${
            effectiveMode === 'execute'
              ? 'bg-warning/5 border-warning/30 ring-2 ring-warning/20'
              : 'bg-surface border-border'
          }`}>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-body-sm font-extrabold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4 text-warning" />
                Dados de Execução Real
              </span>

            </div>

            {/* Consumed Real Hours */}
            <div className="space-y-1">
              <label htmlFor="task-formActualHours" className="block text-body-sm font-bold text-text-primary">
                Horas consumidas (h)
              </label>
              <Input id="task-formActualHours" name="actualHours" error={validation.errors.actualHours}
                type="number"
                min="0"
                step="0.5"
                readOnly={isReadOnly || executionLocked}
                value={formActualHours}
                onChange={e => setFormActualHours(e.target.value)}
                placeholder="Ex: 6"
                className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary focus:ring-2 focus:ring-warning/20 read-only:bg-surface-muted"
              />

            </div>

            {/* Execution Dates and Times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="task-formStartDate" className="block text-label font-bold text-text-primary">Data de início</label>
                <Input id="task-formStartDate" name="startDate" error={validation.errors.startDate}
                  type="date"
                  readOnly={isReadOnly || executionLocked}
                  value={formStartDate}
                  onChange={e => handleStartDateChange(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="task-formStartTime" className="block text-label font-bold text-text-primary">Hora de início</label>
                <Input id="task-formStartTime" name="startTime" error={validation.errors.startTime}
                  type="time"
                  readOnly={isReadOnly || executionLocked}
                  value={formStartTime}
                  onChange={e => setFormStartTime(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="task-formEndDate" className="block text-label font-bold text-text-primary">Data de fim</label>
                <Input id="task-formEndDate" name="endDate" error={validation.errors.endDate}
                  type="date"
                  readOnly={isReadOnly || executionLocked}
                  min={formStartDate || undefined}
                  value={formEndDate}
                  onChange={e => handleEndDateChange(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="task-formEndTime" className="block text-label font-bold text-text-primary">Hora de fim</label>
                <Input id="task-formEndTime" name="endTime" error={validation.errors.endTime}
                  type="time"
                  readOnly={isReadOnly || executionLocked}
                  value={formEndTime}
                  onChange={e => setFormEndTime(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
                />
              </div>
            </div>

            {/* Execution Description / Notes */}
            <div className="space-y-1">
              <label htmlFor="task-formNotes" className="block text-body-sm font-bold text-text-primary">Descrição de execução</label>
              <Textarea id="task-formNotes" name="notes" error={validation.errors.notes}
                rows={2}
                readOnly={isReadOnly || executionLocked}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Relatório do trabalho efetuado, registos de campo ou observações..."
                className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
              />
            </div>
          </div>

          </div>

          {/* Action Buttons */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-6 py-4">
            <div>
              {(effectiveMode === 'edit' || effectiveMode === 'execute') && canDelete && deleteTask && activeTask && !activeTask.deleted && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  isLoading={isSubmitting}
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar Tarefa
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSubmitting}
                onClick={() => { if (!submittingRef.current) onClose(); }}
              >
                {effectiveMode === 'view' ? 'Fechar' : 'Cancelar'}
              </Button>

              {effectiveMode !== 'view' && canWrite && (
                <Button
                  type="submit"
                  disabled={feedback?.writesBlocked}
                  variant="primary"
                  size="sm"
                  isLoading={isSubmitting}
                >
                  {isSubmitting
                    ? 'A processar...'
                    : isDuplication
                    ? 'Criar tarefa duplicada'
                    : effectiveMode === 'create'
                    ? 'Criar tarefa'
                    : effectiveMode === 'execute'
                    ? 'Gravar execução'
                    : wasProvisional && !isProvisional ? 'Confirmar planeamento' : 'Gravar alterações'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Dialog>
  );
}
