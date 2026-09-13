import React, { useState, useEffect } from 'react';
import { X, Calendar, Users } from 'lucide-react';
import { Task, Project, Client, TaskType, User } from '../lib/types';
import { AssigneeSelector } from './AssigneeSelector';
import { getTaskTypeName, formatToOnlyHours } from '../lib/utils';

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
}: TaskDetailsModalProps) {
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
    if (task) {
      setTaskEditStatus(task.statusId || '');
      setTaskEditTypeId(task.taskTypeId || '');
      setTaskEditActualHours(formatToOnlyHours(task.actualHours));
      setTaskEditNotes(task.notes || '');
      setTaskEditStartDate(task.startDate || '');
      setTaskEditStartTime(task.startTime || '');
      setTaskEditEndDate(task.endDate || '');
      setTaskEditEndTime(task.endTime || '');
      setTaskEditAssignees(task.assigneeIds || []);
    }
  }, [task]);

  if (!task) return null;

  const taskProj = projects.find(p => p.id === task.projectId);
  const clientObj = taskProj ? clients.find(c => c.id === taskProj.clientId) : null;
  const taskClientName = clientObj ? (clientObj.clientName || clientObj.shortName || 'N/A') : 'N/A';
  const taskProjTitle = taskProj ? taskProj.title : 'N/A';

  const getUserName = (userId: string) => {
    const u = users.find(usr => usr.id === userId);
    return u ? u.name : userId;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (updateTask) {
      updateTask(task.id, {
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
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all duration-300">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <span className="text-[10px] uppercase font-extrabold text-blue-600 tracking-wider block">
              Visualização Individual de Tarefa
            </span>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              Cliente: <strong className="text-slate-800 font-bold">{taskClientName}</strong> | Projeto: <strong className="text-slate-800 font-bold">{taskProjTitle}</strong>
            </div>
            <h3 className="font-extrabold text-slate-900 text-base leading-snug mt-0.5">
              {task.title}
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

        {/* Read-only Task Info */}
        <div className="px-5 py-4 bg-blue-50/40 border-b border-blue-50 text-xs text-slate-600 space-y-2 shrink-0">
          {task.description && (
            <p className="font-medium text-slate-700 italic bg-white p-2.5 rounded-xl border border-slate-100">
              &quot;{task.description}&quot;
            </p>
          )}
          <div className="flex flex-wrap gap-4 text-[11px] font-semibold text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              Atribuído: <span className="text-slate-700 font-bold">
                {task.assigneeIds && task.assigneeIds.length > 0
                  ? task.assigneeIds.map(id => getUserName(id)).join(', ')
                  : 'Ninguém'}
              </span>
            </span>
            {task.estimatedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Data Prevista: <span className="text-slate-700 font-bold">{new Date(task.estimatedDate + 'T00:00:00').toLocaleDateString('pt-PT')}</span>
              </span>
            )}
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Task Status Dropdown */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Estado da Tarefa</label>
            <select 
              value={taskEditStatus}
              onChange={e => setTaskEditStatus(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-xs font-semibold text-slate-800"
            >
              {taskStatuses.filter(s => !s.deleted).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Task Type */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Tipo de Tarefa</label>
            <div className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 select-none">
              {getTaskTypeName(taskEditTypeId || task.taskTypeId, taskTypes) || 'Não definido'}
            </div>
          </div>

          {/* Consumed Hours */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Horas Consumidas Efetivas (Horas)</label>
            <input 
              type="number" 
              min="0"
              step="1"
              required
              value={taskEditActualHours}
              onChange={e => setTaskEditActualHours(e.target.value)}
              placeholder="Ex: 8"
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
            />
            <p className="text-[10px] text-slate-400 font-medium">Indique o número de horas efetivamente gastas nesta tarefa.</p>
          </div>

          {/* Date & Time grids */}
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Planeamento de Execução Efetiva</span>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">Data de Início Efetiva</label>
                <input 
                  type="date" 
                  value={taskEditStartDate}
                  onChange={e => setTaskEditStartDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">Hora de Início Efetiva</label>
                <input 
                  type="time" 
                  value={taskEditStartTime}
                  onChange={e => setTaskEditStartTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">Data de Fim Efetiva</label>
                <input 
                  type="date" 
                  value={taskEditEndDate}
                  onChange={e => setTaskEditEndDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-500">Hora de Fim Efetiva</label>
                <input 
                  type="time" 
                  value={taskEditEndTime}
                  onChange={e => setTaskEditEndTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Alocação de Técnicos */}
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

          {/* Execution Notes */}
          <div className="space-y-1 border-t border-slate-100 pt-3">
            <label className="block text-xs font-bold text-slate-700">Notas de Execução / Observações</label>
            <textarea 
              rows={3}
              value={taskEditNotes}
              onChange={e => setTaskEditNotes(e.target.value)}
              placeholder="Descreva detalhes da intervenção técnica realizada..."
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-800"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100/60">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-colors cursor-pointer text-xs"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-colors cursor-pointer text-xs shadow-md shadow-slate-100"
            >
              Gravar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
