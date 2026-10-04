'use client';

import { M3SectionHeader } from './M3';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import React, { useState, useMemo } from 'react';
import { Project, Task, Comment, UserAbsence, Material, Quote, Client, ProjectMaterial, ProjectRiskItem } from '../lib/types';
import { Briefcase, CheckSquare, Users, MessageSquare, CalendarClock, CalendarDays, Activity, ChevronLeft, ChevronRight, AlertTriangle, Package, CheckCircle2, Clock, BarChart2, Search } from 'lucide-react';
import { stringToUUID } from '../lib/supabaseSync';
import { getProjectCalculatedRisk, matchTaskStatusId, parseTimeToHours, getProjectStatusStyle } from '../lib/utils';

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
  <Card className="p-5 flex items-start gap-4 border-t-2 border-t-primary/30">
    <div className={`p-3 rounded-control ${colorClass}`}>
      <Icon className="w-6 h-6" />
    </div>
    <div>
      <div className="text-caption font-semibold text-text-secondary uppercase tracking-wider">{title}</div>
      <div className="text-2xl font-bold text-text-primary mt-1 tabular-nums">{value}</div>
      {subtext && <div className="text-body-sm text-text-muted mt-1">{subtext}</div>}
    </div>
  </Card>
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
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>('');
  const [workloadPage, setWorkloadPage] = useState<number>(1);

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

  const getUserName = React.useCallback((userId: string) => {
    const user = users.find(u => matchId(u.id, userId));
    return user ? user.name : '';
  }, [users]);

  const getUserInitials = (userId: string) => {
    const name = getUserName(userId) || 'U';
    return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
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

  // Active projects list sorted strictly by delivery date (scheduledDate > estimatedDate > deliveryDate) from past to future
  const sortedProjects = useMemo(() => {
    return [...projects]
      .filter(p => !p.deleted && !isStatus5(p.statusId))
      .sort((a, b) => {
        const deliveryA = a.scheduledDate || a.estimatedDate || a.deliveryDate;
        const deliveryB = b.scheduledDate || b.estimatedDate || b.deliveryDate;
        const timeA = deliveryA ? safeParseDate(deliveryA).getTime() : Infinity;
        const timeB = deliveryB ? safeParseDate(deliveryB).getTime() : Infinity;
        if (timeA !== timeB) {
          return timeA - timeB; // Past to future (overdue first, then upcoming, then no date)
        }
        const createA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const createB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
        return createB - createA;
      });
  }, [projects, isStatus5]);

  // Filter sorted projects by search query (client name, project title, install project no (IP), project manager name)
  const filteredProjects = useMemo(() => {
    if (!projectSearchQuery.trim()) return sortedProjects;
    const q = projectSearchQuery.toLowerCase().trim();
    return sortedProjects.filter(p => {
      const clientName = getClientName(p.clientId).toLowerCase();
      const title = (p.title || '').toLowerCase();
      const ipNo = (p.installProjectNo || '').toLowerCase();
      const managerName = getUserName(p.projectManagerId).toLowerCase();
      return clientName.includes(q) || title.includes(q) || ipNo.includes(q) || managerName.includes(q);
    });
  }, [sortedProjects, projectSearchQuery, getClientName, getUserName]);

  const ITEMS_PER_PAGE = 10;
  const totalProjects = filteredProjects.length;
  const totalPages = Math.ceil(totalProjects / ITEMS_PER_PAGE) || 1;
  const page = Math.min(currentPage, totalPages);
  const displayedProjects = filteredProjects.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

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

  // Stats
  const activeProjectsCount = sortedProjects.length;
  
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

  const getTaskScale = React.useCallback((statusId: string) => {
    const found = (taskStatuses || []).find((s: any) => s.id === statusId || matchTaskStatusId(s.id, statusId));
    if (found && typeof found.scale === 'number') return found.scale;
    if (matchTaskStatusId(statusId, 'ts-3')) return 3;
    if (matchTaskStatusId(statusId, 'ts-2')) return 2;
    if (matchTaskStatusId(statusId, 'ts-4')) return 4;
    return 1;
  }, [taskStatuses]);

  // 1. Projetos ativos esta semana (next 7 days starting today)
  const activeProjectsThisWeek = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

    // All tasks scheduled in the 7-day window across active projects
    const allTasksThisWeek = activeTasks.filter(t => {
      const dStr = t.startDate || t.estimatedDate || t.endDate;
      if (!dStr) return false;
      const tTime = safeParseDate(dStr).getTime();
      return tTime >= start.getTime() && tTime <= end.getTime();
    });

    const totalTasksThisWeek = allTasksThisWeek.length;

    const results: Array<{
      project: Project;
      clientName: string;
      projTasksCount: number;
      totalTasksThisWeek: number;
      progressPct: number;
    }> = [];

    sortedProjects.forEach(proj => {
      const projTasksWeek = allTasksThisWeek.filter(t => t.projectId === proj.id);

      if (projTasksWeek.length > 0) {
        const projTasksCount = projTasksWeek.length;
        const progressPct = totalTasksThisWeek > 0 ? Math.round((projTasksCount / totalTasksThisWeek) * 100) : 0;
        results.push({
          project: proj,
          clientName: getClientName(proj.clientId),
          projTasksCount,
          totalTasksThisWeek,
          progressPct
        });
      }
    });

    return results;
  }, [sortedProjects, activeTasks, getClientName]);

  // 2. Projetos ativos com maior carga horária (hours consumed in completed/filled tasks + estimated hours in pending tasks)
  const projectsByWorkload = useMemo(() => {
    const list = sortedProjects.map(proj => {
      const projTasks = tasks.filter(t => t.projectId === proj.id && !t.deleted);
      let totalHours = 0;
      let completedHours = 0;
      let pendingHours = 0;

      projTasks.forEach(t => {
        const numUsers = t.assigneeIds && t.assigneeIds.length > 0 ? t.assigneeIds.length : 1;
        const actualH = parseTimeToHours(t.actualHours);
        const estH = parseTimeToHours(t.estimatedHours || '08:00');
        const isDone = getTaskScale(t.statusId) === 3;

        if (isDone || actualH > 0) {
          const taskH = (actualH > 0 ? actualH : estH) * numUsers;
          completedHours += taskH;
          totalHours += taskH;
        } else {
          const taskH = estH * numUsers;
          pendingHours += taskH;
          totalHours += taskH;
        }
      });

      return {
        project: proj,
        clientName: getClientName(proj.clientId),
        totalHours: Math.round(totalHours * 10) / 10,
        completedHours: Math.round(completedHours * 10) / 10,
        pendingHours: Math.round(pendingHours * 10) / 10,
        tasksCount: projTasks.length
      };
    });

    list.sort((a, b) => b.totalHours - a.totalHours);
    return list;
  }, [sortedProjects, tasks, getClientName, getTaskScale]);

  const WORKLOAD_PER_PAGE = 10;
  const totalWorkloadProjects = projectsByWorkload.length;
  const totalWorkloadPages = Math.ceil(totalWorkloadProjects / WORKLOAD_PER_PAGE) || 1;
  const currentWorkloadPage = Math.min(workloadPage, totalWorkloadPages);
  const displayedWorkloadProjects = projectsByWorkload.slice(
    (currentWorkloadPage - 1) * WORKLOAD_PER_PAGE,
    currentWorkloadPage * WORKLOAD_PER_PAGE
  );

  // Max workload for visual bars
  const maxWorkloadHours = useMemo(() => {
    return projectsByWorkload.length > 0 ? Math.max(...projectsByWorkload.map(p => p.totalHours), 1) : 1;
  }, [projectsByWorkload]);

  // Absences
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  let upcomingAbsences = absences.filter(abs => {
    const end = safeParseDate(abs.absenceEndDate).getTime();
    return end >= todayTime;
  });

  if (upcomingAbsences.length === 0) {
    upcomingAbsences = [...absences];
  }

  upcomingAbsences.sort((a, b) => safeParseDate(a.absenceStartDate).getTime() - safeParseDate(b.absenceStartDate).getTime());
  const displayedAbsences = upcomingAbsences.slice(0, 10);

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

  // Active categories
  const activeCategories = (projectCategories || []).filter(c => !c.deleted);
  const activeProjectsForCategories = sortedProjects.filter(p => p.statusId !== 'ps-6' && !p.deleted);
  const totalActiveProjects = activeProjectsForCategories.length;

  const categoryStats = activeCategories.map(cat => {
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
    const hasValidCat = activeCategories.some(c => c.id === p.categoryId || (p.categoryIds && p.categoryIds.includes(c.id)));
    return !hasValidCat;
  }).length;

  if (uncategorizedCount > 0) {
    categoryStats.push({
      id: 'other',
      name: 'Outros',
      count: uncategorizedCount
    });
  }

  return (
    <div className="m3-dashboard grid grid-cols-1 md:grid-cols-12 gap-5 auto-rows-min animate-fade-in">
      
      <div className="md:col-span-12">
        <M3SectionHeader title="Dashboard" description="Projetos, trabalho da semana e atividade da equipa num só lugar." />
      </div>

      {/* Top Summary Cards Section */}
      <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SummaryCard 
          title="Projetos Ativos" 
          value={activeProjectsCount} 
          icon={Activity} 
          colorClass="bg-primary/5 text-primary"
        />
        <SummaryCard 
          title={`Projetos ${currentMonthName}`} 
          value={currentMonthProjectsCount} 
          icon={CalendarClock} 
          colorClass="bg-brand-green/10 text-brand-green"
        />
        <SummaryCard 
          title={`Projetos ${nextMonthName}`} 
          value={nextMonthProjectsCount} 
          icon={CalendarDays} 
          colorClass="bg-brand-accent/10 text-brand-accent"
        />
      </div>

      {/* 1. Full-Width Box: Sorted Active Project Pipeline */}
      <Card className="md:col-span-12 flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-surface-muted/60">
          <div>
            <h2 className="text-heading-sm text-text-primary flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" />
              Projetos Ativos
            </h2>
            <p className="text-body-sm text-text-secondary mt-0.5">Ordenados por data de entrega</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-body-sm">
            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-text-muted z-10 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="search"
                aria-label="Pesquisar projetos por cliente, título, IP ou gestor"
                value={projectSearchQuery}
                onChange={(e) => {
                  setProjectSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Pesquisar..."
                className="pl-9 pr-11 text-body-sm"
              />
              {projectSearchQuery && (
                <IconButton variant="ghost" size="sm"
                  aria-label="Limpar pesquisa de projetos"
                  type="button"
                  onClick={() => {
                    setProjectSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                >
                  ×
                </IconButton>
              )}
            </div>

            <span className="font-medium text-text-secondary">
              Página <strong className="text-text-primary font-bold">{page}</strong> de <strong className="text-text-primary font-bold">{totalPages}</strong> ({totalProjects} projetos)
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="shrink-0"
                aria-label="Página anterior de projetos"
                title="Recua 10 projetos"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> 
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="shrink-0"
                aria-label="Página seguinte de projetos"
                title="Avança 10 projetos"
              >
                 <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          {displayedProjects.length === 0 ? (
            <div className="p-10 text-center text-text-muted text-body-sm font-medium">Nenhum projeto ativo registado.</div>
          ) : (
            <table aria-label="Projetos ativos" className="w-full min-w-[620px] text-left border-collapse text-body-sm">
              <thead className="bg-surface-muted/90 text-caption uppercase tracking-wider text-text-secondary font-bold border-b border-border/80 whitespace-nowrap select-none">
                <tr>
                  <th className="px-5 py-3.5 text-left">IP / Gestor</th>
                  <th className="px-5 py-3.5 text-left">Projeto</th>
                  <th className="px-5 py-3.5 text-left">Entrega</th>
                  <th className="px-5 py-3.5 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-medium">
                {displayedProjects.map((project) => {
                  const deliveryDate = project.scheduledDate || project.estimatedDate || project.deliveryDate;
                  const overdueOrToday = isOverdueOrToday(deliveryDate);
                  const calcRisk = getProjectCalculatedRisk(project.id, projectRiskItems);
                  const isCritical = calcRisk.score >= 16;
                  
                  // Check missing materials for this project
                  const hasMissingMat = (projectMaterials || []).some(
                    pm => matchId(pm.projectId, project.id) && !pm.deleted && pm.status !== 'em_armazem' && pm.status !== 'em_stock'
                  );

                  return (
                    <tr 
                      key={project.id} 
                      className={`hover:bg-surface-muted/80 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${
                        isCritical ? 'border-l-4 border-l-error bg-error/5' : ''
                      }`}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-mono text-text-primary font-bold text-body-sm">{project.installProjectNo || '-'}</div>
                        <div className="text-caption text-text-secondary font-medium truncate max-w-[150px]">{getUserName(project.projectManagerId) || 'Sem gestor'}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {isCritical && (
                            <span className="w-1.5 h-7 bg-error rounded-full shrink-0" title="Risco Crítico do Projeto" />
                          )}
                          <div>
                            <div className="text-body-sm text-primary font-medium flex items-center gap-1.5 flex-wrap">
                              <span>{getClientName(project.clientId)}</span>
                              {hasMissingMat && (
                                <span title="Material em falta no projeto" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-error/10 text-error text-caption font-semibold border border-error/20">
                                  <Package className="w-3 h-3 text-error" />
                                  Material em falta
                                </span>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Abrir projeto ${project.title}`}
                              onClick={event => { event.stopPropagation(); onSelectProject(project.id); }}
                              className="h-auto p-0 justify-start text-left whitespace-normal font-semibold text-text-primary hover:bg-transparent"
                            >
                              {project.title}
                            </Button>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono">
                        {deliveryDate ? (
                          <span className={
                            overdueOrToday
                              ? 'text-error font-semibold bg-error/5 border border-error/20 px-2 py-0.5 rounded inline-block shadow-2xs'
                              : 'text-text-secondary'
                          }>
                            {deliveryDate}
                          </span>
                        ) : (
                          <span className="text-text-muted font-mono">Sem data</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {(() => {
                          const pStyle = getProjectStatusStyle(project.statusId, projectStatuses);
                          return (
                            <Badge className={pStyle.badgeClass}>
                              {pStyle.name}
                            </Badge>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalProjects > 0 && (
          <div className="px-5 py-3.5 bg-surface-muted/70 border-t border-border/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-body-sm text-text-secondary font-medium">
            <div>
              A mostrar <strong className="text-text-primary">{Math.min((page - 1) * 10 + 1, totalProjects)}</strong> - <strong className="text-text-primary">{Math.min(page * 10, totalProjects)}</strong> de <strong className="text-text-primary">{totalProjects}</strong> projetos ativos
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="shrink-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="shrink-0"
              >
                Seguinte<ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Row: Projetos Ativos Esta Semana + Projetos com Maior Carga Horária */}
      <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Widget 1: Projetos ativos esta semana (Next 7 days) */}
        <Card className="p-5 flex flex-col justify-between min-h-[360px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-heading-sm text-text-primary flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-primary" /> Projetos ativos esta semana
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold text-caption border border-primary/20">
                {activeProjectsThisWeek.length} projeto{activeProjectsThisWeek.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-body-sm text-text-secondary mb-4 font-medium">Projetos com tarefas planeadas para os próximos 7 dias</p>
          </div>
          
          <div className="flex-1 flex flex-col gap-3">
            {activeProjectsThisWeek.length === 0 ? (
              <div className="text-center py-10 text-text-secondary text-body-sm font-medium">
                Nenhum projeto com tarefas planeadas para os próximos 7 dias.
              </div>
            ) : (
              activeProjectsThisWeek.map(({ project, clientName, projTasksCount, totalTasksThisWeek, progressPct }) => {
                const pStyle = getProjectStatusStyle(project.statusId, projectStatuses);
                return (
                  <div 
                    key={project.id}
                    onClick={() => onSelectProject(project.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir projeto ${project.title}`}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectProject(project.id); } }}
                    className="bg-surface-muted hover:bg-surface-elevated p-3 rounded-control border border-border/80 cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 space-y-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-caption font-bold text-primary truncate">{clientName}</span>
                          <Badge className={pStyle.badgeClass}>
                            {pStyle.name}
                          </Badge>
                        </div>
                        <div className="text-body-sm font-semibold text-text-primary truncate">{project.title}</div>
                      </div>
                      <span className="text-caption font-mono font-bold text-text-secondary shrink-0">
                        {projTasksCount} de {totalTasksThisWeek} tarefas
                      </span>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          progressPct === 100 ? 'bg-success' : 'bg-primary'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <Button variant="primary"
            onClick={() => onNavigate('tarefas')}
            className="mt-4 w-full text-center"
          >
            Ver todas as tarefas
          </Button>
        </Card>

        {/* Widget 2: Projetos com Maior Carga Horária (Paginated 10 by 10) */}
        <Card className="p-5 flex flex-col justify-between min-h-[360px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-heading-sm text-text-primary flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-primary" /> Projetos com maior carga horária
              </h3>
              <span className="text-body-sm font-bold text-text-secondary">
                Pág. {currentWorkloadPage}/{totalWorkloadPages}
              </span>
            </div>
            <p className="text-caption text-text-secondary mb-4 font-medium">Contabilização de horas consumidas e estimadas de tarefas ativas.</p>
          </div>

          <div className="flex-1 flex flex-col gap-2.5">
            {displayedWorkloadProjects.length === 0 ? (
              <div className="text-center py-10 text-text-muted text-body-sm font-medium">
                Nenhum projeto ativo registado.
              </div>
            ) : (
              displayedWorkloadProjects.map(({ project, clientName, totalHours, completedHours, pendingHours, tasksCount }, idx) => {
                const globalIndex = (currentWorkloadPage - 1) * WORKLOAD_PER_PAGE + idx + 1;
                const barWidth = maxWorkloadHours > 0 ? Math.min(100, Math.round((totalHours / maxWorkloadHours) * 100)) : 0;
                const pStyle = getProjectStatusStyle(project.statusId, projectStatuses);
                
                return (
                  <div 
                    key={project.id}
                    onClick={() => onSelectProject(project.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir projeto ${project.title}`}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectProject(project.id); } }}
                    className="p-2.5 rounded-control border border-border-subtle hover:border-border bg-surface-muted/60 hover:bg-surface-muted cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-caption font-bold shrink-0">
                          {globalIndex}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-caption font-bold text-primary truncate">{clientName}</span>
                            <Badge className={pStyle.badgeClass}>
                              {pStyle.name}
                            </Badge>
                          </div>
                          <div className="text-body-sm font-semibold text-text-primary truncate">{project.title}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-body-sm font-bold text-text-primary font-mono">{totalHours}h</div>
                        <div className="text-caption text-text-muted">{tasksCount} tarefa{tasksCount !== 1 ? 's' : ''}</div>
                      </div>
                    </div>

                    {/* Progress bar representing workload */}
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Workload Pagination Controls */}
          {totalWorkloadPages > 1 && (
            <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-body-sm font-medium text-text-secondary mt-2">
              <span>{totalWorkloadProjects} projetos ativos</span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm"
                  onClick={() => setWorkloadPage(prev => Math.max(1, prev - 1))}
                  disabled={currentWorkloadPage <= 1}
                  className="shrink-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => setWorkloadPage(prev => Math.min(totalWorkloadPages, prev + 1))}
                  disabled={currentWorkloadPage >= totalWorkloadPages}
                  className="shrink-0"
                >
                  Seguinte <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Row: Notas & Comentários Recentes + Ausências e Férias da Equipa */}
      <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left: Recent Comments */}
        <Card className="p-5 flex flex-col min-h-[320px]">
          <h3 className="text-heading-sm text-text-primary mb-4 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-primary" /> Comentários recentes
          </h3>
          {activeComments.length === 0 ? (
            <p className="text-body-sm text-text-muted py-8 text-center font-medium">Nenhum comentário adicionado recentemente.</p>
          ) : (
            <div className="flex flex-col gap-3 text-body-sm max-h-[380px] overflow-y-auto pr-1">
              {activeComments.map((com) => {
                const proj = projects.find(p => matchId(p.id, com.projectId));
                const commentDate = com.createdDate ? new Date(com.createdDate) : null;
                const formattedDate = commentDate && !isNaN(commentDate.getTime()) 
                  ? `${commentDate.toLocaleDateString('pt-PT')} ${commentDate.toLocaleTimeString('pt-PT', {hour: '2-digit', minute:'2-digit'})}`
                  : 'Data N/A';
                return (
                  <div key={com.id} className="border-l-2 border-primary pl-3.5 py-2 bg-surface-muted/60 rounded-r-control border-y border-r border-border-subtle flex flex-col justify-between hover:bg-surface-muted transition-colors">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="font-semibold text-text-primary">{getUserName(com.authorId)}</span>
                        <span className="text-text-muted text-caption">no projeto</span>
                        <span className="font-bold text-primary truncate max-w-[200px]" title={proj ? `${getClientName(proj.clientId)} - ${proj.title}` : 'Desconhecido'}>
                          {proj ? `${getClientName(proj.clientId)} - ${proj.title}` : 'Desconhecido'}
                        </span>
                      </div>
                      <p className="text-text-primary italic mt-0.5 font-medium whitespace-pre-wrap">&quot;{com.comment}&quot;</p>
                    </div>
                    <div className="text-caption text-text-muted mt-2 font-bold font-mono">
                      {formattedDate}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Right: Team Absences */}
        <Card className="p-5 flex flex-col justify-between min-h-[320px]">
          <div>
            <h3 className="text-heading-sm text-text-primary mb-4 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" /> Ausências da equipa
            </h3>
            {displayedAbsences.length === 0 ? (
              <p className="text-body-sm text-text-muted py-8 text-center font-medium">Nenhuma ausência registada.</p>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                {displayedAbsences.map((abs) => {
                  const startDate = safeParseDate(abs.absenceStartDate);
                  const endDate = safeParseDate(abs.absenceEndDate);
                  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
                  return (
                    <div key={abs.id} className="flex items-center justify-between bg-surface-muted/70 p-2.5 rounded-control border border-border-subtle text-body-sm hover:bg-surface-muted transition-all">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-body-sm font-bold shrink-0">
                          {getUserInitials(abs.userId)}
                        </div>
                        <div>
                          <div className="font-semibold text-text-primary text-body-sm">{getUserName(abs.userId)}</div>
                          <div className="text-caption text-text-muted font-bold uppercase tracking-tight">
                            Registo de ausência
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-caption text-text-primary font-bold">{startDate.toLocaleDateString('pt-PT')}</div>
                        <div className="text-caption text-text-secondary font-mono mt-0.5">{days} dia{days !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Button variant="secondary"
            onClick={() => onNavigate('ausencias')}
            className="mt-6 w-full"
          >
            Ver todas as ausências
          </Button>
        </Card>
      </div>

    </div>
  );
}
