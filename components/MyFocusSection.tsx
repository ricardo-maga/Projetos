'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { 
  Task, Project, Client, Notification, TaskStatus, ProjectStatus, User, SpecialDay, TaskType
} from '../lib/types';
import { TASK_STATUS_ID_MAPPINGS, getTaskTypeName, formatToOnlyHours } from '../lib/utils';
import { AssigneeSelector } from './AssigneeSelector';
import TaskDetailsModal from './TaskDetailsModal';
import { 
  CheckSquare, Briefcase, Bell, Calendar as CalendarIcon, ChevronLeft, 
  ChevronRight, Check, Sparkles, Clock, AlertCircle, ArrowRight, 
  CheckCircle2, Circle, CircleDot, StickyNote, Plus, Trash2, FolderKanban, Flag, UserCheck, X, PartyPopper
} from 'lucide-react';

interface MyFocusSectionProps {
  currentUser: User;
  users?: User[];
  userGroups?: any[];
  tasks: Task[];
  projects: Project[];
  clients: Client[];
  specialDays?: SpecialDay[];
  notifications: Notification[];
  taskStatuses: TaskStatus[];
  taskTypes?: TaskType[];
  userAbsences?: any[];
  projectStatuses: ProjectStatus[];
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: (userId: string) => void;
  updateTask: (id: string, updates: any) => void;
  onSelectProject: (id: string) => void;
  onNavigateTab: (tabId: string) => void;
  appConfig?: any;
}

