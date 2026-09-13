'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Task, Project, Client, TaskType } from '../lib/types';
import { Plus, Search, Trash2, Edit2, Clock, Calendar, CheckSquare, PlusCircle, X, Users, Link2, Maximize2, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { AssigneeSelector } from './AssigneeSelector';
import TaskDetailsModal from './TaskDetailsModal';

import { hasPermission } from '../lib/permissions';
import { getTaskStatusName, getDefaultTaskStatusId, matchTaskStatusId, getTaskTypeName, getDefaultTaskTypeId, formatToOnlyHours } from '../lib/utils';

const getPaginationPages = (current: number, total: number): (number | string)[] => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
};

interface TaskSectionProps {
  tasks: Task[];
  projects: Project[];
  clients: Client[];
  users: any[];
  taskStatuses: any[];
  taskTypes?: TaskType[];
  addTask: (t: any) => void;
  updateTask: (id: string, updates: any) => void;
  deleteTask: (id: string) => void;
  currentUser?: any;
  userGroups?: any[];
  appConfig?: any;
}

const matchUserId = (idA: string, idB: string) => {
  if (!idA || !idB) return false;
  if (idA === idB) return true;
  const mappings: Record<string, string> = {
    'u-1': '11111111-1111-1111-1111-111111111111',
    'u-2': '11111111-1111-1111-1111-111111111112',
    'u-3': '11111111-1111-1111-1111-111111111113',
    'u-4': '11111111-1111-1111-1111-111111111114',
    'u-5': '11111111-1111-1111-1111-111111111115',
  };
  const normA = mappings[idA] || idA;
  const normB = mappings[idB] || idB;
  return normA === normB;
};

