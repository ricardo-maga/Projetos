'use client';

import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Plus, 
  Clock, 
  AlertTriangle, 
  Search, 
  X, 
  Briefcase, 
  Filter, 
  CalendarDays,
  CheckCircle2,
  PlayCircle
} from 'lucide-react';
import { Task, Project, Client, User, UserAbsence, SpecialDay, TaskType } from '../lib/types';
import { 
  CalendarDayItem, 
  getOperationalCalendarDays, 
  formatOperationalDateRange, 
  getUserDayAbsence, 
  getOperationalDayConflicts,
  formatDateToYYYYMMDD,
  isUserAssignedToTask,
  isTaskOnDate
} from '../lib/operationalCalendar';
import { getTaskStatusName, matchTaskStatusId, formatToOnlyHours, getTaskTypeName, getTaskStatusStyle } from '../lib/utils';
import { normalizeRoleId } from '../lib/permissions';

// UI Foundation Components
import IconButton from './ui/IconButton';
import Button from './ui/Button';
import Input from './ui/Input';
import Checkbox from './ui/Checkbox';
import Badge from './ui/Badge';

interface OperationalUserCalendarProps {
  tasks: Task[];
  users: User[];
  projects: Project[];
  clients: Client[];
  absences?: UserAbsence[];
  taskStatuses: any[];
  taskTypes?: TaskType[];
  specialDays?: SpecialDay[];
  onSelectTask: (task: Task) => void;
  onQuickCreateTask?: (userId: string, dateStr: string, projectId?: string) => void;
  canCreateTask?: boolean;
  appConfig?: any;
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
  onSelectTask,
  onQuickCreateTask,
  canCreateTask = false,
  appConfig,
}: OperationalUserCalendarProps) {
  // 1. Period state: 7 days (default) or 14 days
  const [periodDays, setPeriodDays] = useState<7 | 14>(7);

  // 2. Anchor Date for the calendar
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());

  // 3. Filters
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [showOnlyWithTasks, setShowOnlyWithTasks] = useState<boolean>(false);

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

  // 4. Active eligible users
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

  // 5. Selected User IDs for the calendar display
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => {
    return activeEligibleUsers.map(u => u.id);
  });

  const hasInitializedRef = React.useRef(false);

  React.useEffect(() => {
    if (!hasInitializedRef.current && activeEligibleUsers.length > 0) {
      setSelectedUserIds(activeEligibleUsers.map(u => u.id));
      hasInitializedRef.current = true;
    }
  }, [activeEligibleUsers]);

  // 6. Navigation handlers
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

  // 7. Computed days for the operational period
  const calendarDays: CalendarDayItem[] = useMemo(() => {
    return getOperationalCalendarDays(anchorDate, periodDays, true);
  }, [anchorDate, periodDays]);

  const dateRangeLabel = useMemo(() => {
    return formatOperationalDateRange(calendarDays);
  }, [calendarDays]);

  // Pre-indexed lookup maps for high-performance rendering
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

  // 8. Filtered displayed users
  const displayedUsers = useMemo(() => {
    let result = activeEligibleUsers.filter(u => selectedUserIds.includes(u.id));

    if (userSearchTerm.trim()) {
      const term = userSearchTerm.trim().toLowerCase();
      result = result.filter(u => 
        u.name.toLowerCase().includes(term) || 
        (u.email || '').toLowerCase().includes(term)
      );
    }

    if (showOnlyWithTasks) {
      result = result.filter(u => (userTaskCountMap.get(u.id) || 0) > 0);
    }

    return result;
  }, [activeEligibleUsers, selectedUserIds, userSearchTerm, showOnlyWithTasks, userTaskCountMap]);

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
  const getProject = (projectId: string): Project | undefined => {
    return projects.find(p => p.id === projectId);
  };

  const getClientName = (clientId?: string): string => {
    if (!clientId) return '';
    const c = clients.find(cl => cl.id === clientId);
    return c ? (c.shortName || c.clientName || '') : '';
  };

  const getUserInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="space-y-4">
      {/* TOP CONTROL BAR */}
      <div className="bg-surface rounded-container border border-border p-4 shadow-raised space-y-4">
        {/* Title, Period & Navigation */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-control bg-blue-50 text-blue-700">
                <CalendarDays className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-text-primary leading-tight">
                  Calendário Operacional das Tarefas
                </h3>
                <p className="text-xs text-text-secondary">
                  Visão e gestão semanal direta por técnico e por dia. Clique nas tarefas para editar ou registar execução.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* 7 vs 14 days toggle */}
            <div className="flex items-center bg-surface-muted p-1 rounded-control border border-border">
              <button
                type="button"
                onClick={() => setPeriodDays(7)}
                className={`px-3 py-1.5 rounded-control text-xs font-bold transition-all cursor-pointer ${
                  periodDays === 7 
                    ? 'bg-surface text-text-primary shadow-raised' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Modo principal de 7 dias"
              >
                7 Dias
              </button>
              <button
                type="button"
                onClick={() => setPeriodDays(14)}
                className={`px-3 py-1.5 rounded-control text-xs font-bold transition-all cursor-pointer ${
                  periodDays === 14 
                    ? 'bg-surface text-text-primary shadow-raised' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Modo alargado de 14 dias"
              >
                14 Dias
              </button>
            </div>

            {/* Navigation buttons: Prev, Today, Next */}
            <div className="flex items-center gap-1.5 bg-surface border border-border rounded-control p-1 shadow-raised">
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePrevWeek}
                title={`Recuar ${periodDays} dias`}
                aria-label="Período anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </IconButton>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleToday}
                title="Ir para a data atual"
              >
                Hoje
              </Button>
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNextWeek}
                title={`Avançar ${periodDays} dias`}
                aria-label="Período seguinte"
              >
                <ChevronRight className="w-4 h-4" />
              </IconButton>
            </div>

            {/* Date range label banner */}
            <div className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-control text-xs font-bold text-blue-900 shadow-raised">
              {dateRangeLabel}
            </div>

            {/* Quick Create Task button in Header */}
            {canCreateTask && onQuickCreateTask && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  const defaultUser = displayedUsers[0]?.id || activeEligibleUsers[0]?.id || '';
                  const defaultDate = calendarDays[0]?.dateStr || formatDateToYYYYMMDD(new Date());
                  onQuickCreateTask(defaultUser, defaultDate);
                }}
                className="ml-auto"
                title="Criar nova tarefa no calendário"
              >
                <Plus className="w-4 h-4 mr-1 shrink-0" />
                <span>Nova Tarefa</span>
              </Button>
            )}
          </div>
        </div>

        {/* Filters Row: User Search & Options */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros:</span>
          </div>

          {/* User Search Input */}
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted z-10 pointer-events-none" />
            <Input
              type="text"
              value={userSearchTerm}
              onChange={e => setUserSearchTerm(e.target.value)}
              placeholder="Pesquisar utilizador..."
              className="pl-10 pr-9 h-10 text-xs"
            />
            {userSearchTerm && (
              <button
                type="button"
                onClick={() => setUserSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1 cursor-pointer z-10"
                title="Limpar pesquisa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Checkbox: Show only users with scheduled tasks */}
          <div className="flex items-center px-3 h-10 bg-surface border border-border rounded-control shadow-raised hover:bg-surface-muted transition-colors">
            <Checkbox
              checked={showOnlyWithTasks}
              onChange={e => setShowOnlyWithTasks(e.target.checked)}
              label="Apenas com tarefas no período"
            />
          </div>

          {(userSearchTerm || showOnlyWithTasks) && (
            <button
              type="button"
              onClick={() => {
                setUserSearchTerm('');
                setShowOnlyWithTasks(false);
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>Limpar filtros</span>
            </button>
          )}
        </div>

        {/* USER SELECTION PILLS BAR */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-700">
                Utilizadores no Calendário ({selectedUserIds.length}/{activeEligibleUsers.length}):
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllUsers}
                className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
              >
                Selecionar Todos
              </button>
              <button
                type="button"
                onClick={handleClearUsers}
                className="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Limpar
              </button>
            </div>
          </div>

          {/* Interactive User Chips */}
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            {activeEligibleUsers.map(user => {
              const isSelected = selectedUserIds.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleUserSelection(user.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  title={`${user.name} (${user.email || 'Sem email'}) - Clique para alternar visibilidade`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-slate-300'}`} />
                  <span>{user.name}</span>
                  {isSelected && <X className="w-3 h-3 ml-0.5 opacity-70 hover:opacity-100" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* OPERATIONAL CALENDAR TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left table-fixed">
            {/* Header: Days */}
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
              <tr>
                {/* User Column Header */}
                <th className="w-56 p-3 text-xs font-extrabold text-slate-700 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center justify-between">
                    <span>Utilizador</span>
                    <span className="text-[10px] text-slate-400 font-semibold">
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
                      <div className="text-[10px] uppercase font-bold tracking-wider opacity-75">
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
                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          {day.monthShort}
                        </span>
                      </div>
                      {specialDay && (
                        <div className="text-[9px] font-bold text-purple-700 truncate max-w-[80px] mx-auto mt-0.5">
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
                      <span className="text-[11px] text-slate-500">
                        {selectedUserIds.length === 0
                          ? 'Não tem nenhum utilizador selecionado.'
                          : 'Nenhum utilizador corresponde aos critérios de pesquisa ou filtros.'}
                      </span>
                      {selectedUserIds.length === 0 && (
                        <button
                          type="button"
                          onClick={handleSelectAllUsers}
                          className="mt-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          Selecionar Todos os Utilizadores
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                displayedUsers.map(user => {
                  const userPeriodTaskCount = userTaskCountMap.get(user.id) || 0;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/40 transition-colors">
                      {/* Left: User Identity Column */}
                      <td className="p-3 sticky left-0 bg-white z-10 border-r border-slate-100 shadow-[2px_0_4px_rgba(0,0,0,0.02)] align-top">
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-extrabold text-[11px] shrink-0 mt-0.5">
                              {getUserInitials(user.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-extrabold text-slate-900 text-xs truncate" title={user.name}>
                                {user.name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {user.email || 'Técnico'}
                              </div>
                              <div className="mt-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded inline-block">
                                {userPeriodTaskCount} {userPeriodTaskCount === 1 ? 'tarefa' : 'tarefas'}
                              </div>
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

                        return (
                          <td
                            key={day.dateStr}
                            className={`p-2 border-l border-slate-100 align-top transition-colors group relative ${
                              (day.isWeekend || !!specialDays.find(sd => sd.date === day.dateStr))
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
                                  className={`p-1.5 rounded-lg text-center font-extrabold text-[10px] border shadow-2xs ${
                                    dayTasks.length > 0
                                      ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                                      : 'bg-slate-200/80 text-slate-700 border-slate-300'
                                  }`}
                                  title={conflictInfo.tooltipText}
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    <span>{conflictInfo.badgeText}</span>
                                  </div>
                                  {dayAbsence?.reason && (
                                    <div className="text-[9px] font-semibold opacity-80 mt-0.5 truncate">
                                      {dayAbsence.reason}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Multiple Tasks Conflict Banner (if not absent) */}
                              {!conflictInfo.isAbsent && conflictInfo.hasMultipleTasks && (
                                <div
                                  className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[9px] font-extrabold flex items-center gap-1 shadow-2xs"
                                  title={conflictInfo.tooltipText}
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>{conflictInfo.badgeText}</span>
                                </div>
                              )}

                              {/* Task Cards */}
                              {dayTasks.map(task => {
                                const project = getProject(task.projectId);
                                const clientName = project ? getClientName(project.clientId) : '';
                                const tStyle = getTaskStatusStyle(task.statusId, taskStatuses);
                                const statusName = tStyle.name;
                                const scale = getTaskScale(task.statusId);
                                const hours = formatToOnlyHours(task.estimatedHours) || '0';

                                // Color styling based on status color configuration
                                const cardStyle = `border-l-4 ${tStyle.dotClass.replace('bg-', 'border-l-')} ${tStyle.bgClass} ${tStyle.borderClass} hover:brightness-95`;
                                const badgeStyle = `${tStyle.badgeClass} font-extrabold`;

                                return (
                                  <div
                                    key={task.id}
                                    onClick={() => onSelectTask(task)}
                                    className={`p-2 bg-white rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer group/card space-y-1 text-left ${cardStyle}`}
                                    title={`Abrir tarefa: ${task.title}\nProjeto: ${project?.title || 'Sem projeto'}\nHoras previstas: ${hours} h\nEstado: ${statusName}`}
                                  >
                                    {/* Project / Client label */}
                                    <div className="text-[9px] font-bold text-blue-700 truncate leading-tight flex items-center gap-1">
                                      <Briefcase className="w-2.5 h-2.5 shrink-0" />
                                      <span className="truncate">
                                        {clientName ? `${clientName} • ` : ''}{project?.title || 'Sem projeto'}
                                      </span>
                                    </div>

                                    {/* Task title */}
                                    <div className="text-[11px] font-extrabold text-slate-800 line-clamp-2 leading-tight group-hover/card:text-blue-600 transition-colors">
                                      {task.title}
                                    </div>

                                    {/* Footer: Hours, Type & Status Badge */}
                                    <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-slate-100">
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-600 bg-slate-100 px-1 py-0.5 rounded">
                                        <Clock className="w-2.5 h-2.5 text-slate-400" />
                                        <span>{hours} h</span>
                                      </span>

                                      <div className="flex items-center gap-1">
                                        {task.taskTypeId && (
                                          <span className="text-[9px] font-medium text-slate-500 bg-slate-50 border border-slate-200/60 px-1 py-0.5 rounded truncate max-w-[80px]">
                                            {getTaskTypeName(task.taskTypeId, taskTypes)}
                                          </span>
                                        )}
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md truncate max-w-[80px] ${badgeStyle}`}>
                                          {statusName}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Empty placeholder when no tasks & no absence */}
                              {dayTasks.length === 0 && !conflictInfo.isAbsent && (
                                <div className="h-full flex items-center justify-center text-slate-300 text-[10px] italic py-3 select-none">
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

      {/* FOOTER LEGEND */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-bold text-slate-700">
          <span>Legenda Operacional:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-blue-500" />
            <span>Planeada</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500" />
            <span>Em Execução</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
            <span>Concluída</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-rose-500" />
            <span>Bloqueada</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-400" />
            <span>Ausência do Técnico</span>
          </span>
          <span className="text-slate-400">
            • Clique em qualquer tarefa para ver detalhes, editar ou registar a execução.
          </span>
        </div>
      </div>
    </div>
  );
}
