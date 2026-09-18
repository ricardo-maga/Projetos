'use client';

import React, { useState } from 'react';
import { Project, Task, UserAbsence, User, Client, SpecialDay, ProjectRiskItem, TaskType } from '../lib/types';
import { 
  ChevronLeft, ChevronRight, Calendar, AlertTriangle, Users, 
  Clock, Flag, AlertCircle, Info, Briefcase, Plus, X, Maximize2
} from 'lucide-react';

import { hasPermission } from '../lib/permissions';
import { AssigneeSelector } from './AssigneeSelector';
import TaskDetailsModal from './TaskDetailsModal';
import { getTaskStatusName, getDefaultTaskStatusId, getTaskTypeName, getDefaultTaskTypeId, stripSecondsFromHours, formatToOnlyHours } from '../lib/utils';

interface CalendarSectionProps {
  projects: Project[];
  tasks: Task[];
  absences: UserAbsence[];
  users: User[];
  clients: Client[];
  specialDays?: SpecialDay[];
  projectRiskItems?: ProjectRiskItem[];
  onSelectProject?: (id: string) => void;
  addTask?: (task: any) => void;
  updateTask?: (id: string, updates: any) => void;
  taskStatuses: any[];
  taskTypes?: TaskType[];
  projectStatuses?: any[];
  currentUser?: any;
  userGroups?: any[];
  appConfig?: any;
}

