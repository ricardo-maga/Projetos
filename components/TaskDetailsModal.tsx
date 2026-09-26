import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Calendar, 
  Users, 
  Clock, 
  AlertTriangle, 
  CheckSquare
} from 'lucide-react';
import { Task, Project, Client, TaskType, User } from '../lib/types';
import { AssigneeSelector } from './AssigneeSelector';
import { getTaskTypeName, formatToOnlyHours } from '../lib/utils';
import { getTaskConflictWarnings } from '../lib/taskConflicts';

interface TaskDetailsModalProps {
  task: Task | null;
  onClose: () => void;
  updateTask?: (id: string, updates: any) => void;
  taskStatuses: any[];
  taskTypes?: TaskType[];
  users: User[];
  userGroups?: any[];
  appConfig?: any;
  projects: Project[];
  clients: Client[];
  absences?: any[];
  planningAllocations?: any[];
  onCreateAllocation?: (input: any) => Promise<any>;
  onUpdateAllocation?: (id: string, input: any) => Promise<any>;
  onCancelAllocation?: (id: string, version: number) => Promise<any>;
  onDeleteAllocation?: (id: string) => Promise<any>;
  onFetchAllocations?: (filters?: any) => Promise<any>;
  createPlanningAllocation?: (input: any) => Promise<any>;
  updatePlanningAllocation?: (id: string, updates: any) => Promise<any>;
  cancelPlanningAllocation?: (id: string, version: number) => Promise<any>;
  deletePlanningAllocation?: (id: string) => Promise<any>;
  tasks?: Task[];
  onSelectTask?: (task: Task) => void;
  onViewTask?: (task: Task) => void;
}

