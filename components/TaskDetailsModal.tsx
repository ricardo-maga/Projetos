import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { Task, Project, Client, TaskType, User } from '../lib/types';
import { AssigneeSelector } from './AssigneeSelector';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import Textarea from './ui/Textarea';
import { SingleChoice } from './ui/SingleChoice';
import { getTaskTypeName, formatToOnlyHours, getDefaultTaskStatusId, getTaskStatusStyle, matchTaskStatusId } from '../lib/utils';
import { getTaskConflictWarnings } from '../lib/taskConflicts';
import { validateTaskExecutionTimes, parseTaskHoursToFloat } from '../lib/taskOperations';
import type { TaskUpdateInput } from '../lib/taskOperations';

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
  deleteTask?: (id: string) => Promise<any> | void;
  taskStatuses: any[];
  taskTypes?: TaskType[];
  users: User[];
  userGroups?: any[];
  appConfig?: any;
  projects: Project[];
  clients: Client[];
  absences?: any[];
  tasks?: Task[];
  canWrite?: boolean;
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
  users,
  userGroups = [],
  appConfig,
  projects,
  clients,
  absences = [],
  tasks = [],
  canWrite = true,
}: TaskDetailsModalProps) {
  // If isOpen is explicitly passed, respect it; otherwise consider open if task or initialMode is provided
  const isModalOpen = isOpen !== undefined ? isOpen : (Boolean(task) || Boolean(initialMode));

  // Mode defaults to edit if task is present, else create
  const effectiveMode: TaskModalMode = initialMode || (task ? 'edit' : 'create');
  const activeTask = task;
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
  const [formTypeId, setFormTypeId] = useState('');
  const [formEstimatedDate, setFormEstimatedDate] = useState('');
  const [formEstimatedHours, setFormEstimatedHours] = useState('08:00');
  const [formActualHours, setFormActualHours] = useState('0');
  const [formStartDate, setFormStartDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAssignees, setFormAssignees] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Initialize form based on mode and task
  useEffect(() => {
    if (effectiveMode === 'create') {
      if (activeTask) {
        // DADOS PRÉ-PREENCHIDOS PARA DUPLICAÇÃO
        const projId = activeTask.projectId || '';
        setFormProjectId(projId);
        const pObj = projects.find(p => p.id === projId);
        setProjectSearchQuery(pObj ? getProjectDisplayLabel(pObj) : '');

        setFormTitle(activeTask.title || '');
        setFormDescription(activeTask.description || '');
        setFormStatusId(getDefaultTaskStatusId(taskStatuses)); // Reset to default unstarted status on duplicate
        setFormTypeId(activeTask.taskTypeId || '');
        setFormEstimatedDate(activeTask.estimatedDate || '');
        setFormEstimatedHours(formatToOnlyHours(activeTask.estimatedHours) || '08:00');
        setFormActualHours('0'); // Reset actual hours to 0 on duplicate
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
        setFormTypeId('');
        // "Data planeada" prevalece, sem datas reais de início e fim inicialmente preenchidas
        setFormEstimatedDate(initialDate || '');
        setFormEstimatedHours('08:00');
        setFormActualHours('0');
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
      setFormTypeId(activeTask.taskTypeId || '');
      setFormEstimatedDate(activeTask.estimatedDate || '');
      setFormEstimatedHours(formatToOnlyHours(activeTask.estimatedHours) || '0');
      setFormActualHours(formatToOnlyHours(activeTask.actualHours) || '0');
      setFormStartDate(activeTask.startDate || '');
      setFormStartTime(activeTask.startTime || '');
      setFormEndDate(activeTask.endDate || '');
      setFormEndTime(activeTask.endTime || '');
      setFormNotes(activeTask.notes || '');
      setFormAssignees(getEffectiveAssignees(activeTask));
      setFormError(null);

      // If in execute mode, suggest completed status if currently pending and set default actual hours if 0
      if (effectiveMode === 'execute') {
        const estH = formatToOnlyHours(activeTask.estimatedHours) || '0';
        const actH = formatToOnlyHours(activeTask.actualHours) || '0';
        if (actH === '0' && estH !== '0') {
          setFormActualHours(estH);
        }
      }
    }
  }, [effectiveMode, activeTask, initialProjectId, initialDate, initialAssigneeId, initialAssigneeIds, projects, taskStatuses, getProjectDisplayLabel]);

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
      setFormError('A data de fim não pode ser anterior à data de início.');
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
      assigneeIds: formAssignees,
      currentTaskId: effectiveMode === 'create' ? null : activeTask?.id,
      tasks,
      users,
      absences,
      projects,
    });
  }, [formStartDate, formEndDate, formEstimatedDate, effectiveMode, activeTask, formAssignees, tasks, users, absences, projects]);

  const selectedProject = projects.find(p => p.id === formProjectId && !p.deleted);
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

    if (effectiveMode === 'view') {
      onClose();
      return;
    }

    if (!canWrite || isSubmitting) return;

    if (effectiveMode !== 'execute' && !formTitle.trim()) {
      setFormError('O título da tarefa é obrigatório.');
      return;
    }

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
      setFormError('A data de fim não pode ser anterior à data de início.');
      return;
    }

    // "se preenchermos data de início é obrigatório preencher data de fim"
    if (formStartDate && !formEndDate) {
      setFormError('Se preencher a data de início, é obrigatório preencher a data de fim.');
      return;
    }

    if (formEndDate && !formStartDate) {
      setFormError('Se preencher a data de fim, é obrigatório preencher a data de início.');
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
      setFormError(timeVal.error || 'A hora de fim deve ser estritamente posterior à hora de início.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (effectiveMode === 'create') {
        const payload = {
          projectId: resolvedProjectId,
          title: formTitle.trim(),
          description: formDescription.trim(),
          statusId: formStatusId || undefined,
          taskTypeId: formTypeId || undefined,
          estimatedDate: formEstimatedDate || undefined,
          estimatedHours: parseTaskHoursToFloat(formEstimatedHours),
          actualHours: parseTaskHoursToFloat(formActualHours),
          startDate: formStartDate || undefined,
          startTime: formStartTime || undefined,
          endDate: formEndDate || undefined,
          endTime: formEndTime || undefined,
          notes: formNotes.trim() || undefined,
          assigneeIds: formAssignees,
        };

        if (createTask) {
          const result = await createTask(payload);
          if (onSaveSuccess && result) onSaveSuccess(result);
        }
        onClose();
      } else if (activeTask && updateTask) {
        const payload = getTaskUpdatePayload(effectiveMode, {
          projectId: resolvedProjectId,
          title: formTitle.trim(),
          description: formDescription.trim(),
          statusId: formStatusId || undefined,
          taskTypeId: formTypeId || '',
          estimatedDate: formEstimatedDate || '',
          estimatedHours: parseTaskHoursToFloat(formEstimatedHours),
          actualHours: parseTaskHoursToFloat(formActualHours),
          startDate: formStartDate || '',
          startTime: formStartTime || '',
          endDate: formEndDate || '',
          endTime: formEndTime || '',
          notes: formNotes.trim() || '',
          assigneeIds: formAssignees,
        });

        const result = await updateTask(activeTask.id, payload);
        if (onSaveSuccess && result) onSaveSuccess(result);
        onClose();
      } else {
        onClose();
      }
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao processar a tarefa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!activeTask || !deleteTask) return;
    const confirmDelete = window.confirm(`Tem a certeza que deseja eliminar a tarefa "${activeTask.title}"?`);
    if (!confirmDelete) return;

    setIsSubmitting(true);
    try {
      await deleteTask(activeTask.id);
      if (onDeleteSuccess) onDeleteSuccess(activeTask.id);
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao eliminar a tarefa.');
      setIsSubmitting(false);
    }
  };

  const isReadOnly = effectiveMode === 'view' || !canWrite;
  const isPlanningReadOnly = isReadOnly || effectiveMode === 'execute';

  if (!isModalOpen) {
    return null;
  }

  return (
    <Dialog 
      isOpen={isModalOpen} 
      onClose={onClose} 
      title={isDuplication 
        ? `Nova Tarefa (Cópia de "${activeTask?.title}")` 
        : effectiveMode === 'create' 
        ? 'Nova Tarefa Operacional' 
        : activeTask?.title || 'Detalhes da Tarefa'}
      className="max-w-2xl"
    >
      <form onSubmit={handleSave} className="flex flex-col h-full">
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
            <span>{formError}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-label font-bold text-text-primary">Estado da tarefa</p>
            <SingleChoice
              label="Estado da tarefa"
              value={taskStatuses.find(s => s.id === formStatusId || matchTaskStatusId(s.id, formStatusId))?.id || formStatusId}
              options={taskStatuses.filter(s => !s.deleted).map(s => ({
                value: s.id,
                label: s.name,
                className: getTaskStatusStyle(s.id, taskStatuses).badgeClass,
              }))}
              onChange={setFormStatusId}
              disabled={isReadOnly || isSubmitting}
            />
          </div>
          
          {/* Informative Conflict Warnings Banner */}
          {conflictWarnings.length > 0 && (
            <div className="p-3.5 bg-warning/10 border border-warning/30 rounded-control space-y-1 text-body-sm text-warning font-medium whitespace-pre-line shadow-2xs">
              <div className="font-bold flex items-center gap-1.5 text-warning text-body-sm">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                Aviso Informativo de Conflitos / Indisponibilidade
              </div>
              {conflictWarnings.map((warn, idx) => (
                <p key={idx} className="text-body-sm leading-relaxed">{warn}</p>
              ))}
            </div>
          )}

          {/* ================= SECTION 1: PLANEAMENTO ================= */}
          <div className="bg-surface-muted p-4 rounded-card border border-border space-y-3.5">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-body-sm font-extrabold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-primary" />
                Dados de Planeamento
              </span>
              {effectiveMode === 'create' && (
                <span className="text-caption font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-badge">
                  Campos essenciais
                </span>
              )}
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label htmlFor="task-formTitle" className="block text-body-sm font-bold text-text-primary">
                Título da Tarefa <span className="text-error">*</span>
              </label>
              <Input id="task-formTitle"
                type="text"
                required
                readOnly={isPlanningReadOnly}
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Ex: Instalação de painéis, Visita técnica, Configuração de rede..."
                className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 focus:border-primary/20 read-only:bg-surface-muted"
              />
            </div>

            {/* Project Selection with Autocomplete and Suggestions */}
            <div className="space-y-1 relative" ref={projectDropdownRef}>
              <div className="flex items-center justify-between">
                <label htmlFor="task-projectSearchQuery" className="block text-label font-bold text-text-primary">
                  Projeto (Cliente) <span className="text-caption text-text-muted font-normal">(Opcional)</span>
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
                <Input id="task-projectSearchQuery"
                  ref={projectInputRef}
                  type="text"
                  readOnly={isPlanningReadOnly}
                  value={projectSearchQuery}
                  onChange={handleProjectInputChange}
                  onFocus={() => {
                    if (!isPlanningReadOnly) setIsProjectDropdownOpen(true);
                  }}
                  placeholder="Pesquisar por título de projeto ou nome de cliente (completo ou abreviado)..."
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
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-surface border border-border rounded-control shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-border animate-in fade-in zoom-in-95 duration-100">
                  <div className="p-2 bg-surface-muted text-caption uppercase font-bold text-text-muted tracking-wider flex items-center justify-between">
                    <span>Projetos Sugeridos ({projectSuggestions.length})</span>
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
                            isSelected ? 'bg-primary/10 text-primary font-bold' : 'text-text-primary font-medium'
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
                            <Check className="w-4 h-4 text-primary shrink-0 ml-2" />
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
                  Data Planeada <span className="text-caption text-text-muted font-normal">(Prevalece até existirem datas reais)</span>
                </label>
                <Input id="task-formEstimatedDate"
                  type="date"
                  readOnly={isPlanningReadOnly}
                  value={formEstimatedDate}
                  onChange={e => setFormEstimatedDate(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 read-only:bg-surface-muted"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="task-formEstimatedHours" className="block text-body-sm font-bold text-text-primary">Horas Previstas (h)</label>
                <Input id="task-formEstimatedHours"
                  type="text"
                  readOnly={isPlanningReadOnly}
                  value={formEstimatedHours}
                  onChange={e => setFormEstimatedHours(e.target.value)}
                  placeholder="Ex: 08:00 ou 8"
                  className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 read-only:bg-surface-muted"
                />
              </div>
            </div>

            {/* Task type (status is the first functional field above planning) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="task-formTypeId" className="block text-body-sm font-bold text-text-primary">Tipo de Tarefa</label>
                <Select id="task-formTypeId"
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
              <label htmlFor="task-formDescription" className="block text-body-sm font-bold text-text-primary">Descrição / Instruções de Planeamento</label>
              <Textarea id="task-formDescription"
                rows={2}
                readOnly={isPlanningReadOnly}
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Detalhes adicionais, escopo ou instruções..."
                className="w-full p-2.5 border border-border rounded-control bg-surface text-body-sm font-semibold text-text-primary focus:ring-2 focus:ring-primary/20 read-only:bg-surface-muted"
              />
            </div>

          </div>

            {/* Native fieldset disables the existing selector in read-only modes. */}
            <fieldset disabled={isReadOnly || isSubmitting} className="min-w-0">
              <AssigneeSelector
                users={users}
                userGroups={userGroups}
                allowedGroupIds={appConfig?.taskAssigneeGroupIds}
                selectedIds={formAssignees}
                onChange={isReadOnly ? () => {} : setFormAssignees}
                filterTeamOnly
              />
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
              {effectiveMode === 'create' ? (
                <span className="text-caption font-bold text-text-muted bg-surface-muted px-2 py-0.5 rounded-badge border border-border">
                  Opcional na criação
                </span>
              ) : effectiveMode === 'execute' ? (
                <span className="text-caption font-bold text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-badge flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-warning" />
                  Foco no registo de trabalho
                </span>
              ) : null}
            </div>

            {/* Consumed Real Hours */}
            <div className="space-y-1">
              <label htmlFor="task-formActualHours" className="block text-body-sm font-bold text-text-primary">
                Horas Reais Consumidas (h)
              </label>
              <Input id="task-formActualHours"
                type="number" 
                min="0"
                step="0.5"
                readOnly={isReadOnly}
                value={formActualHours}
                onChange={e => setFormActualHours(e.target.value)}
                placeholder="Ex: 6"
                className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary focus:ring-2 focus:ring-warning/20 read-only:bg-surface-muted"
              />
              <p className="text-caption text-text-muted font-medium">
                As horas reais representam o tempo efetivamente despendido na tarefa.
              </p>
            </div>

            {/* Execution Dates and Times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="task-formStartDate" className="block text-label font-bold text-text-primary">Data de Início</label>
                <Input id="task-formStartDate"
                  type="date" 
                  readOnly={isReadOnly}
                  value={formStartDate}
                  onChange={e => handleStartDateChange(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="task-formStartTime" className="block text-label font-bold text-text-primary">Hora de Início</label>
                <Input id="task-formStartTime"
                  type="time" 
                  readOnly={isReadOnly}
                  value={formStartTime}
                  onChange={e => setFormStartTime(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="task-formEndDate" className="block text-label font-bold text-text-primary">Data de Fim</label>
                <Input id="task-formEndDate"
                  type="date" 
                  readOnly={isReadOnly}
                  min={formStartDate || undefined}
                  value={formEndDate}
                  onChange={e => handleEndDateChange(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="task-formEndTime" className="block text-label font-bold text-text-primary">Hora de Fim</label>
                <Input id="task-formEndTime"
                  type="time" 
                  readOnly={isReadOnly}
                  value={formEndTime}
                  onChange={e => setFormEndTime(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
                />
              </div>
            </div>

            {/* Execution Description / Notes */}
            <div className="space-y-1">
              <label htmlFor="task-formNotes" className="block text-body-sm font-bold text-text-primary">Descrição / Notas de Execução</label>
              <Textarea id="task-formNotes"
                rows={2}
                readOnly={isReadOnly}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Relatório do trabalho efetuado, registos de campo ou observações..."
                className="w-full p-2.5 border border-border rounded-control text-body-sm font-semibold bg-surface text-text-primary read-only:bg-surface-muted"
              />
            </div>
          </div>

          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
            <div>
              {effectiveMode !== 'create' && !isReadOnly && deleteTask && activeTask && (
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

            <div className="flex items-center gap-2">
              <Button 
                type="button" 
                variant="secondary"
                size="sm"
                onClick={onClose}
              >
                {effectiveMode === 'view' ? 'Fechar' : 'Cancelar'}
              </Button>

              {effectiveMode !== 'view' && canWrite && (
                <Button 
                  type="submit" 
                  variant="primary"
                  size="sm"
                  isLoading={isSubmitting}
                >
                  {isSubmitting 
                    ? 'A processar...' 
                    : isDuplication
                    ? 'Criar Tarefa Duplicada'
                    : effectiveMode === 'create' 
                    ? 'Criar Tarefa' 
                    : effectiveMode === 'execute'
                    ? 'Registar Execução'
                    : 'Gravar Alterações'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Dialog>
  );
}