export default function TaskSection({
  tasks,
  projects,
  clients = [],
  users,
  taskStatuses,
  taskTypes = [],
  addTask,
  updateTask,
  deleteTask,
  currentUser,
  userGroups = [],
  appConfig,
}: TaskSectionProps) {
  const canReadTasks = hasPermission(currentUser, 'tasks_read', userGroups);
  const canWriteTasks = hasPermission(currentUser, 'tasks_write', userGroups);
  const canDeleteTasks = hasPermission(currentUser, 'tasks_delete', userGroups);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatusGroup, setFilterStatusGroup] = useState<'pending' | 'completed' | 'all'>('pending');
  const [filterAssignee, setFilterAssignee] = useState('');

  // Pagination & Sorting state
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<'estimatedDate' | 'status'>('estimatedDate');
  const [groupByProject, setGroupByProject] = useState<boolean>(false);

  // Kanban-specific state
  const [kanbanGroupByProject, setKanbanGroupByProject] = useState<boolean>(false);
  const [kanbanCollapseAllTasks, setKanbanCollapseAllTasks] = useState<boolean>(false);
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({});
  const [draggingOverColumnId, setDraggingOverColumnId] = useState<string | null>(null);
  const [isDraggingTaskId, setIsDraggingTaskId] = useState<string | null>(null);
  const [activeTaskViewTab, setActiveTaskViewTab] = useState<'lista' | 'kanban'>('lista');
  const [isKanbanFullscreen, setIsKanbanFullscreen] = useState<boolean>(false);

  // Reset pagination when filter/sorting/grouping variables change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [search, filterProject, filterStatus, filterStatusGroup, filterAssignee, pageSize, sortBy, groupByProject]);
  
  // Confirmation Modal state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm,
    });
  };

  // Modal / Form state
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formProj, setFormProj] = useState('');
  const [projectSearchInput, setProjectSearchInput] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [formStatus, setFormStatus] = useState('');
  const [formTaskType, setFormTaskType] = useState('');
  const [formAssignees, setFormAssignees] = useState<string[]>([]);
  const [formEstDate, setFormEstDate] = useState('');
  const [formEstHours, setFormEstHours] = useState('08:00');
  const [formActHours, setFormActHours] = useState('00:00');
  const [formStartDate, setFormStartDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const selectedProjectExistingTasks = useMemo(() => {
    if (!formProj) return [];
    return tasks
      .filter(t => t.projectId === formProj && !t.deleted && (!isEditing || t.id !== editingId))
      .sort((a, b) => {
        const dateA = a.estimatedDate || a.startDate || a.createdDate || '';
        const dateB = b.estimatedDate || b.startDate || b.createdDate || '';
        return dateA.localeCompare(dateB);
      });
  }, [formProj, tasks, isEditing, editingId]);

  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const handleCopyTaskLink = (taskId: string) => {
    if (typeof window === 'undefined') return;
    let url = window.location.origin + window.location.pathname + '?tab=tarefas&task=' + taskId;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(taskId);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  // View/Edit Single Task Modal State
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null);
  const [taskEditStatus, setTaskEditStatus] = useState('');
  const [taskEditType, setTaskEditType] = useState('');
  const [taskEditActualHours, setTaskEditActualHours] = useState('');
  const [taskEditNotes, setTaskEditNotes] = useState('');
  const [taskEditStartDate, setTaskEditStartDate] = useState('');
  const [taskEditStartTime, setTaskEditStartTime] = useState('');
  const [taskEditEndDate, setTaskEditEndDate] = useState('');
  const [taskEditEndTime, setTaskEditEndTime] = useState('');

  const openTaskDetailsModal = (task: Task) => {
    setSelectedTaskForDetails(task);
    setTaskEditStatus(task.statusId);
    setTaskEditType(task.taskTypeId || '');
    setTaskEditActualHours(formatToOnlyHours(task.actualHours));
    setTaskEditNotes(task.notes || '');
    setTaskEditStartDate(task.startDate || '');
    setTaskEditStartTime(task.startTime || '');
    setTaskEditEndDate(task.endDate || '');
    setTaskEditEndTime(task.endTime || '');
  };

  const handleSaveTaskDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForDetails) return;

    updateTask(selectedTaskForDetails.id, {
      statusId: taskEditStatus,
      taskTypeId: taskEditType || '',
      actualHours: formatToOnlyHours(taskEditActualHours),
      notes: taskEditNotes,
      startDate: taskEditStartDate,
      startTime: taskEditStartTime,
      endDate: taskEditEndDate,
      endTime: taskEditEndTime,
    });

    setSelectedTaskForDetails(null);
  };

  // Pre-build O(1) Map lookups for projects and clients
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  const getProjectWithClientLabel = (projId: string) => {
    const proj = projectMap.get(projId);
    if (!proj) return '';
    const client = clientMap.get(proj.clientId);
    const clientName = client ? client.clientName : 'Desconhecido';
    const ipPart = proj.installProjectNo ? ` (${proj.installProjectNo})` : '';
    return `${clientName} - ${proj.title}${ipPart}`;
  };

  // Filter tasks (only include tasks for active projects with deleted === false)
  const activeTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.deleted) return false;
      const proj = projectMap.get(t.projectId);
      if (!proj || proj.deleted) return false;
      return true;
    });
  }, [tasks, projectMap]);

  // Helper to resolve scale for task status
  const getTaskScale = React.useCallback((statusId: string) => {
    const status = taskStatuses.find(s => s.id === statusId || matchTaskStatusId(s.id, statusId));
    if (status && typeof status.scale === 'number') return status.scale;
    if (statusId === 'ts-1' || statusId === '99999999-9999-9999-9999-999999999901') return 1;
    if (statusId === 'ts-2' || statusId === '99999999-9999-9999-9999-999999999902') return 2;
    if (statusId === 'ts-3' || statusId === '99999999-9999-9999-9999-999999999903') return 3;
    if (statusId === 'ts-4' || statusId === '99999999-9999-9999-9999-999999999904') return 4;
    return 1;
  }, [taskStatuses]);

  const matchesStatusGroup = React.useCallback((statusId: string) => {
    if (filterStatusGroup === 'all') return true;
    const scale = getTaskScale(statusId);
    if (filterStatusGroup === 'pending') return scale === 1 || scale === 2;
    if (filterStatusGroup === 'completed') return scale === 3;
    return true;
  }, [filterStatusGroup, getTaskScale]);

  // Users with at least 1 defined task assigned to them
  const usersWithTasks = useMemo(() => {
    const userIdsWithTasks = new Set<string>();
    activeTasks.forEach(t => {
      if (t.assigneeIds && t.assigneeIds.length > 0) {
        t.assigneeIds.forEach(id => userIdsWithTasks.add(id));
      }
    });

    return users.filter(u => !u.deleted && u.type === 'Team' && Array.from(userIdsWithTasks).some(tid => matchUserId(u.id, tid)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'));
  }, [activeTasks, users]);

  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase().trim();
    return activeTasks.filter(t => {
      const proj = projectMap.get(t.projectId);
      const client = proj ? clientMap.get(proj.clientId) : null;
      const clientName = client ? (client.clientName || '').toLowerCase() : '';
      const clientShortName = client ? (client.shortName || '').toLowerCase() : '';
      const projTitle = proj ? (proj.title || '').toLowerCase() : '';
      const taskTitle = (t.title || '').toLowerCase();
      const taskDesc = (t.description || '').toLowerCase();

      const matchesSearch = !q || 
                            taskTitle.includes(q) || 
                            taskDesc.includes(q) ||
                            clientName.includes(q) ||
                            clientShortName.includes(q) ||
                            projTitle.includes(q);
      const matchesProject = filterProject ? t.projectId === filterProject : true;
      const matchesType = filterType ? t.taskTypeId === filterType : true;
      const matchesStatus = matchesStatusGroup(t.statusId);
      const matchesAssignee = filterAssignee ? t.assigneeIds.some(id => matchUserId(id, filterAssignee)) : true;
      return matchesSearch && matchesProject && matchesType && matchesStatus && matchesAssignee;
    });
  }, [activeTasks, search, filterProject, filterType, matchesStatusGroup, filterAssignee, projectMap, clientMap]);

  const sortTasks = (taskList: Task[]) => {
    return [...taskList].sort((a, b) => {
      if (sortBy === 'estimatedDate') {
        const dateA = a.estimatedDate || '';
        const dateB = b.estimatedDate || '';
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.localeCompare(dateB);
      } else {
        const statusA = taskStatuses.find(s => s.id === a.statusId || matchTaskStatusId(s.id, a.statusId));
        const statusB = taskStatuses.find(s => s.id === b.statusId || matchTaskStatusId(s.id, b.statusId));
        const scaleA = statusA ? (statusA.scale ?? 999) : 999;
        const scaleB = statusB ? (statusB.scale ?? 999) : 999;
        return scaleA - scaleB;
      }
    });
  };

  let processedTasks: Task[] = [];
  if (groupByProject) {
    const tasksByProject: Record<string, Task[]> = {};
    filteredTasks.forEach(t => {
      if (!tasksByProject[t.projectId]) {
        tasksByProject[t.projectId] = [];
      }
      tasksByProject[t.projectId].push(t);
    });

    const sortedProjectIds = Object.keys(tasksByProject).sort((idA, idB) => {
      const titleA = getProjectWithClientLabel(idA).toLowerCase();
      const titleB = getProjectWithClientLabel(idB).toLowerCase();
      return titleA.localeCompare(titleB);
    });

    sortedProjectIds.forEach(projId => {
      const sortedProjTasks = sortTasks(tasksByProject[projId]);
      processedTasks.push(...sortedProjTasks);
    });
  } else {
    processedTasks = sortTasks(filteredTasks);
  }

  const totalTasks = processedTasks.length;
  const totalPages = Math.ceil(totalTasks / pageSize) || 1;
  const validCurrentPage = Math.min(currentPage, totalPages);
  
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalTasks);
  const paginatedTasks = processedTasks.slice(startIndex, endIndex);

  const openForm = (task: Task | null) => {
    if (task) {
      if (!canWriteTasks) {
        alert('Não tem permissão para editar tarefas.');
        return;
      }
      setEditingId(task.id);
      setFormTitle(task.title);
      setFormDesc(task.description);
      setFormProj(task.projectId);
      setFormStatus(task.statusId);
      setFormTaskType(task.taskTypeId || '');
      setFormAssignees(task.assigneeIds || []);
      setFormEstDate(task.estimatedDate);
      setFormEstHours(task.estimatedHours);
      setFormActHours(formatToOnlyHours(task.actualHours));
      setFormStartDate(task.startDate || '');
      setFormStartTime(task.startTime || '');
      setFormEndDate(task.endDate || '');
      setFormEndTime(task.endTime || '');
      setFormNotes(task.notes || '');
      
      const initialSearch = getProjectWithClientLabel(task.projectId);
      setProjectSearchInput(initialSearch);
    } else {
      if (!canWriteTasks) {
        alert('Não tem permissão para criar novas tarefas.');
        return;
      }
      setEditingId(null);
      setFormTitle('');
      setFormDesc('');
      setFormProj('');
      setFormStatus(getDefaultTaskStatusId(taskStatuses));
      setFormTaskType('');
      setFormAssignees([]);
      setFormEstDate('');
      setFormEstHours('08:00');
      setFormActHours('0');
      setFormStartDate('');
      setFormStartTime('');
      setFormEndDate('');
      setFormEndTime('');
      setFormNotes('');
      
      setProjectSearchInput('');
    }
    setIsEditing(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteTasks) {
      alert('Não tem permissão para criar ou editar tarefas.');
      return;
    }
    const payload = {
      title: formTitle,
      description: formDesc,
      projectId: formProj,
      statusId: formStatus,
      taskTypeId: formTaskType || '',
      assigneeIds: formAssignees,
      estimatedDate: formEstDate,
      estimatedHours: formEstHours,
      actualHours: formatToOnlyHours(formActHours),
      startDate: formStartDate,
      startTime: formStartTime,
      endDate: formEndDate,
      endTime: formEndTime,
      notes: formNotes,
    };

    if (editingId) {
      updateTask(editingId, payload);
    } else {
      addTask(payload);
    }
    setIsEditing(false);
  };

  const handleToggleAssignee = (id: string) => {
    setFormAssignees(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const getProjectTitle = (projId: string) => {
    const proj = projects.find(p => p.id === projId);
    if (!proj) return 'Projeto';
    const client = clients.find(c => c.id === proj.clientId);
    const clientName = client ? client.clientName : 'Desconhecido';
    return `${clientName} - ${proj.title}`;
  };
  const getStatusName = (id: string) => getTaskStatusName(id, taskStatuses);

  const getUserName = (id: string) => users.find(u => matchUserId(u.id, id))?.name || 'N/A';

  const getUserInitials = (fullName: string) => {
    if (!fullName || fullName === 'N/A') return 'N/A';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) {
      return parts[0][0].toUpperCase();
    }
    const firstInitial = parts[0][0].toUpperCase();
    const lastInitial = parts[parts.length - 1][0].toUpperCase();
    return `${firstInitial}${lastInitial}`;
  };

  // Drag and Drop handlers for Kanban
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setIsDraggingTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDraggingOverColumnId(columnId);
  };

  const handleDragLeave = () => {
    setDraggingOverColumnId(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatusId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || isDraggingTaskId;
    setDraggingOverColumnId(null);
    setIsDraggingTaskId(null);
    if (taskId) {
      const existingTask = tasks.find(t => t.id === taskId);
      if (existingTask && existingTask.statusId === targetStatusId) {
        return;
      }
      updateTask(taskId, { statusId: targetStatusId });
    }
  };

  const renderKanbanTaskCard = (task: Task) => {
    return (
      <div
        key={task.id}
        draggable
        onDragStart={(e) => handleDragStart(e, task.id)}
        onDragEnd={() => {
          setIsDraggingTaskId(null);
          setDraggingOverColumnId(null);
        }}
        onClick={() => openTaskDetailsModal(task)}
        className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs hover:shadow-md cursor-grab active:cursor-grabbing hover:border-slate-300 transition-all duration-200 select-none group text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-extrabold text-slate-800 text-xs group-hover:text-blue-600 transition-colors">
              {task.title}
            </div>
            {task.taskTypeId && (
              <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-bold mt-1">
                {getTaskTypeName(task.taskTypeId, taskTypes)}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => openForm(task)}
              className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600"
              title="Editar"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => askConfirmation(
                'Confirmar Eliminação de Tarefa',
                'Tem a certeza que deseja eliminar esta tarefa? Esta ação é irreversível.',
                () => deleteTask(task.id)
              )}
              className="p-1 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-600"
              title="Eliminar"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {!kanbanCollapseAllTasks && (
          <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
            {!kanbanGroupByProject && (
              <div className="text-[9px] text-blue-600 font-bold line-clamp-1">
                📁 {getProjectTitle(task.projectId)}
              </div>
            )}
            
            {task.description && (
              <p className="text-[10px] text-slate-500 font-medium line-clamp-2 italic">
                {task.description}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1 text-[9px] font-bold font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                <Calendar className="w-3 h-3 text-slate-400" />
                {task.estimatedDate || 'Sem data'}
              </div>

              {task.assigneeIds && task.assigneeIds.length > 0 && (
                <div className="flex -space-x-1.5 overflow-hidden" title={task.assigneeIds.map(uid => getUserName(uid)).join(', ')}>
                  {task.assigneeIds.map(uid => (
                    <div
                      key={uid}
                      className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-extrabold text-slate-700 shadow-2xs shrink-0"
                      title={getUserName(uid)}
                    >
                      {getUserInitials(getUserName(uid))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {kanbanCollapseAllTasks && (
          <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-slate-400 border-t border-slate-100 pt-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {!kanbanGroupByProject && (
                <span className="font-bold text-blue-600 line-clamp-1 max-w-[100px]">
                  {getProjectTitle(task.projectId)}
                </span>
              )}
              <span className="font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                {task.estimatedDate || 'Sem data'}
              </span>
            </div>

            {task.assigneeIds && task.assigneeIds.length > 0 && (
              <div className="flex -space-x-1.5 overflow-hidden shrink-0" title={task.assigneeIds.map(uid => getUserName(uid)).join(', ')}>
                {task.assigneeIds.map(uid => (
                  <div
                    key={uid}
                    className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-extrabold text-slate-700 shadow-2xs"
                    title={getUserName(uid)}
                  >
                    {getUserInitials(getUserName(uid))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderKanbanColumns = () => {
    return taskStatuses.filter(s => !s.deleted).map(status => {
      const isColumnCollapsed = collapsedColumns[status.id] || false;
      const columnTasks = activeTasks.filter(t => t.statusId === status.id || matchTaskStatusId(t.statusId, status.id));
      
      const filteredColumnTasks = columnTasks.filter(t => {
        const proj = projects.find(p => p.id === t.projectId);
        const client = proj ? clients.find(c => c.id === proj.clientId) : null;
        const clientName = client ? client.clientName.toLowerCase() : '';

        const matchesSearch = search ? (
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          (t.description || '').toLowerCase().includes(search.toLowerCase()) ||
          clientName.includes(search.toLowerCase())
        ) : true;
        const matchesProject = filterProject ? t.projectId === filterProject : true;
        const matchesAssignee = filterAssignee ? t.assigneeIds.some(id => matchUserId(id, filterAssignee)) : true;
        return matchesSearch && matchesProject && matchesAssignee;
      });

      if (isColumnCollapsed) {
        return (
          <div
            key={status.id}
            onClick={() => setCollapsedColumns(prev => ({ ...prev, [status.id]: false }))}
            onDragOver={(e) => handleDragOver(e, status.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status.id)}
            className={`w-12 flex-shrink-0 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center py-4 cursor-pointer hover:bg-slate-100 transition-all duration-200 ${
              draggingOverColumnId === status.id ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''
            }`}
            title={`Clique para expandir "${status.name}"`}
          >
            <div className="text-[10px] font-extrabold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-full mb-3">
              {filteredColumnTasks.length}
            </div>
            <div 
              className="text-slate-700 font-extrabold text-xs tracking-wider whitespace-nowrap"
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
            >
              {status.name}
            </div>
          </div>
        );
      }

      let renderContent;
      if (kanbanGroupByProject) {
        const grouped: Record<string, Task[]> = {};
        filteredColumnTasks.forEach(t => {
          if (!grouped[t.projectId]) grouped[t.projectId] = [];
          grouped[t.projectId].push(t);
        });

        renderContent = Object.keys(grouped).map(projId => {
          const projTitle = getProjectWithClientLabel(projId) || 'Sem Projeto';
          const sortedProjTasks = sortTasks(grouped[projId]);
          return (
            <div key={projId} className="space-y-2 pt-1">
              <div className="text-[10px] font-extrabold text-blue-600 bg-blue-50/50 px-2 py-1 rounded-lg border border-blue-100/50 line-clamp-1">
                📁 {projTitle}
              </div>
              {sortedProjTasks.map(task => renderKanbanTaskCard(task))}
            </div>
          );
        });
      } else {
        const sortedColumnTasks = sortTasks(filteredColumnTasks);
        renderContent = (
          <div className="space-y-2">
            {sortedColumnTasks.map(task => renderKanbanTaskCard(task))}
          </div>
        );
      }

      return (
        <div
          key={status.id}
          onDragOver={(e) => handleDragOver(e, status.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, status.id)}
          className={`flex-1 min-w-[280px] max-w-[350px] bg-slate-50/60 border border-slate-200/80 rounded-2xl p-3 flex flex-col h-[550px] transition-all duration-200 ${
            draggingOverColumnId === status.id ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''
          }`}
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                status.id === 'ts-3' ? 'bg-emerald-500' :
                status.id === 'ts-2' ? 'bg-blue-500' :
                status.id === 'ts-4' ? 'bg-amber-500' :
                'bg-slate-400'
              }`} />
              <span className="font-extrabold text-xs text-slate-800">{status.name}</span>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded-md">
                {filteredColumnTasks.length}
              </span>
            </div>
            
            <button
              type="button"
              onClick={() => setCollapsedColumns(prev => ({ ...prev, [status.id]: true }))}
              className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
              title="Contrair Coluna"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-200">
            {filteredColumnTasks.length === 0 ? (
              <div className="h-24 flex items-center justify-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-[10px] font-medium italic text-center p-2">
                Nenhuma tarefa aqui
              </div>
            ) : (
              renderContent
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
      
      {isEditing ? (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 -sm animate-fade-in">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div className="flex flex-col">
              <h2 className="text-base font-bold text-slate-800">
                {editingId ? 'Editar Tarefa' : 'Adicionar Nova Tarefa ao Projeto'}
              </h2>
              {(() => {
                const selProj = projectMap.get(formProj) || projects.find(p => p.id === formProj);
                if (!selProj) return null;
                const selClient = clientMap.get(selProj.clientId) || clients.find(c => c.id === selProj.clientId);
                const cName = selClient ? selClient.clientName : 'N/A';
                return (
                  <span className="text-xs font-medium text-slate-500 mt-0.5">
                    Cliente: <strong className="text-slate-700 font-bold">{cName}</strong> | Projeto: <strong className="text-slate-700 font-bold">{selProj.title}</strong>
                  </span>
                );
              })()}
            </div>
            <button 
              type="button" 
              onClick={() => setIsEditing(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-bold text-slate-700">
            <div className="space-y-1 md:col-span-2">
              <label className="block text-slate-500">Título da Tarefa *</label>
              <input 
                type="text" 
                required
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Ex: Cablagem do quadro elétrico principal"
                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-slate-500">Descrição / Instruções Técnicas</label>
              <textarea 
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                rows={3}
                placeholder="Indique as especificações, perigos ou procedimentos técnicos..."
                className="w-full p-2.5 border border-slate-200 rounded-xl font-medium"
              />
            </div>

            <div className="space-y-1 relative md:col-span-2" id="project-autocomplete-container">
              <div className="flex items-center justify-between">
                <label className="block text-slate-500">Projeto Associado *</label>
                {formProj && (
                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    Projeto Selecionado
                  </span>
                )}
              </div>
              <div className="relative flex items-center">
                <input 
                  type="text"
                  required
                  value={projectSearchInput}
                  onChange={e => {
                    setProjectSearchInput(e.target.value);
                    setIsAutocompleteOpen(true);
                    if (!e.target.value) {
                      setFormProj('');
                    }
                  }}
                  onFocus={() => setIsAutocompleteOpen(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setIsAutocompleteOpen(false);
                      if (!projectSearchInput.trim()) {
                        setFormProj('');
                      } else if (!formProj) {
                        const activeProjects = projects.filter(p => !p.deleted);
                        const match = activeProjects.find(p => getProjectWithClientLabel(p.id).toLowerCase() === projectSearchInput.trim().toLowerCase());
                        if (match) {
                          setFormProj(match.id);
                          setProjectSearchInput(getProjectWithClientLabel(match.id));
                        }
                      }
                    }, 200);
                  }}
                  placeholder="Escreva para pesquisar projetos, clientes ou IP..."
                  className="w-full p-2.5 pr-8 border border-slate-200 rounded-xl bg-white font-semibold text-slate-800"
                />
                {projectSearchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormProj('');
                      setProjectSearchInput('');
                      setIsAutocompleteOpen(false);
                    }}
                    className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 cursor-pointer"
                    title="Limpar seleção"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {isAutocompleteOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100">
                  {(() => {
                    const activeProjects = projects.filter(p => !p.deleted);
                    const filtered = activeProjects.map(p => {
                      const label = getProjectWithClientLabel(p.id);
                      return { id: p.id, label };
                    }).filter(item => {
                      if (!projectSearchInput) return true;
                      return item.label.toLowerCase().includes(projectSearchInput.toLowerCase());
                    });

                    if (filtered.length === 0) {
                      return <div className="p-3 text-slate-400 text-center text-xs font-semibold">Nenhum projeto ou cliente encontrado</div>;
                    }

                    return filtered.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevents blur event, allowing immediate 1-click selection!
                          setFormProj(item.id);
                          setProjectSearchInput(item.label);
                          setIsAutocompleteOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 hover:bg-blue-50/70 transition-colors text-xs flex flex-col font-semibold cursor-pointer ${
                          formProj === item.id ? 'bg-blue-50 text-blue-900 font-bold' : 'text-slate-800'
                        }`}
                      >
                        <span>{item.label}</span>
                      </button>
                    ));
                  })()}
                </div>
              )}

              {/* Display existing tasks for selected project */}
              {formProj && (
                <div className="mt-3 p-3.5 bg-slate-50/90 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-800">
                        Tarefas Existentes no Projeto ({selectedProjectExistingTasks.length})
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium italic">
                      Informativo (não clicável)
                    </span>
                  </div>

                  {selectedProjectExistingTasks.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-1">
                      Este projeto ainda não tem tarefas associadas.
                    </p>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100/90 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                            <th className="py-2 px-3">Data</th>
                            <th className="py-2 px-3">Nome da Tarefa</th>
                            <th className="py-2 px-3 text-right">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 select-none pointer-events-none">
                          {selectedProjectExistingTasks.map(t => {
                            const statusName = getTaskStatusName(t.statusId, taskStatuses);
                            const dateDisplay = t.estimatedDate 
                              ? new Date(t.estimatedDate + 'T00:00:00').toLocaleDateString('pt-PT')
                              : (t.startDate ? new Date(t.startDate + 'T00:00:00').toLocaleDateString('pt-PT') : 'Sem data');
                            return (
                              <tr key={t.id} className="text-slate-700 font-medium">
                                <td className="py-2 px-3 text-slate-500 whitespace-nowrap text-[11px]">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{dateDisplay}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-3 font-semibold text-slate-800">
                                  {t.title}
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {statusName}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Estado da Tarefa *</label>
              <select 
                value={formStatus}
                onChange={e => setFormStatus(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
              >
                {taskStatuses.filter(s => !s.deleted).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Tipo de Tarefa</label>
              <select 
                value={formTaskType}
                onChange={e => setFormTaskType(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold cursor-pointer text-slate-800"
              >
                <option value="">Selecione o tipo de tarefa...</option>
                {taskTypes.filter(tt => !tt.deleted).map(tt => (
                  <option key={tt.id} value={tt.id}>
                    {getTaskTypeName(tt.id, taskTypes)}
                  </option>
                ))}
              </select>
            </div>

            {/* Hours */}
            <div className="space-y-1">
              <label className="block text-slate-500">Horas Estimadas (HH:MM) *</label>
              <input 
                type="text" 
                required
                value={formEstHours}
                onChange={e => setFormEstHours(e.target.value)}
                placeholder="Ex: 08:00"
                className="w-full p-2.5 border border-slate-200 rounded-xl text-slate-800"
              />
            </div>

            {/* Dates */}
            <div className="space-y-1">
              <label className="block text-slate-500">Data Prevista</label>
              <input 
                type="date" 
                value={formEstDate}
                onChange={e => setFormEstDate(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Notas Adicionais</label>
              <input 
                type="text" 
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Alguma nota de campo..."
                className="w-full p-2.5 border border-slate-200 rounded-xl font-medium"
              />
            </div>

            {/* Multiple Assignees */}
            <div className="md:col-span-2">
              <AssigneeSelector
                users={users}
                userGroups={userGroups}
                allowedGroupIds={appConfig?.taskAssigneeGroupIds}
                selectedIds={formAssignees}
                onChange={setFormAssignees}
                filterTeamOnly
              />
            </div>

          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button 
              type="button" 
              onClick={() => setIsEditing(false)}
              className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 -sm"
            >
              Gravar Tarefa
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          {/* View Selection Tabs */}
          <div className="flex border-b border-slate-200 gap-6 mb-2">
            <button
              onClick={() => setActiveTaskViewTab('lista')}
              className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTaskViewTab === 'lista'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Lista de Tarefas
            </button>
            <button
              onClick={() => setActiveTaskViewTab('kanban')}
              className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTaskViewTab === 'kanban'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Quadro Kanban
            </button>
          </div>

          {/* Shared Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            {/* Search Input */}
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <input 
                type="text" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              />
            </div>

            {/* Task Status Filter Buttons (Only in Lista view) */}
            {activeTaskViewTab !== 'kanban' && (
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setFilterStatusGroup('pending')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    filterStatusGroup === 'pending'
                      ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pendente
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatusGroup('completed')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    filterStatusGroup === 'completed'
                      ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Concluídas
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatusGroup('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    filterStatusGroup === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas
                </button>
              </div>
            )}

            {/* Task Type Filter */}
            <select 
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
            >
              <option value="">Todos os Tipos</option>
              {taskTypes.filter(tt => !tt.deleted).map(tt => (
                <option key={tt.id} value={tt.id}>{tt.name}</option>
              ))}
            </select>

            {/* Assignee Filter (Only users with assigned tasks) */}
            <select 
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
            >
              <option value="">Qualquer Responsável</option>
              {usersWithTasks.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {activeTaskViewTab === 'lista' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden animate-fade-in">
            
            <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/60 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Lista de tarefas</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Monitorize o estado de cada tarefa, horas estimadas e horas reais consumidas.</p>
                </div>
                {canWriteTasks && (
                  <button 
                    type="button"
                    onClick={() => openForm(null)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" /> Criar Tarefa
                  </button>
                )}
              </div>

              {/* Pagination, Sorting and Grouping controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/60">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Registos por página */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Mostrar:</span>
                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  {/* Ordenar por */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Ordenar por:</span>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as 'estimatedDate' | 'status')}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="estimatedDate">Data prevista (padrão)</option>
                      <option value="status">Estado</option>
                    </select>
                  </div>

                  {/* Agrupar por projeto */}
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer select-none hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={groupByProject}
                      onChange={e => setGroupByProject(e.target.checked)}
                      className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 cursor-pointer"
                    />
                    <span>Agrupar por Projeto</span>
                  </label>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  Total: <span className="font-bold text-slate-800">{totalTasks}</span> {totalTasks === 1 ? 'tarefa' : 'tarefas'}
                </div>
              </div>
            </div>

            {/* Table List Output */}
            <div className="overflow-x-auto w-full">
              {paginatedTasks.length === 0 ? (
                <div className="p-10 text-center text-slate-400 font-medium text-xs">Nenhuma tarefa encontrada.</div>
              ) : (
                <table className="w-full min-w-[750px] text-left border-collapse">
                  <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200/80 whitespace-nowrap select-none">
                    <tr>
                      <th className="px-5 py-3.5 text-left">Tarefa / Projeto</th>
                      <th className="px-5 py-3.5 text-left">Responsáveis</th>
                      <th className="px-5 py-3.5 text-left">Data prevista</th>
                      <th className="px-5 py-3.5 text-left w-[200px] whitespace-nowrap">Estado</th>
                      <th className="px-5 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-slate-100">
                    {paginatedTasks.map(t => (
                      <tr 
                        key={t.id} 
                        onClick={() => openTaskDetailsModal(t)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-800 text-sm">{t.title}</span>
                            {t.taskTypeId && (
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-bold">
                                {getTaskTypeName(t.taskTypeId, taskTypes)}
                              </span>
                            )}
                          </div>
                          <div className="text-blue-600 font-medium mt-0.5 line-clamp-1">{getProjectTitle(t.projectId)}</div>
                          <div className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic">{t.description}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {t.assigneeIds && t.assigneeIds.length > 0 ? (
                              t.assigneeIds.map(uid => (
                                <span key={uid} className="px-1.5 py-0.5 bg-slate-200 text-slate-700 font-bold rounded-md text-[9px]">
                                  {getUserName(uid)}
                                </span>
                              ))
                            ) : <span className="text-slate-400 italic">Não alocado</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-500 font-medium font-mono">
                          {t.estimatedDate || 'N/A'}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            getTaskScale(t.statusId) === 3 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            getTaskScale(t.statusId) === 2 ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                            getTaskScale(t.statusId) === 4 ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {getStatusName(t.statusId)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyTaskLink(t.id);
                              }}
                              className={`p-1.5 rounded-md ${copiedLinkId === t.id ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'}`}
                              title="Copiar Link"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                            {canWriteTasks && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openForm(t);
                                }}
                                className="p-1.5 hover:bg-blue-50 hover:text-blue-700 rounded-md text-slate-500"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDeleteTasks && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!canDeleteTasks) {
                                    alert('Não tem permissão para eliminar tarefas.');
                                    return;
                                  }
                                  askConfirmation(
                                    'Confirmar Eliminação de Tarefa',
                                    'Tem a certeza que deseja eliminar esta tarefa do projeto? Esta ação terá um efeito permanente.',
                                    () => deleteTask(t.id)
                                  );
                                }}
                                className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-md text-slate-500"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {totalTasks > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 bg-slate-50/70 border-t border-slate-200/80 text-xs gap-3 font-medium">
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                  <span>
                    A mostrar <span className="font-bold text-slate-700">{startIndex + 1}</span> a{' '}
                    <span className="font-bold text-slate-700">{endIndex}</span> de{' '}
                    <span className="font-bold text-slate-700">{totalTasks}</span> tarefas
                  </span>
                  <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                    <span className="text-slate-400">Por página:</span>
                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={validCurrentPage === 1}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </button>
                    
                    <div className="flex items-center gap-1 mx-1">
                      {getPaginationPages(validCurrentPage, totalPages).map((p, idx) => (
                        p === '...' ? (
                          <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 font-bold">...</span>
                        ) : (
                          <button
                            key={`page-${p}`}
                            onClick={() => setCurrentPage(Number(p))}
                            className={`min-w-[28px] h-7 px-1.5 flex items-center justify-center rounded-lg font-bold text-xs transition-colors ${
                              validCurrentPage === p
                                ? 'bg-slate-900 text-white'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      ))}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={validCurrentPage === totalPages}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <span>Seguinte</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {activeTaskViewTab === 'kanban' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                  Quadro Kanban de Tarefas
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Arraste e solte as tarefas entre colunas para atualizar instantaneamente o seu estado.</p>
              </div>

              {/* Kanban specific controls */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setKanbanCollapseAllTasks(prev => !prev)}
                  className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-colors ${
                    kanbanCollapseAllTasks 
                      ? 'bg-blue-50 text-blue-700 border-blue-200' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {kanbanCollapseAllTasks ? 'Expandir Detalhes' : 'Contrair Todas as Tarefas'}
                </button>

                <button
                  type="button"
                  onClick={() => setKanbanGroupByProject(prev => !prev)}
                  className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-colors ${
                    kanbanGroupByProject 
                      ? 'bg-blue-50 text-blue-700 border-blue-200' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {kanbanGroupByProject ? 'Sem Agrupamento por Projeto' : 'Agrupar por Projeto'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsKanbanFullscreen(true)}
                  className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  title="Abrir em Ecrã Cheio"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Ecrã Cheio
                </button>
              </div>
            </div>

            {/* Columns grid */}
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200">
              {renderKanbanColumns()}
            </div>
          </div>
          )}

          {/* Kanban Fullscreen Modal */}
          {isKanbanFullscreen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full h-[95vh] flex flex-col overflow-hidden animate-fade-in shadow-2xl border border-slate-200">
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 shrink-0">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                      Quadro Kanban de Tarefas <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Ecrã Cheio</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Arraste e solte as tarefas entre colunas para atualizar instantaneamente o seu estado.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setKanbanCollapseAllTasks(prev => !prev)}
                      className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-colors ${
                        kanbanCollapseAllTasks 
                          ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {kanbanCollapseAllTasks ? 'Expandir Detalhes' : 'Contrair Todas as Tarefas'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setKanbanGroupByProject(prev => !prev)}
                      className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-colors ${
                        kanbanGroupByProject 
                          ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {kanbanGroupByProject ? 'Sem Agrupamento por Projeto' : 'Agrupar por Projeto'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsKanbanFullscreen(false)}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                      Sair do Ecrã Cheio
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-5 bg-slate-50/30 flex gap-4">
                  {renderKanbanColumns()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task Single View / Edit Modal */}
      <TaskDetailsModal
        task={selectedTaskForDetails}
        onClose={() => setSelectedTaskForDetails(null)}
        updateTask={updateTask}
        taskStatuses={taskStatuses}
        taskTypes={taskTypes}
        users={users}
        userGroups={userGroups}
        appConfig={appConfig}
        projects={projects}
        clients={clients}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