export default function TaskDetailsModal({
  task,
  onClose,
  updateTask,
  taskStatuses = [],
  taskTypes = [],
  users = [],
  userGroups = [],
  appConfig,
  projects = [],
  clients = [],
  absences = [],
  tasks = [],
}: TaskDetailsModalProps) {
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

  const [taskEditStatus, setTaskEditStatus] = useState('');
  const [taskEditTypeId, setTaskEditTypeId] = useState('');
  const [taskEditActualHours, setTaskEditActualHours] = useState('');
  const [taskEditNotes, setTaskEditNotes] = useState('');
  const [taskEditStartDate, setTaskEditStartDate] = useState('');
  const [taskEditStartTime, setTaskEditStartTime] = useState('');
  const [taskEditEndDate, setTaskEditEndDate] = useState('');
  const [taskEditEndTime, setTaskEditEndTime] = useState('');
  const [taskEditAssignees, setTaskEditAssignees] = useState<string[]>([]);

  useEffect(() => {
    if (activeTask) {
      setTaskEditStatus(activeTask.statusId || '');
      setTaskEditTypeId(activeTask.taskTypeId || '');
      setTaskEditActualHours(formatToOnlyHours(activeTask.actualHours));
      setTaskEditNotes(activeTask.notes || '');
      setTaskEditStartDate(activeTask.startDate || activeTask.estimatedDate || '');
      setTaskEditStartTime(activeTask.startTime || '');
      setTaskEditEndDate(activeTask.endDate || activeTask.estimatedDate || '');
      setTaskEditEndTime(activeTask.endTime || '');
      setTaskEditAssignees(activeTask.assigneeIds || []);
    }
  }, [activeTask]);

  const conflictWarnings = useMemo(() => {
    const targetDate = taskEditStartDate || activeTask?.estimatedDate || activeTask?.startDate;
    return getTaskConflictWarnings({
      date: targetDate,
      assigneeIds: taskEditAssignees,
      currentTaskId: activeTask?.id,
      tasks,
      users,
      absences,
      projects,
    });
  }, [taskEditStartDate, activeTask, taskEditAssignees, tasks, users, absences, projects]);

  if (!activeTask) return null;

  const taskProj = projects.find(p => p.id === activeTask.projectId);
  const clientObj = taskProj ? clients.find(c => c.id === taskProj.clientId) : null;
  const taskClientName = clientObj ? (clientObj.clientName || clientObj.shortName || 'N/A') : 'N/A';
  const taskProjTitle = taskProj ? taskProj.title : 'N/A';

  const getUserName = (userId: string) => {
    const u = users.find(usr => usr.id === userId);
    return u ? u.name : userId;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation: End time must be strictly after Start time
    if (taskEditStartTime && taskEditEndTime && taskEditEndTime <= taskEditStartTime) {
      alert('A hora de fim deve ser posterior à hora de início.');
      return;
    }

    if (updateTask && activeTask) {
      try {
        await updateTask(activeTask.id, {
          statusId: taskEditStatus,
          taskTypeId: taskEditTypeId || '',
          actualHours: formatToOnlyHours(taskEditActualHours),
          notes: taskEditNotes,
          startDate: taskEditStartDate,
          startTime: taskEditStartTime,
          endDate: taskEditEndDate,
          endTime: taskEditEndTime,
          assigneeIds: taskEditAssignees,
        });
        onClose();
      } catch (err) {
        console.error('Erro ao gravar alterações na tarefa:', err);
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all duration-300">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <span className="text-[10px] uppercase font-extrabold text-blue-600 tracking-wider block flex items-center gap-1">
              <CheckSquare className="w-3 h-3" />
              Execução e Detalhes da Tarefa
            </span>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              Cliente: <strong className="text-slate-800 font-bold">{taskClientName}</strong> | Projeto: <strong className="text-slate-800 font-bold">{taskProjTitle}</strong>
            </div>
            <h3 className="font-extrabold text-slate-900 text-base leading-snug mt-0.5">
              {activeTask.title}
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

        {/* Read-only Task Info Banner */}
        <div className="px-5 py-3.5 bg-blue-50/40 border-b border-blue-50 text-xs text-slate-600 space-y-2 shrink-0">
          {activeTask.description && (
            <p className="font-medium text-slate-700 italic bg-white p-2.5 rounded-xl border border-slate-100">
              &quot;{activeTask.description}&quot;
            </p>
          )}
          <div className="flex flex-wrap gap-4 text-[11px] font-semibold text-slate-500 pt-0.5">
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

          {/* Task Status & Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Estado da Tarefa *</label>
              <select 
                value={taskEditStatus}
                onChange={e => setTaskEditStatus(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100"
              >
                {taskStatuses.filter(s => !s.deleted).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Tipo de Tarefa</label>
              <select
                value={taskEditTypeId}
                onChange={e => setTaskEditTypeId(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecione o tipo de tarefa...</option>
                {taskTypes.filter(tt => !tt.deleted).map(tt => (
                  <option key={tt.id} value={tt.id}>{getTaskTypeName(tt.id, taskTypes)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Consumed Real Hours */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Horas Reais Consumidas (h)</label>
            <input 
              type="number" 
              min="0"
              step="0.5"
              value={taskEditActualHours}
              onChange={e => setTaskEditActualHours(e.target.value)}
              placeholder="Ex: 6"
              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
            />
            <p className="text-[10px] text-slate-400 font-medium">As horas reais consumidas são independentes das horas previstas.</p>
          </div>

          {/* Execution Dates and Times */}
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Registo de Horário de Execução</span>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">Data de Início</label>
                <input 
                  type="date" 
                  value={taskEditStartDate}
                  onChange={e => setTaskEditStartDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">Hora de Início</label>
                <input 
                  type="time" 
                  value={taskEditStartTime}
                  onChange={e => setTaskEditStartTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">Data de Fim</label>
                <input 
                  type="date" 
                  value={taskEditEndDate}
                  onChange={e => setTaskEditEndDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">Hora de Fim</label>
                <input 
                  type="time" 
                  value={taskEditEndTime}
                  onChange={e => setTaskEditEndTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Assignees */}
          <div className="border-t border-slate-100 pt-3">
            <AssigneeSelector
              users={users}
              userGroups={userGroups}
              allowedGroupIds={appConfig?.taskAssigneeGroupIds}
              selectedIds={taskEditAssignees}
              onChange={setTaskEditAssignees}
              filterTeamOnly
            />
          </div>

          {/* Execution Description */}
          <div className="space-y-1 border-t border-slate-100 pt-3">
            <label className="block text-xs font-bold text-slate-700">Descrição / Notas de Execução</label>
            <textarea 
              rows={3}
              value={taskEditNotes}
              onChange={e => setTaskEditNotes(e.target.value)}
              placeholder="Descreva o trabalho realizado, observações de campo..."
              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer text-xs"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-colors cursor-pointer text-xs shadow-md shadow-slate-100"
            >
              Gravar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
