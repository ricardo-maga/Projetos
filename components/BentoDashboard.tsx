'use client';

import React, { useState, useMemo } from 'react';
import { Project, Task, Comment, UserAbsence, Material, Quote, Client, ProjectMaterial, ProjectRiskItem } from '../lib/types';
import { Briefcase, CheckSquare, Users, MessageSquare, CalendarClock, CalendarDays, Activity, ChevronLeft, ChevronRight, AlertTriangle, Package, CheckCircle2 } from 'lucide-react';
import { stringToUUID } from '../lib/supabaseSync';
import { getProjectCalculatedRisk, matchTaskStatusId } from '../lib/utils';

interface BentoDashboardProps {
  projects: Project[];
  tasks: Task[];
  absences: UserAbsence[];
  materials: Material[];
  projectMaterials?: ProjectMaterial[];
  projectRiskItems?: ProjectRiskItem[];
  quotes: Quote[];
  comments: Comment[];
  clients: Client[];
  users: any[];
  projectStatuses: any[];
  taskStatuses?: any[];
  projectCategories: any[];
  projectPriorities: any[];
  onNavigate: (tab: string) => void;
  onSelectProject: (id: string) => void;
}

const SummaryCard = ({ title, value, subtext, icon: Icon, colorClass }: { title: string, value: string | number, subtext?: string, icon: React.ElementType, colorClass: string }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5 -sm flex items-start gap-4 transition-all hover:-md hover:-translate-y-0.5">
    <div className={`p-3 rounded-xl ${colorClass}`}>
      <Icon className="w-6 h-6" />
    </div>
    <div>
      <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">{title}</div>
      <div className="text-2xl font-black text-slate-800 mt-1">{value}</div>
      {subtext && <div className="text-xs font-semibold text-slate-500 mt-1">{subtext}</div>}
    </div>
  </div>
);

