'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  Users, 
  Plus, 
  AlertTriangle, 
  X, 
  CalendarDays,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Task, Project, Client, User, UserAbsence, SpecialDay, TaskType } from '../lib/types';
import { 
  CalendarDayItem, 
  getOperationalCalendarDays, 
  getUserDayAbsence, 
  getOperationalDayConflicts,
  formatDateToYYYYMMDD,
  isUserAssignedToTask,
  isTaskOnDate,
  computeTaskDropUpdates
} from '../lib/operationalCalendar';
import { getTaskStatusName, matchTaskStatusId, getTaskTypeName, getTaskStatusStyle, getUserInitials } from '../lib/utils';
import { normalizeRoleId } from '../lib/permissions';
import DateViewNavigator from './ui/DateViewNavigator';
import { M3Button, M3FilterChip } from './M3';

export function sanitizeUserIds(rawIds: any, eligibleUsers: User[] = []): string[] {
  if (!Array.isArray(rawIds)) return [];
  const eligibleSet = eligibleUsers.length > 0 ? new Set(eligibleUsers.map(u => u.id)) : null;
  const result: string[] = [];
  const seen = new Set<string>();

  for (const id of rawIds) {
    if (typeof id === 'string' && id.trim() !== '') {
      const cleanId = id.trim();
      if (!seen.has(cleanId)) {
        if (!eligibleSet || eligibleSet.has(cleanId)) {
          seen.add(cleanId);
          result.push(cleanId);
        }
      }
    }
  }

  return result;
}

interface OperationalUserCalendarProps {
  tasks: Task[];
  users: User[];
  projects: Project[];
  clients: Client[];
  absences?: UserAbsence[];
  taskStatuses: any[];
  taskTypes?: TaskType[];
  specialDays?: SpecialDay[];
  userGroups?: any[];
  onSelectTask: (task: Task) => void;
  onQuickCreateTask?: (userId: string, dateStr: string, projectId?: string) => void;
  canCreateTask?: boolean;
  canMoveTask?: boolean;
  updateTask?: (id: string, updates: any) => void;
  appConfig?: any;
  currentUser?: User | any;
}