export default function CalendarSection({
  projects = [],
  tasks = [],
  absences = [],
  users = [],
  clients = [],
  specialDays = [],
  projectRiskItems = [],
  onSelectProject = () => {},
  addTask,
  updateTask,
  taskStatuses = [],
  taskTypes = [],
  projectStatuses = [],
  currentUser,
  userGroups = [],
  appConfig,
}: CalendarSectionProps) {
  const canReadCalendar = hasPermission(currentUser, 'calendar_read', userGroups);
  const canWriteCalendar = hasPermission(currentUser, 'calendar_write', userGroups);
  const canReadTasks = hasPermission(currentUser, 'tasks_read', userGroups);
  const canWriteTasks = hasPermission(currentUser, 'tasks_write', userGroups);

  const canMoveTask = canWriteCalendar && canWriteTasks;
  const canCreateTaskInCalendar = canWriteTasks || canWriteCalendar;
  // We want to center the timeline around a pivot date, initially today
  const [pivotDate, setPivotDate] = useState<Date>(() => {
    return new Date();
  });

  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showRiskReviews, setShowRiskReviews] = useState(false);

  // Event proximity date filter (default: 'off')
  const [filterEventDays, setFilterEventDays] = useState<number | 'off'>('off');

  // Timeline Pagination & Fullscreen state
  const [timelineItemsPerPage, setTimelineItemsPerPage] = useState<number>(25);
  const [timelineCurrentPage, setTimelineCurrentPage] = useState<number>(1);
  const [isTimelineFullscreen, setIsTimelineFullscreen] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
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
    if (!canMoveTask) {
      alert('Não tem permissão para alterar o agendamento de tarefas.');
      return;
    }
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
    });

    setSelectedTaskForDetails(null);
  };
  const [modalProjectId, setModalProjectId] = useState<string>('');
  const [modalDateStr, setModalDateStr] = useState<string>('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>([]);
  const [taskStatusId, setTaskStatusId] = useState<string>('ts-1');
  const [taskTypeId, setTaskTypeId] = useState<string>('');
  const [taskEstimatedHours, setTaskEstimatedHours] = useState<string>('08:00');

  const handleDayClick = (projectId: string, dateStr: string) => {
    if (!canCreateTaskInCalendar) {
      alert('Não tem permissão para criar ou agendar tarefas.');
      return;
    }
    setModalProjectId(projectId);
    setModalDateStr(dateStr);
    setTaskTitle('');
    setTaskDescription('');
    setTaskAssigneeIds([]);
    setTaskStatusId(getDefaultTaskStatusId(taskStatuses));
    setTaskTypeId('');
    setTaskEstimatedHours('08:00');
    setIsModalOpen(true);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateTaskInCalendar) {
      alert('Não tem permissão para criar agendamentos de tarefas.');
      return;
    }
    if (!taskTitle.trim() || !modalProjectId || !addTask) return;

    addTask({
      title: taskTitle.trim(),
      description: taskDescription.trim() || 'Criado via linha de tempo',
      projectId: modalProjectId,
      statusId: taskStatusId || getDefaultTaskStatusId(taskStatuses),
      taskTypeId: taskTypeId || '',
      estimatedDate: modalDateStr,
      startDate: modalDateStr,
      endDate: modalDateStr,
      assigneeIds: taskAssigneeIds,
      estimatedHours: taskEstimatedHours || '08:00',
      actualHours: '00:00',
      startTime: '09:00',
      endTime: '18:00',
      notes: ''
    });
    setIsModalOpen(false);
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string, targetProjectId: string) => {
    e.preventDefault();
    if (!canMoveTask) {
      alert('Não tem permissão para mover ou alterar tarefas no calendário.');
      return;
    }
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId && updateTask) {
      const taskObj = tasks.find(t => t.id === taskId);
      if (taskObj && taskObj.projectId === targetProjectId) {
        if (
          taskObj.startDate === targetDateStr &&
          taskObj.endDate === targetDateStr &&
          taskObj.estimatedDate === targetDateStr
        ) {
          return;
        }
        updateTask(taskId, {
          startDate: targetDateStr,
          endDate: targetDateStr,
          estimatedDate: targetDateStr,
        });
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const formatDateToString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Today's date in YYYY-MM-DD format for reference
  const todayStr = formatDateToString(new Date());

  // Generate 20 days of the timeline: 7 days backwards and 12 days forward
  const getTimelineDays = (): Date[] => {
    const start = new Date(pivotDate);
    start.setDate(pivotDate.getDate() - 7);
    
    const days: Date[] = [];
    for (let i = 0; i < 20; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const timelineDays = getTimelineDays();
  const startDateStr = formatDateToString(timelineDays[0]);
  const endDateStr = formatDateToString(timelineDays[timelineDays.length - 1]);

  // Shifting date window functions (by 7 days)
  const shiftPrev = () => {
    setPivotDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 7);
      return next;
    });
  };

  const shiftNext = () => {
    setPivotDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 7);
      return next;
    });
  };

  const jumpToToday = () => {
    setPivotDate(new Date());
  };

  // Initials generator
  const getInitials = (name: string): string => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Helper to check if a task is active on a given day
  const isTaskActiveOnDay = (t: Task, dayStr: string): boolean => {
    if (t.deleted) return false;
    // If actual start and end date are defined, check range
    if (t.startDate && t.endDate) {
      return dayStr >= t.startDate && dayStr <= t.endDate;
    }
    if (t.startDate) {
      return dayStr === t.startDate;
    }
    if (t.endDate) {
      return dayStr === t.endDate;
    }
    // Fallback to estimatedDate
    return t.estimatedDate === dayStr;
  };

  // Check if user has double bookings on a given day (assigned to > 1 active tasks on this day)
  const getTaskCountForUserOnDay = (userId: string, dayStr: string): number => {
    let count = 0;
    tasks.forEach(t => {
      if (t.deleted) return;
      if (t.assigneeIds && t.assigneeIds.includes(userId)) {
        if (isTaskActiveOnDay(t, dayStr)) {
          count++;
        }
      }
    });
    return count;
  };

  // Check if user is absent on a given day
  const getUserAbsenceOnDay = (userId: string, dayStr: string) => {
    return absences.find(abs => {
      if (abs.userId !== userId) return false;
      return dayStr >= abs.absenceStartDate && dayStr <= abs.absenceEndDate;
    });
  };

  // Get client details for a project
  const getProjectClientName = (clientId: string): string => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.clientName : 'Cliente Indefinido';
  };

  const matchId = (idA: string | null | undefined, idB: string | null | undefined) => {
    if (!idA || !idB) return false;
    return idA === idB;
  };

  const isProjectLevel5 = (statusId: string): boolean => {
    if (!statusId) return false;
    const s = projectStatuses.find(st => matchId(st.id, statusId) || st.id === statusId);
    if (!s) return false;
    if (s.scale !== undefined && s.scale >= 5) return true;
    const name = (s.name || '').toLowerCase();
    return name.includes('conclu') || name.includes('suspen') || name.includes('cancel');
  };

  const isWithinDays = (dateStr?: string, daysLimit?: number | 'off') => {
    if (!daysLimit || daysLimit === 'off' || !dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr + 'T00:00:00');
    if (isNaN(targetDate.getTime())) return false;
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
    return diffDays >= 0 && diffDays <= Number(daysLimit);
  };

  const isTaskActiveInDays = (t: Task, daysLimit: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetEnd = new Date(today);
    targetEnd.setDate(today.getDate() + daysLimit);

    const todayStr = formatDateToString(today);
    const targetEndStr = formatDateToString(targetEnd);

    if (t.estimatedDate && t.estimatedDate >= todayStr && t.estimatedDate <= targetEndStr) return true;
    if (t.startDate && t.startDate >= todayStr && t.startDate <= targetEndStr) return true;
    if (t.endDate && t.endDate >= todayStr && t.endDate <= targetEndStr) return true;
    if (t.startDate && t.endDate) {
      return t.startDate <= targetEndStr && t.endDate >= todayStr;
    }
    return false;
  };

  const activeProjects = projects.filter(p => {
    if (p.deleted) return false;
    if (!showCompleted && isProjectLevel5(p.statusId)) return false;

    // Filter by event proximity (project dates, risk review dates, or tasks)
    if (filterEventDays !== 'off') {
      const days = Number(filterEventDays);

      const hasProjectDateEvent = 
        isWithinDays(p.startDate, days) ||
        isWithinDays(p.deliveryDate, days) ||
        isWithinDays(p.estimatedDate, days) ||
        isWithinDays(p.scheduledDate, days);

      const hasRiskReviewEvent = showRiskReviews && (projectRiskItems || []).some(
        ri => !ri.deleted && matchId(ri.projectId, p.id) && isWithinDays(ri.reviewDate, days)
      );

      const projTasks = tasks.filter(t => t.projectId === p.id && !t.deleted);
      const hasTaskEvent = projTasks.some(t => isTaskActiveInDays(t, days));

      if (!hasProjectDateEvent && !hasRiskReviewEvent && !hasTaskEvent) {
        return false;
      }
    }

    return true;
  });

  const totalTimelinePages = Math.max(1, Math.ceil(activeProjects.length / timelineItemsPerPage));
  const currentTimelinePage = Math.min(timelineCurrentPage, totalTimelinePages);
  const paginatedProjects = activeProjects.slice(
    (currentTimelinePage - 1) * timelineItemsPerPage,
    currentTimelinePage * timelineItemsPerPage
  );

  const renderTimelineMatrixTable = (projectsToDisplay: Project[], isFullscreen = false) => {
    return (
      <div className={`bg-white rounded-2xl border border-slate-200 shadow-2xs relative ${
        isFullscreen ? 'h-full max-h-none overflow-auto' : 'sticky top-[57px] z-20 max-h-[calc(100vh-70px)] overflow-auto'
      }`}>
        <table className="w-full min-w-[1200px] border-collapse text-left table-fixed relative">
          {/* Header Columns definition */}
          <thead className="sticky top-0 z-20 bg-slate-50/90 border-b border-slate-200/80 shadow-2xs">
            <tr>
              {/* Project Header Column */}
              <th className="w-72 p-3.5 text-[11px] uppercase tracking-wider font-bold text-slate-500 sticky top-0 left-0 z-30 bg-slate-50/95 border-r border-b border-slate-200/80 shadow-[2px_2px_5px_rgba(0,0,0,0.04)]">
                Projeto / Cliente
              </th>
              
              {/* 20 Days Columns */}
              {timelineDays.map(day => {
                const dayStr = formatDateToString(day);
                const isToday = dayStr === todayStr;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const specialDay = specialDays.find(sd => sd.date === dayStr);
                const isSpecial = !!specialDay;
                
                const dayNum = day.getDate();
                const weekday = day.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '');
                const monthName = day.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '');

                return (
                  <th 
                    key={dayStr} 
                    className={`p-2 text-center text-[10px] font-bold border-l border-b border-slate-200/80 sticky top-0 z-20 ${
                      isToday ? 'bg-amber-100 text-amber-900 border-x border-amber-300' : 
                      (isWeekend || isSpecial) ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-600'
                    }`}
                    title={specialDay ? specialDay.name : ''}
                  >
                    <div className="capitalize text-[9px] font-semibold text-slate-500">{weekday.charAt(0).toUpperCase()}</div>
                    <div className={`text-sm font-black my-0.5 inline-block w-6 h-6 leading-6 rounded-full ${
                      isToday ? 'bg-amber-500 text-white shadow-xs' : ''
                    }`}>
                      {dayNum}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">{monthName}</div>
                    {specialDay && (
                      <div className="text-[8px] font-bold text-slate-600 truncate mt-1 leading-tight w-full max-w-[60px] mx-auto text-wrap">
                        {specialDay.name}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Matrix Body */}
          <tbody className="divide-y divide-slate-100 text-xs">
            {projectsToDisplay.length === 0 ? (
              <tr>
                <td colSpan={21} className="p-8 text-center text-slate-400 font-medium">
                  Nenhum projeto registado para apresentar na linha de tempo.
                </td>
              </tr>
            ) : (
              projectsToDisplay.map(proj => {
                const clientName = getProjectClientName(proj.clientId);
                const projTasks = canReadTasks ? tasks.filter(t => 
                  t.projectId === proj.id && 
                  !t.deleted &&
                  (!selectedAssignee || (t.assigneeIds && t.assigneeIds.includes(selectedAssignee)))
                ) : [];

                return (
                  <tr key={proj.id} className="hover:bg-slate-50/30 transition-colors">
                    {/* Left Column: Project Info Card - Sticky Left */}
                    <td className="p-4 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)] border-r border-slate-100">
                      <div className="space-y-1.5">
                        <div className="text-xs text-slate-700 font-bold flex items-center gap-1">
                          <span className="truncate">{clientName}</span>
                        </div>
                        <div 
                          className="font-bold text-slate-800 text-xs leading-tight line-clamp-1 hover:text-blue-600 cursor-pointer transition-colors"
                          onClick={() => onSelectProject(proj.id)}
                          title="Ver Detalhes do Projeto"
                        >
                          {proj.title}
                        </div>

                        <div className="flex flex-wrap gap-1 text-[9px] font-bold">
                          {proj.startDate && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100/40">
                              Adjudicação: {new Date(proj.startDate + 'T00:00:00').toLocaleDateString('pt-PT', {day:'numeric', month:'short'})}
                            </span>
                          )}
                          {(() => {
                            let label = '';
                            let effectiveDelivery = '';
                            if (proj.scheduledDate) {
                              label = 'Agendamento';
                              effectiveDelivery = proj.scheduledDate;
                            } else if (proj.estimatedDate) {
                              label = 'Data prevista';
                              effectiveDelivery = proj.estimatedDate;
                            } else if (proj.deliveryDate) {
                              label = 'Data de entrega';
                              effectiveDelivery = proj.deliveryDate;
                            }

                            return effectiveDelivery ? (
                              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100/40">
                                {label}: {new Date(effectiveDelivery + 'T00:00:00').toLocaleDateString('pt-PT', {day:'numeric', month:'short'})}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </td>

                    {/* Timeline Day columns representing events */}
                    {timelineDays.map(day => {
                      const dayStr = formatDateToString(day);
                      const isToday = dayStr === todayStr;

                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const isSpecial = !!specialDays.find(sd => sd.date === dayStr);

                      // Check Project defined dates
                      const isProjStart = proj.startDate === dayStr;
                      const isProjDelivery = proj.deliveryDate === dayStr;
                      const isProjEstimated = proj.estimatedDate === dayStr;
                      const isProjScheduled = proj.scheduledDate === dayStr;

                      // Check tasks active on this day
                      const activeTasksOnDay = projTasks.filter(t => isTaskActiveOnDay(t, dayStr));

                      return (
                        <td 
                          key={dayStr} 
                          onClick={() => handleDayClick(proj.id, dayStr)}
                          onDrop={(e) => handleDrop(e, dayStr, proj.id)}
                          onDragOver={handleDragOver}
                          className={`p-2 border-l border-slate-100 text-center vertical-align-top space-y-2 select-none min-h-[90px] cursor-pointer hover:bg-blue-50/30 transition-colors ${
                            isToday ? 'bg-amber-50/20' : 
                            (isWeekend || isSpecial) ? 'bg-slate-50' : ''
                          }`}
                        >
                          {/* Project milestone badges */}
                          <div className="space-y-1">
                            {isProjStart && (
                              <div className="text-[8px] font-black bg-blue-600 text-white rounded py-0.5 px-1 flex items-center justify-center gap-0.5 shadow-xs" title="Data de Adjudicação do Projeto">
                                <Flag className="w-2 h-2" /> ADJUDICAÇÃO
                              </div>
                            )}
                            {isProjDelivery && (
                              <div className="text-[8px] font-black bg-emerald-600 text-white rounded py-0.5 px-1 flex items-center justify-center gap-0.5 shadow-xs" title="Data de Entrega Contratual">
                                <Flag className="w-2 h-2" /> ENTREGA
                              </div>
                            )}
                            {isProjEstimated && !isProjDelivery && (
                              <div className="text-[8px] font-bold bg-slate-700 text-white rounded py-0.5 px-1 flex items-center justify-center gap-0.5" title="Data de Conclusão Estimada">
                                <Clock className="w-2 h-2" /> PREVISTO
                              </div>
                            )}
                            {isProjScheduled && !isProjStart && (
                              <div className="text-[8px] font-bold bg-indigo-600 text-white rounded py-0.5 px-1 flex items-center justify-center gap-0.5" title="Data de Montagem Agendada">
                                <Calendar className="w-2 h-2" /> AGENDADO
                              </div>
                            )}
                            {showRiskReviews && (() => {
                              const risksOnDay = (projectRiskItems || []).filter(ri => !ri.deleted && matchId(ri.projectId, proj.id) && ri.reviewDate === dayStr);
                              return risksOnDay.map(ri => (
                                <div
                                  key={ri.id}
                                  className="text-[8px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 rounded py-0.5 px-1 flex items-center justify-center gap-0.5 shadow-2xs truncate"
                                  title={`Revisão de Risco do Projeto: ${ri.title}`}
                                >
                                  <AlertTriangle className="w-2 h-2 text-rose-600 shrink-0" />
                                  <span className="truncate">Rev. Risco: {ri.title}</span>
                                </div>
                              ));
                            })()}
                          </div>

                          {/* Active tasks list for this project on this day */}
                          {activeTasksOnDay.length > 0 && (
                            <div className="space-y-1.5">
                              {activeTasksOnDay.map(task => {
                                return (
                                  <div 
                                    key={task.id} 
                                    draggable={canMoveTask}
                                    onDragStart={(e) => {
                                      e.stopPropagation();
                                      if (!canMoveTask) {
                                        e.preventDefault();
                                        return;
                                      }
                                      e.dataTransfer.setData('taskId', task.id);
                                    }}
                                    className={`p-1.5 bg-slate-50 border border-slate-200/80 rounded-lg text-left shadow-2xs hover:border-slate-300 transition-colors ${canMoveTask ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                                    title={`Tarefa: ${task.title}\nEstado: ${getTaskStatusName(task.statusId, taskStatuses)}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openTaskDetailsModal(task);
                                    }}
                                  >
                                    {/* Task Title (Compact) */}
                                    <div className="text-[9px] font-bold text-slate-700 truncate mb-1 flex items-center gap-1">
                                      {(getTaskTypeName(task.taskTypeId, taskTypes).toLowerCase().includes('lembrete') || getTaskTypeName(task.taskTypeId, taskTypes).toLowerCase().includes('marco')) && <Flag className="w-2.5 h-2.5 text-purple-600 shrink-0" />}
                                      <span className="truncate">{task.title}</span>
                                    </div>

                                    {/* Assignees initials list with conflicts and warnings */}
                                    <div className="flex flex-wrap gap-1">
                                      {task.assigneeIds && task.assigneeIds.length > 0 ? (
                                        task.assigneeIds.map(uid => {
                                          const user = users.find(u => u.id === uid);
                                          const name = user ? user.name : 'Técnico';
                                          const initials = getInitials(name);

                                          // Determine conflicts
                                          const isDoubleBooked = getTaskCountForUserOnDay(uid, dayStr) > 1;
                                          const absence = getUserAbsenceOnDay(uid, dayStr);
                                          const isAbsent = !!absence;

                                          return (
                                            <span 
                                              key={uid}
                                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase border transition-colors ${
                                                isAbsent 
                                                  ? 'bg-red-50 text-red-600 border-red-300 shadow-xs animate-pulse'
                                                  : isDoubleBooked
                                                  ? 'bg-amber-50 text-red-600 border-red-300 shadow-xs'
                                                  : 'bg-white text-slate-600 border-slate-200'
                                              }`}
                                              title={
                                                isAbsent 
                                                  ? `⚠️ CONFLITO DE AUSÊNCIA: ${name} está ausente (${absence.reason}) neste dia!`
                                                  : isDoubleBooked
                                                  ? `⚠️ DUPLA ALOCAÇÃO: ${name} está alocado em mais do que uma tarefa neste dia!`
                                                  : `Alocado: ${name}`
                                              }
                                            >
                                              {initials}
                                              {isAbsent && <AlertCircle className="w-1.5 h-1.5 text-red-500 fill-red-50" />}
                                              {!isAbsent && isDoubleBooked && <AlertTriangle className="w-1.5 h-1.5 text-red-500" />}
                                            </span>
                                          );
                                        })
                                      ) : (
                                        <span className="text-[8px] text-slate-400 font-medium italic">Não alocado</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Empty space when no events or tasks */}
                          {!isProjStart && !isProjDelivery && !isProjEstimated && !isProjScheduled && activeTasksOnDay.length === 0 && (
                            <div className="h-6 w-full bg-slate-50/20 rounded border border-transparent" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* TIMELINE CONTROL HEADER */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        {/* Row 0: Full width Title and Subtitle */}
        <div className="w-full">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Linha de tempo
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Planeamento diário de projetos, tarefas e técnicos.
          </p>
        </div>

        {/* Row 1: Filters (Técnicos, Datas & Concluídos) */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-500">Filtros:</span>
          <select
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-750 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
            id="filter-assignee"
          >
            <option value="">Todos os utilizadores</option>
            {users.filter(u => !u.deleted).sort((a, b) => a.name.localeCompare(b.name, 'pt-PT')).map(u => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          {/* Filter: Events Proximity */}
          <select
            value={filterEventDays}
            onChange={(e) => {
              const val = e.target.value;
              setFilterEventDays(val === 'off' ? 'off' : Number(val));
              setTimelineCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
            title="Filtrar por eventos nos próximos dias (datas de projeto, tarefas ou revisões de risco)"
          >
            <option value="off">Com eventos: Todos os projetos</option>
            <option value="5">Eventos nos próximos 5 dias</option>
            <option value="10">Eventos nos próximos 10 dias</option>
            <option value="20">Eventos nos próximos 20 dias</option>
            <option value="30">Eventos nos próximos 30 dias</option>
          </select>

          <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer">
            <input 
              type="checkbox"
              checked={showCompleted}
              onChange={e => {
                setShowCompleted(e.target.checked);
                setTimelineCurrentPage(1);
              }}
              className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300"
            />
            Mostrar concluídos
          </label>

          <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
            <input 
              type="checkbox"
              checked={showRiskReviews}
              onChange={e => setShowRiskReviews(e.target.checked)}
              className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
            />
            <span className="flex items-center gap-1">
              <span>⚠️</span>
              <span>Incluir revisão de riscos</span>
            </span>
          </label>
        </div>

        {/* Row 2: Navigation & Fullscreen */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            {/* Registos por página */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
              <span>Mostrar:</span>
              <select
                value={timelineItemsPerPage}
                onChange={(e) => {
                  setTimelineItemsPerPage(Number(e.target.value));
                  setTimelineCurrentPage(1);
                }}
                className="bg-transparent text-slate-800 text-xs font-bold focus:outline-hidden cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* Paginação Anterior / Seguinte */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
              <button 
                disabled={currentTimelinePage === 1}
                onClick={() => setTimelineCurrentPage(p => Math.max(1, p - 1))}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-700 px-2 min-w-[65px] text-center">
                {currentTimelinePage} / {totalTimelinePages}
              </span>
              <button 
                disabled={currentTimelinePage === totalTimelinePages}
                onClick={() => setTimelineCurrentPage(p => Math.min(totalTimelinePages, p + 1))}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                title="Página seguinte"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Shift date buttons */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
              <button 
                onClick={shiftPrev}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Retroceder 7 dias"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={jumpToToday}
                className="px-2.5 py-1 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 transition-colors cursor-pointer"
              >
                Hoje
              </button>
              <button 
                onClick={shiftNext}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Avançar 7 dias"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Ecrã Cheio Button */}
          <button
            onClick={() => setIsTimelineFullscreen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
            title="Abrir linha de tempo em ecrã cheio"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Ecrã cheio</span>
          </button>
        </div>

        {/* Date Window Info Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/50 border border-blue-100/50 rounded-xl p-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-700">

            <span>
              De {new Date(startDateStr + 'T00:00:00').toLocaleDateString('pt-PT')} a {new Date(endDateStr + 'T00:00:00').toLocaleDateString('pt-PT')}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-[10px] font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
              Adjudicação do projeto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
              Entrega do projeto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-slate-200 rounded-full border border-slate-300" />
              Tarefa
            </span>
            <span className="flex items-center gap-1.5 text-red-600">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
              Conflito
            </span>
          </div>
        </div>
      </div>

      {/* TIMELINE MATRIX BOARD */}
      {renderTimelineMatrixTable(paginatedProjects)}

      {/* FOOTER LEGEND INFO */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 -sm text-xs text-slate-500 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <span className="font-semibold flex items-center gap-1.5">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
          Como ler o planeamento de equipa:
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-8 font-medium">
          <div className="flex items-start gap-2">
            <span className="w-2.5 h-2.5 rounded bg-red-50 border border-red-300 text-red-600 inline-flex items-center justify-center text-[7px] font-black">
              AB
            </span>
            <span>
              Iniciais a <strong>Vermelho</strong> indicam que o técnico está ausente ou tem dupla alocação no mesmo dia.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-500 flex items-center">
              <AlertCircle className="w-3.5 h-3.5" />
            </span>
            <span>
              Passe o cursor sobre os emblemas com aviso para ler o motivo exato do conflito de escala.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">
              Adjudicação / Entrega
            </span>
            <span>
              As datas contratuais do projeto aparecem como bandeiras no topo das células de cada dia.
            </span>
          </div>
        </div>
      </div>

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

      {/* Task Creation Modal for Timeline Day Click */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              {(() => {
                const modalProj = projects.find(p => p.id === modalProjectId);
                const modalClient = modalProj ? clients.find(c => c.id === modalProj.clientId) : null;
                const cName = modalClient ? modalClient.clientName : 'N/A';
                const pTitle = modalProj ? modalProj.title : 'Criar Tarefa';
                return (
                  <div>
                    <span className="text-[10px] uppercase font-extrabold text-blue-600 tracking-wider block">Nova Tarefa no Calendário</span>
                    <div className="text-xs font-medium text-slate-500 mt-0.5">
                      Cliente: <strong className="text-slate-800 font-bold">{cName}</strong> | Projeto: <strong className="text-slate-800 font-bold">{pTitle}</strong>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Data selecionada: {modalDateStr ? new Date(modalDateStr + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                    </p>
                  </div>
                );
              })()}
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Title */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Título da Tarefa <span className="text-red-500">*</span></label>
                <input 
                  type="text"
                  required
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  placeholder="Ex: Instalação de equipamentos, Visita técnica..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Descrição / Instruções</label>
                <textarea 
                  rows={3}
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                  placeholder="Detalhes ou observações sobre a tarefa..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>

              {/* Status & Estimated Hours Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Estado</label>
                  <select
                    value={taskStatusId}
                    onChange={e => setTaskStatusId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none cursor-pointer"
                  >
                    {taskStatuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Tipo de Tarefa</label>
                  <select
                    value={taskTypeId}
                    onChange={e => setTaskTypeId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none cursor-pointer"
                  >
                    <option value="">Selecione o tipo de tarefa...</option>
                    {taskTypes.filter(s => !s.deleted).map(s => (
                      <option key={s.id} value={s.id}>{getTaskTypeName(s.id, taskTypes)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Horas Previstas (HH:MM)</label>
                <input 
                  type="text"
                  value={taskEstimatedHours}
                  onChange={e => setTaskEstimatedHours(e.target.value)}
                  placeholder="08:00"
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>

              {/* Assignees */}
              <AssigneeSelector 
                users={users} 
                userGroups={userGroups}
                allowedGroupIds={appConfig?.taskAssigneeGroupIds}
                selectedIds={taskAssigneeIds} 
                onChange={setTaskAssigneeIds} 
                filterTeamOnly
              />

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-colors cursor-pointer text-xs"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors cursor-pointer text-xs shadow-sm"
                >
                  Criar Tarefa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULLSCREEN TIMELINE MODAL */}
      {isTimelineFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex flex-col p-4 md:p-6 overflow-hidden animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col h-full w-full overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">Linha do tempo</h3>
                  <p className="text-xs text-slate-500">De {new Date(startDateStr + 'T00:00:00').toLocaleDateString('pt-PT')} a {new Date(endDateStr + 'T00:00:00').toLocaleDateString('pt-PT')}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3"> 
                {/* Assignee Filter */}
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-750 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
                >
                  <option value="">Todos os utilizadores</option>
                  {users.filter(u => !u.deleted).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>

                <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={showCompleted}
                    onChange={e => {
                      setShowCompleted(e.target.checked);
                      setTimelineCurrentPage(1);
                    }}
                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300"
                  />
                  Mostrar concluídos
                </label>

                {/* Registos por página */}
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                  <span>Mostrar:</span>
                  <select
                    value={timelineItemsPerPage}
                    onChange={(e) => {
                      setTimelineItemsPerPage(Number(e.target.value));
                      setTimelineCurrentPage(1);
                    }}
                    className="bg-transparent text-slate-800 text-xs font-bold focus:outline-hidden cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                {/* Paginação */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
                  <button 
                    disabled={currentTimelinePage === 1}
                    onClick={() => setTimelineCurrentPage(p => Math.max(1, p - 1))}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-30 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-700 px-2 min-w-[65px] text-center">
                    {currentTimelinePage} / {totalTimelinePages}
                  </span>
                  <button 
                    disabled={currentTimelinePage === totalTimelinePages}
                    onClick={() => setTimelineCurrentPage(p => Math.min(totalTimelinePages, p + 1))}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-30 transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Date shift buttons */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
                  <button 
                    onClick={shiftPrev}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={jumpToToday}
                    className="px-2.5 py-1 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  >
                    Hoje
                  </button>
                  <button 
                    onClick={shiftNext}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Close Fullscreen */}
                <button
                  onClick={() => setIsTimelineFullscreen(false)}
                  className="p-2 hover:bg-slate-200/80 rounded-xl text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  title="Fechar ecrã cheio"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-4 overflow-hidden bg-slate-100/50">
              {renderTimelineMatrixTable(paginatedProjects, true)}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