export default function MyFocusSection({
  currentUser,
  users = [],
  userGroups = [],
  tasks = [],
  projects = [],
  clients = [],
  specialDays = [],
  notifications = [],
  taskStatuses = [],
  taskTypes = [],
  userAbsences = [],
  projectStatuses = [],
  markNotificationAsRead,
  markAllNotificationsAsRead,
  updateTask,
  onSelectProject,
  onNavigateTab,
  appConfig
}: MyFocusSectionProps) {
  // Task filter state
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  // Project filter state ('active' | 'all' | 'completed')
  const [projectFilter, setProjectFilter] = useState<'active' | 'all' | 'completed'>('active');

  // Task details modal state
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null);
  const [taskEditStatus, setTaskEditStatus] = useState('');
  const [taskEditType, setTaskEditType] = useState('');
  const [taskEditActualHours, setTaskEditActualHours] = useState('');
  const [taskEditNotes, setTaskEditNotes] = useState('');
  const [taskEditStartDate, setTaskEditStartDate] = useState('');
  const [taskEditStartTime, setTaskEditStartTime] = useState('');
  const [taskEditEndDate, setTaskEditEndDate] = useState('');
  const [taskEditEndTime, setTaskEditEndTime] = useState('');
  const [taskEditAssignees, setTaskEditAssignees] = useState<string[]>([]);

  const openTaskDetailsModal = (task: Task) => {
    setSelectedTaskForDetails(task);
    setTaskEditStatus(task.statusId || '');
    setTaskEditType(task.taskTypeId || '');
    setTaskEditActualHours(formatToOnlyHours(task.actualHours));
    setTaskEditNotes(task.notes || '');
    setTaskEditStartDate(task.startDate || '');
    setTaskEditStartTime(task.startTime || '');
    setTaskEditEndDate(task.endDate || '');
    setTaskEditEndTime(task.endTime || '');
    setTaskEditAssignees(task.assigneeIds || []);
  };

  const handleSaveTaskDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForDetails || !updateTask) return;

    updateTask(selectedTaskForDetails.id, {
      statusId: taskEditStatus,
      taskTypeId: taskEditType || '',
      actualHours: formatToOnlyHours(taskEditActualHours),
      notes: taskEditNotes,
      startDate: taskEditStartDate,
      startTime: taskEditStartTime,
      endDate: taskEditEndDate,
      endTime: taskEditEndTime,
      assigneeIds: taskEditAssignees,
    });

    setSelectedTaskForDetails(null);
  };

  // Notification filter state
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');

  // Calendar state
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());
  
  // Format today YYYY-MM-DD
  const formatYMD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = useMemo(() => formatYMD(new Date()), []);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  // Personal calendar notes state (stored per user in localStorage)
  const [userNotes, setUserNotes] = useState<Record<string, string[]>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`focus_notes_${currentUser.id}`);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error('Error loading focus notes:', e);
      }
    }
    return {};
  });

  const [newNoteText, setNewNoteText] = useState('');

  const saveNotes = (updated: Record<string, string[]>) => {
    setUserNotes(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`focus_notes_${currentUser.id}`, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving focus notes:', e);
      }
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    const existing = userNotes[selectedDateStr] || [];
    const updated = {
      ...userNotes,
      [selectedDateStr]: [...existing, newNoteText.trim()]
    };
    saveNotes(updated);
    setNewNoteText('');
  };

  const handleDeleteNote = (dateStr: string, index: number) => {
    const existing = userNotes[dateStr] || [];
    const updatedList = existing.filter((_, i) => i !== index);
    const updated = {
      ...userNotes,
      [dateStr]: updatedList
    };
    saveNotes(updated);
  };

  // Helper clients map
  const clientsMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach(c => map.set(c.id, c));
    return map;
  }, [clients]);

  // Helper status maps
  const taskStatusMap = useMemo(() => {
    const map = new Map<string, TaskStatus>();
    taskStatuses.forEach(s => map.set(s.id, s));
    return map;
  }, [taskStatuses]);

  // Sorted task statuses by scale
  const sortedTaskStatuses = useMemo(() => {
    return [...taskStatuses].sort((a, b) => (a.scale || 0) - (b.scale || 0));
  }, [taskStatuses]);

  const getTaskScaleInfo = useCallback((statusId: string) => {
    const status = taskStatusMap.get(statusId) || (TASK_STATUS_ID_MAPPINGS[statusId] ? taskStatusMap.get(TASK_STATUS_ID_MAPPINGS[statusId]) : undefined);
    let scale = 1;

    if (status && typeof status.scale === 'number') {
      scale = status.scale;
    } else if (sortedTaskStatuses.length > 0) {
      const idx = sortedTaskStatuses.findIndex(s => s.id === statusId);
      if (idx >= 0) scale = idx + 1;
    }

    if (scale < 1) scale = 1;
    if (scale > 4) scale = ((scale - 1) % 4) + 1;

    switch (scale) {
      case 1:
        return {
          scale: 1,
          circleClass: 'text-red-600 bg-red-50 hover:bg-red-100 border border-red-200/90 shadow-2xs',
          badgeClass: 'bg-red-100 text-red-800 border border-red-200',
          statusName: status?.name || 'Por iniciar',
        };
      case 2:
        return {
          scale: 2,
          circleClass: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200/90 shadow-2xs',
          badgeClass: 'bg-blue-100 text-blue-800 border border-blue-200',
          statusName: status?.name || 'Em curso',
        };
      case 3:
        return {
          scale: 3,
          circleClass: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 shadow-2xs',
          badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
          statusName: status?.name || 'Concluído',
        };
      case 4:
      default:
        return {
          scale: 4,
          circleClass: 'text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-300/90 shadow-2xs',
          badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
          statusName: status?.name || 'Em pausa',
        };
    }
  }, [taskStatusMap, sortedTaskStatuses]);

  const handleCycleStatus = (task: Task) => {
    if (!sortedTaskStatuses || sortedTaskStatuses.length === 0) return;
    const currentIdx = sortedTaskStatuses.findIndex(s => s.id === task.statusId);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % sortedTaskStatuses.length : 0;
    const nextStatus = sortedTaskStatuses[nextIdx];
    if (nextStatus && updateTask) {
      updateTask(task.id, { statusId: nextStatus.id });
    }
  };

  const projectStatusMap = useMemo(() => {
    const map = new Map<string, ProjectStatus>();
    projectStatuses.forEach(s => map.set(s.id, s));
    return map;
  }, [projectStatuses]);

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  // 1. User Assigned Tasks (sorted by expected date ascending, excluding soft-deleted projects and tasks)
  const myAssignedTasks = useMemo(() => {
    const assigned = tasks.filter(t => {
      if (t.deleted) return false;
      if (!t.assigneeIds || !t.assigneeIds.includes(currentUser.id)) return false;
      const proj = projectMap.get(t.projectId);
      if (!proj || proj.deleted) return false;
      return true;
    });
    
    // Sort by expected/estimated date ascending
    assigned.sort((a, b) => {
      const dateA = a.estimatedDate || a.startDate || a.endDate || '9999-99-99';
      const dateB = b.estimatedDate || b.startDate || b.endDate || '9999-99-99';
      return dateA.localeCompare(dateB);
    });

    return assigned;
  }, [tasks, currentUser.id, projectMap]);

  const filteredTasks = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    return myAssignedTasks.filter(t => {
      const scaleInfo = getTaskScaleInfo(t.statusId);
      const isCompleted = scaleInfo.scale === 3;
      if (isCompleted) {
        const completionDate = t.endDate || t.estimatedDate || t.startDate || '';
        if (completionDate && completionDate < thirtyDaysAgoStr) {
          return false;
        }
      }
      if (taskFilter === 'pending') return !isCompleted;
      if (taskFilter === 'completed') return isCompleted;
      return true;
    });
  }, [myAssignedTasks, taskFilter, getTaskScaleInfo]);

  const isLevel5Project = useCallback((proj: Project) => {
    const status = projectStatusMap.get(proj.statusId);
    if (!status) return false;
    if (typeof status.scale === 'number' && status.scale >= 5) return true;
    const lowerName = status.name.toLowerCase();
    return lowerName.includes('conclu') || lowerName.includes('entreg') || lowerName.includes('finaliz') || lowerName.includes('fechad');
  }, [projectStatusMap]);

  const getProjectEffectiveDeliveryDate = useCallback((proj: Project) => {
    // Priority: scheduledDate (data agendada com cliente) -> estimatedDate (data estimada real) -> deliveryDate (prazo de entrega)
    return proj.scheduledDate || proj.estimatedDate || proj.deliveryDate || '';
  }, []);

  const getProjectDeliveryDateType = useCallback((proj: Project) => {
    if (proj.scheduledDate) return 'Agendada c/ Cliente';
    if (proj.estimatedDate) return 'Estimada Real';
    if (proj.deliveryDate) return 'Prazo de Entrega';
    return 'Data de Entrega';
  }, []);

  // 2. Projects managed by user (sorted by delivery date ascending)
  const allUserManagedProjects = useMemo(() => {
    return projects.filter(p => !p.deleted && p.projectManagerId === currentUser.id);
  }, [projects, currentUser.id]);

  const activeProjectsCount = useMemo(() => {
    return allUserManagedProjects.filter(p => !isLevel5Project(p)).length;
  }, [allUserManagedProjects, isLevel5Project]);

  const completedProjectsCount = useMemo(() => {
    return allUserManagedProjects.filter(p => isLevel5Project(p)).length;
  }, [allUserManagedProjects, isLevel5Project]);

  const myManagedProjects = useMemo(() => {
    const filtered = allUserManagedProjects.filter(p => {
      if (projectFilter === 'active') return !isLevel5Project(p);
      if (projectFilter === 'completed') return isLevel5Project(p);
      return true; // 'all'
    });
    
    // Sort by effective delivery date ascending
    filtered.sort((a, b) => {
      const dateA = getProjectEffectiveDeliveryDate(a) || '9999-99-99';
      const dateB = getProjectEffectiveDeliveryDate(b) || '9999-99-99';
      return dateA.localeCompare(dateB);
    });

    return filtered;
  }, [allUserManagedProjects, projectFilter, isLevel5Project, getProjectEffectiveDeliveryDate]);

  // 3. User Notifications
  const myNotifications = useMemo(() => {
    const list = (notifications || []).filter(n => !n.userId || n.userId === currentUser.id || n.userId === 'all');
    list.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
    return list;
  }, [notifications, currentUser.id]);

  const filteredNotifications = useMemo(() => {
    if (notifFilter === 'unread') {
      return myNotifications.filter(n => !n.isRead);
    }
    return myNotifications;
  }, [myNotifications, notifFilter]);

  const unreadCount = useMemo(() => myNotifications.filter(n => !n.isRead).length, [myNotifications]);

  // 4. Monthly Calendar Calculations
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth(); // 0-indexed

  const monthName = currentMonthDate.toLocaleString('pt-PT', { month: 'long', year: 'numeric' });

  // First day of month
  const firstDayOfMonth = new Date(year, month, 1);
  // Days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Day of week for 1st day (0=Sun, 1=Mon, ..., 6=Sat)
  // We want Monday-first (0=Mon, 6=Sun)
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek < 0) startDayOfWeek = 6;

  const calendarDays = useMemo(() => {
    const daysArr: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean }> = [];
    
    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const pm = month === 0 ? 11 : month - 1;
      const py = month === 0 ? year - 1 : year;
      const dateStr = `${py}-${String(pm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      daysArr.push({ dateStr, dayNum: d, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      daysArr.push({ dateStr, dayNum: d, isCurrentMonth: true });
    }

    // Next month padding to fill grid (multiple of 7)
    const remaining = 7 - (daysArr.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const nm = month === 11 ? 0 : month + 1;
        const ny = month === 11 ? year + 1 : year;
        const dateStr = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        daysArr.push({ dateStr, dayNum: d, isCurrentMonth: false });
      }
    }

    return daysArr;
  }, [year, month, startDayOfWeek, daysInMonth]);

  // Indexing items by date for quick calendar lookup
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    myAssignedTasks.forEach(t => {
      const d = t.estimatedDate || t.startDate || t.endDate;
      if (d) {
        const list = map.get(d) || [];
        list.push(t);
        map.set(d, list);
      }
    });
    return map;
  }, [myAssignedTasks]);

  const projectsByDate = useMemo(() => {
    const map = new Map<string, Array<{ project: Project; milestoneLabel: string }>>();
    
    myManagedProjects.forEach(p => {
      const addedDates = new Set<string>();

      // 1. Scheduled / Installation date
      if (p.scheduledDate) {
        const list = map.get(p.scheduledDate) || [];
        list.push({ project: p, milestoneLabel: 'Agendamento / Instalação' });
        map.set(p.scheduledDate, list);
        addedDates.add(p.scheduledDate);
      }

      // 2. Delivery date
      if (p.deliveryDate && !addedDates.has(p.deliveryDate)) {
        const list = map.get(p.deliveryDate) || [];
        list.push({ project: p, milestoneLabel: 'Data de Entrega' });
        map.set(p.deliveryDate, list);
        addedDates.add(p.deliveryDate);
      }

      // 3. Estimated completion date
      if (p.estimatedDate && !addedDates.has(p.estimatedDate)) {
        const list = map.get(p.estimatedDate) || [];
        list.push({ project: p, milestoneLabel: 'Previsão de Conclusão' });
        map.set(p.estimatedDate, list);
        addedDates.add(p.estimatedDate);
      }

      // 4. Effective delivery date if not already included
      const effDelivery = getProjectEffectiveDeliveryDate(p);
      const effType = getProjectDeliveryDateType(p);
      if (effDelivery && !addedDates.has(effDelivery)) {
        const list = map.get(effDelivery) || [];
        list.push({ project: p, milestoneLabel: `Entrega (${effType})` });
        map.set(effDelivery, list);
        addedDates.add(effDelivery);
      }

      // 5. Start date
      if (p.startDate && !addedDates.has(p.startDate)) {
        const list = map.get(p.startDate) || [];
        list.push({ project: p, milestoneLabel: 'Início de Projeto' });
        map.set(p.startDate, list);
        addedDates.add(p.startDate);
      }
    });
    return map;
  }, [myManagedProjects, getProjectEffectiveDeliveryDate, getProjectDeliveryDateType]);

  // Items for selected date
  const selectedDateTasks = tasksByDate.get(selectedDateStr) || [];
  const selectedDateProjects = projectsByDate.get(selectedDateStr) || [];
  const selectedDateUserNotes = userNotes[selectedDateStr] || [];

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  const handleTodayMonth = () => {
    const now = new Date();
    setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDateStr(todayStr);
  };

  // Quick stats
  const pendingTasksCount = useMemo(() => {
    return myAssignedTasks.filter(t => {
      const scaleInfo = getTaskScaleInfo(t.statusId);
      return scaleInfo.scale !== 3;
    }).length;
  }, [myAssignedTasks, getTaskScaleInfo]);

  return (
    <div className="space-y-6 animate-fade-in" id="my-focus-section">
      
      {/* MOTIVATIONAL BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-950 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 backdrop-blur-md rounded-full border border-blue-400/30 text-blue-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Espaço pessoal</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight font-sans">
              Olá, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-amber-200">{currentUser.name}</span>!
            </h2>
            <p className="text-slate-300 text-xs md:text-sm max-w-2xl font-medium">
              Acompanha as tuas tarefas prioritárias, gere os teus projetos e organiza a tua agenda.
            </p>
          </div>

          <div className="flex flex-wrap md:flex-nowrap items-center gap-3 bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10">
            <div className="text-center px-3 border-r border-white/10">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tarefas Pendentes</p>
              <p className="text-xl font-extrabold text-amber-400">{pendingTasksCount}</p>
            </div>
            <div className="text-center px-3 border-r border-white/10">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Projetos em Gestão</p>
              <p className="text-xl font-extrabold text-blue-400">{myManagedProjects.length}</p>
            </div>
            <div className="text-center px-3">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Notificações</p>
              <p className="text-xl font-extrabold text-emerald-400">{unreadCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* TWO COLUMN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: TASKS & MANAGED PROJECTS (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* SECTION 1: ASSIGNED TASKS */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden" id="card-my-tasks">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base tracking-tight">As minhas tarefas</h3>
                  <p className="text-xs text-slate-500 font-medium">Ordenadas por data</p>
                </div>
              </div>

              {/* FILTER BUTTONS */}
              <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
                <button
                  onClick={() => setTaskFilter('pending')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    taskFilter === 'pending' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pendentes ({myAssignedTasks.length - (myAssignedTasks.length - pendingTasksCount)})
                </button>
                <button
                  onClick={() => setTaskFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    taskFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas ({myAssignedTasks.length})
                </button>
                <button
                  onClick={() => setTaskFilter('completed')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    taskFilter === 'completed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Concluídas
                </button>
              </div>
            </div>

            {/* TASK LIST */}
            <div className="divide-y divide-slate-100">
              {filteredTasks.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                    <CheckSquare className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">Nenhuma tarefa encontrada</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    {taskFilter === 'pending' 
                      ? 'Parabéns! Não tens tarefas pendentes no teu plano de trabalho.' 
                      : 'Não existem tarefas atribuídas com o filtro selecionado.'}
                  </p>
                </div>
              ) : (
                filteredTasks.map(task => {
                  const proj = projects.find(p => p.id === task.projectId);
                  const client = proj ? clientsMap.get(proj.clientId) : null;
                  const scaleInfo = getTaskScaleInfo(task.statusId);
                  const isDone = scaleInfo.scale === 3;
                  const dateVal = task.estimatedDate || task.startDate || task.endDate;

                  return (
                    <div 
                      key={task.id} 
                      onClick={() => openTaskDetailsModal(task)}
                      className={`p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group ${
                        isDone ? 'opacity-75 bg-slate-50/40' : ''
                      }`}
                      title="Clique para preencher ou editar a tarefa"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCycleStatus(task);
                            }}
                            className={`p-1.5 rounded-full transition-all flex items-center justify-center cursor-pointer ${scaleInfo.circleClass}`}
                            title={`Escala ${scaleInfo.scale}: ${scaleInfo.statusName}. Clique para alterar para a próxima escala.`}
                          >
                            {scaleInfo.scale === 3 ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : scaleInfo.scale === 2 ? (
                              <CircleDot className="w-4 h-4" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>

                          <span className={`text-sm font-bold tracking-tight group-hover:text-blue-600 transition-colors ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                            {task.title}
                          </span>

                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${scaleInfo.badgeClass}`}>
                            {scaleInfo.statusName}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap pl-7">
                          {proj && (
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectProject(proj.id);
                              }}
                              className="font-semibold text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                              title={`Aceder ao projeto ${proj.title}`}
                            >
                              <Briefcase className="w-3 h-3" />
                              {client && `${client.shortName || client.clientName}`} {proj.title}
                            </span>
                          )}
                          
                          {task.estimatedHours && (
                            <span className="text-slate-400 flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {task.estimatedHours}h
                            </span>
                          )}
                        </div>

                        {task.notes && (
                          <p className="text-xs text-slate-500 bg-amber-50/60 p-2 rounded-lg border border-amber-100/80 italic pl-7 mt-1">
                            &quot;{task.notes}&quot;
                          </p>
                        )}
                      </div>

                      {/* DUE DATE TAG */}
                      <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0 pl-7 sm:pl-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Data Prevista</span>
                        <div className={`text-xs font-black flex items-center gap-1 mt-0.5 ${
                          dateVal === todayStr 
                            ? 'text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200' 
                            : dateVal && dateVal < todayStr && !isDone
                              ? 'text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-200'
                              : 'text-slate-700'
                        }`}>
                          <CalendarIcon className="w-3.5 h-3.5" />
                          <span>
                            {dateVal 
                              ? new Date(dateVal + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
                              : 'Sem data'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* SECTION 2: MANAGED PROJECTS */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden" id="card-managed-projects">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <FolderKanban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base tracking-tight">Os meus projetos</h3>
                  <p className="text-xs text-slate-500 font-medium">Ordenados por data de entrega</p>
                </div>
              </div>

              {/* FILTER BUTTONS */}
              <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
                <button
                  onClick={() => setProjectFilter('active')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    projectFilter === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ativos ({activeProjectsCount})
                </button>
                <button
                  onClick={() => setProjectFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    projectFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos ({allUserManagedProjects.length})
                </button>
                <button
                  onClick={() => setProjectFilter('completed')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    projectFilter === 'completed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Concluídos ({completedProjectsCount})
                </button>
              </div>
            </div>

            {/* PROJECTS LIST */}
            <div className="divide-y divide-slate-100">
              {myManagedProjects.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">Sem projetos</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    {projectFilter === 'completed'
                      ? 'Atualmente não figura como Project Leader em nenhum projeto concluído.'
                      : projectFilter === 'active'
                      ? 'Atualmente não figura como Project Leader em nenhum projeto ativo.'
                      : 'Atualmente não figura como Project Leader em nenhum projeto.'}
                  </p>
                </div>
              ) : (
                myManagedProjects.map(proj => {
                  const client = clientsMap.get(proj.clientId);
                  const pStatus = projectStatusMap.get(proj.statusId);
                  
                  // Calculate tasks progress for this project (ignoring suspended/cancelled/level 0 tasks)
                  const projTasks = tasks.filter(t => {
                    if (t.projectId !== proj.id || t.deleted) return false;
                    const st = taskStatusMap.get(t.statusId) || (TASK_STATUS_ID_MAPPINGS[t.statusId] ? taskStatusMap.get(TASK_STATUS_ID_MAPPINGS[t.statusId]) : undefined);
                    if (st) {
                      if (st.scale === 0) return false;
                      const lower = (st.name || '').toLowerCase();
                      if (lower.includes('susp') || lower.includes('canc')) return false;
                    }
                    return true;
                  });
                  const completedTasks = projTasks.filter(t => {
                    const st = taskStatusMap.get(t.statusId) || (TASK_STATUS_ID_MAPPINGS[t.statusId] ? taskStatusMap.get(TASK_STATUS_ID_MAPPINGS[t.statusId]) : undefined);
                    return st ? st.name.toLowerCase().includes('conclu') || st.scale === 3 || st.scale === 100 : false;
                  }).length;

                  const progressPct = projTasks.length > 0 ? Math.round((completedTasks / projTasks.length) * 100) : 0;

                  const deliveryDateVal = getProjectEffectiveDeliveryDate(proj);
                  const deliveryDateType = getProjectDeliveryDateType(proj);

                  return (
                    <div 
                      key={proj.id}
                      onClick={() => {
                        onSelectProject(proj.id);
                      }}
                      className="p-4 hover:bg-slate-50 transition-colors cursor-pointer space-y-3 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                              {client?.clientName || 'N/D'}
                            </h4>
                            {pStatus && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {pStatus.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium">
                            <strong className="text-slate-700">{proj.title}</strong>
                            {proj.installProjectNo && <span className="ml-2 text-slate-400">• N.º {proj.installProjectNo}</span>}
                          </p>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block" title="Data prioritária: Agendada -> Estimada Real -> Prazo">
                            {deliveryDateType}
                          </span>
                          <span className={`text-xs font-black inline-flex items-center gap-1 ${
                            deliveryDateVal && deliveryDateVal < todayStr
                              ? 'text-red-600 font-bold'
                              : 'text-emerald-700'
                          }`}>
                            <Flag className="w-3 h-3" />
                            {deliveryDateVal 
                              ? new Date(deliveryDateVal + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
                              : 'Não fixada'}
                          </span>
                        </div>
                      </div>

                      {/* PROGRESS BAR */}
                      <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-600">
                          <span>Progresso das Tarefas ({completedTasks}/{projTasks.length})</span>
                          <span>{progressPct}%</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-blue-600 h-full rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: NOTIFICATIONS + MONTHLY CALENDAR (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* SECTION 1: NOTIFICATIONS */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden" id="card-my-notifications">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl relative">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base tracking-tight">Notificações</h3>
                  <p className="text-xs text-slate-500 font-medium">Alertas e avisos do sistema</p>
                </div>
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={() => markAllNotificationsAsRead(currentUser.id)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Limpar
                </button>
              )}
            </div>

            {/* NOTIFICATION LIST */}
            <div className="p-3 space-y-2 max-h-[220px] overflow-y-auto">
              {filteredNotifications.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  Não tem notificações recentes.
                </div>
              ) : (
                filteredNotifications.slice(0, 5).map(notif => (
                  <div 
                    key={notif.id}
                    className={`p-3 rounded-xl text-xs flex items-start gap-2.5 transition-all ${
                      notif.isRead ? 'bg-slate-50 text-slate-600' : 'bg-blue-50/70 text-slate-900 border border-blue-100 shadow-xs'
                    }`}
                  >
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold">{notif.title}</span>
                        <span className="text-[9px] text-slate-400 font-medium">
                          {new Date(notif.createdDate).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] leading-tight">{notif.message}</p>
                    </div>

                    {!notif.isRead && (
                      <button 
                        onClick={() => markNotificationAsRead(notif.id)}
                        className="p-1 text-blue-600 hover:bg-blue-100 rounded-lg"
                        title="Marcar como lida"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SECTION 2: MONTHLY CALENDAR & NOTES */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden" id="card-monthly-calendar">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base tracking-tight">Calendário Mensal</h3>
                  <p className="text-xs text-slate-500 font-medium">Tarefas e lembretes de projetos em agenda</p>
                </div>
              </div>

              <button
                onClick={handleTodayMonth}
                className="text-xs font-bold text-slate-700 hover:bg-slate-200/70 bg-slate-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                Hoje
              </button>
            </div>

            <div className="p-4 space-y-4">
              
              {/* MONTH HEADER NAVIGATION */}
              <div className="flex items-center justify-between">
                <button 
                  onClick={handlePrevMonth}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="font-extrabold text-sm text-slate-800 capitalize font-sans">
                  {monthName}
                </span>
                <button 
                  onClick={handleNextMonth}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* CALENDAR GRID */}
              <div className="space-y-1.5">
                {/* DAYS OF WEEK HEADER */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold uppercase select-none">
                  <span className="text-slate-500 py-0.5">Seg</span>
                  <span className="text-slate-500 py-0.5">Ter</span>
                  <span className="text-slate-500 py-0.5">Qua</span>
                  <span className="text-slate-500 py-0.5">Qui</span>
                  <span className="text-slate-500 py-0.5">Sex</span>
                  <span className="text-slate-500 bg-slate-100/70 py-0.5 rounded-md font-bold">Sáb</span>
                  <span className="text-slate-500 bg-slate-100/70 py-0.5 rounded-md font-bold">Dom</span>
                </div>

                {/* DAYS MATRIX */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((cell, idx) => {
                    const dayTasks = tasksByDate.get(cell.dateStr) || [];
                    const dayProjects = projectsByDate.get(cell.dateStr) || [];
                    const dayNotes = userNotes[cell.dateStr] || [];

                    const isToday = cell.dateStr === todayStr;
                    const isSelected = cell.dateStr === selectedDateStr;

                    const cellDate = new Date(cell.dateStr + 'T00:00:00');
                    const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
                    const specialDay = specialDays.find(sd => sd.date === cell.dateStr);
                    const isSpecial = !!specialDay;

                    const hasEvents = dayTasks.length > 0 || dayProjects.length > 0 || dayNotes.length > 0;

                    let cellStyleClass = '';
                    if (!cell.isCurrentMonth) {
                      cellStyleClass = 'text-slate-300 bg-slate-50/30 opacity-40 hover:opacity-80';
                    } else if (isSelected) {
                      cellStyleClass = 'bg-slate-900 text-white shadow-md ring-2 ring-slate-900 font-bold z-10';
                    } else if (isToday) {
                      cellStyleClass = 'bg-amber-100/90 text-amber-950 font-black border border-amber-300 ring-1 ring-amber-400/50 shadow-2xs hover:bg-amber-200/80';
                    } else if (isSpecial) {
                      cellStyleClass = 'bg-rose-50 text-rose-900 border border-rose-200 font-bold hover:bg-rose-100/80 shadow-2xs';
                    } else if (isWeekend) {
                      cellStyleClass = 'bg-slate-100/80 text-slate-500 font-semibold hover:bg-slate-200/60 border border-slate-200/50';
                    } else {
                      cellStyleClass = 'bg-white text-slate-800 font-bold hover:bg-slate-50 border border-slate-200/60 shadow-2xs';
                    }

                    const tooltipText = specialDay 
                      ? `${specialDay.name} (${cell.dateStr})`
                      : isWeekend
                        ? `${cellDate.getDay() === 6 ? 'Sábado' : 'Domingo'} (${cell.dateStr})`
                        : cell.dateStr;

                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedDateStr(cell.dateStr)}
                        className={`p-1.5 rounded-xl text-center flex flex-col items-center justify-between min-h-[46px] transition-all relative ${cellStyleClass}`}
                        title={tooltipText}
                      >
                        <div className="flex items-center justify-center w-full relative">
                          <span className={`text-xs ${isSpecial && !isSelected ? 'text-rose-900 font-extrabold' : ''}`}>
                            {cell.dayNum}
                          </span>
                          {isSpecial && cell.isCurrentMonth && !isSelected && (
                            <span 
                              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" 
                              title={`Feriado / Dia Especial: ${specialDay?.name}`}
                            />
                          )}
                        </div>

                        {/* DOT INDICATORS */}
                        {hasEvents && (
                          <div className="flex items-center gap-0.5 mt-0.5">
                            {dayTasks.length > 0 && (
                              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-blue-300' : 'bg-blue-600'}`}></span>
                            )}
                            {dayProjects.length > 0 && (
                              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-amber-500'}`}></span>
                            )}
                            {dayNotes.length > 0 && (
                              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-300' : 'bg-emerald-500'}`}></span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* CALENDAR LEGEND */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500 font-medium flex-wrap px-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-slate-100 border border-slate-200"></span>
                    <span>Fim de semana</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-rose-50 border border-rose-200 flex items-center justify-center text-[7px] text-rose-600">●</span>
                    <span className="text-rose-700 font-semibold">Dia Especial / Feriado</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300"></span>
                    <span className="text-amber-900 font-semibold">Hoje</span>
                  </div>
                </div>
              </div>

              {/* SELECTED DATE DETAIL / NOTES PANEL */}
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <StickyNote className="w-4 h-4 text-blue-600" />
                    <span>
                      Atividades & Notas de {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  {selectedDateStr === todayStr && (
                    <span className="text-[10px] font-extrabold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Hoje
                    </span>
                  )}
                </div>

                {/* SPECIAL DAY / WEEKEND BANNER */}
                {(() => {
                  const selSpecial = specialDays.find(sd => sd.date === selectedDateStr);
                  const selDate = new Date(selectedDateStr + 'T00:00:00');
                  const isSelWknd = selDate.getDay() === 0 || selDate.getDay() === 6;

                  if (selSpecial) {
                    return (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-900 font-medium">
                        <div className="flex items-center gap-2 font-bold">
                          <PartyPopper className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>{selSpecial.name}</span>
                        </div>
                        <span className="text-[9px] uppercase tracking-wider bg-rose-200/80 text-rose-800 px-2 py-0.5 rounded-full font-extrabold">
                          Dia Especial / Feriado
                        </span>
                      </div>
                    );
                  }

                  if (isSelWknd) {
                    return (
                      <div className="p-2 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <span>☕</span>
                          <span>Fim de Semana ({selDate.getDay() === 6 ? 'Sábado' : 'Domingo'})</span>
                        </div>
                        <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                          Não Útil
                        </span>
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* EVENTS & TASKS ON SELECTED DAY */}
                <div className="space-y-2">
                  {selectedDateTasks.length === 0 && selectedDateProjects.length === 0 && selectedDateUserNotes.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-2">
                      Nenhum compromisso ou nota gravada para este dia.
                    </p>
                  ) : (
                    <>
                      {/* TASKS */}
                      {selectedDateTasks.map(t => {
                        const proj = projectMap.get(t.projectId);
                        const client = proj ? clientsMap.get(proj.clientId) : null;
                        const scaleInfo = getTaskScaleInfo(t.statusId);

                        return (
                          <div 
                            key={t.id} 
                            onClick={() => openTaskDetailsModal(t)}
                            className="p-2.5 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer text-xs space-y-1 group shadow-2xs"
                            title="Clique para preencher ou editar a tarefa"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5 truncate">
                                  <CheckSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  <span className="truncate">{t.title}</span>
                                </span>
                                <div className="text-[11px] font-medium text-slate-600 flex items-center gap-1 flex-wrap pl-5">
                                  <span className="text-slate-800 font-bold">{client?.clientName || client?.shortName || 'Cliente N/D'}</span>
                                  <span className="text-slate-300">•</span>
                                  <span 
                                    className="text-blue-700 font-semibold hover:underline"
                                    onClick={(e) => {
                                      if (proj) {
                                        e.stopPropagation();
                                        onSelectProject(proj.id);
                                      }
                                    }}
                                    title={proj ? `Aceder ao projeto ${proj.title}` : undefined}
                                  >
                                    {proj?.title || 'Projeto N/D'}
                                  </span>
                                  {proj?.installProjectNo && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span className="text-slate-400">N.º {proj.installProjectNo}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold shrink-0 ${scaleInfo.badgeClass}`}>
                                {scaleInfo.statusName}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {/* PROJECT MILESTONES & DATES */}
                      {selectedDateProjects.map((item, idx) => {
                        const p = item.project;
                        const client = clientsMap.get(p.clientId);
                        const pStatus = projectStatusMap.get(p.statusId);

                        return (
                          <div 
                            key={`proj-milestone-${p.id}-${idx}`}
                            onClick={() => onSelectProject(p.id)}
                            className="p-2.5 bg-white rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all cursor-pointer text-xs space-y-1 group shadow-2xs"
                            title={`Clique para aceder ao projeto: ${p.title}`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <span className="font-bold text-slate-900 group-hover:text-amber-800 transition-colors flex items-center gap-1.5 truncate">
                                  <Flag className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span className="truncate">{item.milestoneLabel}: {p.title}</span>
                                </span>
                                <div className="text-[11px] font-medium text-slate-600 flex items-center gap-1 flex-wrap pl-5">
                                  <span className="text-slate-800 font-bold">{client?.clientName || client?.shortName || 'Cliente N/D'}</span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-amber-800 font-semibold group-hover:underline">{p.title}</span>
                                  {p.installProjectNo && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span className="text-slate-400">N.º {p.installProjectNo}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {pStatus && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                                    {pStatus.name}
                                  </span>
                                )}
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-extrabold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                                  <span>Projeto</span>
                                  <ArrowRight className="w-2.5 h-2.5 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* PERSONAL NOTES */}
                      {selectedDateUserNotes.map((note, idx) => (
                        <div key={idx} className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-xs flex items-start justify-between gap-2">
                          <p className="text-emerald-950 font-medium leading-tight flex-1">{note}</p>
                          <button
                            onClick={() => handleDeleteNote(selectedDateStr, idx)}
                            className="text-emerald-700 hover:text-red-600 p-0.5"
                            title="Eliminar nota"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* ADD PERSONAL NOTE FORM */}
                <form onSubmit={handleAddNote} className="flex gap-1.5 pt-1">
                  <input
                    type="text"
                    value={newNoteText}
                    onChange={e => setNewNoteText(e.target.value)}
                    placeholder="Adicionar nota para este dia..."
                    className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center"
                    title="Adicionar Nota"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </form>
              </div>

            </div>
          </div>

        </div>

      </div>

      {/* TASK EDIT/FILL DETAILS MODAL (SHARED FORM) */}
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
        tasks={tasks}
        onSelectTask={(t) => setSelectedTaskForDetails(t)}
      />

    </div>
  );
}