export default function OperationalUserCalendar({
  tasks = [],
  users = [],
  projects = [],
  clients = [],
  absences = [],
  taskStatuses = [],
  taskTypes = [],
  specialDays = [],
  userGroups = [],
  onSelectTask,
  onQuickCreateTask,
  canCreateTask = false,
  canMoveTask = false,
  updateTask,
  appConfig,
  currentUser,
}: OperationalUserCalendarProps) {
  // 1. Fullscreen container ref and state
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {
        setIsFullscreen(true);
      });
    } else {
      document.exitFullscreen?.().catch(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFS = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFS);
    return () => document.removeEventListener('fullscreenchange', handleFS);
  }, []);

  // 2. Period state: 7 days (default) or 14 days
  const [periodDays, setPeriodDays] = useState<7 | 14>(7);

  // 3. Anchor Date for the calendar
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());

  // 4. Drag and Drop state
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  const handleDropTask = (e: React.DragEvent, targetUserId: string, targetDateStr: string) => {
    e.preventDefault();
    setDragOverCell(null);
    if (!canMoveTask || !updateTask) return;

    let taskId = '';
    let sourceUserId = '';
    let sourceDateStr = '';

    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const parsed = JSON.parse(jsonData);
        taskId = parsed.taskId || '';
        sourceUserId = parsed.sourceUserId || '';
        sourceDateStr = parsed.sourceDateStr || '';
      } catch (err) {}
    }

    if (!taskId) {
      taskId = e.dataTransfer.getData('taskId') || '';
      sourceUserId = e.dataTransfer.getData('sourceUserId') || '';
      sourceDateStr = e.dataTransfer.getData('sourceDateStr') || '';
    }

    if (!taskId) return;

    const taskObj = tasks.find(t => t.id === taskId);
    if (!taskObj) return;

    const { hasChanges, updates } = computeTaskDropUpdates(taskObj, sourceUserId, targetUserId, targetDateStr);
    if (hasChanges && Object.keys(updates).length > 0) {
      try {
        const res = updateTask(taskId, updates);
        if (res && typeof (res as any).catch === 'function') {
          (res as Promise<any>).catch((err: any) => {
            console.error('[OperationalUserCalendar] Falha ao atualizar tarefa após arrastamento:', err);
          });
        }
      } catch (err: any) {
        console.error('[OperationalUserCalendar] Erro ao disparar atualização da tarefa:', err);
      }
    }
  };

  // Helper to resolve scale for task status (1: Planeada, 2: Em Execução, 3: Concluída, 4: Bloqueada)
  const getTaskScale = React.useCallback((statusId: string) => {
    const status = taskStatuses.find(s => s.id === statusId || matchTaskStatusId(s.id, statusId));
    if (status && typeof status.scale === 'number') return status.scale;
    if (statusId === 'ts-1' || statusId === '99999999-9999-9999-9999-999999999901') return 1;
    if (statusId === 'ts-2' || statusId === '99999999-9999-9999-9999-999999999902') return 2;
    if (statusId === 'ts-3' || statusId === '99999999-9999-9999-9999-999999999903') return 3;
    if (statusId === 'ts-4' || statusId === '99999999-9999-9999-9999-999999999904') return 4;
    return 1;
  }, [taskStatuses]);

  // 5. Active eligible users
  const activeEligibleUsers = useMemo(() => {
    const allowedGroupIds = Array.isArray(appConfig?.taskAssigneeGroupIds) && appConfig.taskAssigneeGroupIds.length > 0
      ? appConfig.taskAssigneeGroupIds
      : (typeof appConfig?.taskAssigneeGroupId === 'string' && appConfig.taskAssigneeGroupId.trim() !== ''
          ? appConfig.taskAssigneeGroupId.split(',').map((s: string) => s.trim()).filter(Boolean)
          : []);

    return users
      .filter(u => !u.deleted && u.email?.toLowerCase() !== 'ricardo75@gmail.com')
      .filter(u => {
        if (allowedGroupIds.length > 0) {
          const userRoleId = u.roleId || '';
          const normalizedUserRole = normalizeRoleId(userRoleId);
          return allowedGroupIds.some((gid: string) => {
            const normalizedGid = normalizeRoleId(gid);
            return gid === userRoleId || normalizedGid === normalizedUserRole || gid === normalizedUserRole;
          });
        }
        return u.type === 'Team' || !u.type;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-PT', { sensitivity: 'base' }));
  }, [users, appConfig?.taskAssigneeGroupIds, appConfig?.taskAssigneeGroupId]);

  // 6. Selected User IDs & Hardened LocalStorage Persistence
  const currentUserId = currentUser?.id ? String(currentUser.id) : null;
  const loadedUserIdRef = useRef<string | null>(null);

  // Helper to load and sanitize preference from localStorage for a specific userId
  const loadUserPreference = useCallback((userId: string, eligible: User[]) => {
    if (typeof window === 'undefined' || !userId) return [];
    try {
      const key = `task-calendar-selected-users-v1:${userId}`;
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        return sanitizeUserIds(parsed, eligible);
      }
    } catch (err) {
      console.error('[OperationalUserCalendar] Erro ao ler preferência de utilizadores:', err);
    }
    return [];
  }, []);

  // Initial state load
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => {
    if (currentUserId) {
      loadedUserIdRef.current = currentUserId;
      return loadUserPreference(currentUserId, activeEligibleUsers);
    }
    loadedUserIdRef.current = null;
    return [];
  });

  // Reactive Effect: When currentUserId or activeEligibleUsers change or become available
  useEffect(() => {
    if (!currentUserId) {
      loadedUserIdRef.current = null;
      setSelectedUserIds([]);
      return;
    }

    if (loadedUserIdRef.current !== currentUserId) {
      const loaded = loadUserPreference(currentUserId, activeEligibleUsers);
      setSelectedUserIds(loaded);
      loadedUserIdRef.current = currentUserId;
    } else if (activeEligibleUsers.length > 0) {
      setSelectedUserIds(prev => {
        const sanitized = sanitizeUserIds(prev, activeEligibleUsers);
        if (sanitized.length !== prev.length || sanitized.some((id, idx) => id !== prev[idx])) {
          return sanitized;
        }
        return prev;
      });
    }
  }, [currentUserId, activeEligibleUsers, loadUserPreference]);

  // Saving Effect: Persist selection changes to localStorage ONLY if currentUserId is present AND matched
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUserId) return;
    if (loadedUserIdRef.current !== currentUserId) return;

    try {
      const key = `task-calendar-selected-users-v1:${currentUserId}`;
      localStorage.setItem(key, JSON.stringify(selectedUserIds));
    } catch (err) {
      console.error('[OperationalUserCalendar] Erro ao guardar preferência de utilizadores:', err);
    }
  }, [selectedUserIds, currentUserId]);

  // 7. Navigation handlers
  const handlePrevWeek = () => {
    setAnchorDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - periodDays);
      return next;
    });
  };

  const handleNextWeek = () => {
    setAnchorDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + periodDays);
      return next;
    });
  };

  const handleToday = () => {
    setAnchorDate(new Date());
  };

  // 8. Computed days for the operational period
  const calendarDays: CalendarDayItem[] = useMemo(() => {
    return getOperationalCalendarDays(anchorDate, periodDays, true);
  }, [anchorDate, periodDays]);

  const calendarRangeLabel = useMemo(() => {
    if (!calendarDays || calendarDays.length === 0) return '';
    const start = calendarDays[0];
    const end = calendarDays[calendarDays.length - 1];
    return `${start.dayNum} ${start.monthShort} - ${end.dayNum} ${end.monthShort}`;
  }, [calendarDays]);

  const isTodayInPeriod = useMemo(() => {
    return (calendarDays || []).some(d => d.isToday);
  }, [calendarDays]);

  // Pre-indexed lookup maps
  const { userDayTasksMap, userDayAbsenceMap, userTaskCountMap } = useMemo(() => {
    const tasksMap = new Map<string, Task[]>();
    const countMap = new Map<string, number>();

    const candidateTasks = tasks.filter(t => !t.deleted);

    for (const u of activeEligibleUsers) {
      let uTotalCount = 0;
      for (const d of calendarDays) {
        const key = `${u.id}_${d.dateStr}`;
        const dayTasks: Task[] = [];
        for (const t of candidateTasks) {
          if (isUserAssignedToTask(t, u.id) && isTaskOnDate(t, d.dateStr)) {
            dayTasks.push(t);
          }
        }
        tasksMap.set(key, dayTasks);
        uTotalCount += dayTasks.length;
      }
      countMap.set(u.id, uTotalCount);
    }

    const absenceMap = new Map<string, any>();
    for (const u of activeEligibleUsers) {
      for (const d of calendarDays) {
        const key = `${u.id}_${d.dateStr}`;
        const abs = getUserDayAbsence(absences, u.id, d.dateStr);
        if (abs) {
          absenceMap.set(key, abs);
        }
      }
    }

    return {
      userDayTasksMap: tasksMap,
      userDayAbsenceMap: absenceMap,
      userTaskCountMap: countMap,
    };
  }, [tasks, absences, activeEligibleUsers, calendarDays]);

  // Filtered displayed users
  const displayedUsers = useMemo(() => {
    return activeEligibleUsers.filter(u => selectedUserIds.includes(u.id));
  }, [activeEligibleUsers, selectedUserIds]);

  // User selection handlers
  const handleSelectAllUsers = () => {
    setSelectedUserIds(activeEligibleUsers.map(u => u.id));
  };

  const handleClearUsers = () => {
    setSelectedUserIds([]);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // Helpers for project and client names
  const getProject = (projectId?: string | null): Project | undefined => {
    if (!projectId) return undefined;
    return projects.find(p => p.id === projectId);
  };

  const getProjectLabel = (projectId?: string | null): string => {
    if (!projectId) return 'Sem projeto';
    const proj = projects.find(p => p.id === projectId);
    return proj ? proj.title : 'Projeto não encontrado';
  };

  const getClientName = (clientId?: string): string => {
    if (!clientId) return '';
    const c = clients.find(cl => cl.id === clientId);
    return c ? (c.shortName || c.clientName || '') : '';
  };

  return (
    <div 
      ref={containerRef}
      className={isFullscreen ? 'm3-calendar-fullscreen fixed inset-0 z-50 overflow-y-auto p-4 space-y-4' : 'space-y-4'}
    >
      {/* TOP CONTROL BAR */}
      <div className="m3-card p-4 space-y-4">
        {/* Title & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="m3-calendar-icon p-2 rounded-xl">
              <CalendarDays className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-text-primary">Agenda da equipa</h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Fullscreen Button */}
            <M3Button tone="tonal"
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Sair do ecrã cheio" : "Abrir em ecrã cheio"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Sair do Ecrã Cheio</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Ecrã Cheio</span>
                </>
              )}
            </M3Button>

            {/* Quick Create Task button in Header */}
            {canCreateTask && onQuickCreateTask && (
              <M3Button
                type="button"
                onClick={() => {
                  const defaultUser = displayedUsers[0]?.id || activeEligibleUsers[0]?.id || '';
                  const defaultDate = calendarDays[0]?.dateStr || formatDateToYYYYMMDD(new Date());
                  onQuickCreateTask(defaultUser, defaultDate);
                }}
                title="Criar nova tarefa no calendário"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Tarefa</span>
              </M3Button>
            )}
          </div>
        </div>

        {/* LINE 1: Datas de visualização (DateViewNavigator) */}
        <div className="pt-3 border-t border-slate-100">
          <DateViewNavigator
            periodDays={periodDays}
            onPeriodDaysChange={setPeriodDays}
            onPrev={handlePrevWeek}
            onNext={handleNextWeek}
            onToday={handleToday}
            label={calendarRangeLabel}
            isToday={isTodayInPeriod}
          />
        </div>

        {/* LINE 2: Utilizadores no Calendário */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-700">
                Utilizadores ({selectedUserIds.length}/{activeEligibleUsers.length}):
              </span>
            </div>

            <div className="flex items-center gap-2">
              <M3Button tone="text"
                type="button"
                onClick={handleSelectAllUsers}
              >
                Selecionar Todos
              </M3Button>
              <M3Button tone="text"
                type="button"
                onClick={handleClearUsers}
              >
                Limpar
              </M3Button>
            </div>
          </div>

          {/* Interactive User Chips */}
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            {activeEligibleUsers.map(user => {
              const isSelected = selectedUserIds.includes(user.id);
              return (
                <M3FilterChip
                  key={user.id}
                  type="button"
                  onClick={() => toggleUserSelection(user.id)}
                  selected={isSelected}
                  title={`${user.name} - Clique para alternar visibilidade no calendário`}
                >
                  <span>{user.name}</span>
                </M3FilterChip>
              );
            })}
          </div>
        </div>
      </div>

      {/* OPERATIONAL CALENDAR TABLE */}
      <div className="m3-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left table-fixed">
            {/* Header: Days */}
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
              <tr>
                {/* User Column Header */}
                <th className="w-56 p-3 text-xs font-extrabold text-slate-700 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center justify-between">
                    <span>Utilizador</span>
                    <span className="text-caption text-text-muted font-semibold">
                      ({displayedUsers.length})
                    </span>
                  </div>
                </th>

                {/* Day Columns */}
                {calendarDays.map(day => {
                  const specialDay = specialDays.find(sd => sd.date === day.dateStr);

                  return (
                    <th
                      key={day.dateStr}
                      className={`p-2.5 text-center text-xs font-bold border-l border-slate-200 transition-colors ${
                        (day.isWeekend || !!specialDay)
                          ? (day.isToday
                              ? 'bg-slate-100 text-amber-950 border-x-2 border-amber-400'
                              : 'bg-slate-100/70 text-slate-500')
                          : (day.isToday
                              ? 'bg-amber-50/90 text-amber-950 border-amber-200'
                              : 'bg-slate-50 text-slate-700')
                      }`}
                      title={specialDay ? specialDay.name : undefined}
                    >
                      <div className="text-caption uppercase font-bold tracking-wider opacity-75">
                        {day.weekdayShort}
                      </div>
                      <div className="flex items-center justify-center gap-1 my-0.5">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                          day.isToday 
                            ? 'bg-amber-500 text-white shadow-2xs' 
                            : 'text-slate-800'
                        }`}>
                          {day.dayNum}
                        </span>
                        <span className="text-caption uppercase font-bold text-text-muted">
                          {day.monthShort}
                        </span>
                      </div>
                      {specialDay && (
                        <div className="text-caption font-bold text-purple-700 truncate max-w-[80px] mx-auto mt-0.5">
                          {specialDay.name}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Body: One Row Per User */}
            <tbody className="divide-y divide-slate-100 text-xs">
              {displayedUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={calendarDays.length + 1}
                    className="p-12 text-center text-slate-400 font-medium"
                  >
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Users className="w-8 h-8 text-slate-300" />
                      <span className="text-xs font-bold text-slate-700">
                        Nenhum utilizador visível no calendário
                      </span>
                      <span className="text-caption text-text-secondary">
                        Não tem nenhum utilizador selecionado.
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAllUsers}
                        className="mt-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Selecionar Todos os Utilizadores
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedUsers.map(user => {
                  const userPeriodTaskCount = userTaskCountMap.get(user.id) || 0;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/40 transition-colors">
                      {/* Left: User Identity Column (Line 1: [iniciais] Nome, Line 2: Cargo / Role) */}
                      <td className="p-3 sticky left-0 bg-white z-10 border-r border-slate-100 shadow-[2px_0_4px_rgba(0,0,0,0.02)] align-top">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            {/* Line 1: Badge + Name */}
                            <div className="flex items-center gap-2 min-w-0">

                              <div className="font-extrabold text-slate-900 text-xs truncate" title={user.name}>
                                {user.name}
                              </div>
                            </div>

                            {/* Line 2: Cargo / Role */}
                            <div className="mt-1.5 text-caption font-bold text-text-secondary bg-surface-muted px-1.5 py-0.5 rounded inline-block">
                              {`${userPeriodTaskCount} ${userPeriodTaskCount === 1 ? 'tarefa' : 'tarefas'}`}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleUserSelection(user.id)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors opacity-40 hover:opacity-100 cursor-pointer shrink-0"
                            title={`Ocultar ${user.name} do calendário`}
                            aria-label={`Ocultar ${user.name}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Day Cells for this User */}
                      {calendarDays.map(day => {
                        const cellKey = `${user.id}_${day.dateStr}`;
                        const dayTasks = userDayTasksMap.get(cellKey) || [];
                        const dayAbsence = userDayAbsenceMap.get(cellKey);
                        const conflictInfo = getOperationalDayConflicts(
                          dayTasks,
                          dayAbsence,
                          user.name,
                          day.dateStr.split('-').reverse().join('/')
                        );

                        const isCellDragOver = dragOverCell === cellKey;

                        return (
                          <td
                            key={day.dateStr}
                            onDragOver={(e) => {
                              if (canMoveTask) {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                              }
                            }}
                            onDragEnter={(e) => {
                              if (canMoveTask) {
                                e.preventDefault();
                                setDragOverCell(cellKey);
                              }
                            }}
                            onDragLeave={(e) => {
                              if (canMoveTask && e.currentTarget.contains(e.relatedTarget as Node)) {
                                return;
                              }
                              if (dragOverCell === cellKey) {
                                setDragOverCell(null);
                              }
                            }}
                            onDrop={(e) => {
                              handleDropTask(e, user.id, day.dateStr);
                            }}
                            className={`p-2 border-l border-slate-100 align-top transition-all group relative ${
                              isCellDragOver
                                ? 'bg-blue-50/90 ring-2 ring-blue-400 ring-inset'
                                : (day.isWeekend || !!specialDays.find(sd => sd.date === day.dateStr))
                                  ? (day.isToday ? 'bg-slate-100/80 border-x border-amber-200/80' : 'bg-slate-50/70')
                                  : (day.isToday ? 'bg-amber-50/20' : '')
                            }`}
                          >
                            <div className="min-h-[70px] space-y-1.5 flex flex-col justify-start">
                              {/* Quick Add button on top corner */}
                              {canCreateTask && onQuickCreateTask && (
                                <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onQuickCreateTask(user.id, day.dateStr);
                                    }}
                                    className="p-1 hover:bg-blue-100 text-blue-600 rounded-md transition-colors cursor-pointer"
                                    title={`Adicionar nova tarefa para ${user.name} em ${day.dateStr}`}
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {/* Absence Banner */}
                              {conflictInfo.isAbsent && (
                                <div 
                                  className={`p-1.5 rounded-lg text-center font-extrabold text-xs border shadow-2xs ${
                                    dayTasks.length > 0
                                      ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                                      : 'bg-slate-200/80 text-slate-700 border-slate-300'
                                  }`}
                                  title={conflictInfo.tooltipText}
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                    <span>{conflictInfo.badgeText}</span>
                                  </div>
                                  {dayAbsence?.reason && (
                                    <div className="text-caption font-semibold opacity-85 mt-0.5 truncate">
                                      {dayAbsence.reason}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Multiple Tasks Conflict Banner (if not absent) */}
                              {!conflictInfo.isAbsent && conflictInfo.hasMultipleTasks && (
                                <div
                                  className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-xs font-extrabold flex items-center gap-1 shadow-2xs"
                                  title={conflictInfo.tooltipText}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span>{conflictInfo.badgeText}</span>
                                </div>
                              )}

                              {/* Task Cards: 5 exact lines */}
                              {dayTasks.map(task => {
                                const project = getProject(task.projectId);
                                const projectLabel = getProjectLabel(task.projectId);
                                const clientName = project ? getClientName(project.clientId) : '';
                                const tStyle = getTaskStatusStyle(task.statusId, taskStatuses);
                                const statusName = tStyle.name;

                                // Color styling based on status color configuration
                                const cardStyle = `border-l-4 ${tStyle.dotClass.replace('bg-', 'border-l-')} ${tStyle.bgClass} ${tStyle.borderClass} hover:brightness-95`;
                                const badgeStyle = `${tStyle.badgeClass} font-extrabold`;

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
                                      e.dataTransfer.setData('application/json', JSON.stringify({
                                        taskId: task.id,
                                        sourceUserId: user.id,
                                        sourceDateStr: day.dateStr,
                                      }));
                                      e.dataTransfer.setData('taskId', task.id);
                                      e.dataTransfer.setData('sourceUserId', user.id);
                                      e.dataTransfer.setData('sourceDateStr', day.dateStr);
                                      e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onClick={() => onSelectTask(task)}
                                    className={`p-2 bg-white rounded-xl shadow-2xs hover:shadow-xs transition-all space-y-1 text-left ${cardStyle} ${
                                      canMoveTask ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                    }`}
                                    title={`Abrir tarefa: ${task.title}\nCliente: ${clientName || 'Sem cliente'}\nProjeto: ${projectLabel}\nEstado: ${statusName}`}
                                  >
                                    {/* Linha 1: Nome do cliente (Sem ícone) */}
                                    <div className="text-caption font-bold text-text-secondary truncate leading-tight">
                                      {clientName || 'Sem cliente'}
                                    </div>

                                    {/* Linha 2: Nome do projeto */}
                                    <div className="text-xs font-bold text-blue-700 truncate leading-tight">
                                      {projectLabel}
                                    </div>

                                    {/* Linha 3: Título da tarefa */}
                                    <div className="text-xs sm:text-sm font-extrabold text-slate-900 line-clamp-2 leading-tight">
                                      {task.title}
                                    </div>

                                    {/* Linha 4: Tipo de tarefa */}
                                    <div className="text-caption font-semibold text-text-secondary truncate">
                                      {task.taskTypeId ? (getTaskTypeName(task.taskTypeId, taskTypes) || '—') : '—'}
                                    </div>

                                    {/* Linha 5: Badge de estado da tarefa + Pessoa atribuída */}
                                    <div className="flex items-center justify-between gap-1 pt-0.5">
                                      <span className={`inline-block text-caption font-bold px-1.5 py-0.5 rounded-md truncate max-w-[110px] ${badgeStyle}`}>
                                        {statusName}
                                      </span>
                                      {task.assigneeIds && task.assigneeIds.length > 0 && (
                                        <div className="flex items-center -space-x-1 shrink-0" title={`Atribuído a: ${task.assigneeIds.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(', ')}`}>
                                          {task.assigneeIds.slice(0, 2).map(id => {
                                            const assignedUser = users.find(u => u.id === id);
                                            return (
                                              <span key={id} className="w-4 h-4 rounded-full bg-slate-700 text-white flex items-center justify-center text-[8px] font-black ring-1 ring-white">
                                                {getUserInitials(assignedUser?.name || id)}
                                              </span>
                                            );
                                          })}
                                          {task.assigneeIds.length > 2 && (
                                            <span className="text-[8px] font-bold text-slate-500 pl-0.5">
                                              +{task.assigneeIds.length - 2}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Empty placeholder when no tasks & no absence */}
                              {dayTasks.length === 0 && !conflictInfo.isAbsent && (
                                <div className="h-full flex items-center justify-center text-text-muted text-caption italic py-3 select-none">
                                  —
                                </div>
                              )}
                            </div>
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
      </div>
    </div>
  );
}
