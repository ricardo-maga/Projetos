'use client';

import React, { useState, useEffect } from 'react';
import { Project, Task, UserAbsence, User, Client, SpecialDay, ProjectRiskItem, TaskType } from '../lib/types';
import { 
  ChevronLeft, ChevronRight, Calendar, AlertTriangle, Users, 
  Clock, Flag, AlertCircle, Info, Briefcase, Plus, X, Maximize2, Edit2, Layers,
  Search, RotateCcw, Filter
} from 'lucide-react';

import { hasPermission } from '../lib/permissions';
import { AssigneeSelector } from './AssigneeSelector';
import TaskDetailsModal from './TaskDetailsModal';
import PlanningAllocationModal from './PlanningAllocationModal';
import ResourceDayDetailModal from './ResourceDayDetailModal';
import { getTaskStatusName, getDefaultTaskStatusId, getTaskTypeName, getDefaultTaskTypeId, stripSecondsFromHours, formatToOnlyHours } from '../lib/utils';
import { 
  PlanningAllocationDTO, 
  PlanningAllocationCreateInput, 
  PlanningAllocationUpdateInput, 
  PlanningAllocationFilters,
  ResourceCapacityDetail,
  ResourceLoadSummary
} from '../lib/planning/types';
import { formatHoursDisplay } from '../lib/planning/summary';
import ResourceCapacityBar from './ResourceCapacityBar';

// FASE 23E-C1: Operational Period & Temporal Management
export type OperationalPeriod = 'today' | 'tomorrow' | '7days' | '14days';

// FASE 23E-C2: Operational Filters types
export type ResourceOperationalFilter = 
  | 'all' 
  | 'with_capacity' 
  | 'no_capacity' 
  | 'overloaded' 
  | 'no_confirmed' 
  | 'with_draft'
  | 'has_confirmed'
  | 'has_planned'
  | 'has_free';

export type AllocationStatusFilter = 'all' | 'CONFIRMED' | 'DRAFT';

