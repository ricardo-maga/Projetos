import React, { useState, useEffect, useMemo } from 'react';
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
  FileText
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
  taskStatuses = [],
  taskTypes = [],
  users = [],
  userGroups = [],
  appConfig,
  projects = [],
  clients = [],
  absences = [],
  tasks = [],
  canWrite = true,
  onSelectTask,
}: TaskDetailsModalProps) {
  // Modal visibility guard:
  // If isOpen is explicitly provided, use it.
  // Otherwise, only open if a task is provided.
  const isModalOpen = isOpen !== undefined ? isOpen : Boolean(task);

  // Determine mode
  const effectiveMode: TaskModalMode = initialMode || (task ? 'edit' : 'create');

  // Active task state
  const [activeTask, setActiveTask] = useState<Task | null>(task);
  useEffect(() => {
    if (task) {
      const found = Array.isArray(tasks) ? tasks.find(t => t.id === task.id) : null;
      setActiveTask(found || task);
    } else {
      setActiveTask(null);
    }
  }, [task, tasks]);

  // Form states
  const [formProjectId, setFormProjectId] = useState(initialProjectId);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatusId, setFormStatusId] = useState('');
  const [formTypeId, setFormTypeId] = useState('');
  const [formEstimatedDate, setFormEstimatedDate] = useState(initialDate);
  const [formEstimatedHours, setFormEstimatedHours] = useState('08:00');
  const [formActualHours, setFormActualHours] = useState('0');
  const [formStartDate, setFormStartDate] = useState(initialDate);
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndDate, setFormEndDate] = useState(initialDate);
  const [formEndTime, setFormEndTime] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAssignees, setFormAssignees] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form based on mode and task
  useEffect(() => {
    if (effectiveMode === 'create') {
      const defaultProj = initialProjectId || (projects.length > 0 ? projects[0].id : '');
      const defaultStatus = getDefaultTaskStatusId(taskStatuses);
      const defaultAssignees = initialAssigneeIds || (initialAssigneeId ? [initialAssigneeId] : []);
      
      setFormProjectId(defaultProj);
      setFormTitle('');
      setFormDescription('');
      setFormStatusId(defaultStatus);
      setFormTypeId('');
      setFormEstimatedDate(initialDate);
      setFormEstimatedHours('08:00');
      setFormActualHours('0');
      setFormStartDate(initialDate);
      setFormStartTime('');
      setFormEndDate(initialDate);
      setFormEndTime('');
      setFormNotes('');
      setFormAssignees(defaultAssignees);
      setFormError(null);
    } else if (activeTask) {
      setFormProjectId(activeTask.projectId || '');
      setFormTitle(activeTask.title || '');
      setFormDescription(activeTask.description || '');
      setFormStatusId(activeTask.statusId || getDefaultTaskStatusId(taskStatuses));
      setFormTypeId(activeTask.taskTypeId || '');
      setFormEstimatedDate(activeTask.estimatedDate || '');
      setFormEstimatedHours(formatToOnlyHours(activeTask.estimatedHours) || '0');
      setFormActualHours(formatToOnlyHours(activeTask.actualHours) || '0');
      setFormStartDate(activeTask.startDate || activeTask.estimatedDate || '');
      setFormStartTime(activeTask.startTime || '');
      setFormEndDate(activeTask.endDate || activeTask.estimatedDate || '');
      setFormEndTime(activeTask.endTime || '');
      setFormNotes(activeTask.notes || '');
      setFormAssignees(activeTask.assigneeIds || []);
      setFormError(null);
    }
  }, [effectiveMode, activeTask, initialProjectId, initialDate, initialAssigneeId, initialAssigneeIds, projects, taskStatuses]);

  // Conflict warnings calculation
  const conflictWarnings = useMemo(() => {
    const targetDate = formStartDate || formEstimatedDate || activeTask?.estimatedDate || activeTask?.startDate;
    return getTaskConflictWarnings({
      date: targetDate,
      assigneeIds: formAssignees,
      currentTaskId: activeTask?.id,
      tasks,
      users,
      absences,
      projects,
    });
  }, [formStartDate, formEstimatedDate, activeTask, formAssignees, tasks, users, absences, projects]);

  const activeProject = projects.find(p => p.id === (effectiveMode === 'create' ? formProjectId : activeTask?.projectId));
  const activeClient = activeProject ? clients.find(c => c.id === activeProject.clientId) : null;
  const clientName = activeClient ? (activeClient.clientName || activeClient.shortName || 'N/A') : 'N/A';
  const projectTitle = activeProject ? activeProject.title : 'N/A';

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

    if (!formProjectId) {
      setFormError('O projeto é obrigatório.');
      return;
    }

    // Validate execution times
    const timeVal = validateTaskExecutionTimes(formStartTime, formEndTime);
    if (!timeVal.valid) {
      setFormError(timeVal.error || 'A hora de fim deve ser estritamente posterior à hora de início.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (effectiveMode === 'create') {
        const payload = {
          projectId: formProjectId.trim(),
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
          projectId: formProjectId.trim(),
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
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <span className="text-[10px] uppercase font-extrabold text-blue-600 tracking-wider flex items-center gap-1">
              {effectiveMode === 'create' ? (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  Criar Nova Tarefa
                </>
              ) : effectiveMode === 'view' ? (
                <>
                  <FileText className="w-3.5 h-3.5" />
                  Detalhes da Tarefa
                </>
              ) : (
                <>
                  <CheckSquare className="w-3.5 h-3.5" />
                  Planeamento e Execução da Tarefa
                </>
              )}
            </span>

            {effectiveMode !== 'create' && (
              <div className="text-xs font-medium text-slate-500 mt-0.5">
                Cliente: <strong className="text-slate-800 font-bold">{clientName}</strong> | Projeto: <strong className="text-slate-800 font-bold">{projectTitle}</strong>
              </div>
            )}

            <h3 className="font-extrabold text-slate-900 text-base leading-snug mt-0.5">
              {effectiveMode === 'create' ? 'Nova Tarefa' : activeTask?.title}
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

        {/* Read-only banner if in edit/view mode */}
        {effectiveMode !== 'create' && activeTask && (
          <div className="px-5 py-3 bg-blue-50/40 border-b border-blue-50 text-xs text-slate-600 space-y-1.5 shrink-0">
            {activeTask.description && (
              <p className="font-medium text-slate-700 italic bg-white p-2 rounded-xl border border-slate-100">
                &quot;{activeTask.description}&quot;
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-[11px] font-semibold text-slate-500">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                Responsáveis: <span className="text-slate-700 font-bold">
                  {activeTask.assigneeIds && activeTask.assigneeIds.length > 0
                    ? activeTask.assigneeIds.map(id => getUserName(id)).join(', ')
                    : 'Sem utilizadores'}
                </span>
              </span>
              {activeTask.estimatedDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Data Planeada: <span className="text-slate-700 font-bold">{activeTask.estimatedDate.split('-').reverse().join('/')}</span>
                </span>
              )}
              {Boolean(activeTask.estimatedHours) && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Horas Previstas: <span className="text-slate-700 font-bold">{activeTask.estimatedHours} h</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Form Error Banner */}
        {formError && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Informative Conflict Warnings Banner */}
          {conflictWarnings.length > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs text-amber-900 font-medium whitespace-pre-line">
              <div className="font-bold flex items-center gap-1.5 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Conflitos Detectados
              </div>
              {conflictWarnings.map((warn, idx) => (
                <p key={idx} className="text-xs leading-relaxed">{warn}</p>
              ))}
            </div>
          )}

          {/* ================= SECTION 1: PLANEAMENTO ================= */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block border-b border-slate-100 pb-1">
              Dados de Planeamento
            </span>

            {/* Project Selection (Required in create mode, editable in edit mode) */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                Projeto <span className="text-rose-500">*</span>
              </label>
              <select
                disabled={isReadOnly}
                value={formProjectId}
                onChange={e => setFormProjectId(e.target.value)}
                required
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">Selecione um projeto...</option>
                {projects.filter(p => !p.deleted).map(p => {
                  const cl = clients.find(c => c.id === p.clientId);
                  const clStr = cl ? ` (${cl.clientName || cl.shortName})` : '';
                  return (
                    <option key={p.id} value={p.id}>
                      {p.title}{clStr}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                Título da Tarefa <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text"
                required
                readOnly={isReadOnly}
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Ex: Instalação de painéis, Visita técnica, Configuração de rede..."
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 read-only:bg-slate-50"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Descrição / Instruções</label>
              <textarea 
                rows={2}
                readOnly={isReadOnly}
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Detalhes adicionais ou escopo da tarefa..."
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 read-only:bg-slate-50"
              />
            </div>

            {/* Status & Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Estado da Tarefa <span className="text-rose-500">*</span></label>
                <select 
                  disabled={isReadOnly}
                  value={formStatusId}
                  onChange={e => setFormStatusId(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                >
                  {taskStatuses.filter(s => !s.deleted).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Tipo de Tarefa</label>
                <select
                  disabled={isReadOnly}
                  value={formTypeId}
                  onChange={e => setFormTypeId(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                >
                  <option value="">Selecione o tipo de tarefa...</option>
                  {taskTypes.filter(tt => !tt.deleted).map(tt => (
                    <option key={tt.id} value={tt.id}>{getTaskTypeName(tt.id, taskTypes)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Planned Date & Estimated Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Data Planeada</label>
                <input 
                  type="date"
                  readOnly={isReadOnly}
                  value={formEstimatedDate}
                  onChange={e => {
                    setFormEstimatedDate(e.target.value);
                    if (!formStartDate) setFormStartDate(e.target.value);
                    if (!formEndDate) setFormEndDate(e.target.value);
                  }}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 read-only:bg-slate-50"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Horas Previstas (h)</label>
                <input 
                  type="text"
                  readOnly={isReadOnly}
                  value={formEstimatedHours}
                  onChange={e => setFormEstimatedHours(e.target.value)}
                  placeholder="Ex: 08:00 ou 8"
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 read-only:bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* ================= SECTION 2: EXECUÇÃO ================= */}
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block border-b border-slate-100 pb-1">
              Dados de Execução
            </span>

            {/* Consumed Real Hours */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Horas Reais Consumidas (h)</label>
              <input 
                type="number" 
                min="0"
                step="0.5"
                readOnly={isReadOnly}
                value={formActualHours}
                onChange={e => setFormActualHours(e.target.value)}
                placeholder="Ex: 6"
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 focus:ring-2 focus:ring-blue-100 read-only:bg-slate-50"
              />
              <p className="text-[10px] text-slate-400 font-medium">As horas reais consumidas são independentes das horas previstas de planeamento.</p>
            </div>

            {/* Execution Dates and Times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">Data de Início</label>
                <input 
                  type="date" 
                  readOnly={isReadOnly}
                  value={formStartDate}
                  onChange={e => setFormStartDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-50"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">Hora de Início</label>
                <input 
                  type="time" 
                  readOnly={isReadOnly}
                  value={formStartTime}
                  onChange={e => setFormStartTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">Data de Fim</label>
                <input 
                  type="date" 
                  readOnly={isReadOnly}
                  value={formEndDate}
                  onChange={e => setFormEndDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-50"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">Hora de Fim</label>
                <input 
                  type="time" 
                  readOnly={isReadOnly}
                  value={formEndTime}
                  onChange={e => setFormEndTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-50"
                />
              </div>
            </div>

            {/* Execution Description */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Descrição / Notas de Execução</label>
              <textarea 
                rows={2}
                readOnly={isReadOnly}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Descreva o trabalho realizado, anotações de campo..."
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 read-only:bg-slate-50"
              />
            </div>
          </div>

          {/* Assignees Selector */}
          <div className="border-t border-slate-100 pt-3">
            <AssigneeSelector
              users={users}
              userGroups={userGroups}
              allowedGroupIds={appConfig?.taskAssigneeGroupIds}
              selectedIds={formAssignees}
              onChange={isReadOnly ? () => {} : setFormAssignees}
              filterTeamOnly
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-100">
            <div>
              {effectiveMode !== 'create' && !isReadOnly && deleteTask && activeTask && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold transition-colors cursor-pointer text-xs flex items-center gap-1.5"
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
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer text-xs"
              >
                {effectiveMode === 'view' ? 'Fechar' : 'Cancelar'}
              </button>

              {effectiveMode !== 'view' && canWrite && (
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-bold transition-colors cursor-pointer text-xs shadow-md shadow-slate-100 flex items-center gap-1.5"
                >
                  {isSubmitting ? 'A processar...' : effectiveMode === 'create' ? 'Criar Tarefa' : 'Gravar Alterações'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