export default function BentoDashboard({
  projects,
  tasks,
  absences,
  materials,
  projectMaterials = [],
  projectRiskItems = [],
  quotes,
  comments,
  clients,
  users,
  projectStatuses,
  taskStatuses = [],
  projectCategories,
  projectPriorities,
  onNavigate,
  onSelectProject,
}: BentoDashboardProps) {
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Robust ID normalization matcher for legacy, short, or standard UUID formats
  const matchId = (idA: string | null | undefined, idB: string | null | undefined) => {
    if (!idA || !idB) return false;
    if (idA === idB) return true;
    return stringToUUID(idA) === stringToUUID(idB);
  };

  const isStatus5 = React.useCallback((statusId: string | null | undefined) => {
    if (!statusId) return false;
    const statusObj = projectStatuses.find(s => matchId(s.id, statusId) || s.id === statusId);
    if (!statusObj) return false;
    if (statusObj.scale !== undefined && statusObj.scale >= 5) return true;
    const name = (statusObj.name || '').toLowerCase();
    return name.includes('conclu') || name.includes('suspen') || name.includes('cancel');
  }, [projectStatuses]);

  // Helpers to get relations
  const getClientName = React.useCallback((clientId: string) => {
    const client = clients.find(c => matchId(c.id, clientId));
    return client ? client.clientName : 'Cliente Desconhecido';
  }, [clients]);

  const getProjectStatus = (statusId: string) => {
    const status = projectStatuses.find(s => matchId(s.id, statusId));
    return status ? status.name : 'Planeamento';
  };

  const getProjectPriority = (priorityId: string) => {
    const priority = projectPriorities.find(p => matchId(p.id, priorityId));
    return priority ? priority.name : 'Média';
  };

  const getPriorityLevel = (priorityId: string): number => {
    const prio = projectPriorities.find(p => matchId(p.id, priorityId));
    if (prio && prio.scale !== undefined) return prio.scale;
    if (priorityId === 'pp-3' || priorityId?.endsWith('-3')) return 3;
    if (priorityId === 'pp-2' || priorityId?.endsWith('-2')) return 2;
    if (priorityId === 'pp-1' || priorityId?.endsWith('-1')) return 1;
    return 1;
  };

  const renderPriorityBadge = (priorityId: string) => {
    const level = getPriorityLevel(priorityId);
    const label = getProjectPriority(priorityId);

    if (level === 3) {
      // Nível 3 > Vermelho
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold text-red-700 bg-red-50 border border-red-200">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
          {label}
        </span>
      );
    }

    if (level === 2) {
      // Nível 2 > Amarelo torrado
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold text-amber-900 bg-amber-100/90 border border-amber-300">
          <span className="w-2 h-2 rounded-full bg-amber-600" />
          {label}
        </span>
      );
    }

    // Nível 1 > mantém esquema atual
    return (
      <span className="inline-flex items-center gap-1.5 font-extrabold text-slate-700 text-xs">
        <span className="w-2 h-2 rounded-full bg-slate-300" />
        {label}
      </span>
    );
  };

  // Active projects list sorted by priority, delivery date, and creation date (excluding status 5 and deleted)
  const sortedProjects = [...projects]
    .filter(p => !p.deleted && !isStatus5(p.statusId))
    .sort((a, b) => {
      // 1. Priority level (Nível 3 > Nível 2 > Nível 1)
      const priorityA = getPriorityLevel(a.priorityId);
      const priorityB = getPriorityLevel(b.priorityId);
      if (priorityB !== priorityA) {
        return priorityB - priorityA; // Higher priority first
      }

      // 2. Delivery Date (earliest first / closest deadline: scheduledDate -> estimatedDate -> deliveryDate)
      const deliveryA = a.scheduledDate || a.estimatedDate || a.deliveryDate;
      const deliveryB = b.scheduledDate || b.estimatedDate || b.deliveryDate;
      const dateA = deliveryA ? new Date(deliveryA).getTime() : Infinity;
      const dateB = deliveryB ? new Date(deliveryB).getTime() : Infinity;
      if (dateA !== dateB) {
        return dateA - dateB;
      }

      // 3. Creation Date (most recent first)
      const createA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
      const createB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
      return createB - createA;
    });

  const ITEMS_PER_PAGE = 10;
  const totalProjects = sortedProjects.length;
  const totalPages = Math.ceil(totalProjects / ITEMS_PER_PAGE) || 1;
  const page = Math.min(currentPage, totalPages);
  const displayedProjects = sortedProjects.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  
  // Helper to parse dates securely for sorting and comparison
  const parseDateToTime = (dateStr: string | null | undefined): number => {
    if (!dateStr) return 0;
    const clean = String(dateStr).trim();
    if (!clean) return 0;
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day).getTime();
      }
    }
    const parsed = Date.parse(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  const safeParseDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const clean = String(dateStr).trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
    }
    const parsed = Date.parse(clean);
    return isNaN(parsed) ? new Date() : new Date(parsed);
  };

  const isOverdueOrToday = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    const clean = String(dateStr).trim();
    if (!clean) return false;
    
    const d = safeParseDate(clean);
    const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    return dMidnight <= todayMidnight;
  };

  // Stats
  const highRiskCount = sortedProjects.filter(p => getProjectCalculatedRisk(p.id, projectRiskItems).score >= 11).length;
  const planningCount = sortedProjects.filter(p => p.statusId === 'ps-1').length;
  
  // Pre-build O(1) project map
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  // Task distribution stats (only include tasks for active projects with deleted === false)
  const activeTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.deleted) return false;
      const proj = projectMap.get(t.projectId);
      if (!proj || proj.deleted) return false;
      return true;
    });
  }, [tasks, projectMap]);

  // New Stats
  const activeProjectsCount = sortedProjects.filter(p => !isStatus5(p.statusId) && !p.deleted).length;
  const realTimeActiveProjects = sortedProjects.filter(p => !isStatus5(p.statusId) && p.statusId !== 'ps-1' && !p.deleted).length;
  const realTimePendingProjects = sortedProjects.filter(p => p.statusId === 'ps-1' && !p.deleted).length;
  const realTimePendingTasks = activeTasks.filter(t => matchTaskStatusId(t.statusId, 'ts-1')).length;
  
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const nextMonth = (currentMonth + 1) % 12;
  const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
  
  const isDateInMonth = (dateStr: string | null | undefined, month: number, year: number) => {
    if (!dateStr) return false;
    const d = safeParseDate(dateStr);
    return d.getMonth() === month && d.getFullYear() === year;
  };
  
  const currentMonthProjectsCount = sortedProjects.filter(p => 
    isDateInMonth(p.deliveryDate, currentMonth, currentYear) || 
    isDateInMonth(p.estimatedDate, currentMonth, currentYear) ||
    isDateInMonth(p.scheduledDate, currentMonth, currentYear)
  ).length;

  const nextMonthProjectsCount = sortedProjects.filter(p => 
    isDateInMonth(p.deliveryDate, nextMonth, nextMonthYear) || 
    isDateInMonth(p.estimatedDate, nextMonth, nextMonthYear) ||
    isDateInMonth(p.scheduledDate, nextMonth, nextMonthYear)
  ).length;
  
  const currentMonthName = now.toLocaleString('pt-PT', { month: 'long' });
  const nextMonthName = new Date(nextMonthYear, nextMonth).toLocaleString('pt-PT', { month: 'long' });
  
  // Tasks for current week & next week
  const getWeekNumber = (date: Date) => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };
  const currentWeek = getWeekNumber(now);
  
  const tasksCurrentWeek = activeTasks.filter(t => t.startDate && getWeekNumber(safeParseDate(t.startDate)) === currentWeek).length;
  const tasksNextWeek = activeTasks.filter(t => t.startDate && getWeekNumber(safeParseDate(t.startDate)) === currentWeek + 1).length;

  const totalTasks = activeTasks.length;

  const getTaskScale = (statusId: string) => {
    const found = (taskStatuses || []).find((s: any) => s.id === statusId || matchTaskStatusId(s.id, statusId));
    if (found && typeof found.scale === 'number') return found.scale;
    if (matchTaskStatusId(statusId, 'ts-3')) return 3;
    if (matchTaskStatusId(statusId, 'ts-2')) return 2;
    if (matchTaskStatusId(statusId, 'ts-4')) return 4;
    return 1;
  };

  const completedTasks = activeTasks.filter(t => getTaskScale(t.statusId) === 3).length;
  const inProgressTasks = activeTasks.filter(t => getTaskScale(t.statusId) === 2).length;
  const notStartedTasks = activeTasks.filter(t => getTaskScale(t.statusId) === 1).length;
  const onHoldTasks = activeTasks.filter(t => getTaskScale(t.statusId) >= 4).length;

  const completedPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const inProgressPct = totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) : 0;
  const pendingPct = totalTasks > 0 ? Math.round(((notStartedTasks + onHoldTasks) / totalTasks) * 100) : 0;

  // Get current date time (midnight)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  // "seguintes" -> current or future absences
  let upcomingAbsences = absences.filter(abs => parseDateToTime(abs.absenceEndDate) >= todayTime);

  // Fallback to all absences if none are in the future (for demo environments with static/older datasets)
  if (upcomingAbsences.length === 0) {
    upcomingAbsences = [...absences];
  }

  // Always sort by the start date of the absence period (absenceStartDate) ascending
  upcomingAbsences.sort((a, b) => parseDateToTime(a.absenceStartDate) - parseDateToTime(b.absenceStartDate));

  // Limit to next 10 records
  const displayedAbsences = upcomingAbsences.slice(0, 10);

  const getUserName = (userId: string) => {
    const user = users.find(u => matchId(u.id, userId));
    return user ? user.name : 'Utilizador';
  };
  const getUserInitials = (userId: string) => {
    const name = getUserName(userId);
    return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  };


  // Recent comments (excluding soft-deleted projects, sorted by createdDate descending)
  const activeComments = [...comments]
    .filter(c => {
      const proj = projects.find(p => matchId(p.id, c.projectId));
      return proj && !proj.deleted;
    })
    .sort((a, b) => {
      const timeA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
      const timeB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
      return timeB - timeA;
    })
    .slice(0, 15);

  // Active projects for categories (not concluded 'ps-6' and not deleted)
  const activeProjectsForCategories = sortedProjects.filter(p => p.statusId !== 'ps-6' && !p.deleted);
  const totalActiveProjects = activeProjectsForCategories.length;

  // Calculate category stats
  const categoryStats = projectCategories.map(cat => {
    const count = activeProjectsForCategories.filter(p => 
      p.categoryId === cat.id || (p.categoryIds && p.categoryIds.includes(cat.id))
    ).length;
    return {
      id: cat.id,
      name: cat.name,
      count
    };
  }).filter(stat => stat.count > 0)
    .sort((a, b) => b.count - a.count);

  const uncategorizedCount = activeProjectsForCategories.filter(p => {
    if (!p.categoryId && (!p.categoryIds || p.categoryIds.length === 0)) return true;
    const hasValidCat = projectCategories.some(c => c.id === p.categoryId || (p.categoryIds && p.categoryIds.includes(c.id)));
    return !hasValidCat;
  }).length;

  if (uncategorizedCount > 0) {
    categoryStats.push({
      id: 'other',
      name: 'Outros',
      count: uncategorizedCount
    });
  }

  // Next 14 days range
  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  rangeEnd.setHours(23, 59, 59, 999);

  // Users with tasks allocated in the next 14 days
  const usersWithTasksIn14Days = users.map(user => {
    const userTasks = activeTasks.filter(t => {
      if (!t.assigneeIds || !t.assigneeIds.includes(user.id)) {
        return false;
      }
      
      const taskStartStr = t.startDate || t.estimatedDate || '';
      const taskEndStr = t.endDate || t.estimatedDate || '';
      
      if (!taskStartStr && !taskEndStr) {
        return false;
      }
      
      const taskStart = taskStartStr ? safeParseDate(taskStartStr).getTime() : null;
      const taskEnd = taskEndStr ? safeParseDate(taskEndStr).getTime() : null;
      
      const startLimit = rangeStart.getTime();
      const endLimit = rangeEnd.getTime();
      
      if (taskStart !== null && taskEnd !== null) {
        return taskStart <= endLimit && taskEnd >= startLimit;
      } else if (taskStart !== null) {
        return taskStart >= startLimit && taskStart <= endLimit;
      } else if (taskEnd !== null) {
        return taskEnd >= startLimit && taskEnd <= endLimit;
      }
      
      return false;
    });
    
    return {
      user,
      count: userTasks.length
    };
  }).filter(u => u.count > 0)
    .sort((a, b) => b.count - a.count);

  // Calculate projects with missing materials
  const projectsWithMissingMaterials = useMemo(() => {
    if (!projectMaterials || projectMaterials.length === 0) return [];
    
    const activeProjs = sortedProjects.filter(p => !p.deleted && !isStatus5(p.statusId));
    
    return activeProjs.map(p => {
      const missingItems = projectMaterials.filter(pm => matchId(pm.projectId, p.id) && !pm.deleted && pm.status !== 'em_stock');
      if (missingItems.length === 0) return null;
      
      return {
        project: p,
        clientName: getClientName(p.clientId),
        missingCount: missingItems.length,
        deliveryDate: p.scheduledDate || p.deliveryDate || p.estimatedDate || 'Sem data',
      };
    }).filter(Boolean) as Array<{ project: Project; clientName: string; missingCount: number; deliveryDate: string }>;
  }, [projectMaterials, sortedProjects, getClientName, isStatus5]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 auto-rows-min animate-fade-in">
      
      {/* Top Summary Cards Section */}
      <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SummaryCard 
          title="Projetos Ativos" 
          value={activeProjectsCount} 
          icon={Activity} 
          colorClass="bg-blue-50 text-blue-600" 
        />
        <SummaryCard 
          title={`Projetos ${currentMonthName}`} 
          value={currentMonthProjectsCount} 
          icon={CalendarClock} 
          colorClass="bg-emerald-50 text-emerald-600" 
        />
        <SummaryCard 
          title={`Projetos ${nextMonthName}`} 
          value={nextMonthProjectsCount} 
          icon={CalendarDays} 
          colorClass="bg-amber-50 text-amber-600" 
        />
      </div>

      {/* Widget: Projetos com Material em Falta */}
      {projectsWithMissingMaterials.length > 0 && (
        <div className="md:col-span-12 bg-white rounded-2xl border border-rose-200 flex flex-col overflow-hidden shadow-xs">
          <div className="p-4 border-b border-rose-100 flex justify-between items-center bg-rose-50/60">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <h2 className="font-bold text-rose-900 text-sm md:text-base">Projetos com material em falta</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-black text-xs border border-rose-200">
                {projectsWithMissingMaterials.length}
              </span>
            </div>
            <span className="text-xs font-bold text-rose-600 hidden sm:inline">Controlo de Encomendas & Stock</span>
          </div>
          <div className="divide-y divide-slate-100">
            {projectsWithMissingMaterials.map(item => (
              <div key={item.project.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{item.clientName}</span>
                    <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-extrabold uppercase border border-rose-200">
                      {item.missingCount} {item.missingCount === 1 ? 'material em falta' : 'materiais em falta'}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">{item.project.title}</h3>
                  <p className="text-xs text-slate-500">
                    Data de Entrega / Agendamento: <strong className="text-slate-800 font-semibold">{item.deliveryDate}</strong>
                  </p>
                </div>
                <button
                  onClick={() => onSelectProject(item.project.id)}
                  className="self-start sm:self-center px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Package className="w-4 h-4 text-rose-600" />
                  Ver Projeto & Material
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. Full-Width Box: Sorted Active Project Pipeline */}
      <div className="md:col-span-12 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden -sm">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50/50">
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm md:text-base">
              <Briefcase className="w-5 h-5 text-blue-600" />
              Projetos Ativos
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Portfólio de projetos ativos</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-slate-500">
              Página <strong className="text-slate-800 font-bold">{page}</strong> de <strong className="text-slate-800 font-bold">{totalPages}</strong> ({totalProjects} projetos)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors shadow-xs"
                title="Recua 10 projetos"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> 
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors shadow-xs"
                title="Avança 10 projetos"
              >
                 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {displayedProjects.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">Nenhum projeto ativo registado.</div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="text-[10px] uppercase text-slate-400 font-extrabold bg-slate-50/50 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">IP</th>
                  <th className="px-5 py-3">Projeto</th>
                  <th className="px-5 py-3">Entrega</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {displayedProjects.map((project) => {
                  const deliveryDate = project.scheduledDate || project.estimatedDate || project.deliveryDate;
                  const overdueOrToday = isOverdueOrToday(deliveryDate);
                  const calcRisk = getProjectCalculatedRisk(project.id, projectRiskItems);
                  const isCritical = calcRisk.score >= 16;
                  return (
                    <tr 
                      key={project.id} 
                      className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                        isCritical ? 'border-l-4 border-l-rose-600 bg-rose-50/10' : ''
                      }`}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <td className="px-5 py-3.5 font-mono text-slate-400 font-bold">{project.installProjectNo || 'Sem ID'}</td>
                      <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {isCritical && (
                              <span className="w-1.5 h-7 bg-rose-600 rounded-full shrink-0" title="Risco Crítico do Projeto" />
                            )}
                            <div>
                              <div className="text-xs text-blue-600 font-medium">{getClientName(project.clientId)}</div>
                              <div className="font-extrabold text-slate-800 line-clamp-1 text-sm">{project.title}</div>
                            </div>
                          </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono">
                        {deliveryDate ? (
                          <span className={
                            overdueOrToday
                              ? 'text-red-600 font-extrabold bg-red-50 border border-red-200 px-2 py-0.5 rounded inline-block shadow-2xs'
                              : 'text-slate-600'
                          }>
                            {deliveryDate}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">Sem data</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          project.statusId === 'ps-5' || project.statusId === 'ps-4'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : project.statusId === 'ps-7'
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                          {getProjectStatus(project.statusId)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalProjects > 0 && (
          <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-medium px-5">
            <div>
              A mostrar <strong className="text-slate-700">{Math.min((page - 1) * 10 + 1, totalProjects)}</strong> - <strong className="text-slate-700">{Math.min(page * 10, totalProjects)}</strong> de <strong className="text-slate-700">{totalProjects}</strong> projetos ativos
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-700 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors shadow-2xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-700 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors shadow-2xs"
              >
                Seguinte<ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards After Pipeline */}
      <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Active Categories Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between -sm min-h-[280px]">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-blue-500" /> Categorias de Projetos Ativos
            </div>
            {categoryStats.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center font-medium">Nenhum projeto ativo com categoria atribuída.</p>
            ) : (
              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                {categoryStats.map((stat) => {
                  const percentage = totalActiveProjects > 0 ? Math.round((stat.count / totalActiveProjects) * 100) : 0;
                  return (
                    <div key={stat.id} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-slate-700">{stat.name}</span>
                        <span className="font-mono text-slate-500 font-bold">
                          {stat.count} <span className="text-slate-300">/</span> {totalActiveProjects} <span className="text-[10px] text-slate-400">({percentage}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 rounded-full transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button 
            onClick={() => onNavigate('projetos')}
            className="mt-6 text-center py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100/75 rounded-lg transition-colors"
          >
            Ver todos os projetos
          </button>
        </div>

        {/* Tasks per User (14 days) Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between -sm min-h-[280px]">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-blue-500" /> Tarefas por utilizador - 2 semanas
            </div>
            {usersWithTasksIn14Days.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center font-medium">Nenhum utilizador com tarefas nos próximos 14 dias.</p>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                {usersWithTasksIn14Days.map(({ user, count }) => (
                  <div key={user.id} className="flex items-center justify-between bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 text-xs hover:bg-slate-50 transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {getUserInitials(user.id)}
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-800 text-xs">{user.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                          {user.role || 'Membro da Equipa'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">
                        {count} tarefa{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button 
            onClick={() => onNavigate('tarefas')}
            className="mt-6 text-center py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100/75 rounded-lg transition-colors"
          >
            Ver todas as tarefas
          </button>
        </div>
      </div>

      {/* Left Column (Distribuição de Tarefas + Notas & Comentários Recentes) */}
      <div className="md:col-span-6 flex flex-col gap-5">
        {/* 2. Tasks Stats */}
        <div className="bg-slate-900 rounded-2xl p-5 text-white flex flex-col justify-between -sm min-h-[280px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-blue-400" /> Distribuição de Tarefas
              </h3>
              <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-[11px] font-bold border border-slate-700 text-blue-400">
                {completedPct}%
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-6 font-medium">Taxa de conclusão e distribuição de esforços da equipa.</p>
          </div>
          
          <div className="flex-1 flex flex-col gap-4 justify-center">
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span>Em Progresso</span>
                <span className="text-blue-400 font-mono text-[11px]">{inProgressTasks} de {totalTasks}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${inProgressPct}%` }}></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold text-slate-400">
                <span>Pendente / Suspenso</span>
                <span className="font-mono text-[11px]">{notStartedTasks + onHoldTasks} de {totalTasks}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-slate-600 rounded-full transition-all duration-500" style={{ width: `${pendingPct}%` }}></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span>Concluído</span>
                <span className="text-emerald-400 font-mono text-[11px]">{completedTasks} de {totalTasks}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${completedPct}%` }}></div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => onNavigate('tarefas')}
            className="mt-6 w-full text-center py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl transition-all"
          >
            Gerir Quadro de Tarefas
          </button>
        </div>

        {/* 6. Recent Comments */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col -sm flex-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-blue-500" /> Notas & Comentários Recentes
          </div>
          {activeComments.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center font-medium">Nenhum comentário adicionado recentemente.</p>
          ) : (
            <div className="flex flex-col gap-3 text-xs max-h-[420px] overflow-y-auto pr-1">
              {activeComments.map((com) => {
                const proj = projects.find(p => matchId(p.id, com.projectId));
                const commentDate = com.createdDate ? new Date(com.createdDate) : null;
                const formattedDate = commentDate && !isNaN(commentDate.getTime()) 
                  ? `${commentDate.toLocaleDateString('pt-PT')} ${commentDate.toLocaleTimeString('pt-PT', {hour: '2-digit', minute:'2-digit'})}`
                  : 'Data N/A';
                return (
                  <div key={com.id} className="border-l-2 border-blue-500 pl-3.5 py-2 bg-slate-50/60 rounded-r-xl border-y border-r border-slate-100 flex flex-col justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="font-extrabold text-slate-800">{getUserName(com.authorId)}</span>
                        <span className="text-slate-400 text-[10px]">no projeto</span>
                        <span className="font-bold text-blue-600 truncate max-w-[200px]" title={proj ? `${getClientName(proj.clientId)} - ${proj.title}` : 'Desconhecido'}>
                          {proj ? `${getClientName(proj.clientId)} - ${proj.title}` : 'Desconhecido'}
                        </span>
                      </div>
                      <p className="text-slate-700 italic mt-0.5 font-medium whitespace-pre-wrap">&quot;{com.comment}&quot;</p>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2 font-bold font-mono">
                      {formattedDate}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Column (Ausências e Férias da Equipa) */}
      <div className="md:col-span-6 flex flex-col gap-5">
        {/* 3. Team Absence Widget */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between -sm min-h-[280px] flex-1">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-500" /> Ausências e Férias da Equipa
            </div>
            {displayedAbsences.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center font-medium">Nenhuma ausência registada.</p>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                {displayedAbsences.map((abs) => {
                  const startDate = safeParseDate(abs.absenceStartDate);
                  const endDate = safeParseDate(abs.absenceEndDate);
                  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
                  return (
                    <div key={abs.id} className="flex items-center justify-between bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 text-xs hover:bg-slate-50 transition-all">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                          {getUserInitials(abs.userId)}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-800 text-xs">{getUserName(abs.userId)}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                            Registo de ausência
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-700 font-bold">{startDate.toLocaleDateString('pt-PT')}</div>
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">{days} dia{days !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button 
            onClick={() => onNavigate('ausencias')}
            className="mt-6 text-center py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100/75 rounded-lg transition-colors"
          >
            Ver Agenda Completa
          </button>
        </div>
      </div>

    </div>
  );
}