// FASE 23E-C3A: Operational Planning KPIs Interface
export interface OperationalPlanningKPIs {
  totalCapacityMinutes: number;
  totalConfirmedMinutes: number;
  totalPlannedMinutes: number;
  totalFreeMinutes: number;
  totalExcessMinutes: number;
  overloadedResourcesCount: number;
  noConfirmedResourcesCount: number;
  withDraftResourcesCount: number;
  // Decimal hours helpers
  totalCapacityHours: number;
  totalConfirmedHours: number;
  totalPlannedHours: number;
  totalFreeHours: number;
  totalExcessHours: number;
}

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
  // Planning Allocations (FASE 23C)
  planningAllocations?: PlanningAllocationDTO[];
  planningLoading?: boolean;
  fetchPlanningAllocations?: (filters?: PlanningAllocationFilters) => Promise<any>;
  createPlanningAllocation?: (input: PlanningAllocationCreateInput) => Promise<any>;
  updatePlanningAllocation?: (id: string, input: PlanningAllocationUpdateInput) => Promise<any>;
  cancelPlanningAllocation?: (id: string, version: number) => Promise<any>;
  deletePlanningAllocation?: (id: string) => Promise<any>;
  // Capacity & Load (FASE 23D)
  planningCapacity?: ResourceCapacityDetail[];
  planningResourceLoad?: ResourceLoadSummary[];
  planningCapacityLoading?: boolean;
  fetchPlanningCapacity?: (filters?: { dateFrom?: string; dateTo?: string; resourceId?: string }) => Promise<any>;
  fetchPlanningResourceLoad?: (filters?: { dateFrom?: string; dateTo?: string; resourceId?: string }) => Promise<any>;
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
  planningAllocations = [],
  planningLoading = false,
  fetchPlanningAllocations,
  createPlanningAllocation,
  updatePlanningAllocation,
  cancelPlanningAllocation,
  deletePlanningAllocation,
  planningCapacity = [],
  planningResourceLoad = [],
  planningCapacityLoading = false,
  fetchPlanningCapacity,
  fetchPlanningResourceLoad,
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

  // Planning Allocations UI states (FASE 23C)
  const [showCancelledAllocations, setShowCancelledAllocations] = useState<boolean>(false);
  const [showUnplannedDrawer, setShowUnplannedDrawer] = useState<boolean>(false);
  const [isPlanningModalOpen, setIsPlanningModalOpen] = useState<boolean>(false);
  const [selectedAllocationForEdit, setSelectedAllocationForEdit] = useState<PlanningAllocationDTO | null>(null);
  const [selectedTaskForPlanning, setSelectedTaskForPlanning] = useState<Task | null>(null);
  const [calendarViewMode, setCalendarViewMode] = useState<'projects' | 'resources'>('projects');

  // FASE 23E-A: Resource Daily Detail Modal state
  const [selectedResourceDay, setSelectedResourceDay] = useState<{
    resource: User;
    dateStr: string;
  } | null>(null);
  const [planningInitialResourceId, setPlanningInitialResourceId] = useState<string>('');
  const [planningInitialDate, setPlanningInitialDate] = useState<string>('');

  const handleOpenResourceDayDetail = (resource: User, dateStr: string) => {
    setSelectedResourceDay({ resource, dateStr });
  };

  const handleNewAllocationFromDayDetail = (resourceId: string, dateStr: string) => {
    setPlanningInitialResourceId(resourceId);
    setPlanningInitialDate(dateStr);
    setSelectedAllocationForEdit(null);
    setSelectedTaskForPlanning(null);
    setIsPlanningModalOpen(true);
  };

  const handleEditAllocationFromDayDetail = (alloc: PlanningAllocationDTO) => {
    setSelectedAllocationForEdit(alloc);
    const t = tasks.find(tsk => tsk.id === alloc.taskId) || null;
    setSelectedTaskForPlanning(t);
    setIsPlanningModalOpen(true);
  };

  const handleViewTaskFromDayDetail = (task: Task) => {
    openTaskDetailsModal(task);
  };

  // Compute context capacity for PlanningAllocationModal when opened for a specific resource/date (FASE 23E-B)
  const activeDayCapacity = React.useMemo(() => {
    const resId = planningInitialResourceId || selectedAllocationForEdit?.resourceId;
    const dStr = planningInitialDate || selectedAllocationForEdit?.date;
    if (!resId || !dStr) return undefined;

    const cap = planningCapacity.find(c => c.resourceId === resId && c.date === dStr);
    const dayAllocs = planningAllocations.filter(a => a.resourceId === resId && a.date === dStr);
    const capMin = cap ? cap.operationalCapacityMinutes : 480;
    const confirmedMin = dayAllocs.filter(a => a.status === 'CONFIRMED').reduce((acc, a) => acc + (a.durationMinutes || 0), 0);
    const draftMin = dayAllocs.filter(a => a.status === 'DRAFT').reduce((acc, a) => acc + (a.durationMinutes || 0), 0);
    const plannedMin = confirmedMin + draftMin;
    const freeMin = Math.max(0, capMin - confirmedMin);
    const excessMin = Math.max(0, plannedMin - capMin);

    return {
      capacityHours: formatHoursDisplay(capMin / 60),
      confirmedHours: formatHoursDisplay(confirmedMin / 60),
      plannedHours: formatHoursDisplay(plannedMin / 60),
      freeHours: formatHoursDisplay(freeMin / 60),
      excessHours: excessMin > 0 ? `+${formatHoursDisplay(excessMin / 60)}` : '0h',
    };
  }, [planningInitialResourceId, planningInitialDate, selectedAllocationForEdit, planningCapacity, planningAllocations]);

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

  // FASE 23E-C1: Operational Period & Temporal Management
  const [operationalPeriod, setOperationalPeriod] = useState<OperationalPeriod>('14days');
  const [resourceAnchorDate, setResourceAnchorDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });

  // FASE 23E-C2: Operational Filters State (Local UI State)
  const [resourceOperationalFilter, setResourceOperationalFilter] = useState<ResourceOperationalFilter>('all');
  const [technicianSearch, setTechnicianSearch] = useState<string>('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [leaderFilter, setLeaderFilter] = useState<string>('');
  const [allocationStatusFilter, setAllocationStatusFilter] = useState<AllocationStatusFilter>('all');

  // Today's date in YYYY-MM-DD format for reference
  const todayStr = formatDateToString(new Date());

  // Active users (excluding deleted users)
  const activeUsers = React.useMemo(() => {
    return users.filter(u => !u.deleted);
  }, [users]);

  // Available Project Leaders from active projects
  const projectLeaders = React.useMemo(() => {
    const leaderIdSet = new Set<string>();
    projects.forEach(p => {
      if (!p.deleted) {
        if (p.projectManagerId) leaderIdSet.add(p.projectManagerId);
        if (p.fieldManagerId) leaderIdSet.add(p.fieldManagerId);
      }
    });
    return users
      .filter(u => !u.deleted && leaderIdSet.has(u.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'));
  }, [projects, users]);

  // Available Projects for filter
  const availableProjects = React.useMemo(() => {
    return projects
      .filter(p => !p.deleted)
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-PT'));
  }, [projects]);

  // Helper to check if task belongs to a project
  const isTaskInProject = React.useCallback((taskId: string, targetProjectId: string): boolean => {
    const task = tasks.find(t => t.id === taskId);
    return !!task && task.projectId === targetProjectId;
  }, [tasks]);

  // Helper to check if task belongs to a project managed by leader
  const isTaskInLeaderProject = React.useCallback((taskId: string, targetLeaderId: string): boolean => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;
    const project = projects.find(p => p.id === task.projectId);
    return !!project && (project.projectManagerId === targetLeaderId || project.fieldManagerId === targetLeaderId);
  }, [tasks, projects]);

  // Generate days of the timeline based on view mode and selected operational period
  const getTimelineDays = (): Date[] => {
    if (calendarViewMode === 'resources') {
      const start = new Date(resourceAnchorDate);
      start.setHours(12, 0, 0, 0);
      let count = 14;
      if (operationalPeriod === 'today' || operationalPeriod === 'tomorrow') {
        count = 1;
      } else if (operationalPeriod === '7days') {
        count = 7;
      } else if (operationalPeriod === '14days') {
        count = 14;
      }
      const days: Date[] = [];
      for (let i = 0; i < count; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
      }
      return days;
    }

    // Projects mode: 20 days around pivotDate
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

  // Fetch planning allocations for current calendar date interval (FASE 23C)
  useEffect(() => {
    if (fetchPlanningAllocations && startDateStr && endDateStr) {
      fetchPlanningAllocations({ dateFrom: startDateStr, dateTo: endDateStr });
    }
  }, [startDateStr, endDateStr, fetchPlanningAllocations]);

  // Fetch planning capacity & resource load for current calendar date interval (FASE 23D)
  useEffect(() => {
    if (fetchPlanningCapacity && startDateStr && endDateStr) {
      fetchPlanningCapacity({ dateFrom: startDateStr, dateTo: endDateStr });
    }
    if (fetchPlanningResourceLoad && startDateStr && endDateStr) {
      fetchPlanningResourceLoad({ dateFrom: startDateStr, dateTo: endDateStr });
    }
  }, [startDateStr, endDateStr, fetchPlanningCapacity, fetchPlanningResourceLoad]);

  // Track which tasks have allocations vs unplanned tasks
  const taskIdsWithAllocations = React.useMemo(() => {
    return new Set(planningAllocations.map(a => a.taskId));
  }, [planningAllocations]);

  const unplannedTasks = React.useMemo(() => {
    return tasks.filter(t => !t.deleted && !taskIdsWithAllocations.has(t.id));
  }, [tasks, taskIdsWithAllocations]);

  // FASE 23E-C2: Base Resources (filtered by text search, project, leader, allocation status)
  const baseResources = React.useMemo(() => {
    const dayStrings = new Set(timelineDays.map(d => formatDateToString(d)));

    return activeUsers.filter(user => {
      // 1. Text Search Filter: case-insensitive partial match on name or email
      if (technicianSearch.trim() !== '') {
        const term = technicianSearch.trim().toLowerCase();
        const matchName = user.name.toLowerCase().includes(term);
        const matchEmail = (user.email || '').toLowerCase().includes(term);
        if (!matchName && !matchEmail) return false;
      }

      // Valid allocations of this user inside current timeline window (excluding CANCELLED)
      const userAllocsInWindow = planningAllocations.filter(
        a => a.resourceId === user.id && dayStrings.has(a.date) && a.status !== 'CANCELLED'
      );

      // 3. Project Filter
      if (projectFilter !== '') {
        const hasMatchingProjectAlloc = userAllocsInWindow.some(alloc => isTaskInProject(alloc.taskId, projectFilter));
        if (!hasMatchingProjectAlloc) return false;
      }

      // 4. Project Leader Filter
      if (leaderFilter !== '') {
        const hasMatchingLeaderAlloc = userAllocsInWindow.some(alloc => isTaskInLeaderProject(alloc.taskId, leaderFilter));
        if (!hasMatchingLeaderAlloc) return false;
      }

      // 5. Allocation Status Filter
      if (allocationStatusFilter !== 'all') {
        const matchingStatusAllocs = userAllocsInWindow.filter(alloc => {
          if (alloc.status !== allocationStatusFilter) return false;
          if (projectFilter && !isTaskInProject(alloc.taskId, projectFilter)) return false;
          if (leaderFilter && !isTaskInLeaderProject(alloc.taskId, leaderFilter)) return false;
          return true;
        });

        if (matchingStatusAllocs.length === 0) return false;
      }

      return true;
    });
  }, [
    activeUsers,
    timelineDays,
    planningAllocations,
    technicianSearch,
    projectFilter,
    leaderFilter,
    allocationStatusFilter,
    isTaskInProject,
    isTaskInLeaderProject
  ]);

  // FASE 23E-C3D: Filtered Resources computed by applying ResourceOperationalFilter on baseResources
  const filteredResources = React.useMemo(() => {
    if (resourceOperationalFilter === 'all') return baseResources;

    const dayStrings = new Set(timelineDays.map(d => formatDateToString(d)));

    return baseResources.filter(user => {
      const userAllocsInWindow = planningAllocations.filter(
        a => a.resourceId === user.id && dayStrings.has(a.date) && a.status !== 'CANCELLED'
      );

      let totalCapacityMins = 0;
      let hasDayWithCapacity = false;
      let hasOverload = false;
      let hasFreeCapacity = false;
      let totalConfirmedCount = 0;
      let totalDraftCount = 0;

      timelineDays.forEach(day => {
        const dStr = formatDateToString(day);
        const capDetail = (planningCapacity || []).find(c => c.resourceId === user.id && c.date === dStr);
        const loadDetail = (planningResourceLoad || []).find(l => l.resourceId === user.id && l.date === dStr);

        const capMins = capDetail ? capDetail.operationalCapacityMinutes : 0;
        totalCapacityMins += capMins;
        if (capMins > 0) {
          hasDayWithCapacity = true;
        }

        const dayAllocs = userAllocsInWindow.filter(a => a.date === dStr);
        const confirmedMins = capDetail 
          ? capDetail.confirmedAllocationMinutes 
          : (loadDetail ? loadDetail.plannedMinutes : dayAllocs.filter(a => a.status === 'CONFIRMED').reduce((s, a) => s + (a.durationMinutes || 0), 0));
        const draftMins = dayAllocs.filter(a => a.status === 'DRAFT').reduce((s, a) => s + (a.durationMinutes || 0), 0);
        const plannedMins = confirmedMins + draftMins;

        const isOver = capDetail ? capDetail.overAllocatedMinutes > 0 : (plannedMins > capMins);
        if (isOver) {
          hasOverload = true;
        }

        const freeMins = capDetail 
          ? capDetail.availableMinutes 
          : Math.max(0, capMins - confirmedMins);
        if (freeMins > 0) {
          hasFreeCapacity = true;
        }

        totalConfirmedCount += dayAllocs.filter(a => a.status === 'CONFIRMED').length;
        totalDraftCount += dayAllocs.filter(a => a.status === 'DRAFT').length;
      });

      if (resourceOperationalFilter === 'with_capacity') {
        return hasDayWithCapacity;
      } else if (resourceOperationalFilter === 'no_capacity') {
        return totalCapacityMins === 0;
      } else if (resourceOperationalFilter === 'overloaded') {
        return hasOverload;
      } else if (resourceOperationalFilter === 'no_confirmed') {
        return totalConfirmedCount === 0;
      } else if (resourceOperationalFilter === 'with_draft') {
        return totalDraftCount > 0;
      } else if (resourceOperationalFilter === 'has_confirmed') {
        return totalConfirmedCount > 0;
      } else if (resourceOperationalFilter === 'has_planned') {
        return (totalConfirmedCount + totalDraftCount) > 0;
      } else if (resourceOperationalFilter === 'has_free') {
        return hasFreeCapacity;
      }

      return true;
    });
  }, [
    baseResources,
    resourceOperationalFilter,
    timelineDays,
    planningAllocations,
    planningCapacity,
    planningResourceLoad
  ]);

  // FASE 23E-C3A: Operational Planning KPIs Aggregation Engine (useMemo over baseResources)
  const operationalKPIs = React.useMemo<OperationalPlanningKPIs>(() => {
    if (baseResources.length === 0 || timelineDays.length === 0) {
      return {
        totalCapacityMinutes: 0,
        totalConfirmedMinutes: 0,
        totalPlannedMinutes: 0,
        totalFreeMinutes: 0,
        totalExcessMinutes: 0,
        overloadedResourcesCount: 0,
        noConfirmedResourcesCount: 0,
        withDraftResourcesCount: 0,
        totalCapacityHours: 0,
        totalConfirmedHours: 0,
        totalPlannedHours: 0,
        totalFreeHours: 0,
        totalExcessHours: 0,
      };
    }

    const dayStrings = timelineDays.map(d => formatDateToString(d));
    const dayStringSet = new Set(dayStrings);

    // O(1) Indexing maps
    const capacityMap = new Map<string, ResourceCapacityDetail>();
    (planningCapacity || []).forEach(c => {
      if (dayStringSet.has(c.date)) {
        capacityMap.set(`${c.resourceId}|${c.date}`, c);
      }
    });

    const allocationsMap = new Map<string, PlanningAllocationDTO[]>();
    (planningAllocations || []).forEach(a => {
      if (a.status !== 'CANCELLED' && dayStringSet.has(a.date)) {
        const key = `${a.resourceId}|${a.date}`;
        const list = allocationsMap.get(key) || [];
        list.push(a);
        allocationsMap.set(key, list);
      }
    });

    let totalCapacityMinutes = 0;
    let totalConfirmedMinutes = 0;
    let totalDraftMinutes = 0;
    let totalFreeMinutes = 0;
    let totalExcessMinutes = 0;
    let overloadedResourcesCount = 0;
    let noConfirmedResourcesCount = 0;
    let withDraftResourcesCount = 0;

    baseResources.forEach(user => {
      let resourceHasOverload = false;
      let resourceConfirmedCount = 0;
      let resourceDraftCount = 0;

      dayStrings.forEach(dStr => {
        const key = `${user.id}|${dStr}`;
        const capDetail = capacityMap.get(key);
        const dayAllocs = allocationsMap.get(key) || [];

        // Capacity: strictly canonical, NO 480 fallback
        const capMins = capDetail ? capDetail.operationalCapacityMinutes : 0;
        totalCapacityMinutes += capMins;

        // Confirmed: canonical from planningCapacity, or sum of CONFIRMED allocations
        const confMins = capDetail 
          ? capDetail.confirmedAllocationMinutes 
          : dayAllocs.filter(a => a.status === 'CONFIRMED').reduce((s, a) => s + (a.durationMinutes || 0), 0);
        totalConfirmedMinutes += confMins;

        // Draft: sum of DRAFT allocations for this day
        const draftMins = dayAllocs.filter(a => a.status === 'DRAFT').reduce((s, a) => s + (a.durationMinutes || 0), 0);
        totalDraftMinutes += draftMins;

        // Free: daily canonical available minutes
        const freeMins = capDetail 
          ? capDetail.availableMinutes 
          : Math.max(0, capMins - confMins);
        totalFreeMinutes += freeMins;

        // Excess: daily canonical over-allocated minutes
        const excessMins = capDetail 
          ? capDetail.overAllocatedMinutes 
          : Math.max(0, confMins - capMins);
        totalExcessMinutes += excessMins;

        if (excessMins > 0) {
          resourceHasOverload = true;
        }

        resourceConfirmedCount += dayAllocs.filter(a => a.status === 'CONFIRMED').length;
        resourceDraftCount += dayAllocs.filter(a => a.status === 'DRAFT').length;
      });

      if (resourceHasOverload) {
        overloadedResourcesCount++;
      }
      if (resourceConfirmedCount === 0) {
        noConfirmedResourcesCount++;
      }
      if (resourceDraftCount > 0) {
        withDraftResourcesCount++;
      }
    });

    const totalPlannedMinutes = totalConfirmedMinutes + totalDraftMinutes;

    return {
      totalCapacityMinutes,
      totalConfirmedMinutes,
      totalPlannedMinutes,
      totalFreeMinutes,
      totalExcessMinutes,
      overloadedResourcesCount,
      noConfirmedResourcesCount,
      withDraftResourcesCount,
      totalCapacityHours: Number((totalCapacityMinutes / 60).toFixed(1)),
      totalConfirmedHours: Number((totalConfirmedMinutes / 60).toFixed(1)),
      totalPlannedHours: Number((totalPlannedMinutes / 60).toFixed(1)),
      totalFreeHours: Number((totalFreeMinutes / 60).toFixed(1)),
      totalExcessHours: Number((totalExcessMinutes / 60).toFixed(1)),
    };
  }, [baseResources, timelineDays, planningCapacity, planningAllocations]);

  // FASE 23E-C3D: KPI Toggle Click Handler
  const handleKPIClick = (filterType: ResourceOperationalFilter) => {
    if (resourceOperationalFilter === filterType) {
      setResourceOperationalFilter('all');
    } else {
      setResourceOperationalFilter(filterType);
    }
  };

  // Helper to translate operational filter type to human-readable Portuguese label
  const getResourceOperationalFilterLabel = (filter: ResourceOperationalFilter): string => {
    switch (filter) {
      case 'with_capacity': return 'Com capacidade';
      case 'no_capacity': return 'Sem capacidade';
      case 'overloaded': return 'Sobrecarregados / Excesso';
      case 'has_confirmed': return 'Com Confirmado';
      case 'no_confirmed': return 'Sem Confirmado';
      case 'has_planned': return 'Com Planeado';
      case 'has_free': return 'Com Capacidade Livre';
      case 'with_draft': return 'Com DRAFT';
      default: return 'Todos os recursos';
    }
  };

  // Check if any operational filter is active
  const hasActiveResourceFilters = 
    resourceOperationalFilter !== 'all' ||
    technicianSearch.trim() !== '' ||
    projectFilter !== '' ||
    leaderFilter !== '' ||
    allocationStatusFilter !== 'all';

  // Clear all operational filters
  const handleClearResourceFilters = () => {
    setResourceOperationalFilter('all');
    setTechnicianSearch('');
    setProjectFilter('');
    setLeaderFilter('');
    setAllocationStatusFilter('all');
  };

  // Shifting date window functions
  const shiftPrev = () => {
    if (calendarViewMode === 'resources') {
      setResourceAnchorDate(prev => {
        const next = new Date(prev);
        next.setHours(12, 0, 0, 0);
        let delta = -14;
        if (operationalPeriod === 'today' || operationalPeriod === 'tomorrow') {
          delta = -1;
        } else if (operationalPeriod === '7days') {
          delta = -7;
        }
        next.setDate(prev.getDate() + delta);
        return next;
      });
      return;
    }
    setPivotDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 7);
      return next;
    });
  };

  const shiftNext = () => {
    if (calendarViewMode === 'resources') {
      setResourceAnchorDate(prev => {
        const next = new Date(prev);
        next.setHours(12, 0, 0, 0);
        let delta = 14;
        if (operationalPeriod === 'today' || operationalPeriod === 'tomorrow') {
          delta = 1;
        } else if (operationalPeriod === '7days') {
          delta = 7;
        }
        next.setDate(prev.getDate() + delta);
        return next;
      });
      return;
    }
    setPivotDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 7);
      return next;
    });
  };

  const jumpToToday = () => {
    if (calendarViewMode === 'resources') {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      setResourceAnchorDate(today);
      if (operationalPeriod === 'tomorrow') {
        setOperationalPeriod('today');
      }
      return;
    }
    setPivotDate(new Date());
  };

  const handleSelectOperationalPeriod = (mode: OperationalPeriod) => {
    setOperationalPeriod(mode);
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    if (mode === 'today') {
      setResourceAnchorDate(today);
    } else if (mode === 'tomorrow') {
      const tom = new Date(today);
      tom.setDate(today.getDate() + 1);
      setResourceAnchorDate(tom);
    } else if (mode === '7days') {
      setResourceAnchorDate(today);
    } else if (mode === '14days') {
      setResourceAnchorDate(today);
    }
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

                      // Planning Allocations for this project on this day (FASE 23C)
                      const allProjTasks = tasks.filter(t => t.projectId === proj.id && !t.deleted);
                      const projTaskIds = new Set(allProjTasks.map(t => t.id));
                      const projAllocationsOnDay = planningAllocations.filter(alloc => {
                        if (alloc.date !== dayStr) return false;
                        if (!projTaskIds.has(alloc.taskId)) return false;
                        if (!showCancelledAllocations && alloc.status === 'CANCELLED') return false;
                        if (selectedAssignee && alloc.resourceId !== selectedAssignee) return false;
                        return true;
                      });

                      // Unplanned tasks active on this day (have legacy dates but NO formal planning allocations)
                      const unplannedTasksOnDay = projTasks.filter(t => 
                        !taskIdsWithAllocations.has(t.id) && isTaskActiveOnDay(t, dayStr)
                      );

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

                          {/* 1. Formal Planning Allocations (Blocos Temporais Reais) */}
                          {projAllocationsOnDay.length > 0 && (
                            <div className="space-y-1.5">
                              {projAllocationsOnDay.map(alloc => {
                                const allocTask = tasks.find(t => t.id === alloc.taskId);
                                const resourceUser = users.find(u => u.id === alloc.resourceId);
                                const isDraft = alloc.status === 'DRAFT';
                                const isCancelled = alloc.status === 'CANCELLED';

                                return (
                                  <div
                                    key={alloc.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedAllocationForEdit(alloc);
                                      setSelectedTaskForPlanning(allocTask || null);
                                      setIsPlanningModalOpen(true);
                                    }}
                                    className={`p-1.5 rounded-lg text-left shadow-2xs transition-all cursor-pointer ${
                                      isCancelled
                                        ? 'bg-slate-100 border border-slate-200 text-slate-400 opacity-60 line-through'
                                        : isDraft
                                        ? 'bg-amber-50/70 border border-dashed border-amber-300 hover:border-amber-400 text-slate-800'
                                        : 'bg-blue-50/90 border border-blue-200 hover:border-blue-400 text-slate-900'
                                    }`}
                                    title={`Alocação: ${allocTask?.title || 'Tarefa'}\nHorário: ${alloc.startTime.substring(0, 5)} - ${alloc.endTime.substring(0, 5)} (${formatHoursDisplay((alloc.durationMinutes || 0) / 60)})\nTécnico: ${resourceUser?.name || 'Técnico'}\nEstado: ${alloc.status === 'CONFIRMED' ? 'Confirmado' : isDraft ? 'Rascunho' : 'Cancelado'}`}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                      <span className={`text-[7.5px] font-black uppercase tracking-wider px-1 py-0.2 rounded ${
                                        isCancelled
                                          ? 'bg-slate-200 text-slate-600'
                                          : isDraft
                                          ? 'bg-amber-200 text-amber-900 border border-amber-300'
                                          : 'bg-blue-600 text-white'
                                      }`}>
                                        {isCancelled ? 'CANC' : isDraft ? 'DRAFT' : 'CONF'}
                                      </span>
                                      <span className="text-[8px] font-bold text-slate-500">
                                        {alloc.startTime.substring(0, 5)}-{alloc.endTime.substring(0, 5)}
                                      </span>
                                    </div>

                                    <div className="text-[9px] font-bold truncate">
                                      {allocTask?.title || 'Tarefa'}
                                    </div>

                                    <div className="flex items-center justify-between text-[8px] text-slate-500 mt-0.5">
                                      <span className="truncate flex items-center gap-0.5 font-medium">
                                        <Users className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                        {resourceUser?.name?.split(' ')[0] || 'Técnico'}
                                      </span>
                                      <span className="font-semibold text-slate-600 shrink-0">
                                        {formatHoursDisplay((alloc.durationMinutes || 0) / 60)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* 2. Tasks sem Planeamento Formal (Datas Legadas) */}
                          {unplannedTasksOnDay.length > 0 && (
                            <div className="space-y-1.5">
                              {unplannedTasksOnDay.map(task => {
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
                                    className={`p-1.5 bg-slate-50/80 border border-dashed border-slate-300 rounded-lg text-left shadow-2xs hover:border-slate-400 transition-colors ${canMoveTask ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                                    title={`Tarefa sem planeamento formal: ${task.title}\nEstado: ${getTaskStatusName(task.statusId, taskStatuses)}\nClique para ver detalhes ou criar planeamento.`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openTaskDetailsModal(task);
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                      <span className="text-[7.5px] font-bold uppercase tracking-wider px-1 py-0.2 rounded bg-slate-200 text-slate-600">
                                        Não Planeada
                                      </span>
                                    </div>

                                    <div className="text-[9px] font-bold text-slate-700 truncate mb-1 flex items-center gap-1">
                                      {(getTaskTypeName(task.taskTypeId, taskTypes).toLowerCase().includes('lembrete') || getTaskTypeName(task.taskTypeId, taskTypes).toLowerCase().includes('marco')) && <Flag className="w-2.5 h-2.5 text-purple-600 shrink-0" />}
                                      <span className="truncate">{task.title}</span>
                                    </div>

                                    {/* Assignees initials list */}
                                    <div className="flex flex-wrap gap-1">
                                      {task.assigneeIds && task.assigneeIds.length > 0 ? (
                                        task.assigneeIds.map(uid => {
                                          const user = users.find(u => u.id === uid);
                                          const name = user ? user.name : 'Técnico';
                                          const initials = getInitials(name);
                                          return (
                                            <span 
                                              key={uid}
                                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase border bg-white text-slate-600 border-slate-200"
                                              title={`Alocado legado: ${name}`}
                                            >
                                              {initials}
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

                          {/* Empty space when no events, allocations, or tasks */}
                          {!isProjStart && !isProjDelivery && !isProjEstimated && !isProjScheduled && projAllocationsOnDay.length === 0 && unplannedTasksOnDay.length === 0 && (
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

  const renderResourceCapacityMatrixTable = (isFullscreen = false) => {
    const isKPIFilterActive = resourceOperationalFilter !== 'all';

    return (
      <div className="space-y-2.5">
        {/* FASE 23E-C3E: Compact Operational Results & Filter Indicator Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-800 uppercase text-[10px] tracking-wider">Planeamento Operacional</span>
            <span className="text-slate-300">•</span>
            {isKPIFilterActive ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 font-bold text-[11px]">
                  Filtro ativo: {getResourceOperationalFilterLabel(resourceOperationalFilter)}
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-bold text-slate-900 text-xs">
                  {filteredResources.length} {filteredResources.length === 1 ? 'recurso' : 'recursos'}
                </span>
              </>
            ) : (
              <span className="font-bold text-slate-800 text-xs">
                {filteredResources.length} {filteredResources.length === 1 ? 'recurso' : 'recursos'}
              </span>
            )}
          </div>

          {isKPIFilterActive && (
            <button
              type="button"
              id="btn-remove-kpi-filter"
              onClick={() => setResourceOperationalFilter('all')}
              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer flex items-center gap-1"
              title="Remover filtro KPI"
              aria-label="Remover filtro operacional de KPI"
            >
              <X className="w-3 h-3 text-blue-600" />
              <span>Remover filtro KPI</span>
            </button>
          )}
        </div>

        <div className={`bg-white rounded-2xl border border-slate-200 shadow-2xs relative ${
          isFullscreen ? 'h-full max-h-none overflow-auto' : 'sticky top-[57px] z-20 max-h-[calc(100vh-70px)] overflow-auto'
        }`}>
          <table className="w-full min-w-[1200px] border-collapse text-left table-fixed relative">
            <thead className="sticky top-0 z-20 bg-slate-50/90 border-b border-slate-200/80 shadow-2xs">
              <tr>
                <th className="w-72 p-3.5 text-[11px] uppercase tracking-wider font-bold text-slate-500 sticky top-0 left-0 z-30 bg-slate-50/95 border-r border-b border-slate-200/80 shadow-[2px_2px_5px_rgba(0,0,0,0.04)]">
                  Recurso / Técnico (Capacidade Diária)
                </th>
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
                    >
                      <div className="uppercase tracking-wider text-[9px] text-slate-400 font-medium">{weekday}</div>
                      <div className="text-xs font-black text-slate-800">{dayNum} {monthName}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredResources.length === 0 ? (
                <tr>
                  <td 
                    colSpan={timelineDays.length + 1} 
                    className="p-8 text-center text-slate-500 bg-slate-50/50"
                  >
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Users className="w-8 h-8 text-slate-300" />
                      <span className="text-xs font-bold text-slate-700">Nenhum técnico encontrado</span>
                      <span className="text-[11px] text-slate-500">
                        Nenhum recurso corresponde aos filtros operacionais ativos.
                      </span>
                      {hasActiveResourceFilters && (
                        <button
                          type="button"
                          onClick={handleClearResourceFilters}
                          className="mt-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          Limpar filtros operacionais
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredResources.map(user => {
                  const targetDateStr = timelineDays.some(d => formatDateToString(d) === todayStr)
                    ? todayStr
                    : formatDateToString(timelineDays[0]);

                  // Compute period totals for canonical summary
                  let periodCapMins = 0;
                  let periodConfMins = 0;
                  let periodDraftMins = 0;
                  let periodConfCount = 0;
                  let periodDraftCount = 0;

                  timelineDays.forEach(day => {
                    const dStr = formatDateToString(day);
                    const capDetail = (planningCapacity || []).find(c => c.resourceId === user.id && c.date === dStr);
                    periodCapMins += capDetail ? capDetail.operationalCapacityMinutes : 0;

                    const dayAllocs = planningAllocations.filter(a => a.resourceId === user.id && a.date === dStr && a.status !== 'CANCELLED');
                    dayAllocs.forEach(a => {
                      if (a.status === 'CONFIRMED') {
                        periodConfMins += (a.durationMinutes || 0);
                        periodConfCount++;
                      } else if (a.status === 'DRAFT') {
                        periodDraftMins += (a.durationMinutes || 0);
                        periodDraftCount++;
                      }
                    });
                  });

                  const periodPlanMins = periodConfMins + periodDraftMins;
                  const periodFreeMins = Math.max(0, periodCapMins - periodConfMins);
                  const periodExcessMins = Math.max(0, periodPlanMins - periodCapMins);

                  const resourceSummaryTooltip = `Recurso: ${user.name}\nPeríodo: ${startDateStr} a ${endDateStr} (${timelineDays.length} dias)\nCapacidade: ${formatHoursDisplay(periodCapMins / 60)}\nConfirmado: ${formatHoursDisplay(periodConfMins / 60)} (${periodConfCount} alocações)\nPlaneado: ${formatHoursDisplay(periodPlanMins / 60)}\nLivre: ${formatHoursDisplay(periodFreeMins / 60)}\nExcesso: ${formatHoursDisplay(periodExcessMins / 60)}\nCONFIRMED: ${periodConfCount} | DRAFT: ${periodDraftCount}\n\nClique para abrir o detalhe do recurso.`;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="p-3 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)] border-r border-slate-100">
                        <button
                          type="button"
                          id={`btn-resource-drilldown-${user.id}`}
                          onClick={() => handleOpenResourceDayDetail(user, targetDateStr)}
                          className="flex items-center gap-2 w-full text-left p-1.5 -m-1.5 rounded-xl hover:bg-slate-100/80 transition-colors cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          title={resourceSummaryTooltip}
                          aria-label={`Ver detalhe operacional de ${user.name}`}
                        >
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            {getInitials(user.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-700 transition-colors">{user.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">{user.email || user.type}</div>
                          </div>
                        </button>
                      </td>
                      {timelineDays.map(day => {
                        const dayStr = formatDateToString(day);
                        const capDetail = (planningCapacity || []).find(c => c.resourceId === user.id && c.date === dayStr);
                        const loadDetail = (planningResourceLoad || []).find(l => l.resourceId === user.id && l.date === dayStr);

                        const capMins = capDetail ? capDetail.operationalCapacityMinutes : 480;
                        const confirmedMins = capDetail ? capDetail.confirmedAllocationMinutes : (loadDetail ? loadDetail.plannedMinutes : 0);
                        const isOver = capDetail ? capDetail.overAllocatedMinutes > 0 : confirmedMins > capMins;
                        const isZeroCap = capMins === 0;

                        const isSelectedCell = selectedResourceDay?.resource?.id === user.id && selectedResourceDay?.dateStr === dayStr;
                        const dayAllocCount = planningAllocations.filter(a => a.resourceId === user.id && a.date === dayStr && a.status !== 'CANCELLED').length;

                        return (
                          <td key={dayStr} className="p-1.5 border-l border-slate-100 text-center align-middle">
                            <button
                              type="button"
                              id={`btn-matrix-cell-${user.id}-${dayStr}`}
                              onClick={() => handleOpenResourceDayDetail(user, dayStr)}
                              className={`w-full p-1.5 rounded-lg border text-[10px] text-center transition-all cursor-pointer select-none hover:shadow-xs hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                                isSelectedCell ? 'ring-2 ring-blue-600 border-blue-500 shadow-xs' : ''
                              } ${
                                isZeroCap 
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200/60' 
                                  : isOver 
                                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100/70 hover:border-amber-400' 
                                  : confirmedMins > 0 
                                  ? 'bg-blue-50/60 border-blue-200 text-blue-900 hover:bg-blue-100/70 hover:border-blue-300' 
                                  : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                              }`}
                              title={`Ver detalhe operacional de ${user.name} em ${dayStr}`}
                            >
                              <div className="font-bold flex items-center justify-center gap-1">
                                <span>{isZeroCap ? 'Indisponível' : formatHoursDisplay(confirmedMins / 60)}</span>
                                {dayAllocCount > 0 && !isZeroCap && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block shrink-0" title={`${dayAllocCount} alocação(ões)`} />
                                )}
                              </div>
                              <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                                Cap: {formatHoursDisplay(capMins / 60)}
                              </div>
                            </button>
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
    );
  };

  // FASE 23E-C3D: Visual Bar for Operational Planning KPIs with Interactive Filters
  const renderOperationalKPIsBar = (isFullscreen = false) => {
    return (
      <div 
        id={isFullscreen ? 'operational-kpis-bar-fullscreen' : 'operational-kpis-bar'}
        role="region"
        aria-label="Indicadores de planeamento operacional"
        className={`bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs ${
          isFullscreen ? 'shrink-0' : ''
        }`}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5 text-left">
          {/* 1. Capacidade */}
          <button
            type="button"
            id={isFullscreen ? 'kpi-total-capacity-fs' : 'kpi-total-capacity'}
            onClick={() => handleKPIClick('with_capacity')}
            aria-pressed={resourceOperationalFilter === 'with_capacity'}
            aria-label={`Filtrar por Capacidade: ${operationalKPIs.totalCapacityHours.toFixed(1)} horas`}
            title={`Filtrar por Capacidade > 0 (${resourceOperationalFilter === 'with_capacity' ? 'Clique para remover filtro' : 'Clique para aplicar filtro'})`}
            className={`flex flex-col justify-center px-3 py-2 border rounded-xl transition-all text-left cursor-pointer ${
              resourceOperationalFilter === 'with_capacity'
                ? 'bg-slate-100 border-slate-700 text-slate-950 ring-2 ring-slate-800 shadow-xs font-bold scale-[1.01]'
                : 'bg-slate-50/90 border-slate-200 text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Capacidade
              </span>
              {resourceOperationalFilter === 'with_capacity' && (
                <span className="text-[9px] font-extrabold text-slate-800 bg-slate-200 px-1 py-0.2 rounded-xs">Ativo</span>
              )}
            </div>
            <span className="text-sm font-extrabold text-slate-900 mt-0.5">
              {operationalKPIs.totalCapacityHours.toFixed(1)}h
            </span>
          </button>

          {/* 2. Confirmado */}
          <button
            type="button"
            id={isFullscreen ? 'kpi-total-confirmed-fs' : 'kpi-total-confirmed'}
            onClick={() => handleKPIClick('has_confirmed')}
            aria-pressed={resourceOperationalFilter === 'has_confirmed'}
            aria-label={`Filtrar por Confirmado: ${operationalKPIs.totalConfirmedHours.toFixed(1)} horas`}
            title={`Filtrar por recursos com alocações CONFIRMED (${resourceOperationalFilter === 'has_confirmed' ? 'Clique para remover filtro' : 'Clique para aplicar filtro'})`}
            className={`flex flex-col justify-center px-3 py-2 border rounded-xl transition-all text-left cursor-pointer ${
              resourceOperationalFilter === 'has_confirmed'
                ? 'bg-blue-100 border-blue-600 text-blue-950 ring-2 ring-blue-600 shadow-xs font-bold scale-[1.01]'
                : 'bg-blue-50/70 border-blue-200 text-blue-950 hover:bg-blue-100/70'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                Confirmado
              </span>
              {resourceOperationalFilter === 'has_confirmed' && (
                <span className="text-[9px] font-extrabold text-blue-800 bg-blue-200 px-1 py-0.2 rounded-xs">Ativo</span>
              )}
            </div>
            <span className="text-sm font-extrabold text-blue-950 mt-0.5">
              {operationalKPIs.totalConfirmedHours.toFixed(1)}h
            </span>
          </button>

          {/* 3. Planeado */}
          <button
            type="button"
            id={isFullscreen ? 'kpi-total-planned-fs' : 'kpi-total-planned'}
            onClick={() => handleKPIClick('has_planned')}
            aria-pressed={resourceOperationalFilter === 'has_planned'}
            aria-label={`Filtrar por Planeado: ${operationalKPIs.totalPlannedHours.toFixed(1)} horas`}
            title={`Filtrar por recursos com CONFIRMED ou DRAFT (${resourceOperationalFilter === 'has_planned' ? 'Clique para remover filtro' : 'Clique para aplicar filtro'})`}
            className={`flex flex-col justify-center px-3 py-2 border rounded-xl transition-all text-left cursor-pointer ${
              resourceOperationalFilter === 'has_planned'
                ? 'bg-indigo-100 border-indigo-600 text-indigo-950 ring-2 ring-indigo-600 shadow-xs font-bold scale-[1.01]'
                : 'bg-indigo-50/70 border-indigo-200 text-indigo-950 hover:bg-indigo-100/70'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                Planeado
              </span>
              {resourceOperationalFilter === 'has_planned' && (
                <span className="text-[9px] font-extrabold text-indigo-800 bg-indigo-200 px-1 py-0.2 rounded-xs">Ativo</span>
              )}
            </div>
            <span className="text-sm font-extrabold text-indigo-950 mt-0.5">
              {operationalKPIs.totalPlannedHours.toFixed(1)}h
            </span>
          </button>

          {/* 4. Livre */}
          <button
            type="button"
            id={isFullscreen ? 'kpi-total-free-fs' : 'kpi-total-free'}
            onClick={() => handleKPIClick('has_free')}
            aria-pressed={resourceOperationalFilter === 'has_free'}
            aria-label={`Filtrar por Livre: ${operationalKPIs.totalFreeHours.toFixed(1)} horas`}
            title={`Filtrar por recursos com capacidade livre (${resourceOperationalFilter === 'has_free' ? 'Clique para remover filtro' : 'Clique para aplicar filtro'})`}
            className={`flex flex-col justify-center px-3 py-2 border rounded-xl transition-all text-left cursor-pointer ${
              resourceOperationalFilter === 'has_free'
                ? 'bg-emerald-100 border-emerald-600 text-emerald-950 ring-2 ring-emerald-600 shadow-xs font-bold scale-[1.01]'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-950 hover:bg-emerald-100/70'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                Livre
              </span>
              {resourceOperationalFilter === 'has_free' && (
                <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-200 px-1 py-0.2 rounded-xs">Ativo</span>
              )}
            </div>
            <span className="text-sm font-extrabold text-emerald-950 mt-0.5">
              {operationalKPIs.totalFreeHours.toFixed(1)}h
            </span>
          </button>

          {/* 5. Excesso */}
          <button
            type="button"
            id={isFullscreen ? 'kpi-total-excess-fs' : 'kpi-total-excess'}
            onClick={() => handleKPIClick('overloaded')}
            aria-pressed={resourceOperationalFilter === 'overloaded'}
            aria-label={`Filtrar por Excesso: ${operationalKPIs.totalExcessHours.toFixed(1)} horas`}
            title={`Filtrar por recursos com excesso de carga (${resourceOperationalFilter === 'overloaded' ? 'Clique para remover filtro' : 'Clique para aplicar filtro'})`}
            className={`flex flex-col justify-center px-3 py-2 border rounded-xl transition-all text-left cursor-pointer ${
              resourceOperationalFilter === 'overloaded'
                ? 'bg-rose-100 border-rose-600 text-rose-950 ring-2 ring-rose-600 shadow-xs font-bold scale-[1.01]'
                : operationalKPIs.totalExcessHours > 0
                  ? 'bg-rose-50 border-rose-200 text-rose-950 hover:bg-rose-100/70'
                  : 'bg-slate-50/90 border-slate-200 text-slate-800 hover:bg-slate-100/80'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                operationalKPIs.totalExcessHours > 0 || resourceOperationalFilter === 'overloaded'
                  ? 'text-rose-700'
                  : 'text-slate-500'
              }`}>
                Excesso
              </span>
              {resourceOperationalFilter === 'overloaded' && (
                <span className="text-[9px] font-extrabold text-rose-800 bg-rose-200 px-1 py-0.2 rounded-xs">Ativo</span>
              )}
            </div>
            <span className={`text-sm font-extrabold mt-0.5 ${
              operationalKPIs.totalExcessHours > 0 || resourceOperationalFilter === 'overloaded'
                ? 'text-rose-950'
                : 'text-slate-900'
            }`}>
              {operationalKPIs.totalExcessHours.toFixed(1)}h
            </span>
          </button>

          {/* 6. Sobrecarregados */}
          <button
            type="button"
            id={isFullscreen ? 'kpi-overloaded-resources-fs' : 'kpi-overloaded-resources'}
            onClick={() => handleKPIClick('overloaded')}
            aria-pressed={resourceOperationalFilter === 'overloaded'}
            aria-label={`Filtrar por Sobrecarregados: ${operationalKPIs.overloadedResourcesCount} recursos`}
            title={`Filtrar por recursos sobrecarregados (${resourceOperationalFilter === 'overloaded' ? 'Clique para remover filtro' : 'Clique para aplicar filtro'})`}
            className={`flex flex-col justify-center px-3 py-2 border rounded-xl transition-all text-left cursor-pointer ${
              resourceOperationalFilter === 'overloaded'
                ? 'bg-amber-100 border-amber-600 text-amber-950 ring-2 ring-amber-600 shadow-xs font-bold scale-[1.01]'
                : operationalKPIs.overloadedResourcesCount > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-950 hover:bg-amber-100/70'
                  : 'bg-slate-50/90 border-slate-200 text-slate-800 hover:bg-slate-100/80'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                operationalKPIs.overloadedResourcesCount > 0 || resourceOperationalFilter === 'overloaded'
                  ? 'text-amber-700'
                  : 'text-slate-500'
              }`}>
                Sobrecarregados
              </span>
              {resourceOperationalFilter === 'overloaded' && (
                <span className="text-[9px] font-extrabold text-amber-800 bg-amber-200 px-1 py-0.2 rounded-xs">Ativo</span>
              )}
            </div>
            <span className={`text-sm font-extrabold mt-0.5 ${
              operationalKPIs.overloadedResourcesCount > 0 || resourceOperationalFilter === 'overloaded'
                ? 'text-amber-950'
                : 'text-slate-900'
            }`}>
              {operationalKPIs.overloadedResourcesCount}
            </span>
          </button>

          {/* 7. Sem Confirmado */}
          <button
            type="button"
            id={isFullscreen ? 'kpi-no-confirmed-resources-fs' : 'kpi-no-confirmed-resources'}
            onClick={() => handleKPIClick('no_confirmed')}
            aria-pressed={resourceOperationalFilter === 'no_confirmed'}
            aria-label={`Filtrar por Sem Confirmado: ${operationalKPIs.noConfirmedResourcesCount} recursos`}
            title={`Filtrar por recursos sem alocações CONFIRMED (${resourceOperationalFilter === 'no_confirmed' ? 'Clique para remover filtro' : 'Clique para aplicar filtro'})`}
            className={`flex flex-col justify-center px-3 py-2 border rounded-xl transition-all text-left cursor-pointer ${
              resourceOperationalFilter === 'no_confirmed'
                ? 'bg-slate-200 border-slate-600 text-slate-950 ring-2 ring-slate-700 shadow-xs font-bold scale-[1.01]'
                : 'bg-slate-50/90 border-slate-200 text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Sem Confirmado
              </span>
              {resourceOperationalFilter === 'no_confirmed' && (
                <span className="text-[9px] font-extrabold text-slate-800 bg-slate-300 px-1 py-0.2 rounded-xs">Ativo</span>
              )}
            </div>
            <span className="text-sm font-extrabold text-slate-900 mt-0.5">
              {operationalKPIs.noConfirmedResourcesCount}
            </span>
          </button>

          {/* 8. Com DRAFT */}
          <button
            type="button"
            id={isFullscreen ? 'kpi-with-draft-resources-fs' : 'kpi-with-draft-resources'}
            onClick={() => handleKPIClick('with_draft')}
            aria-pressed={resourceOperationalFilter === 'with_draft'}
            aria-label={`Filtrar por Com DRAFT: ${operationalKPIs.withDraftResourcesCount} recursos`}
            title={`Filtrar por recursos com alocações DRAFT (${resourceOperationalFilter === 'with_draft' ? 'Clique para remover filtro' : 'Clique para aplicar filtro'})`}
            className={`flex flex-col justify-center px-3 py-2 border rounded-xl transition-all text-left cursor-pointer ${
              resourceOperationalFilter === 'with_draft'
                ? 'bg-amber-100 border-amber-500 text-amber-950 ring-2 ring-amber-500 shadow-xs font-bold scale-[1.01]'
                : operationalKPIs.withDraftResourcesCount > 0
                  ? 'bg-amber-50/60 border-amber-200 text-amber-950 hover:bg-amber-100/70'
                  : 'bg-slate-50/90 border-slate-200 text-slate-800 hover:bg-slate-100/80'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                operationalKPIs.withDraftResourcesCount > 0 || resourceOperationalFilter === 'with_draft'
                  ? 'text-amber-700'
                  : 'text-slate-500'
              }`}>
                Com DRAFT
              </span>
              {resourceOperationalFilter === 'with_draft' && (
                <span className="text-[9px] font-extrabold text-amber-800 bg-amber-200 px-1 py-0.2 rounded-xs">Ativo</span>
              )}
            </div>
            <span className={`text-sm font-extrabold mt-0.5 ${
              operationalKPIs.withDraftResourcesCount > 0 || resourceOperationalFilter === 'with_draft'
                ? 'text-amber-950'
                : 'text-slate-900'
            }`}>
              {operationalKPIs.withDraftResourcesCount}
            </span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* TIMELINE CONTROL HEADER */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        {/* Row 0: Full width Title, Subtitle and View Mode Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-4 w-full">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Linha de tempo & Capacidade de Recursos
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Planeamento diário de projetos, tarefas, técnicos e carga operacional.
            </p>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setCalendarViewMode('projects')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                calendarViewMode === 'projects'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              📅 Vista de Projetos
            </button>
            <button
              type="button"
              onClick={() => setCalendarViewMode('resources')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                calendarViewMode === 'resources'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              👥 Capacidade de Recursos
            </button>
          </div>
        </div>

        {/* Row 1: Filters */}
        {calendarViewMode === 'resources' ? (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
            {/* Technician Text Search */}
            <div className="relative min-w-[200px] max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                id="input-technician-search"
                value={technicianSearch}
                onChange={(e) => setTechnicianSearch(e.target.value)}
                placeholder="Pesquisar técnico..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                aria-label="Pesquisar técnico por nome ou email"
              />
              {technicianSearch && (
                <button
                  type="button"
                  id="btn-clear-technician-search"
                  onClick={() => setTechnicianSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  title="Limpar pesquisa"
                  aria-label="Limpar pesquisa"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter: Resource / Operational State */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500">Recurso:</span>
              <select
                id="select-resource-filter"
                value={resourceOperationalFilter}
                onChange={(e) => setResourceOperationalFilter(e.target.value as ResourceOperationalFilter)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
                aria-label="Filtrar por estado operacional do recurso"
              >
                <option value="all">Todos</option>
                <option value="with_capacity">Com capacidade</option>
                <option value="no_capacity">Sem capacidade</option>
                <option value="overloaded">Sobrecarregados / Excesso</option>
                <option value="has_confirmed">Com confirmado</option>
                <option value="no_confirmed">Sem confirmado</option>
                <option value="has_planned">Com planeado</option>
                <option value="has_free">Com capacidade livre</option>
                <option value="with_draft">Com DRAFT</option>
              </select>
            </div>

            {/* Filter: Project */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500">Projeto:</span>
              <select
                id="select-project-filter"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer max-w-[200px] truncate"
                aria-label="Filtrar por projeto"
              >
                <option value="">Todos os projetos</option>
                {availableProjects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter: Project Leader */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500">Leader:</span>
              <select
                id="select-leader-filter"
                value={leaderFilter}
                onChange={(e) => setLeaderFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer max-w-[180px] truncate"
                aria-label="Filtrar por Project Leader"
              >
                <option value="">Todos os líderes</option>
                {projectLeaders.map(leader => (
                  <option key={leader.id} value={leader.id}>
                    {leader.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter: Allocation Status */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500">Estado:</span>
              <select
                id="select-allocation-status-filter"
                value={allocationStatusFilter}
                onChange={(e) => setAllocationStatusFilter(e.target.value as AllocationStatusFilter)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
                aria-label="Filtrar por estado da alocação"
              >
                <option value="all">Todos os estados</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="DRAFT">DRAFT</option>
              </select>
            </div>

            {/* Clear Filters button */}
            {hasActiveResourceFilters && (
              <button
                type="button"
                id="btn-clear-resource-filters"
                onClick={handleClearResourceFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-200"
                title="Limpar todos os filtros operacionais"
                aria-label="Limpar filtros operacionais"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Limpar filtros</span>
              </button>
            )}
          </div>
        ) : (
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

            {/* Planning Allocations Filters (FASE 23C) */}
            <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
              <input 
                type="checkbox"
                checked={showCancelledAllocations}
                onChange={e => setShowCancelledAllocations(e.target.checked)}
                className="w-3.5 h-3.5 text-slate-600 rounded border-slate-300 focus:ring-slate-500"
              />
              <span>Mostrar alocações canceladas</span>
            </label>

            <button
              type="button"
              onClick={() => setShowUnplannedDrawer(!showUnplannedDrawer)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                showUnplannedDrawer
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Ver lista de tarefas que ainda não possuem blocos de planeamento no motor"
            >
              <Layers className="w-3.5 h-3.5 text-amber-600" />
              <span>Não planeadas ({unplannedTasks.length})</span>
            </button>
          </div>
        )}

        {/* Row 2: Navigation & Fullscreen */}
        {calendarViewMode === 'resources' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            {/* Quick Period Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 mr-1">Período:</span>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  id="btn-period-today"
                  onClick={() => handleSelectOperationalPeriod('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    operationalPeriod === 'today'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                  aria-pressed={operationalPeriod === 'today'}
                  aria-label="Ver período de Hoje (1 dia)"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  id="btn-period-tomorrow"
                  onClick={() => handleSelectOperationalPeriod('tomorrow')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    operationalPeriod === 'tomorrow'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                  aria-pressed={operationalPeriod === 'tomorrow'}
                  aria-label="Ver período de Amanhã (1 dia)"
                >
                  Amanhã
                </button>
                <button
                  type="button"
                  id="btn-period-7days"
                  onClick={() => handleSelectOperationalPeriod('7days')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    operationalPeriod === '7days'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                  aria-pressed={operationalPeriod === '7days'}
                  aria-label="Ver período dos Próximos 7 dias"
                >
                  Próximos 7 dias
                </button>
                <button
                  type="button"
                  id="btn-period-14days"
                  onClick={() => handleSelectOperationalPeriod('14days')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    operationalPeriod === '14days'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                  aria-pressed={operationalPeriod === '14days'}
                  aria-label="Ver período dos Próximos 14 dias"
                >
                  Próximos 14 dias
                </button>
              </div>
            </div>

            {/* Navigation & Fullscreen */}
            <div className="flex items-center gap-3">
              {/* Date Shifting */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
                <button 
                  type="button"
                  id="btn-nav-prev"
                  onClick={shiftPrev}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  title={
                    operationalPeriod === 'today' || operationalPeriod === 'tomorrow'
                      ? 'Dia anterior'
                      : operationalPeriod === '7days'
                      ? 'Retroceder 7 dias'
                      : 'Retroceder 14 dias'
                  }
                  aria-label="Período anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  type="button"
                  id="btn-nav-today"
                  onClick={jumpToToday}
                  className="px-2.5 py-1 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  aria-label="Ir para a data atual"
                >
                  Hoje
                </button>
                <button 
                  type="button"
                  id="btn-nav-next"
                  onClick={shiftNext}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  title={
                    operationalPeriod === 'today' || operationalPeriod === 'tomorrow'
                      ? 'Dia seguinte'
                      : operationalPeriod === '7days'
                      ? 'Avançar 7 dias'
                      : 'Avançar 14 dias'
                  }
                  aria-label="Período seguinte"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Ecrã Cheio Button */}
              <button
                type="button"
                onClick={() => setIsTimelineFullscreen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
                title="Abrir matriz de capacidade em ecrã cheio"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Ecrã cheio</span>
              </button>
            </div>
          </div>
        ) : (
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
        )}

        {/* Date Window Info Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/50 border border-blue-100/50 rounded-xl p-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <span>
              {startDateStr === endDateStr ? (
                `Data: ${new Date(startDateStr + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`
              ) : (
                `De ${new Date(startDateStr + 'T00:00:00').toLocaleDateString('pt-PT')} a ${new Date(endDateStr + 'T00:00:00').toLocaleDateString('pt-PT')} (${timelineDays.length} dias)`
              )}
            </span>
            {calendarViewMode === 'resources' && (
              <span className="ml-1 px-2 py-0.5 rounded-md bg-blue-100/80 text-blue-800 font-bold text-[11px]">
                {filteredResources.length} de {activeUsers.length} técnicos
              </span>
            )}
            {(planningLoading || planningCapacityLoading) && (
              <span className="text-[10px] text-blue-600 animate-pulse font-bold">
                (A carregar alocações...)
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-[10px] font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-blue-600 rounded-sm" />
              Alocação Confirmada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-amber-300 border border-amber-500 border-dashed rounded-sm" />
              Alocação Rascunho (Draft)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-slate-200 border border-slate-400 border-dashed rounded-sm" />
              Não Planeada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
              Adjudicação
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
              Entrega
            </span>
          </div>
        </div>

        {/* Unplanned Tasks Drawer / Panel (FASE 23C) */}
        {showUnplannedDrawer && (
          <div className="mt-3 p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-600" />
                <h4 className="text-xs font-bold text-amber-950">
                  Tarefas Sem Planeamento Formal ({unplannedTasks.length})
                </h4>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  Tarefas que ainda não possuem blocos temporais alocados a recursos
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowUnplannedDrawer(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            {unplannedTasks.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Todas as tarefas ativas possuem blocos de planeamento.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                {unplannedTasks.map(t => {
                  const proj = projects.find(p => p.id === t.projectId);
                  return (
                    <div
                      key={t.id}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs hover:border-blue-300 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800 truncate" title={t.title}>
                          {t.title}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {proj?.title || 'Sem projeto'} {t.estimatedHours ? `• Est: ${t.estimatedHours}h` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTaskForPlanning(t);
                          setSelectedAllocationForEdit(null);
                          setIsPlanningModalOpen(true);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shrink-0 cursor-pointer"
                      >
                        + Planear
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* OPERATIONAL KPIS BAR (FASE 23E-C3B) */}
      {calendarViewMode === 'resources' && renderOperationalKPIsBar()}

      {/* TIMELINE MATRIX BOARD OR RESOURCE CAPACITY MATRIX */}
      {calendarViewMode === 'resources' ? renderResourceCapacityMatrixTable() : renderTimelineMatrixTable(paginatedProjects)}

      {/* FOOTER LEGEND INFO */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs text-xs text-slate-500 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <span className="font-semibold flex items-center gap-1.5">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
          Como ler a linha de tempo & planeamento:
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-8 font-medium">
          <div className="flex items-start gap-2">
            <span className="w-3 h-3 rounded bg-blue-600 text-white inline-flex items-center justify-center text-[7px] font-black shrink-0 mt-0.5">
              CONF
            </span>
            <span>
              <strong>CONFIRMED:</strong> Reserva confirmada que consome capacidade na agenda do técnico.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-3 h-3 rounded bg-amber-200 border border-dashed border-amber-400 text-amber-900 inline-flex items-center justify-center text-[7px] font-black shrink-0 mt-0.5">
              DRAFT
            </span>
            <span>
              <strong>DRAFT:</strong> Reserva em rascunho. Visível no calendário, mas <em>não</em> consome capacidade formal.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-3 h-3 rounded bg-slate-200 border border-dashed border-slate-400 text-slate-700 inline-flex items-center justify-center text-[7px] font-bold shrink-0 mt-0.5">
              NP
            </span>
            <span>
              <strong>Não Planeada:</strong> Tarefa com datas indicativas mas sem blocos de recurso formalizados.
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
        // Planning Allocations Props (FASE 23C)
        planningAllocations={planningAllocations}
        createPlanningAllocation={createPlanningAllocation}
        updatePlanningAllocation={updatePlanningAllocation}
        cancelPlanningAllocation={cancelPlanningAllocation}
        deletePlanningAllocation={deletePlanningAllocation}
      />

      {/* Resource Daily Detail Modal (FASE 23E-A & 23E-B) */}
      {selectedResourceDay && (
        <ResourceDayDetailModal
          isOpen={!!selectedResourceDay}
          onClose={() => setSelectedResourceDay(null)}
          resource={selectedResourceDay.resource}
          dateStr={selectedResourceDay.dateStr}
          capacityDetail={planningCapacity.find(
            c => c.resourceId === selectedResourceDay.resource.id && c.date === selectedResourceDay.dateStr
          )}
          loadDetail={planningResourceLoad.find(
            l => l.resourceId === selectedResourceDay.resource.id && l.date === selectedResourceDay.dateStr
          )}
          allocations={planningAllocations}
          tasks={tasks}
          projects={projects}
          users={users}
          userAbsences={userAbsences}
          onNewAllocation={handleNewAllocationFromDayDetail}
          onEditAllocation={handleEditAllocationFromDayDetail}
          onConfirmAllocation={async (id, version) => updatePlanningAllocation(id, { status: 'CONFIRMED', version })}
          onCancelAllocation={cancelPlanningAllocation}
          onDeleteAllocation={deletePlanningAllocation}
          onViewTask={handleViewTaskFromDayDetail}
          onSelectProject={onSelectProject}
          canWriteCalendar={canWriteCalendar}
        />
      )}

      {/* Planning Allocation Modal (FASE 23C & 23E-A & 23E-B) */}
      {isPlanningModalOpen && (
        <PlanningAllocationModal
          isOpen={isPlanningModalOpen}
          onClose={() => {
            setIsPlanningModalOpen(false);
            setSelectedAllocationForEdit(null);
            setSelectedTaskForPlanning(null);
            setPlanningInitialResourceId('');
            setPlanningInitialDate('');
          }}
          task={selectedTaskForPlanning}
          tasks={tasks}
          projects={projects}
          allocation={selectedAllocationForEdit}
          users={users}
          initialResourceId={planningInitialResourceId}
          initialDate={planningInitialDate}
          contextCapacity={activeDayCapacity}
          createPlanningAllocation={createPlanningAllocation}
          updatePlanningAllocation={updatePlanningAllocation}
          cancelPlanningAllocation={cancelPlanningAllocation}
          deletePlanningAllocation={deletePlanningAllocation}
        />
      )}

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

              {calendarViewMode === 'resources' ? (
                <div className="flex flex-wrap items-center gap-3">
                  {/* Quick Period Buttons */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleSelectOperationalPeriod('today')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        operationalPeriod === 'today'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectOperationalPeriod('tomorrow')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        operationalPeriod === 'tomorrow'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      Amanhã
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectOperationalPeriod('7days')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        operationalPeriod === '7days'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      7 dias
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectOperationalPeriod('14days')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        operationalPeriod === '14days'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      14 dias
                    </button>
                  </div>

                  <span className="px-2 py-0.5 rounded-md bg-blue-100/80 text-blue-800 font-bold text-xs">
                    {filteredResources.length} de {activeUsers.length} técnicos
                  </span>

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
              ) : (
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
              )}
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-4 overflow-hidden bg-slate-100/50 flex flex-col gap-3">
              {calendarViewMode === 'resources' && renderOperationalKPIsBar(true)}
              <div className="flex-1 overflow-hidden">
                {calendarViewMode === 'resources' ? renderResourceCapacityMatrixTable(true) : renderTimelineMatrixTable(paginatedProjects, true)}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
