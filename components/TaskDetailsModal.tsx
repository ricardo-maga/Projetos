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
import { getTaskTypeName, formatToOnlyHours, getDefaultTaskStatusId } from '../lib/utils';
import { getTaskConflictWarnings } from '../lib/taskConflicts';
import { validateTaskExecutionTimes, parseTaskHoursToFloat } from '../lib/taskOperations';

export type TaskModalMode = 'create' | 'edit' | 'execute' | 'view';

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

    if (!formTitle.trim()) {
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
        const payload = {
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
        };

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

  if (!isModalOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all duration-300">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className={`p-1 rounded-lg ${
                isDuplication 
                  ? 'bg-indigo-100 text-indigo-700' 
                  : effectiveMode === 'create'
                  ? 'bg-blue-100 text-blue-700'
                  : effectiveMode === 'execute'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {isDuplication ? (
                  <Copy className="w-4 h-4" />
                ) : effectiveMode === 'create' ? (
                  <PlusCircle className="w-4 h-4" />
                ) : effectiveMode === 'execute' ? (
                  <PlayCircle className="w-4 h-4" />
                ) : effectiveMode === 'view' ? (
                  <FileText className="w-4 h-4" />
                ) : (
                  <CheckSquare className="w-4 h-4" />
                )}
              </span>
              <span className={`text-[11px] uppercase font-extrabold tracking-wider ${
                isDuplication ? 'text-indigo-700' : 'text-blue-700'
              }`}>
                {isDuplication
                  ? 'Duplicação de Tarefa'
                  : effectiveMode === 'create'
                  ? 'Criação Rápida de Tarefa'
                  : effectiveMode === 'execute'
                  ? 'Registo e Execução da Tarefa'
                  : effectiveMode === 'view'
                  ? 'Detalhes da Tarefa'
                  : 'Edição de Tarefa'}
              </span>
            </div>

            {effectiveMode !== 'create' && (
              <div className="text-xs font-medium text-slate-500 mt-1">
                Cliente: <strong className="text-slate-800 font-bold">{clientName}</strong> | Projeto: <strong className="text-slate-800 font-bold">{projectTitle}</strong>
              </div>
            )}

            <h3 className="font-extrabold text-slate-900 text-base leading-snug mt-1">
              {isDuplication 
                ? `Nova Tarefa (Cópia de "${activeTask?.title}")` 
                : effectiveMode === 'create' 
                ? 'Nova Tarefa Operacional' 
                : activeTask?.title}
            </h3>
            {isDuplication && (
              <p className="text-xs text-slate-500 mt-0.5">
                Os dados foram pré-preenchidos de acordo com a tarefa original. A nova tarefa só será criada ao clicar em Guardar.
              </p>
            )}
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            title="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Read-only banner if in edit/view mode */}
        {effectiveMode !== 'create' && activeTask && (
          <div className="px-6 py-3 bg-blue-50/50 border-b border-blue-100 text-xs text-slate-600 space-y-1.5 shrink-0">
            {activeTask.description && (
              <p className="font-medium text-slate-700 italic bg-white p-2 rounded-xl border border-slate-100">
                &quot;{activeTask.description}&quot;
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-[11px] font-semibold text-slate-600">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                Responsáveis: <span className="text-slate-900 font-bold">
                  {getEffectiveAssignees(activeTask).length > 0
                    ? getEffectiveAssignees(activeTask).map(id => getUserName(id)).join(', ')
                    : 'Sem utilizadores'}
                </span>
              </span>
              {activeTask.estimatedDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Data Planeada: <span className="text-slate-900 font-bold">{activeTask.estimatedDate.split('-').reverse().join('/')}</span>
                </span>
              )}
              {Boolean(activeTask.estimatedHours) && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Horas Previstas: <span className="text-slate-900 font-bold">{activeTask.estimatedHours} h</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Form Error Banner */}
        {formError && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Informative Conflict Warnings Banner */}
          {conflictWarnings.length > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs text-amber-900 font-medium whitespace-pre-line shadow-2xs">
              <div className="font-bold flex items-center gap-1.5 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Aviso Informativo de Conflitos / Indisponibilidade
              </div>
              {conflictWarnings.map((warn, idx) => (
                <p key={idx} className="text-xs leading-relaxed">{warn}</p>
              ))}
            </div>
          )}

          {/* ================= SECTION 1: PLANEAMENTO ================= */}
          <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-blue-600" />
                Dados de Planeamento
              </span>
              {effectiveMode === 'create' && (
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  Campos essenciais
                </span>
              )}
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Título da Tarefa <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text"
                required
                readOnly={isReadOnly}
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Ex: Instalação de painéis, Visita técnica, Configuração de rede..."
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 read-only:bg-slate-100"
              />
            </div>

            {/* Project Selection with Autocomplete and Suggestions */}
            <div className="space-y-1 relative" ref={projectDropdownRef}>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800">
                  Projeto (Cliente) <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
                </label>
                {selectedProject && (
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-200 flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" /> Projeto selecionado
                  </span>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <input
                  ref={projectInputRef}
                  type="text"
                  readOnly={isReadOnly}
                  value={projectSearchQuery}
                  onChange={handleProjectInputChange}
                  onFocus={() => {
                    if (!isReadOnly) setIsProjectDropdownOpen(true);
                  }}
                  placeholder="Pesquisar por título de projeto ou nome de cliente (completo ou abreviado)..."
                  className={`w-full pl-9 pr-8 py-2.5 border rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors ${
                    formProjectId 
                      ? 'border-blue-300 bg-blue-50/20 text-slate-900 font-bold' 
                      : 'border-slate-200 bg-white text-slate-800'
                  } read-only:bg-slate-100 read-only:text-slate-500`}
                />
                {!isReadOnly && projectSearchQuery && (
                  <button
                    type="button"
                    onClick={handleClearProject}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Limpar seleção"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {!isReadOnly && isProjectDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                  <div className="p-2 bg-slate-50 text-[10px] uppercase font-extrabold text-slate-500 tracking-wider flex items-center justify-between">
                    <span>Projetos Sugeridos ({projectSuggestions.length})</span>
                    <span className="font-normal lowercase">opcional</span>
                  </div>
                  {projectSuggestions.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500 italic text-center">
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
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelectProject(p)}
                          className={`w-full text-left px-3.5 py-2.5 hover:bg-blue-50/80 transition-colors flex items-center justify-between text-xs cursor-pointer ${
                            isSelected ? 'bg-blue-50 text-blue-900 font-bold' : 'text-slate-800 font-medium'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-bold text-slate-900 truncate">
                              {p.title}
                              {p.installProjectNo && (
                                <span className="ml-1 text-[10px] text-slate-500 font-normal">
                                  #{p.installProjectNo}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate mt-0.5">
                              <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{clDisplay}</span>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Planned Date & Estimated Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">
                  Data Planeada <span className="text-[10px] text-slate-500 font-normal">(Prevalece até existirem datas reais)</span>
                </label>
                <input 
                  type="date"
                  readOnly={isReadOnly}
                  value={formEstimatedDate}
                  onChange={e => setFormEstimatedDate(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 read-only:bg-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">Horas Previstas (h)</label>
                <input 
                  type="text"
                  readOnly={isReadOnly}
                  value={formEstimatedHours}
                  onChange={e => setFormEstimatedHours(e.target.value)}
                  placeholder="Ex: 08:00 ou 8"
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 read-only:bg-slate-100"
                />
              </div>
            </div>

            {/* Status & Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">Estado da Tarefa <span className="text-rose-500">*</span></label>
                <select 
                  disabled={isReadOnly}
                  value={formStatusId}
                  onChange={e => setFormStatusId(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 cursor-pointer"
                >
                  {taskStatuses.filter(s => !s.deleted).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">Tipo de Tarefa</label>
                <select
                  disabled={isReadOnly}
                  value={formTypeId}
                  onChange={e => setFormTypeId(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 cursor-pointer"
                >
                  <option value="">Selecione o tipo de tarefa...</option>
                  {taskTypes.filter(tt => !tt.deleted).map(tt => (
                    <option key={tt.id} value={tt.id}>{getTaskTypeName(tt.id, taskTypes)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description (Instructions) */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">Descrição / Instruções de Planeamento</label>
              <textarea 
                rows={2}
                readOnly={isReadOnly}
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Detalhes adicionais, escopo ou instruções..."
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 read-only:bg-slate-100"
              />
            </div>

            {/* Assignees Selector */}
            <div className="pt-2">
              <AssigneeSelector
                users={users}
                userGroups={userGroups}
                allowedGroupIds={appConfig?.taskAssigneeGroupIds}
                selectedIds={formAssignees}
                onChange={isReadOnly ? () => {} : setFormAssignees}
                filterTeamOnly
              />
            </div>
          </div>

          {/* ================= SECTION 2: EXECUÇÃO (Available in all modes) ================= */}
          <div className={`p-4 rounded-2xl border space-y-3.5 transition-all ${
            effectiveMode === 'execute' 
              ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-200/60' 
              : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4 text-amber-600" />
                Dados de Execução Real
              </span>
              {effectiveMode === 'create' ? (
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  Opcional na criação
                </span>
              ) : effectiveMode === 'execute' ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-amber-600" />
                  Foco no registo de trabalho
                </span>
              ) : null}
            </div>

            {/* Consumed Real Hours */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Horas Reais Consumidas (h)
              </label>
              <input 
                type="number" 
                min="0"
                step="0.5"
                readOnly={isReadOnly}
                value={formActualHours}
                onChange={e => setFormActualHours(e.target.value)}
                placeholder="Ex: 6"
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 focus:ring-2 focus:ring-amber-200 read-only:bg-slate-100"
              />
              <p className="text-[10px] text-slate-500 font-medium">
                As horas reais representam o tempo efetivamente despendido na tarefa.
              </p>
            </div>

            {/* Execution Dates and Times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">Data de Início</label>
                <input 
                  type="date" 
                  readOnly={isReadOnly}
                  value={formStartDate}
                  onChange={e => handleStartDateChange(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-100"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">Hora de Início</label>
                <input 
                  type="time" 
                  readOnly={isReadOnly}
                  value={formStartTime}
                  onChange={e => setFormStartTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">Data de Fim</label>
                <input 
                  type="date" 
                  readOnly={isReadOnly}
                  min={formStartDate || undefined}
                  value={formEndDate}
                  onChange={e => handleEndDateChange(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-100"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">Hora de Fim</label>
                <input 
                  type="time" 
                  readOnly={isReadOnly}
                  value={formEndTime}
                  onChange={e => setFormEndTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-100"
                />
              </div>
            </div>

            {/* Execution Description / Notes */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">Descrição / Notas de Execução</label>
              <textarea 
                rows={2}
                readOnly={isReadOnly}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Relatório do trabalho efetuado, registos de campo ou observações..."
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-100"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200">
            <div>
              {effectiveMode !== 'create' && !isReadOnly && deleteTask && activeTask && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="h-10 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold transition-colors cursor-pointer text-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar Tarefa
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button 
                type="button" 
                onClick={onClose}
                className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer text-xs sm:text-sm"
              >
                {effectiveMode === 'view' ? 'Fechar' : 'Cancelar'}
              </button>

              {effectiveMode !== 'view' && canWrite && (
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className={`h-10 px-5 text-white rounded-xl font-bold transition-all cursor-pointer text-xs sm:text-sm shadow-xs flex items-center gap-1.5 ${
                    isDuplication
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
                  }`}
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
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
