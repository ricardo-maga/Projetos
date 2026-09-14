'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ComposedChart,
  Line
} from 'recharts';
import {
  BarChart2,
  PieChart as PieIcon,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  FolderKanban,
  Calendar,
  Filter,
  ArrowUpRight,
  Briefcase,
  Activity,
  Sparkles,
  Layers,
  ChevronRight,
  Info,
  ListFilter
} from 'lucide-react';
import { Task, Project, TaskType, TaskStatus, User, Client } from '../lib/types';
import { parseTimeToHours, formatHoursToHHMM } from '../lib/utils';

interface TaskAnalyticsProps {
  tasks: Task[];
  projects: Project[];
  taskTypes: TaskType[];
  taskStatuses: TaskStatus[];
  users: User[];
  clients?: Client[];
}

// Color palette for charts
const COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#64748b'  // Slate
];

export function TaskAnalytics({
  tasks,
  projects,
  taskTypes,
  taskStatuses,
  users,
  clients = []
}: TaskAnalyticsProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  // Filter States for Drilldown
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterTaskType, setFilterTaskType] = useState<string>('all');
  const [timeHorizon, setTimeHorizon] = useState<'30' | '60' | '90'>('30');

  // Helper to map status scale
  const getTaskScale = useMemo(() => {
    return (statusId: string) => {
      const st = taskStatuses.find(s => s.id === statusId);
      if (st && typeof st.scale === 'number') return st.scale;
      if (statusId === 'ts-1') return 1;
      if (statusId === 'ts-2') return 2;
      if (statusId === 'ts-3') return 3;
      return 1;
    };
  }, [taskStatuses]);

  // Non-deleted tasks base set
  const activeTasks = useMemo(() => {
    return tasks.filter(t => !t.deleted);
  }, [tasks]);

  // Filtered tasks based on interactive header filters
  const filteredTasks = useMemo(() => {
    return activeTasks.filter(t => {
      if (filterProject !== 'all' && t.projectId !== filterProject) return false;
      if (filterUser !== 'all' && (!t.assigneeIds || !t.assigneeIds.includes(filterUser))) return false;
      if (filterTaskType !== 'all' && t.taskTypeId !== filterTaskType) return false;
      return true;
    });
  }, [activeTasks, filterProject, filterUser, filterTaskType]);

  // Date boundaries
  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => now.toISOString().slice(0, 10), [now]);

  // Helper: Get days ago for past dates
  const getDaysAgo = useCallback((dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const diff = now.getTime() - d.getTime();
    return Math.floor(diff / (1000 * 3600 * 24));
  }, [now]);

  // Helper: Get days ahead for future dates
  const getDaysAhead = useCallback((dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    // Set both dates to midnight for accurate day difference
    const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = dMidnight.getTime() - nowMidnight.getTime();
    return Math.floor(diff / (1000 * 3600 * 24));
  }, [now]);

  // -------------------------------------------------------------
  // KPI METRICS (Summary Overview)
  // -------------------------------------------------------------
  const kpis = useMemo(() => {
    const openTasks = filteredTasks.filter(t => {
      const scale = getTaskScale(t.statusId);
      return scale === 1 || scale === 2;
    });

    const completedTasks = filteredTasks.filter(t => getTaskScale(t.statusId) === 3);

    const overdueTasks = openTasks.filter(t => {
      if (!t.estimatedDate) return false;
      return t.estimatedDate < todayStr;
    });

    const totalEstHoursOpen = openTasks.reduce((acc, t) => acc + parseTimeToHours(t.estimatedHours), 0);
    const totalActHoursOpen = openTasks.reduce((acc, t) => acc + parseTimeToHours(t.actualHours), 0);

    const totalEstHoursAll = filteredTasks.reduce((acc, t) => acc + parseTimeToHours(t.estimatedHours), 0);
    const totalActHoursAll = filteredTasks.reduce((acc, t) => acc + parseTimeToHours(t.actualHours), 0);

    const completionRate = filteredTasks.length > 0 
      ? Math.round((completedTasks.length / filteredTasks.length) * 100) 
      : 0;

    return {
      totalOpen: openTasks.length,
      totalCompleted: completedTasks.length,
      totalAll: filteredTasks.length,
      overdueCount: overdueTasks.length,
      totalEstHoursOpen,
      totalActHoursOpen,
      totalEstHoursAll,
      totalActHoursAll,
      completionRate
    };
  }, [filteredTasks, getTaskScale, todayStr]);

  // -------------------------------------------------------------
  // 1 & 2. TAREFAS EM ABERTO POR TIPO DE TAREFA
  // -------------------------------------------------------------
  const openTasksByType = useMemo(() => {
    const openTasks = filteredTasks.filter(t => {
      const scale = getTaskScale(t.statusId);
      return scale === 1 || scale === 2;
    });

    const typeMap: Record<string, {
      typeId: string;
      typeName: string;
      count: number;
      estHours: number;
      actHours: number;
    }> = {};

    // Initialize map with all active task types
    taskTypes.filter(tt => !tt.deleted).forEach(tt => {
      typeMap[tt.id] = {
        typeId: tt.id,
        typeName: tt.name,
        count: 0,
        estHours: 0,
        actHours: 0
      };
    });

    typeMap['untyped'] = {
      typeId: 'untyped',
      typeName: 'Sem Tipo / Geral',
      count: 0,
      estHours: 0,
      actHours: 0
    };

    openTasks.forEach(t => {
      const key = t.taskTypeId && typeMap[t.taskTypeId] ? t.taskTypeId : 'untyped';
      typeMap[key].count += 1;
      typeMap[key].estHours += parseTimeToHours(t.estimatedHours);
      typeMap[key].actHours += parseTimeToHours(t.actualHours);
    });

    const list = Object.values(typeMap).filter(item => item.count > 0 || item.estHours > 0);
    const totalOpen = openTasks.length || 1;

    return list.map(item => ({
      ...item,
      percentage: Math.round((item.count / totalOpen) * 100),
      formattedEstHours: formatHoursToHHMM(item.estHours),
      formattedActHours: formatHoursToHHMM(item.actHours)
    })).sort((a, b) => b.count - a.count);
  }, [filteredTasks, getTaskScale, taskTypes]);

  // -------------------------------------------------------------
  // 3 & 4. NÚMERO E HORAS DE TAREFAS DOS ÚLTIMOS 30, 60, 90 DIAS POR TIPO
  // -------------------------------------------------------------
  const pastDaysAnalysisByType = useMemo(() => {
    const typeMap: Record<string, {
      typeId: string;
      typeName: string;
      count30: number;
      count60: number;
      count90: number;
      estHours30: number;
      actHours30: number;
      estHours60: number;
      actHours60: number;
      estHours90: number;
      actHours90: number;
    }> = {};

    taskTypes.filter(tt => !tt.deleted).forEach(tt => {
      typeMap[tt.id] = {
        typeId: tt.id,
        typeName: tt.name,
        count30: 0, count60: 0, count90: 0,
        estHours30: 0, actHours30: 0,
        estHours60: 0, actHours60: 0,
        estHours90: 0, actHours90: 0
      };
    });

    typeMap['untyped'] = {
      typeId: 'untyped',
      typeName: 'Sem Tipo / Geral',
      count30: 0, count60: 0, count90: 0,
      estHours30: 0, actHours30: 0,
      estHours60: 0, actHours60: 0,
      estHours90: 0, actHours90: 0
    };

    filteredTasks.forEach(t => {
      const refDate = t.createdDate || t.startDate || t.estimatedDate;
      const daysAgo = getDaysAgo(refDate);
      if (daysAgo === null || daysAgo < 0) return; // ignore future dates for past analytics

      const key = t.taskTypeId && typeMap[t.taskTypeId] ? t.taskTypeId : 'untyped';
      const estH = parseTimeToHours(t.estimatedHours);
      const actH = parseTimeToHours(t.actualHours);

      if (daysAgo <= 30) {
        typeMap[key].count30 += 1;
        typeMap[key].estHours30 += estH;
        typeMap[key].actHours30 += actH;
      }
      if (daysAgo <= 60) {
        typeMap[key].count60 += 1;
        typeMap[key].estHours60 += estH;
        typeMap[key].actHours60 += actH;
      }
      if (daysAgo <= 90) {
        typeMap[key].count90 += 1;
        typeMap[key].estHours90 += estH;
        typeMap[key].actHours90 += actH;
      }
    });

    return Object.values(typeMap)
      .filter(item => item.count90 > 0 || item.estHours90 > 0)
      .sort((a, b) => b.count90 - a.count90);
  }, [filteredTasks, taskTypes, getDaysAgo]);

  // Chart dataset for past days (based on selected timeHorizon or comparison)
  const pastDaysChartData = useMemo(() => {
    return pastDaysAnalysisByType.map(item => {
      let count = item.count30;
      let estHours = item.estHours30;
      let actHours = item.actHours30;

      if (timeHorizon === '60') {
        count = item.count60;
        estHours = item.estHours60;
        actHours = item.actHours60;
      } else if (timeHorizon === '90') {
        count = item.count90;
        estHours = item.estHours90;
        actHours = item.actHours90;
      }

      return {
        typeName: item.typeName,
        QtdTarefas: count,
        HorasEstimadas: Math.round(estHours * 10) / 10,
        HorasGastas: Math.round(actHours * 10) / 10,
        count30: item.count30,
        count60: item.count60,
        count90: item.count90,
      };
    });
  }, [pastDaysAnalysisByType, timeHorizon]);

  // -------------------------------------------------------------
  // 5. CARGA DE TRABALHO FUTURA: 7, 15, 30 DIAS POR UTILIZADOR
  // -------------------------------------------------------------
  const userWorkloadUpcoming = useMemo(() => {
    const userMap: Record<string, {
      userId: string;
      userName: string;
      roleId: string;
      hours7d: number;
      hours15d: number;
      hours30d: number;
      tasksCount7d: number;
      tasksCount15d: number;
      tasksCount30d: number;
    }> = {};

    // Filter active team users
    const teamUsers = users.filter(u => !u.deleted && (u.type === 'Team' || !u.type));
    teamUsers.forEach(u => {
      userMap[u.id] = {
        userId: u.id,
        userName: u.name,
        roleId: u.roleId || '',
        hours7d: 0,
        hours15d: 0,
        hours30d: 0,
        tasksCount7d: 0,
        tasksCount15d: 0,
        tasksCount30d: 0
      };
    });

    userMap['unassigned'] = {
      userId: 'unassigned',
      userName: 'Sem Responsável',
      roleId: '',
      hours7d: 0,
      hours15d: 0,
      hours30d: 0,
      tasksCount7d: 0,
      tasksCount15d: 0,
      tasksCount30d: 0
    };

    // Filter open/pending tasks scheduled in future
    const openTasks = filteredTasks.filter(t => {
      const scale = getTaskScale(t.statusId);
      return scale === 1 || scale === 2;
    });

    openTasks.forEach(t => {
      const targetDate = t.estimatedDate || t.startDate || t.endDate;
      const daysAhead = getDaysAhead(targetDate);

      // Include tasks from today up to 30 days ahead (or overdue tasks in 7d load)
      if (daysAhead === null || daysAhead > 30) return;

      const estH = parseTimeToHours(t.estimatedHours);
      const assignees = t.assigneeIds && t.assigneeIds.length > 0 ? t.assigneeIds : ['unassigned'];
      // Attribute proportional hours per user to avoid overcounting
      const hoursPerUser = estH / assignees.length;

      assignees.forEach(uId => {
        const key = userMap[uId] ? uId : 'unassigned';
        if (daysAhead <= 7) {
          userMap[key].hours7d += hoursPerUser;
          userMap[key].tasksCount7d += 1;
        }
        if (daysAhead <= 15) {
          userMap[key].hours15d += hoursPerUser;
          userMap[key].tasksCount15d += 1;
        }
        if (daysAhead <= 30) {
          userMap[key].hours30d += hoursPerUser;
          userMap[key].tasksCount30d += 1;
        }
      });
    });

    return Object.values(userMap)
      .filter(item => item.hours30d > 0 || item.tasksCount30d > 0)
      .map(item => {
        let loadBadge = { label: 'Normal', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
        if (item.hours7d > 40) {
          loadBadge = { label: 'Sobrecarga (>40h/sem)', color: 'bg-rose-50 text-rose-700 border-rose-200' };
        } else if (item.hours7d > 28) {
          loadBadge = { label: 'Carga Elevada', color: 'bg-amber-50 text-amber-700 border-amber-200' };
        }

        return {
          ...item,
          formatted7d: formatHoursToHHMM(item.hours7d),
          formatted15d: formatHoursToHHMM(item.hours15d),
          formatted30d: formatHoursToHHMM(item.hours30d),
          loadBadge
        };
      })
      .sort((a, b) => b.hours30d - a.hours30d);
  }, [filteredTasks, users, getTaskScale, getDaysAhead]);

  // -------------------------------------------------------------
  // 6. PROJETOS ATIVOS COM MAIS HORAS GASTAS E PREVISTAS
  // -------------------------------------------------------------
  const activeProjectsHours = useMemo(() => {
    const activeProjs = projects.filter(p => !p.deleted);
    const clientMap = new Map(clients.map(c => [c.id, c.clientName || c.shortName]));

    const projectStats = activeProjs.map(proj => {
      const projTasks = activeTasks.filter(t => t.projectId === proj.id);
      const estHours = projTasks.reduce((acc, t) => acc + parseTimeToHours(t.estimatedHours), 0);
      const actHours = projTasks.reduce((acc, t) => acc + parseTimeToHours(t.actualHours), 0);
      
      const openTasksCount = projTasks.filter(t => {
        const scale = getTaskScale(t.statusId);
        return scale === 1 || scale === 2;
      }).length;

      const completedTasksCount = projTasks.filter(t => getTaskScale(t.statusId) === 3).length;

      const deviationHours = actHours - estHours;
      const deviationPercentage = estHours > 0 ? Math.round((deviationHours / estHours) * 100) : 0;

      return {
        id: proj.id,
        title: proj.title,
        clientName: clientMap.get(proj.clientId) || proj.clientContactName || 'Cliente Direto',
        totalTasks: projTasks.length,
        openTasksCount,
        completedTasksCount,
        estHours: Math.round(estHours * 10) / 10,
        actHours: Math.round(actHours * 10) / 10,
        formattedEst: formatHoursToHHMM(estHours),
        formattedAct: formatHoursToHHMM(actHours),
        deviationHours: Math.round(deviationHours * 10) / 10,
        formattedDeviation: (deviationHours > 0 ? '+' : '') + formatHoursToHHMM(Math.abs(deviationHours)),
        deviationPercentage
      };
    });

    // Filter projects that have tasks or registered hours, and sort descending by total hours
    return projectStats
      .filter(p => p.totalTasks > 0 || p.estHours > 0 || p.actHours > 0)
      .sort((a, b) => (b.estHours + b.actHours) - (a.estHours + a.actHours));
  }, [projects, activeTasks, clients, getTaskScale]);

  // -------------------------------------------------------------
  // 7. DISTRIBUIÇÃO POR ESTADO DE TAREFA (Ciclo de Vida)
  // -------------------------------------------------------------
  const statusDistribution = useMemo(() => {
    const map: Record<string, { name: string; count: number; color: string }> = {};

    taskStatuses.filter(s => !s.deleted).forEach((s, idx) => {
      map[s.id] = {
        name: s.name,
        count: 0,
        color: COLORS[idx % COLORS.length]
      };
    });

    filteredTasks.forEach(t => {
      if (map[t.statusId]) {
        map[t.statusId].count += 1;
      }
    });

    return Object.values(map).filter(item => item.count > 0);
  }, [filteredTasks, taskStatuses]);

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* ------------------------------------------------------------- */}
      {/* HEADER & FILTERS BAR */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">
              <Sparkles className="w-4 h-4 text-blue-500" />
              Painel de Inteligência de Projetos
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Análise Avançada de Tarefas & Alocação de Equipas
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Métricas consolidadas de tarefas em aberto, evolução temporal, carga de trabalho futura e rentabilidade de horas por projeto.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl border border-blue-100">
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              {kpis.totalAll} Tarefas Analisadas
            </span>
          </div>
        </div>

        {/* Global Drilldown Filters */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Project Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Projeto
            </label>
            <div className="relative">
              <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              >
                <option value="all">Todos os Projetos ({projects.length})</option>
                {projects.filter(p => !p.deleted).map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* User/Assignee Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Colaborador / Técnico
            </label>
            <div className="relative">
              <Users className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              >
                <option value="all">Todos os Colaboradores ({users.length})</option>
                {users.filter(u => !u.deleted).map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Task Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Tipo de Tarefa
            </label>
            <div className="relative">
              <Layers className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={filterTaskType}
                onChange={e => setFilterTaskType(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              >
                <option value="all">Todos os Tipos ({taskTypes.length})</option>
                {taskTypes.filter(tt => !tt.deleted).map(tt => (
                  <option key={tt.id} value={tt.id}>{tt.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Horizon Window Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Janela Temporal (Análise Histórica)
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={timeHorizon}
                onChange={e => setTimeHorizon(e.target.value as any)}
                className="w-full pl-8 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              >
                <option value="30">Últimos 30 Dias</option>
                <option value="60">Últimos 60 Dias</option>
                <option value="90">Últimos 90 Dias</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SUMMARY KPI CARDS */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Tarefas em Aberto */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Tarefas em Aberto
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {kpis.totalOpen}
            </div>
            <span className="text-xs font-semibold text-slate-500">
              da escala 1 e 2
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-600 flex items-center gap-1 font-medium pt-2 border-t border-slate-100">
            <span>Carga pendente:</span>
            <span className="font-bold text-blue-700">{formatHoursToHHMM(kpis.totalEstHoursOpen)}h</span>
          </div>
        </div>

        {/* KPI 2: Tarefas em Atraso */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Tarefas em Atraso
            </span>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
              kpis.overdueCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className={`text-2xl font-black tracking-tight ${
              kpis.overdueCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}>
              {kpis.overdueCount}
            </div>
            <span className="text-xs font-semibold text-slate-500">
              prazo ultrapassado
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-600 flex items-center justify-between font-medium pt-2 border-t border-slate-100">
            <span>Requer atenção rápida</span>
            <span className="text-[11px] font-bold text-amber-600">
              {kpis.totalOpen > 0 ? Math.round((kpis.overdueCount / kpis.totalOpen) * 100) : 0}% das abertas
            </span>
          </div>
        </div>

        {/* KPI 3: Horas Totais Registadas */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Horas Reais Gastas
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatHoursToHHMM(kpis.totalActHoursAll)}h
            </div>
            <span className="text-xs font-semibold text-slate-500">
              vs {formatHoursToHHMM(kpis.totalEstHoursAll)}h previstas
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-600 flex items-center justify-between font-medium pt-2 border-t border-slate-100">
            <span>Eficiência de Execução:</span>
            <span className={`font-bold ${
              kpis.totalActHoursAll > kpis.totalEstHoursAll ? 'text-rose-600' : 'text-emerald-600'
            }`}>
              {kpis.totalEstHoursAll > 0 
                ? `${Math.round((kpis.totalActHoursAll / kpis.totalEstHoursAll) * 100)}%` 
                : '100%'}
            </span>
          </div>
        </div>

        {/* KPI 4: Taxa de Conclusão */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-purple-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Taxa de Conclusão
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {kpis.completionRate}%
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {kpis.totalCompleted} de {kpis.totalAll}
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-purple-600 h-full transition-all duration-500 rounded-full"
              style={{ width: `${kpis.completionRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 1 & 2: TAREFAS EM ABERTO POR TIPO DE TAREFA */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-blue-600" />
              Tarefas em Aberto por Tipo de Tarefa (Estado = 1 ou 2)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribuição do volume e horas estimadas das tarefas pendentes e em curso por tipologia.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-700 rounded-lg self-start sm:self-auto">
            Total Abertas: {kpis.totalOpen}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Chart Donut & Bar */}
          <div className="lg:col-span-5 h-72 flex flex-col justify-center items-center relative">
            {isMounted && openTasksByType.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={openTasksByType}
                    dataKey="count"
                    nameKey="typeName"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    {openTasksByType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any, name: any, item: any) => [
                      `${val} tarefas (${item.payload.formattedEstHours}h previstas)`,
                      item.payload.typeName
                    ]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400 italic">Sem tarefas em aberto para apresentar.</div>
            )}
          </div>

          {/* Detailed Table */}
          <div className="lg:col-span-7 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Tipo de Tarefa</th>
                  <th className="py-2.5 px-3 text-center">Tarefas Abertas</th>
                  <th className="py-2.5 px-3 text-right">Horas Previstas</th>
                  <th className="py-2.5 px-3 text-right">Horas Gastas</th>
                  <th className="py-2.5 px-3 text-right">% do Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openTasksByType.map((item, idx) => (
                  <tr key={item.typeId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-800 flex items-center gap-2">
                      <span 
                        className="w-2.5 h-2.5 rounded-full inline-block" 
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }} 
                      />
                      {item.typeName}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-900">
                      <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-800">
                        {item.count}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-slate-700">
                      {item.formattedEstHours}h
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-slate-700">
                      {item.formattedActHours}h
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-blue-600">
                      <div className="flex items-center justify-end gap-2">
                        <span>{item.percentage}%</span>
                        <div className="w-12 bg-slate-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                          <div 
                            className="bg-blue-600 h-full rounded-full" 
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {openTasksByType.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                      Nenhuma tarefa em aberto encontrada com os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 3 & 4: HISTÓRICO 30, 60, 90 DIAS POR TIPO */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-600" />
              Volume e Horas dos Últimos 30, 60 e 90 Dias por Tipo
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Comparativo de tarefas criadas e esforço em horas acumulado em janelas temporais retrospetivas.
            </p>
          </div>

          {/* Time Horizon Selector Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200/80 self-start sm:self-auto">
            <button
              onClick={() => setTimeHorizon('30')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                timeHorizon === '30' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Dias
            </button>
            <button
              onClick={() => setTimeHorizon('60')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                timeHorizon === '60' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              60 Dias
            </button>
            <button
              onClick={() => setTimeHorizon('90')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                timeHorizon === '90' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              90 Dias
            </button>
          </div>
        </div>

        {/* Chart View */}
        <div className="h-80 w-full mb-6">
          {isMounted && pastDaysChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pastDaysChartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="typeName" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
                <YAxis yAxisId="left" orientation="left" stroke="#6366f1" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                  formatter={(val: any, name: any) => [
                    name.includes('Horas') ? `${val}h` : `${val} tarefas`,
                    name === 'QtdTarefas' ? 'Qtd. Tarefas' : name === 'HorasEstimadas' ? 'Horas Previstas' : 'Horas Gastas'
                  ]}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                <Bar yAxisId="left" dataKey="QtdTarefas" name="Qtd. Tarefas" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Bar yAxisId="right" dataKey="HorasEstimadas" name="Horas Previstas" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Bar yAxisId="right" dataKey="HorasGastas" name="Horas Gastas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
              Sem registos históricos para o período selecionado.
            </div>
          )}
        </div>

        {/* Detailed Comparative Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider bg-slate-50/50">
                <th className="py-2.5 px-3">Tipo de Tarefa</th>
                <th className="py-2.5 px-3 text-center bg-indigo-50/40 text-indigo-800">Qtd (30d)</th>
                <th className="py-2.5 px-3 text-center bg-indigo-50/40 text-indigo-800">Horas (30d)</th>
                <th className="py-2.5 px-3 text-center bg-slate-100/50">Qtd (60d)</th>
                <th className="py-2.5 px-3 text-center bg-slate-100/50">Horas (60d)</th>
                <th className="py-2.5 px-3 text-center">Qtd (90d)</th>
                <th className="py-2.5 px-3 text-center">Horas (90d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pastDaysAnalysisByType.map(item => (
                <tr key={item.typeId} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-3 font-semibold text-slate-800">
                    {item.typeName}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-indigo-900 bg-indigo-50/20">
                    {item.count30}
                  </td>
                  <td className="py-3 px-3 text-center font-medium text-slate-700 bg-indigo-50/20">
                    <span className="font-semibold">{formatHoursToHHMM(item.estHours30)}h</span>
                    <span className="text-[10px] text-slate-400 block">Real: {formatHoursToHHMM(item.actHours30)}h</span>
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-slate-800 bg-slate-50/30">
                    {item.count60}
                  </td>
                  <td className="py-3 px-3 text-center font-medium text-slate-700 bg-slate-50/30">
                    <span className="font-semibold">{formatHoursToHHMM(item.estHours60)}h</span>
                    <span className="text-[10px] text-slate-400 block">Real: {formatHoursToHHMM(item.actHours60)}h</span>
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-slate-800">
                    {item.count90}
                  </td>
                  <td className="py-3 px-3 text-center font-medium text-slate-700">
                    <span className="font-semibold">{formatHoursToHHMM(item.estHours90)}h</span>
                    <span className="text-[10px] text-slate-400 block">Real: {formatHoursToHHMM(item.actHours90)}h</span>
                  </td>
                </tr>
              ))}
              {pastDaysAnalysisByType.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                    Nenhum histórico encontrado para esta seleção.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 5: CARGA DE TRABALHO FUTURA POR UTILIZADOR */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Alocação & Carga de Trabalho Futura dos Próximos 7, 15 e 30 Dias por Utilizador
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Identificação prévia de pontos de estrangulamento e sobrecarga na equipa técnica para as próximas semanas.
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            *Horas distribuídas proporcionalmente por tarefa
          </span>
        </div>

        {/* Chart View */}
        <div className="h-80 w-full mb-6">
          {isMounted && userWorkloadUpcoming.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userWorkloadUpcoming} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="userName" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="h" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                  formatter={(val: any) => [`${Math.round(val * 10) / 10}h previstas`]}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="hours7d" name="Próximos 7 Dias" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="hours15d" name="Próximos 15 Dias" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="hours30d" name="Próximos 30 Dias" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
              Sem carga de trabalho agendada para os próximos 30 dias.
            </div>
          )}
        </div>

        {/* Detailed Workload Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3">Colaborador / Técnico</th>
                <th className="py-2.5 px-3 text-center bg-emerald-50/50 text-emerald-800">Horas (7 Dias)</th>
                <th className="py-2.5 px-3 text-center bg-blue-50/50 text-blue-800">Horas (15 Dias)</th>
                <th className="py-2.5 px-3 text-center bg-purple-50/50 text-purple-800">Horas (30 Dias)</th>
                <th className="py-2.5 px-3 text-center">Nº Tarefas Futuras</th>
                <th className="py-2.5 px-3 text-right">Estado de Carga</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {userWorkloadUpcoming.map(u => (
                <tr key={u.userId} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-3 font-semibold text-slate-900 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px]">
                      {u.userName.slice(0, 2).toUpperCase()}
                    </div>
                    {u.userName}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-emerald-900 bg-emerald-50/20">
                    {u.formatted7d}h
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-blue-900 bg-blue-50/20">
                    {u.formatted15d}h
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-purple-900 bg-purple-50/20">
                    {u.formatted30d}h
                  </td>
                  <td className="py-3 px-3 text-center font-semibold text-slate-800">
                    {u.tasksCount30d}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${u.loadBadge.color}`}>
                      {u.loadBadge.label}
                    </span>
                  </td>
                </tr>
              ))}
              {userWorkloadUpcoming.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                    Nenhuma tarefa agendada nos próximos 30 dias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 6: PROJETOS ATIVOS COM MAIS HORAS GASTAS E PREVISTAS */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-purple-600" />
              Projetos Ativos: Comparativo de Horas Previstas vs. Gastas
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Análise de desvio de rentabilidade e esforço alocado aos projetos de obra em execução.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-purple-50 text-purple-700 rounded-lg self-start sm:self-auto">
            {activeProjectsHours.length} Projetos Ativos
          </span>
        </div>

        {/* Top Projects Chart */}
        <div className="h-80 w-full mb-6">
          {isMounted && activeProjectsHours.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeProjectsHours.slice(0, 10)}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" unit="h" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis dataKey="title" type="category" width={140} tick={{ fontSize: 11, fill: '#334155' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                  formatter={(val: any) => [`${val}h`]}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="estHours" name="Horas Previstas" fill="#93c5fd" radius={[0, 6, 6, 0]} maxBarSize={20} />
                <Bar dataKey="actHours" name="Horas Gastas" fill="#3b82f6" radius={[0, 6, 6, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
              Sem dados de projetos com tarefas registadas.
            </div>
          )}
        </div>

        {/* Complete Ranking Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3">Projeto</th>
                <th className="py-2.5 px-3">Cliente</th>
                <th className="py-2.5 px-3 text-center">Tarefas (Abertas / Concluídas)</th>
                <th className="py-2.5 px-3 text-right">Horas Previstas</th>
                <th className="py-2.5 px-3 text-right">Horas Gastas</th>
                <th className="py-2.5 px-3 text-right">Desvio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeProjectsHours.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-3 font-bold text-slate-900">
                    {p.title}
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-600">
                    {p.clientName}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="font-semibold text-slate-800">
                      <span className="text-blue-600 font-bold">{p.openTasksCount}</span> / <span className="text-emerald-600 font-bold">{p.completedTasksCount}</span> ({p.totalTasks})
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-slate-700">
                    {p.formattedEst}h
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-slate-900">
                    {p.formattedAct}h
                  </td>
                  <td className="py-3 px-3 text-right font-bold">
                    <span className={`inline-flex items-center gap-1 ${
                      p.deviationHours > 0 
                        ? 'text-rose-600' 
                        : p.deviationHours < 0 
                          ? 'text-emerald-600' 
                          : 'text-slate-500'
                    }`}>
                      {p.formattedDeviation}h ({p.deviationPercentage > 0 ? `+${p.deviationPercentage}` : p.deviationPercentage}%)
                    </span>
                  </td>
                </tr>
              ))}
              {activeProjectsHours.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                    Sem projetos ativos registados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 7: DISTRIBUIÇÃO GLOBAL POR ESTADO DE TAREFA */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
          <Layers className="w-5 h-5 text-amber-500" />
          Distribuição Global por Estado no Ciclo de Vida
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          Visão holística de todas as tarefas nos vários estados de progresso configurados.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {statusDistribution.map(st => (
            <div 
              key={st.name} 
              className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80 text-center flex flex-col justify-between"
            >
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                <span className="truncate">{st.name}</span>
              </div>
              <div className="text-xl font-black text-slate-900">
                {st.count}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {filteredTasks.length > 0 ? Math.round((st.count / filteredTasks.length) * 100) : 0}% do total
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
