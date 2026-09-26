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
  CalendarDays
} from 'lucide-react';
import { Task, Project, Client, User, UserAbsence, SpecialDay, TaskType } from '../lib/types';
import { 
  CalendarDayItem, 
  getOperationalCalendarDays, 
  formatOperationalDateRange, 
  getUserDayTasks, 
  getUserDayAbsence, 
  getOperationalDayConflicts,
  formatDateToYYYYMMDD,
  matchUserId,
  isUserAssignedToTask,
  isTaskOnDate
} from '../lib/operationalCalendar';
import { getTaskStatusName, formatToOnlyHours, getTaskTypeName } from '../lib/utils';
import { normalizeRoleId } from '../lib/permissions';

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
  onQuickCreateTask?: (userId: string, dateStr: string) => void;
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
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [showOnlyWithTasks, setShowOnlyWithTasks] = useState<boolean>(false);

  // 4. Active eligible users (team members, non-deleted, excluding deleted users like ricardo75@gmail.com)
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

  // 5. Selected User IDs for the calendar display (initialized with all eligible users)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => {
    return activeEligibleUsers.map(u => u.id);
  });

  const hasInitializedRef = React.useRef(false);

  // Initialize selectedUserIds once activeEligibleUsers are loaded
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

  // Pre-indexed lookup maps for high-performance rendering (Requirement 11)
  const { userDayTasksMap, userDayAbsenceMap, userTaskCountMap } = useMemo(() => {
    const tasksMap = new Map<string, Task[]>();
    const countMap = new Map<string, number>();

    const candidateTasks = tasks.filter(t => {
      if (t.deleted) return false;
      if (projectFilter && t.projectId !== projectFilter) return false;
      if (statusFilter && t.statusId !== statusFilter) return false;
      return true;
    });

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
  }, [tasks, absences, activeEligibleUsers, calendarDays, projectFilter, statusFilter]);

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

  // Available projects for filtering
  const activeProjects = useMemo(() => {
    return projects.filter(p => !p.deleted).sort((a, b) => a.title.localeCompare(b.title, 'pt-PT'));
  }, [projects]);

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
      {/* 1. TOP CONTROL BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-4">
        {/* Title, Period & Navigation */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
                <CalendarDays className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                  Calendário Operacional Semanal
                </h3>
                <p className="text-xs text-slate-500">
                  Visão operacional de tarefas atribuídas por técnico e por dia.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* 7 vs 14 days toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setPeriodDays(7)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodDays === 7 
                    ? 'bg-white text-slate-900 shadow-2xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Modo principal de 7 dias"
              >
                7 Dias
              </button>
              <button
                type="button"
                onClick={() => setPeriodDays(14)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodDays === 14 
                    ? 'bg-white text-slate-900 shadow-2xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Modo alargado de 14 dias"
              >
                14 Dias
              </button>
            </div>

            {/* Navigation buttons: Prev, Today, Next */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={handlePrevWeek}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title={`Recuar ${periodDays} dias`}
                aria-label="Período anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="px-3 py-1 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                title="Ir para a data atual"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={handleNextWeek}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title={`Avançar ${periodDays} dias`}
                aria-label="Período seguinte"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Date range label banner */}
            <div className="px-3 py-1.5 bg-blue-50/80 border border-blue-100 rounded-xl text-xs font-bold text-blue-900 shadow-2xs">
              {dateRangeLabel}
            </div>

            {/* Quick Create Task button in Header (Requirement 8) */}
            {canCreateTask && onQuickCreateTask && (
              <button
                type="button"
                onClick={() => {
                  const defaultUser = displayedUsers[0]?.id || activeEligibleUsers[0]?.id || '';
                  const defaultDate = calendarDays[0]?.dateStr || formatDateToYYYYMMDD(new Date());
                  onQuickCreateTask(defaultUser, defaultDate);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ml-auto"
                title="Criar nova tarefa no calendário"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Tarefa</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters Row: Project, Status, User Search & Options */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros:</span>
          </div>

          {/* Project Filter */}
          <select
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer max-w-[200px] truncate"
            title="Filtrar tarefas por projeto"
          >
            <option value="">Todos os Projetos</option>
            {activeProjects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>

          {/* Task Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
            title="Filtrar por estado da tarefa"
          >
            <option value="">Todos os Estados</option>
            {taskStatuses.filter(s => !s.deleted).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* User Search Input */}
          <div className="relative min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={userSearchTerm}
              onChange={e => setUserSearchTerm(e.target.value)}
              placeholder="Pesquisar utilizador..."
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            {userSearchTerm && (
              <button
                type="button"
                onClick={() => setUserSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Limpar pesquisa"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Checkbox: Show only users with scheduled tasks */}
          <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={showOnlyWithTasks}
              onChange={e => setShowOnlyWithTasks(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300"
            />
            <span>Apenas com tarefas no período</span>
          </label>

          {(projectFilter || statusFilter || userSearchTerm || showOnlyWithTasks) && (
            <button
              type="button"
              onClick={() => {
                setProjectFilter('');
                setStatusFilter('');
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

        {/* 2. USER SELECTION PILLS BAR */}
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

      {/* 3. OPERATIONAL CALENDAR TABLE */}
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
                        day.isToday
                          ? 'bg-amber-50/90 text-amber-950 border-amber-200'
                          : day.isWeekend
                          ? 'bg-slate-100/70 text-slate-500'
                          : 'bg-slate-50 text-slate-700'
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
                              day.isToday ? 'bg-amber-50/20' : day.isWeekend ? 'bg-slate-50/40' : ''
                            }`}
                          >
                            <div className="min-h-[70px] space-y-1.5 flex flex-col justify-start">
                              {/* 1. Quick Add button on top corner */}
                              {canCreateTask && onQuickCreateTask && (
                                <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => onQuickCreateTask(user.id, day.dateStr)}
                                    className="p-1 hover:bg-blue-100 text-blue-600 rounded-md transition-colors cursor-pointer"
                                    title={`Adicionar nova tarefa para ${user.name} em ${day.dateStr}`}
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {/* 2. Absence Banner */}
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

                              {/* 3. Multiple Tasks Conflict Banner (if not absent) */}
                              {!conflictInfo.isAbsent && conflictInfo.hasMultipleTasks && (
                                <div
                                  className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[9px] font-extrabold flex items-center gap-1 shadow-2xs"
                                  title={conflictInfo.tooltipText}
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>{conflictInfo.badgeText}</span>
                                </div>
                              )}

                              {/* 4. Task Cards */}
                              {dayTasks.map(task => {
                                const project = getProject(task.projectId);
                                const clientName = project ? getClientName(project.clientId) : '';
                                const statusName = getTaskStatusName(task.statusId, taskStatuses);
                                const hours = formatToOnlyHours(task.estimatedHours) || '0';

                                return (
                                  <div
                                    key={task.id}
                                    onClick={() => onSelectTask(task)}
                                    className="p-2 bg-white border border-slate-200 hover:border-blue-400 rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer group/card space-y-1 text-left"
                                    title={`Abrir tarefa: ${task.title}\nProjeto: ${project?.title || 'N/A'}\nHoras previstas: ${hours} h\nEstado: ${statusName}`}
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
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-md truncate max-w-[80px]">
                                          {statusName}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* 5. Empty placeholder when no tasks & no absence */}
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

      {/* 4. FOOTER LEGEND */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-bold text-slate-700">
          <span>Legenda Operacional:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500" />
            <span>Dia Atual (Hoje)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-400" />
            <span>Ausência de Utilizador</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-400" />
            <span>⚠️ Múltiplas tarefas no mesmo dia</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-rose-500" />
            <span>⚠️ Ausente com tarefas planeadas</span>
          </span>
          <span className="text-slate-400">
            • As horas apresentadas são as horas previstas da tarefa.
          </span>
        </div>
      </div>
    </div>
  );
}
