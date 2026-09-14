'use client';

import React, { useState, useEffect } from 'react';
import { Project, Client, Comment, Task, TaskType, DefaultTask, UserAbsence, ProjectMaterial, ProjectRiskItem, RiskCategory, RiskStatus, RiskPriority } from '../lib/types';
import { 
  Plus, Search, Edit2, Trash2, ArrowLeft, Calendar, FileText, 
  Sparkles, DollarSign, Users, ShieldAlert, PlusCircle, MessageSquare, ListTodo, CheckSquare, BrainCircuit,
  X, Clock, ChevronLeft, ChevronRight, AlertTriangle, AlertCircle, Info, Flag, Maximize2, Link2, UserCheck, Check,
  Package, Truck, CheckCircle2, Boxes, Tag, ShoppingBag, BarChart3
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { AssigneeSelector } from './AssigneeSelector';
import TaskDetailsModal from './TaskDetailsModal';

import { hasPermission } from '../lib/permissions';
import { stringToUUID } from '../lib/supabaseSync';
import { getProjectCalculatedRisk, getTaskStatusName, getDefaultTaskStatusId, matchTaskStatusId, getTaskTypeName, getDefaultTaskTypeId, checkTaskSchedulingConflicts, stripSecondsFromHours, formatToOnlyHours } from '../lib/utils';

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

const calculateSuggestedReviewDate = (prob: number, imp: number, identDateStr: string) => {
  const score = (prob || 1) * (imp || 1);
  let base = identDateStr ? new Date(identDateStr + 'T00:00:00') : new Date();
  if (isNaN(base.getTime())) base = new Date();
  let days = 30;
  if (score >= 16) days = 7;
  else if (score >= 11) days = 14;
  else if (score >= 6) days = 30;
  else days = 60;
  base.setDate(base.getDate() + days);
  return base.toISOString().split('T')[0];
};

const materialDebounceTimersMap = new Map<string, NodeJS.Timeout>();

interface ProjectSectionProps {
  projects: Project[];
  clients: Client[];
  users: any[];
  tasks: Task[];
  comments: Comment[];
  absences?: UserAbsence[];
  projectStatuses: any[];
  projectCategories: any[];
  projectRisks: any[];
  projectPriorities: any[];
  projectTeams: any[];
  projectPartners: any[];
  addProject: (p: any) => any;
  updateProject: (id: string, updates: any) => void;
  deleteProject: (id: string) => void;
  addClient: (c: any) => any;
  addComment: (projectId: string, authorId: string, text: string) => void;
  deleteComment: (id: string) => void;
  addTask: (task: any) => any;
  addTasks?: (tasks: any[]) => any[];
  updateTask: (id: string, updates: any) => void;
  taskStatuses: any[];
  taskTypes?: TaskType[];
  specialDays?: any[];
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  defaultTasks?: DefaultTask[];
  appConfig?: any;
  currentUser?: any;
  userGroups?: any[];
  projectMaterials?: ProjectMaterial[];
  addProjectMaterial?: (pm: any) => void;
  updateProjectMaterial?: (id: string, updates: any) => void;
  deleteProjectMaterial?: (id: string) => void;
  projectRiskItems?: ProjectRiskItem[];
  riskCategories?: RiskCategory[];
  riskStatuses?: RiskStatus[];
  riskPriorities?: RiskPriority[];
  addProjectRiskItem?: (item: any) => void;
  updateProjectRiskItem?: (id: string, updates: any) => void;
  deleteProjectRiskItem?: (id: string) => void;
}

export default function ProjectSection({
  projects,
  clients,
  users,
  tasks,
  comments,
  absences = [],
  projectStatuses,
  projectCategories,
  projectRisks,
  projectPriorities,
  projectTeams,
  projectPartners,
  addProject,
  updateProject,
  deleteProject,
  addClient,
  addComment,
  deleteComment,
  addTask,
  addTasks,
  updateTask,
  taskStatuses,
  taskTypes = [],
  specialDays = [],
  selectedProjectId,
  setSelectedProjectId,
  defaultTasks = [],
  appConfig,
  currentUser,
  userGroups = [],
  projectMaterials = [],
  addProjectMaterial,
  updateProjectMaterial,
  deleteProjectMaterial,
  projectRiskItems = [],
  riskCategories = [],
  riskStatuses = [],
  riskPriorities = [],
  addProjectRiskItem,
  updateProjectRiskItem,
  deleteProjectRiskItem,
}: ProjectSectionProps) {
  const canReadProjects = hasPermission(currentUser, 'projects_read', userGroups);
  const canWriteProjects = hasPermission(currentUser, 'projects_write', userGroups);
  const canDeleteProjects = hasPermission(currentUser, 'projects_delete', userGroups);

  const canReadTasks = hasPermission(currentUser, 'tasks_read', userGroups);
  const canWriteTasks = hasPermission(currentUser, 'tasks_write', userGroups);
  const canDeleteTasks = hasPermission(currentUser, 'tasks_delete', userGroups);
  
  // Tab state inside project view: 'geral' | 'tarefas' | 'material' | 'riscos' | 'analise'
  const [activeDetailTab, setActiveDetailTab] = useState<'geral' | 'tarefas' | 'material' | 'riscos' | 'analise'>('geral');

  // Risk Form State
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [riskTitle, setRiskTitle] = useState('');
  const [riskCategoryId, setRiskCategoryId] = useState('');
  const [riskIdentificationDate, setRiskIdentificationDate] = useState(new Date().toISOString().split('T')[0]);
  const [riskOwnerId, setRiskOwnerId] = useState('');
  const [riskDescription, setRiskDescription] = useState('');
  const [riskConsequence, setRiskConsequence] = useState('');
  const [riskProbability, setRiskProbability] = useState<number>(3);
  const [riskImpact, setRiskImpact] = useState<number>(3);
  const [riskMitigationPlan, setRiskMitigationPlan] = useState('');
  const [riskContingencyPlan, setRiskContingencyPlan] = useState('');
  const [riskReviewDate, setRiskReviewDate] = useState('');
  const [riskStatusId, setRiskStatusId] = useState('');
  const [riskPriorityId, setRiskPriorityId] = useState('');

  const [riskSearchQuery, setRiskSearchQuery] = useState('');
  const [riskFilterCategory, setRiskFilterCategory] = useState('');
  const [riskFilterStatus, setRiskFilterStatus] = useState('');
  const [expandedRiskId, setExpandedRiskId] = useState<string | null>(null);

  // Material Form State
  const [matDesc, setMatDesc] = useState('');
  const [matSupplier, setMatSupplier] = useState('');
  const [matQty, setMatQty] = useState<number>(1);
  const [matRef, setMatRef] = useState('');
  const [matBudget, setMatBudget] = useState<string>('');
  const [matCostPrice, setMatCostPrice] = useState<number>(0);
  const [matSalePrice, setMatSalePrice] = useState<number>(0);
  const [matDeliveryDate, setMatDeliveryDate] = useState('');
  const [matStatus, setMatStatus] = useState<'por_encomendar' | 'encomendado' | 'em_armazem' | string>('por_encomendar');
  const [isSupplierAutocompleteOpen, setIsSupplierAutocompleteOpen] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [pendingMaterialStatuses, setPendingMaterialStatuses] = useState<Record<string, string>>({});

  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterManager, setFilterManager] = useState('');

  // Project List Pagination state
  const [projectPageSize, setProjectPageSize] = useState<number>(25);
  const [projectCurrentPage, setProjectCurrentPage] = useState<number>(1);

  // Reset pagination when any filter or page size changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjectCurrentPage(1);
  }, [search, filterCategory, filterStatus, filterManager, showCompleted, projectPageSize]);
  
  const sortedStatuses = [...(projectStatuses || [])].sort((a, b) => (a.scale ?? 0) - (b.scale ?? 0));
  
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
  
  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDefaultTaskIds, setSelectedDefaultTaskIds] = useState<string[]>([]);

  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formClient, setFormClient] = useState('');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [formCategory, setFormCategory] = useState('');
  const [formCategories, setFormCategories] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState('');
  const [formProjManager, setFormProjManager] = useState('');
  const [formFieldManager, setFormFieldManager] = useState('');
  const [formSales, setFormSales] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formDeliveryDate, setFormDeliveryDate] = useState('');
  const [formEstimatedDate, setFormEstimatedDate] = useState('');
  const [formScheduledDate, setFormScheduledDate] = useState('');
  const [formInstallNo, setFormInstallNo] = useState('');
  const [formSFNo, setFormSFNo] = useState('');
  const [formPriority, setFormPriority] = useState('');
  const [formBudget, setFormBudget] = useState(0);
  const [formDemo, setFormDemo] = useState(false);
  const [formTeams, setFormTeams] = useState<string[]>([]);
  const [formPartners, setFormPartners] = useState<string[]>([]);
  const [formClientContactName, setFormClientContactName] = useState('');
  const [formClientContactEmail, setFormClientContactEmail] = useState('');
  const [formClientContactPhone, setFormClientContactPhone] = useState('');
  
  // Document field (simple entry)
  const [newDocName, setNewDocName] = useState('');
  const [formDocs, setFormDocs] = useState<string[]>([]);

  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = () => {
    if (typeof window === 'undefined' || !selectedProj) return;
    let url = window.location.origin + window.location.pathname + '?tab=projetos&project=' + selectedProj.id;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Comment Form
  const [newCommentText, setNewCommentText] = useState('');

  // Manual Task Form State in Project Details
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [showImportTaskForm, setShowImportTaskForm] = useState(false);
  const [selectedImportModelTaskIds, setSelectedImportModelTaskIds] = useState<string[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskEstHours, setNewTaskEstHours] = useState('08:00');
  const [newTaskAssignees, setNewTaskAssignees] = useState<string[]>([]);
  const [newTaskEstDate, setNewTaskEstDate] = useState('');
  const [newTaskTypeId, setNewTaskTypeId] = useState('');
  const [taskEditAssignees, setTaskEditAssignees] = useState<string[]>([]);
  const [taskEditTypeId, setTaskEditTypeId] = useState('');

  // Monthly Calendar Offset
  const [calMonthOffset, setCalMonthOffset] = useState(0);

  const resetCalMonthToToday = () => {
    const baseDate = selectedProj?.startDate ? new Date(selectedProj.startDate + 'T00:00:00') : new Date();
    const now = new Date();
    const diffMonths = (now.getFullYear() - baseDate.getFullYear()) * 12 + (now.getMonth() - baseDate.getMonth());
    setCalMonthOffset(diffMonths);
  };

  // Project View Tab (Calendário / Cronograma)
  const [projectViewTab, setProjectViewTab] = useState<'calendario' | 'cronograma'>('calendario');

  // Full Timeline Modal State
  const [isFullTimelineModalOpen, setIsFullTimelineModalOpen] = useState(false);

  // Timeline (Cronograma) Start Date
  const [cronogramaStartDate, setCronogramaStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 5);
    return d;
  });

  const shiftCronogramaPrev = () => {
    setCronogramaStartDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 5);
      return next;
    });
  };

  const shiftCronogramaNext = () => {
    setCronogramaStartDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 5);
      return next;
    });
  };

  const resetCronogramaToDefault = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 5);
    setCronogramaStartDate(d);
  };

  // Helper to format Date object to YYYY-MM-DD string
  const formatDateToString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to check if a task is active on a given day
  const isTaskActiveOnDay = (t: Task, dayStr: string): boolean => {
    if (t.deleted) return false;
    if (t.startDate && t.endDate) {
      return dayStr >= t.startDate && dayStr <= t.endDate;
    }
    if (t.startDate) {
      return dayStr === t.startDate;
    }
    if (t.endDate) {
      return dayStr === t.endDate;
    }
    return t.estimatedDate === dayStr;
  };

  // Check if user has double bookings on a given day (assigned to > 1 active tasks in our system on this day)
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

  // Get conflicts list for a given task based on its scheduled dates and assignees
  const getTaskConflicts = (t: Task) => {
    const conflicts: { userId: string; userName: string; type: 'absence' | 'double_booking'; details: string }[] = [];
    if (!t.assigneeIds || t.assigneeIds.length === 0) return conflicts;
    
    // Find all dates this task is active on
    const datesToCheck: string[] = [];
    if (t.startDate && t.endDate) {
      const start = new Date(t.startDate + 'T12:00:00');
      const end = new Date(t.endDate + 'T12:00:00');
      const limit = 30; // safety
      let curr = new Date(start);
      let count = 0;
      while (curr <= end && count < limit) {
        datesToCheck.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
        count++;
      }
    } else if (t.startDate) {
      datesToCheck.push(t.startDate);
    } else if (t.endDate) {
      datesToCheck.push(t.endDate);
    } else if (t.estimatedDate) {
      datesToCheck.push(t.estimatedDate);
    }

    // Check each assignee on these dates
    t.assigneeIds.forEach(uid => {
      const user = users.find(u => u.id === uid);
      const uName = user ? user.name : 'Técnico';
      
      datesToCheck.forEach(dateStr => {
        // Check absence
        const abs = getUserAbsenceOnDay(uid, dateStr);
        if (abs) {
          conflicts.push({
            userId: uid,
            userName: uName,
            type: 'absence',
            details: `Ausência em ${new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-PT')}`,
          });
        }
        
        // Check double booking
        const count = getTaskCountForUserOnDay(uid, dateStr);
        if (count > 1) {
          conflicts.push({
            userId: uid,
            userName: uName,
            type: 'double_booking',
            details: `Dupla alocação em ${new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-PT')} (${count} tarefas)`,
          });
        }
      });
    });
    
    // De-duplicate by details and type
    const unique: typeof conflicts = [];
    const seen = new Set<string>();
    conflicts.forEach(c => {
      const key = `${c.userId}-${c.type}-${c.details}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    });
    return unique;
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteTasks) {
      alert('Não tem permissão para criar tarefas.');
      return;
    }
    if (!newTaskTitle.trim() || !selectedProj) return;

    const executeCreate = () => {
      addTask({
        projectId: selectedProj.id,
        title: newTaskTitle.trim(),
        statusId: getDefaultTaskStatusId(taskStatuses),
        taskTypeId: newTaskTypeId || '',
        assigneeIds: newTaskAssignees,
        estimatedDate: newTaskEstDate,
        description: newTaskDesc.trim(),
        estimatedHours: newTaskEstHours,
        actualHours: '0',
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        notes: '',
      });

      // Reset task form
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskEstHours('08:00');
      setNewTaskAssignees([]);
      setNewTaskEstDate('');
      setNewTaskTypeId('');
      setShowAddTaskForm(false);
    };

    const conflicts = checkTaskSchedulingConflicts({
      estimatedDate: newTaskEstDate,
      assigneeIds: newTaskAssignees,
      users,
      tasks,
      userAbsences: absences || []
    });

    if (conflicts.length > 0) {
      const conflictList = conflicts.map(c => `• ${c.userName}: ${c.detail}`).join('\n');
      askConfirmation(
        'Aviso de Conflito de Agendamento',
        `Atenção: Foram detetados os seguintes conflitos de ausência ou dupla alocação:\n\n${conflictList}\n\nQuer mesmo continuar e gravar a tarefa?`,
        executeCreate
      );
    } else {
      executeCreate();
    }
  };

  // View/Edit Single Task Modal State
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null);
  const [taskEditStatus, setTaskEditStatus] = useState('');
  const [taskEditActualHours, setTaskEditActualHours] = useState('');
  const [taskEditNotes, setTaskEditNotes] = useState('');
  const [taskEditStartDate, setTaskEditStartDate] = useState('');
  const [taskEditStartTime, setTaskEditStartTime] = useState('');
  const [taskEditEndDate, setTaskEditEndDate] = useState('');
  const [taskEditEndTime, setTaskEditEndTime] = useState('');

  const openTaskDetailsModal = (task: Task) => {
    setSelectedTaskForDetails(task);
    setTaskEditStatus(task.statusId);
    setTaskEditTypeId(task.taskTypeId || '');
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
    if (!canWriteTasks) {
      alert('Não tem permissão para alterar tarefas.');
      return;
    }
    if (!selectedTaskForDetails) return;

    const executeSave = () => {
      updateTask(selectedTaskForDetails.id, {
        statusId: taskEditStatus,
        taskTypeId: taskEditTypeId || '',
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

    const conflicts = checkTaskSchedulingConflicts({
      taskId: selectedTaskForDetails.id,
      startDate: taskEditStartDate,
      endDate: taskEditEndDate,
      estimatedDate: selectedTaskForDetails.estimatedDate,
      assigneeIds: taskEditAssignees,
      users,
      tasks,
      userAbsences: absences || []
    });

    if (conflicts.length > 0) {
      const conflictList = conflicts.map(c => `• ${c.userName}: ${c.detail}`).join('\n');
      askConfirmation(
        'Aviso de Conflito de Agendamento',
        `Atenção: Foram detetados os seguintes conflitos de ausência ou dupla alocação:\n\n${conflictList}\n\nQuer mesmo continuar e gravar as alterações?`,
        executeSave
      );
    } else {
      executeSave();
    }
  };

  // Open Form
  const openForm = (proj: Project | null) => {
    if (proj) {
      if (!canWriteProjects) {
        alert('Não tem permissão para editar projetos.');
        return;
      }
    } else {
      if (!canWriteProjects) {
        alert('Não tem permissão para criar novos projetos.');
        return;
      }
    }
    setSelectedDefaultTaskIds([]);
    if (proj) {
      setEditingId(proj.id);
      setFormTitle(proj.title);
      setFormDesc(proj.description);
      setFormClient(proj.clientId);
      const currentClient = clients.find(c => c.id === proj.clientId);
      setClientSearchQuery(currentClient ? `${currentClient.clientName} (${currentClient.shortName})` : '');
      setFormCategory(proj.categoryId);
      setFormCategories(proj.categoryIds || (proj.categoryId ? [proj.categoryId] : []));
      setFormStatus(proj.statusId);
      setFormProjManager(proj.projectManagerId);
      setFormFieldManager(proj.fieldManagerId);
      setFormSales(proj.salesRepId);
      setFormStartDate(proj.startDate);
      setFormDeliveryDate(proj.deliveryDate);
      setFormEstimatedDate(proj.estimatedDate);
      setFormScheduledDate(proj.scheduledDate);
      setFormInstallNo(proj.installProjectNo);
      setFormSFNo(proj.sfOpportunityNo);
      setFormPriority(proj.priorityId);
      setFormBudget(proj.budgetValue);
      setFormDemo(proj.demo);
      setFormTeams(proj.teamsInvolvedIds || []);
      setFormPartners(proj.partnersIds || []);
      setFormDocs(proj.documents || []);
      setFormClientContactName(proj.clientContactName || '');
      setFormClientContactEmail(proj.clientContactEmail || '');
      setFormClientContactPhone(proj.clientContactPhone || '');
    } else {
      setEditingId(null);
      setFormTitle('');
      setFormDesc('');
      setFormClient('');
      setClientSearchQuery('');
      setFormCategory(projectCategories.find(c => !c.deleted)?.id || '');
      setFormCategories([]);
      setFormStatus(projectStatuses[0]?.id || '');
      setFormProjManager('');
      setFormFieldManager('');
      setFormSales('');
      setFormStartDate('');
      setFormDeliveryDate('');
      setFormEstimatedDate('');
      setFormScheduledDate('');
      setFormInstallNo('');
      setFormSFNo('');
      setFormPriority(projectPriorities[0]?.id || '');
      setFormBudget(0);
      setFormDemo(false);
      setFormTeams([]);
      setFormPartners([]);
      setFormDocs([]);
      setFormClientContactName('');
      setFormClientContactEmail('');
      setFormClientContactPhone('');
    }
    setIsEditing(true);
  };

  const toggleDefaultTask = (id: string) => {
    setSelectedDefaultTaskIds(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  // Submit Form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteProjects) {
      alert('Não tem permissão para criar ou editar projetos.');
      return;
    }

    let finalClientId = formClient;
    const trimmedQuery = clientSearchQuery.trim();

    if (trimmedQuery) {
      // Find if there is an existing client with this name or full match
      const existing = (clients || []).find(c => 
        c && !c.deleted && (
          c.clientName.toLowerCase().trim() === trimmedQuery.toLowerCase() ||
          `${c.clientName} (${c.shortName})`.toLowerCase().trim() === trimmedQuery.toLowerCase()
        )
      );

      if (existing) {
        finalClientId = existing.id;
      } else if (!formClient || !(clients || []).some(c => c && c.id === formClient && !c.deleted)) {
        // Create new client dynamically since name was typed but doesn't exist
        let clientNameInput = trimmedQuery;
        let shortNameInput = trimmedQuery; // Use the inserted name for both clientName and shortName

        const newClient = addClient({
          clientName: clientNameInput,
          shortName: shortNameInput,
          location: '',
          taxId: '',
          contactPerson: '',
          contactEmail: '',
          contactPhone: ''
        });
        
        if (newClient && newClient.id) {
          finalClientId = newClient.id;
        }
      }
    } else {
      finalClientId = '';
    }

    const payload = {
      title: formTitle,
      description: formDesc,
      clientId: finalClientId,
      categoryId: formCategories[0] || formCategory,
      categoryIds: formCategories,
      statusId: formStatus,
      projectManagerId: formProjManager,
      fieldManagerId: formFieldManager,
      salesRepId: formSales,
      startDate: formStartDate,
      deliveryDate: formDeliveryDate,
      estimatedDate: formEstimatedDate,
      scheduledDate: formScheduledDate,
      installProjectNo: formInstallNo,
      sfOpportunityNo: formSFNo,
      priorityId: formPriority,
      budgetValue: Number(formBudget),
      demo: formDemo,
      teamsInvolvedIds: formTeams,
      partnersIds: formPartners,
      documents: formDocs,
      clientContactName: formClientContactName,
      clientContactEmail: formClientContactEmail,
      clientContactPhone: formClientContactPhone,
      createdById: currentUser?.id || '11111111-1111-1111-1111-111111111111', 
    };

    if (editingId) {
      updateProject(editingId, payload);
    } else {
      const newProj = addProject(payload);
      if (newProj && newProj.id) {
        const tasksToCreate: any[] = [];
        selectedDefaultTaskIds.forEach(dtId => {
          const dt = defaultTasks.find(item => item.id === dtId);
          if (dt) {
            tasksToCreate.push({
              projectId: newProj.id,
              title: dt.title,
              statusId: getDefaultTaskStatusId(taskStatuses),
              taskTypeId: dt.taskTypeId || getDefaultTaskTypeId(taskTypes),
              assigneeIds: [],
              estimatedDate: '',
              description: dt.description || '',
              estimatedHours: dt.estimatedHours || '08:00',
              actualHours: '00:00',
              startDate: '',
              startTime: '',
              endDate: '',
              endTime: '',
              notes: 'Criado automaticamente a partir do modelo de tarefas por defeito.'
            });
          }
        });

        if (tasksToCreate.length > 0) {
          if (addTasks) {
            addTasks(tasksToCreate);
          } else {
            tasksToCreate.forEach(t => addTask(t));
          }
        }
        setSelectedProjectId(newProj.id);
      }
    }
    setIsEditing(false);
  };

  const handleToggleTeam = (id: string) => {
    setFormTeams(prev => {
      const exists = prev.some(t => matchId(t, id));
      return exists ? prev.filter(t => !matchId(t, id)) : [...prev, id];
    });
  };

  const handleTogglePartner = (id: string) => {
    setFormPartners(prev => {
      const exists = prev.some(p => matchId(p, id));
      return exists ? prev.filter(p => !matchId(p, id)) : [...prev, id];
    });
  };

  const addDocument = () => {
    if (newDocName.trim()) {
      setFormDocs(prev => [...prev, newDocName.trim()]);
      setNewDocName('');
    }
  };

  const removeDocument = (idx: number) => {
    setFormDocs(prev => prev.filter((_, i) => i !== idx));
  };

  const autocompleteClients = (clients || [])
    .filter(c => {
      if (!c) return false;
      const q = clientSearchQuery.toLowerCase().trim();
      if (!q) return true;
      const name = c.clientName || '';
      const short = c.shortName || '';
      return (
        name.toLowerCase().includes(q) ||
        short.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const nameA = (a.clientName || a.shortName || '').toLowerCase();
      const nameB = (b.clientName || b.shortName || '').toLowerCase();
      return nameA.localeCompare(nameB, 'pt', { sensitivity: 'base' });
    });

  const matchId = (idA: string | null | undefined, idB: string | null | undefined) => {
    if (!idA || !idB) return false;
    if (idA === idB) return true;
    return stringToUUID(idA) === stringToUUID(idB);
  };

  // Helper functions
  const getClientName = (clientId: string) => clients.find(c => matchId(c.id, clientId))?.clientName || 'Cliente';
  const getStatusName = (id: string) => projectStatuses.find(s => matchId(s.id, id))?.name || 'N/A';
  const getCategoryName = (id: string) => projectCategories.find(c => matchId(c.id, id))?.name || 'N/A';
  const getRiskName = (id?: string) => id ? (projectRisks.find(r => matchId(r.id, id))?.name || 'N/D') : 'N/D';
  const getPriorityName = (id: string) => projectPriorities.find(p => matchId(p.id, id))?.name || 'N/A';
  const getUserName = (id: string) => users.find(u => matchId(u.id, id))?.name || 'Equipa';

  // Helper to check if project status is level 5 (completed, suspended, cancelled, or scale >= 5)
  const isProjectLevel5 = (statusId: string): boolean => {
    if (!statusId) return false;
    const s = projectStatuses.find(st => matchId(st.id, statusId) || st.id === statusId);
    if (!s) return false;
    if (s.scale !== undefined && s.scale >= 5) return true;
    const name = (s.name || '').toLowerCase();
    return name.includes('conclu') || name.includes('suspen') || name.includes('cancel');
  };

  const getProjectFlowLevel = (statusId: string): number => {
    if (isProjectLevel5(statusId)) return 5;
    const s = projectStatuses.find(st => matchId(st.id, statusId));
    if (s && s.scale !== undefined) return Math.min(s.scale, 5);
    return 0;
  };

  // Filter projects
  const activeProjects = projects.filter(p => !p.deleted);
  const filteredProjects = activeProjects.filter(p => {
    const client = clients.find(c => matchId(c.id, p.clientId));
    const clientName = (client?.clientName || getClientName(p.clientId) || '').toLowerCase();
    const clientShortName = (client?.shortName || '').toLowerCase();
    const projTitle = (p.title || '').toLowerCase();
    const projDesc = (p.description || '').toLowerCase();
    const projId = (p.id || '').toLowerCase();
    const installNo = (p.installProjectNo || '').toLowerCase();
    const q = search.toLowerCase().trim();

    const matchesSearch = !q || 
                          projTitle.includes(q) ||
                          projDesc.includes(q) ||
                          clientName.includes(q) ||
                          clientShortName.includes(q) ||
                          projId.includes(q) ||
                          installNo.includes(q);

    const matchesCategory = filterCategory ? (p.categoryId === filterCategory || (p.categoryIds && p.categoryIds.includes(filterCategory))) : true;
    const matchesStatus = filterStatus ? p.statusId === filterStatus : true;
    const matchesManager = filterManager ? (p.projectManagerId === filterManager || matchId(p.projectManagerId, filterManager)) : true;
    const matchesCompleted = showCompleted ? true : !isProjectLevel5(p.statusId);
    return matchesSearch && matchesCategory && matchesStatus && matchesManager && matchesCompleted;
  });

  // Project Pagination calculations
  const totalProjects = filteredProjects.length;
  const totalProjectPages = Math.ceil(totalProjects / projectPageSize) || 1;
  const validProjectPage = Math.min(Math.max(1, projectCurrentPage), totalProjectPages);
  const startProjectIndex = (validProjectPage - 1) * projectPageSize;
  const endProjectIndex = Math.min(startProjectIndex + projectPageSize, totalProjects);
  const paginatedProjects = filteredProjects.slice(startProjectIndex, endProjectIndex);

  const selectedProj = activeProjects.find(p => matchId(p.id, selectedProjectId));
  const projTasks = tasks.filter(t => matchId(t.projectId, selectedProjectId) && !t.deleted);
  const projComments = comments.filter(c => matchId(c.projectId, selectedProjectId));
  const projMaterials = (projectMaterials || []).filter(pm => matchId(pm.projectId, selectedProjectId) && !pm.deleted);
  const materialGroupsDict: Record<string, ProjectMaterial[]> = {};
  projMaterials.forEach(m => {
    const supKey = (m.supplier || 'Sem Fornecedor').trim();
    if (!materialGroupsDict[supKey]) materialGroupsDict[supKey] = [];
    materialGroupsDict[supKey].push(m);
  });
  const projMaterialsGrouped = Object.entries(materialGroupsDict);
  const missingMaterialsCount = projMaterials.filter(m => {
    const st = pendingMaterialStatuses[m.id] || m.status;
    return st !== 'em_armazem' && st !== 'em_stock';
  }).length;
  const hasMissingMaterials = missingMaterialsCount > 0;

  const projRiskItems = (projectRiskItems || []).filter(ri => matchId(ri.projectId, selectedProjectId) && !ri.deleted);
  const projCriticalRisksCount = projRiskItems.filter(ri => (ri.probability * ri.impact) >= 16).length;

  const getRiskCategoryName = (id?: string) => {
    if (!id) return 'Sem Categoria';
    const cat = riskCategories.find(c => c.id === id);
    return cat ? cat.name : 'Sem Categoria';
  };

  const getRiskStatusName = (id?: string) => {
    if (!id) return 'Aberto';
    const st = riskStatuses.find(s => s.id === id);
    return st ? st.name : 'Aberto';
  };

  const getRiskPriorityName = (id?: string) => {
    if (!id) return 'Média';
    const pr = riskPriorities.find(p => p.id === id);
    return pr ? pr.name : 'Média';
  };

  const getRiskLevelDetails = (probability: number, impact: number) => {
    const score = (probability || 1) * (impact || 1);
    if (score >= 16) {
      return { score, label: 'Crítico', color: 'text-rose-700 bg-rose-100 border-rose-300', dot: '🔴' };
    } else if (score >= 11) {
      return { score, label: 'Alto', color: 'text-orange-700 bg-orange-100 border-orange-300', dot: '🟠' };
    } else if (score >= 6) {
      return { score, label: 'Médio', color: 'text-amber-700 bg-amber-100 border-amber-300', dot: '🟡' };
    } else {
      return { score, label: 'Baixo', color: 'text-emerald-700 bg-emerald-100 border-emerald-300', dot: '🟢' };
    }
  };

  const getProjectCalculatedRisk = (projId: string, riskItems?: ProjectRiskItem[]) => {
    const items = (riskItems || []).filter(ri => matchId(ri.projectId, projId) && !ri.deleted);
    if (items.length === 0) {
      return { score: 0, label: 'N/D', color: 'text-slate-500 bg-slate-100 border-slate-200', dot: '⚪' };
    }
    let maxScore = 0;
    items.forEach(ri => {
      const score = (ri.probability || 1) * (ri.impact || 1);
      if (score > maxScore) maxScore = score;
    });
    return getRiskLevelDetails(1, maxScore);
  };

  // All existing suppliers across project materials and partners for autocomplete
  const supplierSet = new Set<string>();
  (projectMaterials || []).forEach(m => { if (m.supplier && m.supplier.trim()) supplierSet.add(m.supplier.trim()); });
  (projectPartners || []).forEach(p => { if (p.name && p.name.trim()) supplierSet.add(p.name.trim()); });
  const allSuppliers = Array.from(supplierSet).sort((a, b) => a.localeCompare(b));

  const handleOpenAddMaterialModal = () => {
    setEditingMaterialId(null);
    setMatDesc('');
    setMatSupplier('');
    setMatQty(1);
    setMatRef('');
    setMatBudget('');
    setMatCostPrice(0);
    setMatSalePrice(0);
    setMatDeliveryDate('');
    setMatStatus('por_encomendar');
    setIsSupplierAutocompleteOpen(false);
    setIsMaterialModalOpen(true);
  };

  const handleCloseMaterialModal = () => {
    setIsMaterialModalOpen(false);
    setEditingMaterialId(null);
    setMatDesc('');
    setMatSupplier('');
    setMatQty(1);
    setMatRef('');
    setMatBudget('');
    setMatCostPrice(0);
    setMatSalePrice(0);
    setMatDeliveryDate('');
    setMatStatus('por_encomendar');
    setIsSupplierAutocompleteOpen(false);
  };

  const handleSaveMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProj || !matDesc.trim() || !matSupplier.trim()) {
      alert('Descrição e Fornecedor são campos obrigatórios.');
      return;
    }
    if (!canWriteProjects) {
      alert('Não tem permissão para registar materiais no projeto.');
      return;
    }

    if (editingMaterialId && updateProjectMaterial) {
      updateProjectMaterial(editingMaterialId, {
        description: matDesc.trim(),
        supplier: matSupplier.trim(),
        quantity: Number(matQty) || 1,
        reference: matRef.trim(),
        budget: matBudget.trim(),
        costPrice: Number(matCostPrice) || 0,
        salePrice: Number(matSalePrice) || 0,
        expectedDeliveryDate: matDeliveryDate,
        status: matStatus,
      });
      setEditingMaterialId(null);
    } else if (addProjectMaterial) {
      addProjectMaterial({
        projectId: selectedProj.id,
        description: matDesc.trim(),
        supplier: matSupplier.trim(),
        quantity: Number(matQty) || 1,
        reference: matRef.trim(),
        budget: matBudget.trim(),
        costPrice: Number(matCostPrice) || 0,
        salePrice: Number(matSalePrice) || 0,
        expectedDeliveryDate: matDeliveryDate,
        status: matStatus,
      });
    }

    // Close modal & reset form
    setIsMaterialModalOpen(false);
    setMatDesc('');
    setMatSupplier('');
    setMatQty(1);
    setMatRef('');
    setMatBudget('');
    setMatCostPrice(0);
    setMatSalePrice(0);
    setMatDeliveryDate('');
    setMatStatus('por_encomendar');
    setIsSupplierAutocompleteOpen(false);
  };

  const handleToggleMaterialStatus = (pm: ProjectMaterial) => {
    if (!canWriteProjects || !updateProjectMaterial) return;

    const initialStatus = pm.status || 'por_encomendar';
    const currentStatus = pendingMaterialStatuses[pm.id] || initialStatus;
    let nextStatus: string = 'encomendado';
    if (currentStatus === 'por_encomendar') {
      nextStatus = 'encomendado';
    } else if (currentStatus === 'encomendado') {
      nextStatus = 'em_armazem';
    } else {
      nextStatus = 'por_encomendar';
    }

    // Immediately reflect change visually (or clear pending if back to initial)
    setPendingMaterialStatuses(prev => {
      if (nextStatus === initialStatus) {
        const copy = { ...prev };
        delete copy[pm.id];
        return copy;
      }
      return { ...prev, [pm.id]: nextStatus };
    });

    // Clear previous debounce timer for this material item if user clicks rapidly
    const existingTimer = materialDebounceTimersMap.get(pm.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      materialDebounceTimersMap.delete(pm.id);
    }

    // Only debounce and write to DB if the target status differs from initial status
    if (nextStatus !== initialStatus) {
      const timer = setTimeout(() => {
        updateProjectMaterial(pm.id, { status: nextStatus });
        materialDebounceTimersMap.delete(pm.id);
      }, 500);
      materialDebounceTimersMap.set(pm.id, timer);
    }
  };

  const handleEditMaterial = (pm: ProjectMaterial) => {
    setEditingMaterialId(pm.id);
    setMatDesc(pm.description || '');
    setMatSupplier(pm.supplier || '');
    setMatQty(pm.quantity || 1);
    setMatRef(pm.reference || '');
    setMatBudget(pm.budget !== undefined && pm.budget !== null ? String(pm.budget) : '');
    setMatCostPrice(pm.costPrice || 0);
    setMatSalePrice(pm.salePrice || 0);
    setMatDeliveryDate(pm.expectedDeliveryDate || '');
    setMatStatus(pm.status || 'por_encomendar');
    setIsMaterialModalOpen(true);
  };

  const handleDeleteMaterial = (id: string) => {
    if (!canWriteProjects || !deleteProjectMaterial) return;
    if (confirm('Tem a certeza que deseja eliminar esta linha de material?')) {
      const existingTimer = materialDebounceTimersMap.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        materialDebounceTimersMap.delete(id);
      }
      setPendingMaterialStatuses(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      deleteProjectMaterial(id);
    }
  };

  // ==================== PROJECT RISK ITEMS HANDLERS ====================
  const handleSaveRisk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProj || !riskTitle.trim()) {
      alert('O título do risco é obrigatório.');
      return;
    }
    if (!canWriteProjects) {
      alert('Não tem permissão para registar riscos.');
      return;
    }

    const riskData = {
      projectId: selectedProj.id,
      title: riskTitle.trim(),
      categoryId: riskCategoryId || (riskCategories[0]?.id || ''),
      identificationDate: riskIdentificationDate,
      ownerId: riskOwnerId || '',
      description: riskDescription.trim(),
      consequence: riskConsequence.trim(),
      probability: Number(riskProbability) || 3,
      impact: Number(riskImpact) || 3,
      mitigationPlan: riskMitigationPlan.trim(),
      contingencyPlan: riskContingencyPlan.trim(),
      reviewDate: riskReviewDate || calculateSuggestedReviewDate(Number(riskProbability) || 3, Number(riskImpact) || 3, riskIdentificationDate),
      statusId: riskStatusId || (riskStatuses[0]?.id || ''),
      priorityId: riskPriorityId || (riskPriorities[1]?.id || ''),
    };

    if (editingRiskId && updateProjectRiskItem) {
      updateProjectRiskItem(editingRiskId, riskData);
    } else if (addProjectRiskItem) {
      addProjectRiskItem(riskData);
    }

    // Reset form & close modal
    resetRiskForm();
    setShowRiskModal(false);
  };

  const resetRiskForm = () => {
    setEditingRiskId(null);
    setRiskTitle('');
    setRiskCategoryId(riskCategories[0]?.id || '');
    setRiskIdentificationDate(new Date().toISOString().split('T')[0]);
    setRiskOwnerId('');
    setRiskDescription('');
    setRiskConsequence('');
    setRiskProbability(3);
    setRiskImpact(3);
    setRiskMitigationPlan('');
    setRiskContingencyPlan('');
    setRiskReviewDate(calculateSuggestedReviewDate(3, 3, new Date().toISOString().split('T')[0]));
    setRiskStatusId(riskStatuses[0]?.id || '');
    setRiskPriorityId(riskPriorities[1]?.id || '');
  };

  const handleEditRisk = (risk: ProjectRiskItem) => {
    setEditingRiskId(risk.id);
    setRiskTitle(risk.title || '');
    setRiskCategoryId(risk.categoryId || '');
    setRiskIdentificationDate(risk.identificationDate || new Date().toISOString().split('T')[0]);
    setRiskOwnerId(risk.ownerId || '');
    setRiskDescription(risk.description || '');
    setRiskConsequence(risk.consequence || '');
    setRiskProbability(risk.probability || 3);
    setRiskImpact(risk.impact || 3);
    setRiskMitigationPlan(risk.mitigationPlan || '');
    setRiskContingencyPlan(risk.contingencyPlan || '');
    setRiskReviewDate(risk.reviewDate || '');
    setRiskStatusId(risk.statusId || '');
    setRiskPriorityId(risk.priorityId || '');
    setShowRiskModal(true);
  };

  const handleDeleteRisk = (id: string) => {
    if (!canWriteProjects || !deleteProjectRiskItem) return;
    askConfirmation(
      'Eliminar Risco',
      'Tem a certeza que deseja eliminar este item de risco? Esta operação não pode ser revertida.',
      () => {
        deleteProjectRiskItem(id);
      }
    );
  };


  const handleFlowStepClick = (levelIndex: number) => {
    if (!selectedProj) return;
    if (!canWriteProjects) {
      alert('Não tem permissão para alterar o estado do projeto.');
      return;
    }
    const suffix = `30${levelIndex + 1}`;
    const found = projectStatuses.find(s => {
      const norm = s.id.replace(/[-]/g, '').toLowerCase();
      return norm.endsWith(suffix) || s.id === `ps-${levelIndex + 1}`;
    });
    
    if (found) {
      updateProject(selectedProj.id, { statusId: found.id });
    } else {
      // Find status by name keyword
      const levelKeywords = ['iniciar', 'iniciado', 'preparação', 'ensaio', 'implementação', 'concluido'];
      const targetKeyword = levelKeywords[levelIndex];
      const foundByName = projectStatuses.find(s => s.name.toLowerCase().includes(targetKeyword));
      if (foundByName) {
        updateProject(selectedProj.id, { statusId: foundByName.id });
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. If viewing detail & NOT editing */}
      {selectedProj && !isEditing ? (
        <div className="bg-white rounded-2xl border border-slate-200 -sm overflow-hidden animate-fade-in">
          
          {/* Header Action Row */}
          <div className="p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-4 items-center justify-between">
            <button 
              onClick={() => setSelectedProjectId(null)}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-semibold"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  copiedLink 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900'
                }`}
                title="Copiar link do projeto"
              >
                <Link2 className="w-3.5 h-3.5" />
                
              </button>
              {canWriteProjects && (
                <button 
                  onClick={() => openForm(selectedProj)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar Projeto
                </button>
              )}
              {canDeleteProjects && (
                <button 
                  onClick={() => {
                    askConfirmation(
                      'Confirmar Eliminação de Projeto',
                      'Tem a certeza que deseja eliminar este projeto permanentemente? Esta ação não pode ser desfeita.',
                      () => {
                        if (!canDeleteProjects) {
                          alert('Não tem permissão para eliminar projetos.');
                          return;
                        }
                        deleteProject(selectedProj.id);
                        setSelectedProjectId(null);
                      }
                    );
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              )}
            </div>
          </div>

          {/* PROJECT BANNER HEADER (Client, Name, Risk, Priority, Material status) */}
          <div className="p-6 bg-white border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{getClientName(selectedProj.clientId)}</span>
                {selectedProj.demo && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Demo</span>}
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{selectedProj.title}</h1>
              <p className="text-xs text-slate-500 font-mono">IP: {selectedProj.installProjectNo || 'S/N'} • Oportunidade SF: {selectedProj.sfOpportunityNo || 'S/N'}</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {hasMissingMaterials && (
                <span className="text-xs font-bold uppercase px-3 py-1.5 rounded-xl bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>Material em falta ({missingMaterialsCount})</span>
                </span>
              )}
              {(() => {
                const calcRisk = getProjectCalculatedRisk(selectedProj.id, projectRiskItems);
                return (
                  <span className={`text-xs font-extrabold uppercase px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${calcRisk.color}`}>
                    <span>{calcRisk.dot}</span>
                    <span>Risco: {calcRisk.label}</span>
                  </span>
                );
              })()}
              <span className="text-xs font-bold uppercase px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
                Prioridade: {getPriorityName(selectedProj.priorityId)}
              </span>
            </div>
          </div>
          
          {/* FLOW PIPELINE PROGRESS BAR */}
          {(() => {
            const currentStatus = projectStatuses.find(s => s.id === selectedProj.statusId);
            const rawScale = currentStatus ? (currentStatus.scale ?? 1) : 1;
            
            // Map raw database scale directly to effective display scale (1 to 5)
            let displayScale = 1;
            if (rawScale === 1) displayScale = 1;
            else if (rawScale === 2) displayScale = 2;
            else if (rawScale === 3) displayScale = 3;
            else if (rawScale === 4) displayScale = 4;
            else if (rawScale >= 5) displayScale = 5;

            const levels = [
              { label: 'Por iniciar', targetScale: 1 },
              { label: 'Iniciado', targetScale: 2 },
              { label: 'Preparação', targetScale: 3 },
              { label: 'Implementação', targetScale: 4 },
              { label: 'Concluído', targetScale: 5 },
            ];

            return (
              <div className="overflow-x-auto w-full border-b border-slate-100">
                <div className="relative flex w-full min-w-[560px] justify-between items-center px-6 sm:px-10 py-8 sm:py-10 bg-slate-50/50">
                  {/* Connecting Lines */}
                  <div className="absolute left-[56px] right-[56px] top-[56px] flex items-center z-0">
                    {levels.slice(0, -1).map((_, idx) => {
                      const isPassed = displayScale > levels[idx + 1].targetScale;
                      const isCurrent = displayScale === levels[idx + 1].targetScale;
                      const isActive = displayScale >= levels[idx + 1].targetScale;
                      
                      let lineColor = "bg-slate-200";
                      if (isPassed) {
                        lineColor = "bg-slate-400"; // cinza
                      } else if (isCurrent) {
                        if (displayScale === 5) {
                          lineColor = "bg-emerald-800"; // verde-escuro
                        } else {
                          lineColor = "bg-blue-500"; // azul
                        }
                      }

                      return (
                        <div key={idx} className="flex-1 h-[2px] bg-slate-200">
                          <div 
                            className={`h-full transition-all duration-700 ease-in-out ${isActive ? lineColor : 'bg-transparent'}`}
                            style={{ width: isActive ? '100%' : '0%' }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Step Indicators */}
                  {levels.map((lvl, idx) => {
                    const isCurrent = lvl.targetScale === displayScale;
                    const isPassed = lvl.targetScale < displayScale;
                    
                    let circleClass = "";
                    let labelColorClass = "";

                    if (isCurrent) {
                      if (lvl.targetScale === 1) {
                        circleClass = "ring-red-100 bg-red-500 border-red-500 text-white ring-4 scale-110 font-bold";
                        labelColorClass = "text-red-600 font-extrabold";
                      } else if (lvl.targetScale === 5) {
                        circleClass = "ring-emerald-200 bg-emerald-800 border-emerald-800 text-white ring-4 scale-110 font-bold";
                        labelColorClass = "text-emerald-800 font-extrabold";
                      } else {
                        circleClass = "ring-blue-100 bg-blue-600 border-blue-600 text-white ring-4 scale-110 font-bold";
                        labelColorClass = "text-blue-600 font-extrabold";
                      }
                    } else if (isPassed) {
                      // cinza se já tiver num estado com escala superior
                      circleClass = "bg-slate-400 border-slate-400 text-white";
                      labelColorClass = "text-slate-500 font-semibold";
                    } else {
                      // cinza claro se estiver num estado de escala inferior
                      circleClass = "bg-slate-100 border-slate-200 text-slate-300";
                      labelColorClass = "text-slate-300";
                    }

                    return (
                      <div
                        key={idx}
                        className="relative z-10 flex flex-col items-center select-none"
                      >
                        {/* Step Circle */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 border-[2px] ${circleClass}`}>
                          {isPassed ? <Check className="w-4 h-4 stroke-[3]" /> : <span className="text-[11px] font-black">{idx + 1}</span>}
                        </div>
                        
                        {/* Label */}
                        <span className={`absolute top-11 whitespace-nowrap text-[10px] uppercase tracking-widest font-extrabold transition-colors mt-1 ${labelColorClass}`}>
                          {lvl.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Project Separators Header (Tabs: Visão Geral / Tarefas / Material / Riscos / Análise) */}
          <div className="border-b border-slate-200 bg-slate-50/80 px-3 sm:px-6 pt-2.5 sm:pt-3 overflow-x-auto w-full scrollbar-thin">
            <div className="flex gap-2 min-w-max pb-0.5">
              <button
                type="button"
                onClick={() => setActiveDetailTab('geral')}
                className={`px-4 py-2.5 text-xs font-extrabold border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeDetailTab === 'geral'
                    ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" /> Visão Geral
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('tarefas')}
                className={`px-4 py-2.5 text-xs font-extrabold border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeDetailTab === 'tarefas'
                    ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ListTodo className="w-4 h-4 shrink-0" /> Tarefas ({projTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('material')}
                className={`px-4 py-2.5 text-xs font-extrabold border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeDetailTab === 'material'
                    ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Package className="w-4 h-4 shrink-0" /> Material ({projMaterials.length})
                {hasMissingMaterials && (
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping inline-block shrink-0" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveDetailTab('riscos');
                  resetRiskForm();
                }}
                className={`px-4 py-2.5 text-xs font-extrabold border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeDetailTab === 'riscos'
                    ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0" /> Riscos ({projRiskItems.length})
                {projCriticalRisksCount > 0 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping inline-block shrink-0" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('analise')}
                className={`px-4 py-2.5 text-xs font-extrabold border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeDetailTab === 'analise'
                    ? 'border-blue-600 text-blue-700 bg-white rounded-t-xl shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <BarChart3 className="w-4 h-4 shrink-0" /> Análise
              </button>
            </div>
          </div>

          {/* TAB 1: VISÃO GERAL */}
          {activeDetailTab === 'geral' && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Left Content Column (Main info) */}
              <div className="md:col-span-8 space-y-6">
 
                {/* Description Block */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h3 className="font-bold text-xs uppercase text-slate-400 mb-2 flex items-center gap-1"><FileText className="w-3.5 h-3.5"/> Descrição do Projeto</h3>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedProj.description || 'Sem descrição registada.'}</p>
                </div>

              {/* Tabs Switcher: Calendário vs Cronograma */}
              <div className="space-y-4">
                <div className="overflow-x-auto w-full border-b border-slate-200 scrollbar-thin">
                  <div className="flex gap-6 min-w-max pb-0.5">
                    <button
                      type="button"
                      onClick={() => setProjectViewTab('calendario')}
                      className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                        projectViewTab === 'calendario'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <Calendar className="w-4 h-4 shrink-0" />
                      Calendário Mensal
                    </button>
                    <button
                      type="button"
                      onClick={() => setProjectViewTab('cronograma')}
                      className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                        projectViewTab === 'cronograma'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-400 hover:text-slate-700'
                      }`}
                      id="tab-cronograma-btn"
                    >
                      <Clock className="w-4 h-4 shrink-0" />
                      Cronograma
                    </button>
                  </div>
                </div>

                {projectViewTab === 'calendario' ? (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">Calendário Mensal do Projeto</h3>
                      <div className="flex items-center gap-1.5">
                        <button 
                          type="button"
                          onClick={() => setCalMonthOffset(o => o - 1)} 
                          className="flex items-center justify-center p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 cursor-pointer transition-colors"
                          title="Mês anterior"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          type="button"
                          onClick={resetCalMonthToToday} 
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 cursor-pointer transition-colors"
                          title="Voltar para o mês atual"
                        >
                          Hoje
                        </button>
                        <button 
                          type="button"
                          onClick={() => setCalMonthOffset(o => o + 1)} 
                          className="flex items-center justify-center p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 cursor-pointer transition-colors"
                          title="Mês seguinte"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold text-slate-700 min-w-[120px] text-center my-auto ml-2 capitalize">
                          {(() => {
                            const targetDate = selectedProj.startDate ? new Date(selectedProj.startDate + 'T00:00:00') : new Date();
                            targetDate.setMonth(targetDate.getMonth() + calMonthOffset);
                            return targetDate.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
                          })()}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden -sm">
                      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase text-center">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                          <div key={d} className="py-2 border-r border-slate-100 last:border-0">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 text-xs">
                        {(() => {
                          const targetDate = selectedProj.startDate ? new Date(selectedProj.startDate + 'T00:00:00') : new Date();
                          targetDate.setMonth(targetDate.getMonth() + calMonthOffset);
                          const year = targetDate.getFullYear();
                          const month = targetDate.getMonth();
                          
                          const firstDayOfMonth = new Date(year, month, 1);
                          const lastDayOfMonth = new Date(year, month + 1, 0);
                          const daysInMonth = lastDayOfMonth.getDate();
                          const startingDayOfWeek = firstDayOfMonth.getDay();
                          
                          const cells = [];
                          
                          for (let i = 0; i < startingDayOfWeek; i++) {
                            cells.push(<div key={`empty-${i}`} className="min-h-[80px] p-2 border-b border-r border-slate-100 bg-slate-50/50"></div>);
                          }

                          for (let d = 1; d <= daysInMonth; d++) {
                            const currentDate = new Date(year, month, d);
                            const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const sd = specialDays?.find(s => s.date === dateStr);
                            const isSpecial = !!sd;

                            const isProjStart = selectedProj.startDate === dateStr;
                            const isProjDelivery = selectedProj.deliveryDate === dateStr;
                            const isProjEstimated = selectedProj.estimatedDate === dateStr;
                            const isProjScheduled = selectedProj.scheduledDate === dateStr;
                            
                            const tasksOnDay = projTasks.filter(t => {
                              if (t.startDate && t.endDate) return dateStr >= t.startDate && dateStr <= t.endDate;
                              if (t.startDate) return dateStr === t.startDate;
                              if (t.endDate) return dateStr === t.endDate;
                              return t.estimatedDate === dateStr;
                            });

                            const isMilestoneTask = (t: Task) => {
                              const typeName = getTaskTypeName(t.taskTypeId, taskTypes);
                              return typeName.toLowerCase().includes('marco') || (t.title && t.title.toLowerCase().includes('marco'));
                            };
                            const milestonesOnDay = tasksOnDay.filter(t => isMilestoneTask(t));
                            const regularTasksOnDay = tasksOnDay.filter(t => !isMilestoneTask(t));
                            const materialsOnDay = projMaterials.filter(pm => pm.expectedDeliveryDate === dateStr);
                            const risksOnDay = projRiskItems.filter(ri => ri.reviewDate === dateStr);

                            cells.push(
                              <div 
                                key={`day-${d}`} 
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (!canWriteTasks) {
                                    alert('Não tem permissão para alterar tarefas.');
                                    return;
                                  }
                                  const taskId = e.dataTransfer.getData('taskId');
                                  if (taskId && updateTask) {
                                    const existingTask = tasks.find(t => t.id === taskId);
                                    if (existingTask && existingTask.startDate === dateStr && existingTask.endDate === dateStr && existingTask.estimatedDate === dateStr) {
                                      return;
                                    }
                                    updateTask(taskId, {
                                      startDate: dateStr,
                                      endDate: dateStr,
                                      estimatedDate: dateStr
                                    });
                                  }
                                }}
                                onClick={() => {
                                  setShowAddTaskForm(true);
                                  setNewTaskEstDate(dateStr);
                                  setShowImportTaskForm(false);
                                  setTimeout(() => {
                                    document.getElementById('add-task-form-panel')?.scrollIntoView({ behavior: 'smooth' });
                                  }, 50);
                                }}
                                className={`min-h-[110px] p-1.5 border-b border-r border-slate-100 last:border-r-0 relative group transition-colors hover:bg-slate-100/50 cursor-pointer flex flex-col justify-start ${
                                  isWeekend || isSpecial ? 'bg-slate-100/60' : 'bg-white'
                                }`}
                                title="Clique no dia para adicionar uma nova tarefa ou marco"
                              >
                                <div className="flex justify-between items-start mb-1 flex-shrink-0">
                                  <span className={`inline-block w-5 h-5 text-center leading-5 rounded-full font-bold text-[11px] ${
                                    dateStr === new Date().toISOString().split('T')[0] ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600'
                                  }`}>{d}</span>
                                  {sd && <span className="text-[8px] font-bold text-slate-400 truncate max-w-[50px]" title={sd.name}>{sd.name.substring(0, 8)}...</span>}
                                </div>
                                
                                <div className="flex flex-col gap-1 overflow-y-auto max-h-[100px] pr-0.5 custom-scrollbar">
                                  {/* Início de Projeto */}
                                  {isProjStart && (
                                    <div 
                                      className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-extrabold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Início / Adjudicação do projeto: ${selectedProj.title}`}
                                    >
                                      <span className="shrink-0 text-[10px]">🚀</span>
                                      <span className="truncate">Início Proj.</span>
                                    </div>
                                  )}

                                  {/* Prazo de Entrega */}
                                  {isProjDelivery && (
                                    <div 
                                      className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Prazo de entrega do projeto: ${selectedProj.title}`}
                                    >
                                      <span className="shrink-0 text-[10px]">🏁</span>
                                      <span className="truncate">Prazo Entrega</span>
                                    </div>
                                  )}

                                  {/* Previsão Real */}
                                  {isProjEstimated && !isProjDelivery && (
                                    <div 
                                      className="px-1.5 py-0.5 rounded-md bg-purple-100 border border-purple-200 text-purple-900 text-[10px] font-extrabold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Previsão real de entrega: ${selectedProj.title}`}
                                    >
                                      <span className="shrink-0 text-[10px]">🔮</span>
                                      <span className="truncate">Prev. Entrega</span>
                                    </div>
                                  )}

                                  {/* Agendamento */}
                                  {isProjScheduled && !isProjStart && (
                                    <div 
                                      className="px-1.5 py-0.5 rounded-md bg-indigo-100 border border-indigo-200 text-indigo-900 text-[10px] font-extrabold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Agendamento do projeto: ${selectedProj.title}`}
                                    >
                                      <span className="shrink-0 text-[10px]">📅</span>
                                      <span className="truncate">Agendamento</span>
                                    </div>
                                  )}

                                  {/* Marcos de Projeto */}
                                  {milestonesOnDay.map(m => (
                                    <div
                                      key={m.id}
                                      draggable={canWriteTasks}
                                      onDragStart={(e) => {
                                        e.stopPropagation();
                                        if (!canWriteTasks) { e.preventDefault(); return; }
                                        e.dataTransfer.setData('taskId', m.id);
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openTaskDetailsModal(m);
                                      }}
                                      className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-black flex items-center gap-1 truncate cursor-pointer hover:bg-amber-600 transition-colors shadow-2xs"
                                      title={`Marco: ${m.title}\nClique para ver/editar`}
                                    >
                                      <span className="shrink-0 text-[10px]">🚩</span>
                                      <span className="truncate">{m.title}</span>
                                    </div>
                                  ))}

                                  {/* Tarefas de Projeto */}
                                  {regularTasksOnDay.map(t => {
                                    const assigneesText = t.assigneeIds && t.assigneeIds.length > 0
                                      ? t.assigneeIds.map(id => getUserName(id)).join(', ')
                                      : 'Não alocado';
                                    return (
                                      <div 
                                        key={t.id} 
                                        draggable={canWriteTasks}
                                        onDragStart={(e) => {
                                          e.stopPropagation();
                                          if (!canWriteTasks) {
                                            e.preventDefault();
                                            return;
                                          }
                                          e.dataTransfer.setData('taskId', t.id);
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openTaskDetailsModal(t);
                                        }}
                                        className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold flex items-center gap-1.5 truncate cursor-grab active:cursor-grabbing hover:bg-slate-200 transition-colors shadow-2xs"
                                        title={`Tarefa: ${t.title}\nTécnicos: ${assigneesText}\nClique para ver/editar`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                                        <span className="truncate">{t.title}</span>
                                      </div>
                                    );
                                  })}

                                  {/* Materiais do Projeto */}
                                  {materialsOnDay.map(pm => (
                                    <div
                                      key={pm.id}
                                      className="px-1.5 py-0.5 rounded-md bg-sky-100 border border-sky-200 text-sky-900 text-[10px] font-bold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Receção Prevista de Material: ${pm.description}\nFornecedor: ${pm.supplier || '-'}\nQtd: ${pm.quantity}`}
                                    >
                                      <span className="shrink-0 text-[10px]">📦</span>
                                      <span className="truncate">{pm.description}</span>
                                    </div>
                                  ))}

                                  {/* Revisões de Risco */}
                                  {risksOnDay.map(ri => (
                                    <div
                                      key={ri.id}
                                      className="px-1.5 py-0.5 rounded-md bg-rose-100 border border-rose-200 text-rose-900 text-[10px] font-bold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Revisão de Risco do Projeto: ${ri.title}`}
                                    >
                                      <span className="shrink-0 text-[10px]">⚠️</span>
                                      <span className="truncate">{ri.title}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }

                          const totalCells = cells.length;
                          const remainder = totalCells % 7;
                          if (remainder !== 0) {
                            for (let i = 0; i < (7 - remainder); i++) {
                              cells.push(<div key={`empty-end-${i}`} className="min-h-[110px] p-2 border-b border-r border-slate-100 bg-slate-50/50"></div>);
                            }
                          }

                          return cells;
                        })()}
                      </div>
                      <div className="bg-slate-50 p-2.5 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1.5 justify-center text-[10px] font-bold text-slate-600">
                        <span className="flex items-center gap-1"><span className="text-xs">🚀</span> Início Projeto</span>
                        <span className="flex items-center gap-1"><span className="text-xs">🏁</span> Prazo Entrega</span>
                        <span className="flex items-center gap-1"><span className="text-xs">🔮</span> Prev. Real</span>
                        <span className="flex items-center gap-1"><span className="text-xs">📅</span> Agendamento</span>
                        <span className="flex items-center gap-1"><span className="text-xs">🚩</span> Marcos</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span> Tarefas</span>
                        <span className="flex items-center gap-1"><span className="text-xs">📦</span> Entrega Material</span>
                        <span className="flex items-center gap-1"><span className="text-xs">⚠️</span> Revisão Risco</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-200 inline-block"></span> Fim-de-semana / Feriado</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  // 30-Day Timeline (Cronograma)
                  <div className="space-y-4 animate-fade-in" id="project-timeline-container">
                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Cronograma</h4>
                        <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-md px-2 py-0.5">
                          {(() => {
                            const end = new Date(cronogramaStartDate);
                            end.setDate(end.getDate() + 29);
                            return `${cronogramaStartDate.toLocaleDateString('pt-PT')} a ${end.toLocaleDateString('pt-PT')}`;
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={shiftCronogramaPrev}
                          className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 cursor-pointer transition-colors"
                          title="Voltar 5 dias"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={resetCronogramaToDefault}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 cursor-pointer transition-colors"
                          title="Voltar para a janela de 5 dias antes de hoje"
                        >
                          Hoje
                        </button>
                        <button
                          type="button"
                          onClick={shiftCronogramaNext}
                          className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 cursor-pointer transition-colors"
                          title="Avançar 5 dias"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsFullTimelineModalOpen(true)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 hover:text-blue-800 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ml-1"
                          title="Abrir cronograma em ecrã cheio"
                          id="btn-ecra-cheio"
                        >
                          <Maximize2 className="w-3.5 h-3.5" /> Ecrã cheio
                        </button>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1850px] text-xs text-left border-collapse table-fixed">
                          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200 whitespace-nowrap select-none">
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="p-3.5 sticky left-0 bg-slate-50 border-r border-slate-200 font-bold text-slate-700 w-56 min-w-[210px] shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-20 text-[11px] uppercase tracking-wider">
                                Tarefa
                              </th>
                              {(() => {
                                const days = [];
                                for (let i = 0; i < 30; i++) {
                                  const d = new Date(cronogramaStartDate);
                                  d.setDate(cronogramaStartDate.getDate() + i);
                                  const dayStr = formatDateToString(d);
                                  const isToday = dayStr === formatDateToString(new Date());
                                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                  
                                  days.push(
                                    <th 
                                      key={dayStr} 
                                      onClick={() => {
                                        setShowAddTaskForm(true);
                                        setNewTaskEstDate(dayStr);
                                        setShowImportTaskForm(false);
                                        setTimeout(() => {
                                          document.getElementById('add-task-form-panel')?.scrollIntoView({ behavior: 'smooth' });
                                        }, 50);
                                      }}
                                      className={`p-2 border-r border-slate-200/80 text-center min-w-[55px] font-bold cursor-pointer hover:bg-slate-200/50 transition-colors ${
                                        isToday ? 'bg-amber-100/60 text-amber-950 border-x border-amber-300' :
                                        isWeekend ? 'bg-slate-100/70 text-slate-500 hover:bg-slate-200/40' : 'text-slate-600'
                                      }`}
                                      title="Clique para adicionar tarefa neste dia"
                                    >
                                      <div className="text-[10px] uppercase font-semibold text-slate-400">
                                        {d.toLocaleDateString('pt-PT', { weekday: 'short' }).charAt(0).toUpperCase()}
                                      </div>
                                      <div className={`text-xs ${isToday ? 'font-extrabold text-amber-900' : ''}`}>{d.getDate()}</div>
                                      <div className="text-[8px] font-normal text-slate-400">
                                        {d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')}
                                      </div>
                                    </th>
                                  );
                                }
                                return days;
                              })()}
                            </tr>
                          </thead>
                          <tbody>
                            {/* Project Dates Summary Row */}
                            <tr className="bg-slate-50/60 border-b border-slate-200">
                              <td className="p-2.5 sticky left-0 bg-slate-100 border-r border-slate-200 font-bold text-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10">
                                <div className="flex items-center gap-1.5 text-blue-800">
                                  <Flag className="w-3.5 h-3.5 text-blue-600" />
                                  <span className="text-[10px] uppercase font-bold tracking-wide">Marcos do Projeto</span>
                                </div>
                              </td>
                              {(() => {
                                const cells = [];
                                for (let i = 0; i < 30; i++) {
                                  const d = new Date(cronogramaStartDate);
                                  d.setDate(cronogramaStartDate.getDate() + i);
                                  const dayStr = formatDateToString(d);
                                  const isToday = dayStr === formatDateToString(new Date());
                                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                  
                                  const isProjStart = selectedProj.startDate === dayStr;
                                  const isProjDelivery = selectedProj.deliveryDate === dayStr;
                                  const isProjEstimated = selectedProj.estimatedDate === dayStr;
                                  const isProjScheduled = selectedProj.scheduledDate === dayStr;
                                  const risksOnDay = projRiskItems.filter(ri => !ri.deleted && matchId(ri.projectId, selectedProj.id) && ri.reviewDate === dayStr);

                                  cells.push(
                                    <td key={dayStr} className={`p-1 border-r border-slate-200/80 text-center align-middle ${isToday ? 'bg-amber-50/40' : isWeekend ? 'bg-slate-100/40' : ''}`}>
                                      <div className="flex flex-col gap-0.5 items-center justify-center">
                                        {isProjStart && (
                                          <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[8px] font-extrabold rounded shadow-xs scale-90" title="Data de Início do Projeto">
                                            INÍCIO
                                          </span>
                                        )}
                                        {isProjDelivery && (
                                          <span className="px-1.5 py-0.5 bg-emerald-600 text-white text-[8px] font-extrabold rounded shadow-xs scale-90" title="Data de Entrega do Projeto">
                                            ENTREGA
                                          </span>
                                        )}
                                        {isProjEstimated && !isProjDelivery && (
                                          <span className="px-1.5 py-0.5 bg-slate-700 text-white text-[8px] font-extrabold rounded shadow-xs scale-90" title="Previsão de Conclusão">
                                            PREVISTO
                                          </span>
                                        )}
                                        {isProjScheduled && !isProjStart && (
                                          <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[8px] font-extrabold rounded shadow-xs scale-90" title="Instalação/Agendamento">
                                            AGENDADO
                                          </span>
                                        )}
                                        {risksOnDay.map(ri => (
                                          <span key={ri.id} className="px-1 py-0.5 bg-rose-600 text-white text-[8px] font-extrabold rounded shadow-xs flex items-center gap-0.5 scale-90 truncate max-w-[50px]" title={`Revisão de Risco: ${ri.title}`}>
                                            ⚠️ Rev. Risco
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                  );
                                }
                                return cells;
                              })()}
                            </tr>

                            {/* Sorted Task Rows */}
                            {(() => {
                              const sortedTasks = [...projTasks].sort((a, b) => {
                                const dateA = a.startDate || a.estimatedDate || a.endDate || '';
                                const dateB = b.startDate || b.estimatedDate || b.endDate || '';
                                return dateA.localeCompare(dateB);
                              });

                              if (sortedTasks.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={31} className="p-8 text-center text-slate-400 italic">
                                      Nenhuma tarefa ativa associada a este projeto. Crie ou importe tarefas acima.
                                    </td>
                                  </tr>
                                );
                              }

                              return sortedTasks.map(t => {
                                const stat = taskStatuses.find(s => s.id === t.statusId);
                                const assigneesText = t.assigneeIds && t.assigneeIds.length > 0
                                  ? t.assigneeIds.map(uid => getUserName(uid)).join(', ')
                                  : 'Não alocado';
                                
                                const conflicts = getTaskConflicts(t);

                                return (
                                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/20 group">
                                    <td 
                                      onClick={() => openTaskDetailsModal(t)}
                                      className="p-3 sticky left-0 bg-white group-hover:bg-slate-50 hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10 font-medium cursor-pointer transition-colors"
                                      title={`Clique para ver/editar: ${t.title}`}
                                    >
                                      <div className="space-y-1">
                                        <div className="font-bold text-slate-800 text-xs truncate max-w-[190px] group-hover:text-blue-600 transition-colors" title={t.title}>
                                          {t.title}
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-extrabold border tracking-wider ${
                                            t.statusId === 'ts-3' || t.statusId === '99999999-9999-9999-9999-999999999903'
                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                              : t.statusId === 'ts-2' || t.statusId === '99999999-9999-9999-9999-999999999902'
                                              ? 'bg-amber-50 text-amber-700 border-amber-200/50'
                                              : 'bg-blue-50 text-blue-700 border-blue-200/50'
                                          }`}>{getTaskStatusName(t.statusId, taskStatuses)}</span>
                                          
                                          <span className="text-[10px] text-slate-500 font-bold truncate max-w-[150px]">
                                            👤 {assigneesText}
                                          </span>
                                        </div>

                                        {/* Task Alerts & Warnings in the Row Headers */}
                                        {conflicts.length > 0 && (
                                          <div className="space-y-1 pt-1">
                                            {conflicts.map((c, i) => (
                                              <div 
                                                key={i} 
                                                className="flex items-start gap-1 p-1 bg-red-50 text-red-700 border border-red-200/60 rounded-md text-[9px] font-semibold leading-tight hover:bg-red-100 transition-colors"
                                                title={c.details}
                                              >
                                                <ShieldAlert className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                                <span className="break-words">{c.details}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    {(() => {
                                      const dayCells = [];
                                      for (let i = 0; i < 30; i++) {
                                        const d = new Date(cronogramaStartDate);
                                        d.setDate(cronogramaStartDate.getDate() + i);
                                        const dayStr = formatDateToString(d);
                                        const isToday = dayStr === formatDateToString(new Date());
                                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                        const isActive = isTaskActiveOnDay(t, dayStr);
                                        
                                        dayCells.push(
                                          <td 
                                            key={dayStr}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              if (!canWriteTasks) {
                                                alert('Não tem permissão para alterar tarefas.');
                                                return;
                                              }
                                              const taskId = e.dataTransfer.getData('taskId');
                                              if (taskId && updateTask) {
                                                const existingTask = tasks.find(t => t.id === taskId);
                                                if (existingTask && existingTask.startDate === dayStr && existingTask.endDate === dayStr && existingTask.estimatedDate === dayStr) {
                                                  return;
                                                }
                                                updateTask(taskId, {
                                                  startDate: dayStr,
                                                  endDate: dayStr,
                                                  estimatedDate: dayStr,
                                                });
                                              }
                                            }}
                                            className={`p-1 border-r border-slate-200/80 text-center align-middle relative min-w-[55px] ${
                                              isActive ? 'bg-blue-50/10' : ''
                                            } ${
                                              isToday ? 'bg-amber-50/30' : 
                                              isWeekend ? 'bg-slate-50/60' : ''
                                            }`}
                                          >
                                            {isActive && (
                                              <div 
                                                draggable={canWriteTasks}
                                                onDragStart={(e) => {
                                                  e.stopPropagation();
                                                  if (!canWriteTasks) {
                                                    e.preventDefault();
                                                    return;
                                                  }
                                                  e.dataTransfer.setData('taskId', t.id);
                                                }}
                                                className={`py-1.5 px-1 rounded-lg text-[9px] font-bold text-white -sm cursor-grab active:cursor-grabbing hover:scale-105 hover:brightness-95 active:scale-95 transition-all select-none overflow-hidden truncate max-w-[50px] mx-auto ${
                                                  t.statusId === 'ts-3' 
                                                    ? 'bg-emerald-500 hover:bg-emerald-600' 
                                                    : t.statusId === 'ts-2'
                                                    ? 'bg-amber-500 hover:bg-amber-600'
                                                    : 'bg-blue-500 hover:bg-blue-600'
                                                }`}
                                                title={`Tarefa: ${t.title}\nEstado: ${stat?.name || 'Pendente'}\nTécnico: ${assigneesText}\n(Arraste para outro dia para reagendar)`}
                                              >
                                                {t.title.substring(0, 5)}..
                                              </div>
                                            )}
                                          </td>
                                        );
                                      }
                                      return dayCells;
                                    })()}
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                      <div className="bg-slate-50 p-2.5 border-t border-slate-150 flex flex-wrap gap-4 justify-center text-[10px] font-bold text-slate-500">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Pendente</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Em Progresso</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Concluído</span>
                        <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 border border-red-200 bg-red-50 text-red-600 rounded flex items-center justify-center text-[8px]">⚠️</span> Alertas</span>
                        <span className="text-[9px] text-slate-400 italic font-medium ml-2">Dica: Arraste as barras coloridas para reagendar as tarefas para novos dias no cronograma.</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Comments Section */}
              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-blue-600" /> Notas & Comentários</h3>
                
                {/* Comment list */}
                {projComments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Sem comentários ou notas adicionadas.</p>
                ) : (
                  <div className="space-y-3">
                    {projComments.map(c => (
                      <div key={c.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-start text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{getUserName(c.authorId)}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{new Date(c.createdDate).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-600 italic">&quot;{c.comment}&quot;</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            askConfirmation(
                              'Eliminar comentário',
                              'Tem a certeza de que pretende eliminar este comentário/nota?',
                              () => deleteComment(c.id)
                            );
                          }}
                          className="text-red-500 hover:text-red-700 font-semibold text-[11px] cursor-pointer"
                        >
                          Apagar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Comment input form */}
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Adicione uma nota sobre o progresso ou alteração técnica..."
                    className="flex-1 p-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100"
                  />
                  <button 
                    onClick={() => {
                      if (newCommentText.trim()) {
                        addComment(selectedProj.id, currentUser?.id || 'u-1', newCommentText.trim());
                        setNewCommentText('');
                      }
                    }}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                  >
                    Enviar
                  </button>
                </div>
              </div>

            </div>

            {/* Right Meta Column (Fields) */}
            <div className="md:col-span-4 bg-slate-50/70 rounded-2xl p-5 border border-slate-100 space-y-6 text-xs">
              
              {/*  Status Overview */}
              
     
                <div  className="space-y-2.5">
                  <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Estado</h4>
                  <select 
                    value={selectedProj.statusId}
                    onChange={(e) => updateProject(selectedProj.id, { statusId: e.target.value })}
                    className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full font-bold text-blue-700 text-[10px] uppercase tracking-wide cursor-pointer outline-none hover:bg-blue-100 transition-colors"
                  >
                    {sortedStatuses.filter(s => !s.deleted || s.id === selectedProj.statusId).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2.5">
                  <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Categorias</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedProj.categoryIds && selectedProj.categoryIds.length > 0 ? (
                      selectedProj.categoryIds.map(catId => (
                        <span key={catId} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-semibold font-mono text-[10px]">
                          {getCategoryName(catId)}
                        </span>
                      ))
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-semibold font-mono text-[10px]">
                        {getCategoryName(selectedProj.categoryId)}
                      </span>
                    )}
                  </div>
                </div>
              

              {/* Governance & Team Contacts */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Equipa</h4>
                <div className="space-y-1.5 text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Project Leader:</span>
                    <span className="font-bold">{getUserName(selectedProj.projectManagerId)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Técnico responsável:</span>
                    <span className="font-bold">{getUserName(selectedProj.fieldManagerId)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Vendedor:</span>
                    <span className="font-bold">{getUserName(selectedProj.salesRepId)}</span>
                  </div>
                </div>
              </div>

              {/* Client Contact Info */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Contactos Cliente</h4>
                  <div className="space-y-1.5 text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Nome:</span>
                    <span className="font-bold">{selectedProj.clientContactName || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Email:</span>
                    <span className="font-bold">{selectedProj.clientContactEmail || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Telefone:</span>
                    <span className="font-bold">{selectedProj.clientContactPhone || '-'}</span>
                  </div>
                </div>


              </div>

              {/* Timeline Dates */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Datas importantes</h4>
                <div className="space-y-1.5 text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Data de adjudicação:</span>
                    <span className="font-bold">{selectedProj.startDate || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Prazo de entrega:</span>
                    <span className="font-bold text-blue-600">{selectedProj.deliveryDate || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Previsão de entrega real:</span>
                    <span className="font-bold">{selectedProj.estimatedDate || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Data agendamento:</span>
                    <span className="font-bold">{selectedProj.scheduledDate || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Systems / ERP Integration numbers */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Dados internos</h4>
                <div className="space-y-1.5 text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Nº IP:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedProj.installProjectNo || 'S/N'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Oportunidade SF:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedProj.sfOpportunityNo || 'S/N'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Valor da venda:</span>
                    <span className="font-mono font-bold text-slate-800">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(selectedProj.budgetValue)}</span>
                  </div>
                </div>
              </div>

              {/* Teams */}
              <div className="space-y-3">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">Equipas de apoio</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedProj.teamsInvolvedIds?.length > 0 ? (
                      selectedProj.teamsInvolvedIds.map(tid => {
                        const team = projectTeams.find(t => matchId(t.id, tid));
                        return (
                          <span key={tid} className="px-2 py-0.5 bg-slate-200 text-slate-700 font-bold rounded-md text-[10px]">
                            {team ? team.name : tid}
                          </span>
                        );
                      })
                    ) : <span className="text-slate-400 italic">Sem outras equipas alocadas</span>}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">Parceiros externos</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedProj.partnersIds?.length > 0 ? (
                      selectedProj.partnersIds.map(pid => {
                        const partner = projectPartners.find(p => matchId(p.id, pid));
                        return (
                          <span key={pid} className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold rounded-md text-[10px]">
                            {partner ? partner.name : pid}
                          </span>
                        );
                      })
                    ) : <span className="text-slate-400 italic">Nenhum parceiro alocado</span>}
                  </div>
                </div>
              
              {/* Documents Attachments list */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Documentação técnica</span>
                {selectedProj.documents?.length > 0 ? (
                  <div className="space-y-1 mt-1">
                    {selectedProj.documents.map((doc, i) => (
                      <div key={i} className="flex items-center gap-1.5 py-1 text-blue-600 hover:underline cursor-pointer">
                        <FileText className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                        <span className="font-semibold truncate max-w-[180px]">{doc}</span>
                      </div>
                    ))}
                  </div>
                ) : <span className="text-slate-400 italic block mt-1">Sem esquemas ou PDFs anexados.</span>}
              </div>

            </div>

          </div>
          )}

          {/* TAB 2: TAREFAS */}
          {activeDetailTab === 'tarefas' && (
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <ListTodo className="w-5 h-5 text-blue-600" />
                    Tarefas do Projeto ({projTasks.length})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Gestão de tarefas técnicas, marcos de projeto e prazos de execução</p>
                </div>
                <div className="flex gap-2">
                  {canWriteTasks && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setShowImportTaskForm(!showImportTaskForm);
                          setShowAddTaskForm(false);
                        }}
                        className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-emerald-600" /> Importar Tarefas Modelo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddTaskForm(!showAddTaskForm);
                          setShowImportTaskForm(false);
                        }}
                        className="flex items-center gap-1.5 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-xl transition-colors cursor-pointer shadow-xs"
                      >
                        <Plus className="w-4 h-4 text-white" /> Criar Tarefa / Marco
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline Import Task Form */}
              {showImportTaskForm && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 text-xs font-bold text-slate-700 animate-fade-in shadow-xs" id="import-task-form-panel">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="text-slate-800 font-extrabold text-sm">Importar Tarefa(s) Modelo</span>
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowImportTaskForm(false);
                        setSelectedImportModelTaskIds([]);
                      }}
                      className="text-slate-400 hover:text-slate-600 text-base font-normal px-1 cursor-pointer"
                    >
                      ×
                    </button>
                  </div>

                  <p className="text-slate-500 text-xs font-normal leading-relaxed">
                    Selecione um ou mais modelos de engenharia para clonar e adicionar de imediato a este projeto.
                  </p>

                  {defaultTasks && defaultTasks.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                      {defaultTasks.map(dt => {
                        const isChecked = selectedImportModelTaskIds.includes(dt.id);
                        return (
                          <label
                            key={dt.id}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                              isChecked
                                ? "bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs"
                                : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedImportModelTaskIds(prev => 
                                  prev.includes(dt.id) ? prev.filter(id => id !== dt.id) : [...prev, dt.id]
                                );
                              }}
                              className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                            />
                            <div className="text-xs leading-tight font-semibold flex-1">
                              <div className="flex justify-between items-center gap-1 font-bold text-slate-800">
                                <span className="truncate max-w-[160px]" title={dt.title}>{dt.title}</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono flex-shrink-0">
                                  {dt.estimatedHours}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-normal mt-1 truncate max-w-[200px]" title={dt.description}>
                                {dt.description || "Sem descrição."}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Não existem tarefas modelo configuradas.</p>
                  )}

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 mt-2">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowImportTaskForm(false);
                        setSelectedImportModelTaskIds([]);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="button" 
                      disabled={selectedImportModelTaskIds.length === 0}
                      onClick={() => {
                        const tasksToImport = selectedImportModelTaskIds.map(dtId => {
                          const dt = defaultTasks.find(item => item.id === dtId);
                          return dt ? {
                            projectId: selectedProj.id,
                            title: dt.title,
                            statusId: getDefaultTaskStatusId(taskStatuses),
                            taskTypeId: dt.taskTypeId || getDefaultTaskTypeId(taskTypes),
                            assigneeIds: [],
                            estimatedDate: '',
                            description: dt.description || '',
                            estimatedHours: dt.estimatedHours || '08:00',
                            actualHours: '00:00',
                            startDate: '',
                            startTime: '',
                            endDate: '',
                            endTime: '',
                            notes: 'Importada a partir do modelo de tarefas por defeito.'
                          } : null;
                        }).filter(Boolean);

                        if (tasksToImport.length > 0) {
                          if (addTasks) {
                            addTasks(tasksToImport);
                          } else {
                            tasksToImport.forEach(t => addTask(t));
                          }
                          alert(`Sucesso! Foram importadas ${tasksToImport.length} tarefas com sucesso para o projeto.`);
                        }

                        setSelectedImportModelTaskIds([]);
                        setShowImportTaskForm(false);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Importar ({selectedImportModelTaskIds.length})
                    </button>
                  </div>
                </div>
              )}

              {/* Inline Add Task / Milestone Form */}
              {showAddTaskForm && (
                <form id="add-task-form-panel" onSubmit={handleCreateTask} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 text-xs font-bold text-slate-700 animate-fade-in shadow-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <div>
                      <span className="text-slate-800 font-extrabold text-sm block">Nova Tarefa / Marco para o Projeto</span>
                      <span className="text-xs font-medium text-slate-500 block mt-0.5">
                        Cliente: <strong className="text-slate-700 font-bold">{getClientName(selectedProj.clientId)}</strong> | Projeto: <strong className="text-slate-700 font-bold">{selectedProj.title}</strong>
                      </span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setShowAddTaskForm(false)}
                      className="text-slate-400 hover:text-slate-600 text-base font-normal px-1 cursor-pointer"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-700 font-bold">Título da Tarefa ou Marco *</label>
                    <input 
                      type="text" 
                      required
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      placeholder="Ex: Instalação física dos sensores de barreira / Entrega da Fase 1"
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-700 font-bold">Descrição / Instruções Técnicas</label>
                    <textarea 
                      value={newTaskDesc}
                      onChange={e => setNewTaskDesc(e.target.value)}
                      rows={2}
                      placeholder="Instruções para o técnico no terreno ou critérios do marco..."
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  {/* Task Type Dropdown */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Tipo de Tarefa</label>
                    <select
                      value={newTaskTypeId}
                      onChange={e => setNewTaskTypeId(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer"
                    >
                      <option value="">Selecione o tipo de tarefa...</option>
                      {taskTypes.filter(tt => !tt.deleted).map(tt => (
                        <option key={tt.id} value={tt.id}>
                          {getTaskTypeName(tt.id, taskTypes)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="block text-slate-700 font-bold">Horas Estimadas (HH:MM)</label>
                      <input 
                        type="text" 
                        required
                        value={newTaskEstHours}
                        onChange={e => setNewTaskEstHours(e.target.value)}
                        placeholder="08:00"
                        className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                      />
                    </div>

                    <AssigneeSelector
                      users={users}
                      userGroups={userGroups}
                      allowedGroupIds={appConfig?.taskAssigneeGroupIds}
                      selectedIds={newTaskAssignees}
                      onChange={setNewTaskAssignees}
                      filterTeamOnly
                    />

                    <div className="space-y-1">
                      <label className="block text-slate-700 font-bold">Data Prevista</label>
                      <input 
                        type="date" 
                        value={newTaskEstDate}
                        onChange={e => setNewTaskEstDate(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 mt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowAddTaskForm(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              )}

              {/* Tasks List */}
              {projTasks.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs font-medium">
                  Nenhuma tarefa ou marco associado a este projeto.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...projTasks].sort((a, b) => {
                    const dateA = a.startDate || a.estimatedDate || a.endDate || '';
                    const dateB = b.startDate || b.estimatedDate || b.endDate || '';
                    if (!dateA && !dateB) return 0;
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    return dateA.localeCompare(dateB);
                  }).map(task => (
                    <div 
                      key={task.id} 
                      onClick={() => openTaskDetailsModal(task)}
                      className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 shadow-xs space-y-2 cursor-pointer transition-all hover:shadow-md"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded">
                              {getTaskStatusName(task.statusId, taskStatuses)}
                            </span>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-bold rounded flex items-center gap-1">
                              {getTaskTypeName(task.taskTypeId, taskTypes).toLowerCase().includes('marco') && <Flag className="w-3 h-3 text-purple-600" />}
                              {getTaskTypeName(task.taskTypeId, taskTypes)}
                            </span>
                          </div>
                          <h4 className="font-extrabold text-slate-900 text-sm hover:text-blue-600 transition-colors">{task.title}</h4>
                        </div>
                      </div>
                      {task.description && (
                        <p className="text-xs text-slate-600 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex justify-between items-center text-[11px] text-slate-500 pt-2 border-t border-slate-100 font-medium">
                        <span>Previsão: {task.estimatedDate ? new Date(task.estimatedDate + 'T00:00:00').toLocaleDateString('pt-PT') : 'Sem data'}</span>
                        {task.estimatedHours && <span>Est: {task.estimatedHours}h</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MATERIAL */}
          {activeDetailTab === 'material' && (
            <div className="p-6 space-y-6">
              {/* Red Warning Banner if material is missing */}
              {hasMissingMaterials ? (
                <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 flex items-center justify-between text-rose-900 shadow-xs animate-fade-in">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
                    <div>
                      <h4 className="font-extrabold text-sm uppercase tracking-wide text-rose-800">Aviso: Material em falta</h4>
                      <p className="text-xs font-semibold text-rose-700 mt-0.5">
                        Este projeto possui {missingMaterialsCount} {missingMaterialsCount === 1 ? 'linha de material pendente' : 'linhas de material pendentes'} que ainda não {missingMaterialsCount === 1 ? 'está' : 'estão'} em armazém.
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-rose-200 text-rose-900 rounded-full text-xs font-black uppercase tracking-wider shrink-0">
                    Material em Falta
                  </span>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between text-emerald-900 shadow-xs">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="font-extrabold text-sm uppercase tracking-wide text-emerald-800">Todo o Material em Armazém</h4>
                      <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                        Não existem avisos ou materiais pendentes de receção no armazém para este projeto.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Header with Registar material button */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-blue-600" />
                    Lista de Material Necessário ({projMaterials.length} {projMaterials.length === 1 ? 'linha' : 'linhas'})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Acompanhamento de encomendas e stock de materiais do projeto
                  </p>
                </div>
                {canWriteProjects && (
                  <button
                    type="button"
                    onClick={handleOpenAddMaterialModal}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Registar material</span>
                  </button>
                )}
              </div>

              {/* Material lines grouped by Supplier */}
              <div className="space-y-6">
                {projMaterials.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs font-medium">
                    Nenhum material ou encomenda registada para este projeto.
                  </div>
                ) : (
                  projMaterialsGrouped.map(([supplierName, items]) => {
                    const groupMissing = items.filter(i => {
                      const st = pendingMaterialStatuses[i.id] || i.status;
                      return st !== 'em_armazem' && st !== 'em_stock';
                    }).length;

                      return (
                        <div key={supplierName} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                          {/* Supplier Group Header */}
                          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                            <div className="flex items-center gap-2.5">
                              <Truck className="w-4 h-4 text-blue-600 shrink-0" />
                              <h4 className="font-extrabold text-slate-900 text-sm">{supplierName}</h4>
                              <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-extrabold">
                                {items.length} {items.length === 1 ? 'item' : 'itens'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-bold">
                              {groupMissing > 0 ? (
                                <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-200 rounded-full text-[10px] uppercase tracking-wide flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  {groupMissing} em falta
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] uppercase tracking-wide flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Tudo em armazém
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Table of items */}
                          <div className="overflow-x-auto w-full">
                            <table className="w-full min-w-[850px] text-left text-xs divide-y divide-slate-100">
                              <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200/80 whitespace-nowrap select-none">
                                <tr>
                                  <th className="px-4 py-3">Descrição</th>
                                  <th className="px-3 py-3">Ref.</th>
                                  <th className="px-3 py-3 text-center">Qtd</th>
                                  <th className="px-3 py-3">Data Prevista</th>
                                  <th className="px-3 py-3 text-left">N° de orçamento</th>
                                  <th className="px-3 py-3 text-right">P. Custo</th>
                                  <th className="px-3 py-3 text-right">P. Venda</th>
                                  <th className="px-4 py-3 text-center">Estado do Material</th>
                                  {canWriteProjects && <th className="px-3 py-3 text-center">Ações</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-medium">
                                {items.map(item => {
                                  const effectiveStatus = pendingMaterialStatuses[item.id] || item.status;
                                  const isEmArmazem = effectiveStatus === 'em_armazem' || effectiveStatus === 'em_stock';
                                  const isEncomendado = effectiveStatus === 'encomendado';

                                  return (
                                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                      <td className="px-4 py-3 font-bold text-slate-900">{item.description}</td>
                                      <td className="px-3 py-3 text-slate-500 font-mono text-[11px]">{item.reference || '-'}</td>
                                      <td className="px-3 py-3 text-center font-bold text-slate-800">{item.quantity}</td>
                                      <td className="px-3 py-3 text-slate-600">{item.expectedDeliveryDate || '-'}</td>
                                      <td className="px-3 py-3 text-left font-semibold text-slate-700">{item.budget ? String(item.budget) : '-'}</td>
                                      <td className="px-3 py-3 text-right text-slate-600">{item.costPrice ? `${item.costPrice} €` : '-'}</td>
                                      <td className="px-3 py-3 text-right font-bold text-emerald-700">{item.salePrice ? `${item.salePrice} €` : '-'}</td>
                                      <td className="px-4 py-3 text-center">
                                        <button
                                          type="button"
                                          disabled={!canWriteProjects}
                                          onClick={() => handleToggleMaterialStatus(item)}
                                          className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 mx-auto cursor-pointer ${
                                            isEmArmazem
                                              ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
                                              : isEncomendado
                                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                          }`}
                                          title={canWriteProjects ? 'Clique para alterar estado (Por encomendar / Encomendado / Em armazém)' : ''}
                                        >
                                          {isEmArmazem ? (
                                            <>
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                              <span>Em armazém</span>
                                            </>
                                          ) : isEncomendado ? (
                                            <>
                                              <Truck className="w-3.5 h-3.5 text-amber-600" />
                                              <span>Encomendado</span>
                                            </>
                                          ) : (
                                            <>
                                              <ShoppingBag className="w-3.5 h-3.5 text-slate-500" />
                                              <span>Por encomendar</span>
                                            </>
                                          )}
                                        </button>
                                      </td>
                                      {canWriteProjects && (
                                        <td className="px-3 py-3 text-center space-x-1">
                                          <button
                                            type="button"
                                            onClick={() => handleEditMaterial(item)}
                                            className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                                            title="Editar"
                                          >
                                            <Edit2 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteMaterial(item.id)}
                                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                            title="Eliminar"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              {/* MODAL FORM: Registar material */}
              {isMaterialModalOpen && canWriteProjects && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
                  <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 border border-slate-100 my-8">
                    {/* Modal Header */}
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                      <h3 className="font-extrabold text-slate-900 flex items-center gap-2.5 text-base">
                        <Package className="w-5 h-5 text-blue-600" />
                        {editingMaterialId ? 'Editar Material' : 'Registar material'}
                      </h3>
                      <button
                        type="button"
                        onClick={handleCloseMaterialModal}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Modal Form */}
                    <form onSubmit={handleSaveMaterial} className="space-y-4 text-xs font-medium">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        
                        {/* Descrição (Required) */}
                        <div className="sm:col-span-2 space-y-1">
                          <label className="block font-bold text-slate-700">Descrição *</label>
                          <input
                            type="text"
                            required
                            value={matDesc}
                            onChange={e => setMatDesc(e.target.value)}
                            placeholder="Ex: Sensor indutivo IFM 24V M12"
                            className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-semibold"
                          />
                        </div>

                        {/* Fornecedor (Required + Autocomplete) */}
                        <div className="sm:col-span-2 space-y-1 relative">
                          <label className="block font-bold text-slate-700">Fornecedor *</label>
                          <input
                            type="text"
                            required
                            value={matSupplier}
                            onChange={e => {
                              setMatSupplier(e.target.value);
                              setIsSupplierAutocompleteOpen(true);
                            }}
                            onFocus={() => setIsSupplierAutocompleteOpen(true)}
                            placeholder="Comece a escrever o fornecedor..."
                            className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-semibold"
                          />
                          {/* Autocomplete Suggestions */}
                          {isSupplierAutocompleteOpen && matSupplier.trim() !== '' && (
                            (() => {
                              const matches = allSuppliers.filter(s => s.toLowerCase().includes(matSupplier.toLowerCase().trim()));
                              if (matches.length === 0) return null;
                              return (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-48 overflow-y-auto divide-y divide-slate-100">
                                  {matches.map((s, idx) => (
                                    <div
                                      key={idx}
                                      onClick={() => {
                                        setMatSupplier(s);
                                        setIsSupplierAutocompleteOpen(false);
                                      }}
                                      className="p-2.5 hover:bg-blue-50 text-slate-800 font-semibold cursor-pointer text-xs flex justify-between items-center"
                                    >
                                      <span>{s}</span>
                                      <span className="text-[10px] text-slate-400">Sugestão</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()
                          )}
                        </div>

                        {/* Quantidade */}
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-700">Quantidade</label>
                          <input
                            type="number"
                            min="1"
                            value={matQty}
                            onChange={e => setMatQty(Number(e.target.value))}
                            className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-semibold"
                          />
                        </div>

                        {/* Referência */}
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-700">Referência</label>
                          <input
                            type="text"
                            value={matRef}
                            onChange={e => setMatRef(e.target.value)}
                            placeholder="Ex: REF-88231"
                            className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-semibold"
                          />
                        </div>

                        {/* N° de orçamento */}
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-700">N° de orçamento</label>
                          <input
                            type="text"
                            value={matBudget}
                            onChange={e => setMatBudget(e.target.value)}
                            placeholder="Ex: ORÇ-2026/01"
                            className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-semibold"
                          />
                        </div>

                        {/* Preço Custo */}
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-700">Preço Custo (€)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={matCostPrice}
                            onChange={e => setMatCostPrice(Number(e.target.value))}
                            className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-semibold"
                          />
                        </div>

                        {/* Preço Venda */}
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-700">Preço Venda (€)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={matSalePrice}
                            onChange={e => setMatSalePrice(Number(e.target.value))}
                            className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-semibold"
                          />
                        </div>

                        {/* Data Prevista de Entrega */}
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-700">Data Prevista de Entrega</label>
                          <input
                            type="date"
                            value={matDeliveryDate}
                            onChange={e => setMatDeliveryDate(e.target.value)}
                            className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-semibold"
                          />
                        </div>

                        {/* Estado Inicial */}
                        <div className="space-y-1 sm:col-span-2">
                          <label className="block font-bold text-slate-700">Estado do Material</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setMatStatus('por_encomendar')}
                              className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                                matStatus === 'por_encomendar'
                                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              <ShoppingBag className="w-3.5 h-3.5 text-blue-600" /> Por encomendar
                            </button>
                            <button
                              type="button"
                              onClick={() => setMatStatus('encomendado')}
                              className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                                matStatus === 'encomendado'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              <Truck className="w-3.5 h-3.5 text-amber-600" /> Encomendado
                            </button>
                            <button
                              type="button"
                              onClick={() => setMatStatus('em_armazem')}
                              className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                                matStatus === 'em_armazem' || matStatus === 'em_stock'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Em armazém
                            </button>
                          </div>
                        </div>

                      </div>

                      {/* Modal Footer */}
                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={handleCloseMaterialModal}
                          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition-colors cursor-pointer text-xs"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2 text-xs"
                        >
                          <Plus className="w-4 h-4" />
                          {editingMaterialId ? 'Atualizar Linha' : 'Registar material'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: GESTÃO DE RISCOS */}
          {activeDetailTab === 'riscos' && (
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-blue-600" />
                    Gestão e Mitigação de Riscos do Projeto
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Identificação, classificação e acompanhamento de riscos com planos de ação integrados</p>
                </div>
              </div>

              {/* Risks Statistics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Riscos Identificados</span>
                  <span className="text-2xl font-extrabold text-slate-800 mt-1">{projRiskItems.length}</span>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider">Riscos Críticos</span>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-2xl font-extrabold text-rose-700">
                      {projRiskItems.filter(ri => (ri.probability * ri.impact) >= 16).length}
                    </span>
                    {projRiskItems.filter(ri => (ri.probability * ri.impact) >= 16).length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                    )}
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Riscos Altos / Médios</span>
                  <span className="text-2xl font-extrabold text-amber-700 mt-1">
                    {projRiskItems.filter(ri => {
                      const score = ri.probability * ri.impact;
                      return score >= 6 && score < 16;
                    }).length}
                  </span>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Riscos Fechados</span>
                  <span className="text-2xl font-extrabold text-emerald-700 mt-1">
                    {projRiskItems.filter(ri => {
                      const st = riskStatuses.find(s => s.id === ri.statusId);
                      return (st?.name || '').toLowerCase() === 'fechado';
                    }).length}
                  </span>
                </div>
              </div>

              {/* Filters & Actions Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                {/* Search */}
                <div className="relative w-full sm:w-72">
                  <input
                    type="text"
                    placeholder="Pesquisar por título ou descrição..."
                    value={riskSearchQuery}
                    onChange={e => setRiskSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100 text-slate-800 placeholder-slate-400"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                  <select
                    value={riskFilterCategory}
                    onChange={e => setRiskFilterCategory(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden text-slate-600 cursor-pointer"
                  >
                    <option value="">Todas as Categorias</option>
                    {riskCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>

                  <select
                    value={riskFilterStatus}
                    onChange={e => setRiskFilterStatus(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden text-slate-600 cursor-pointer"
                  >
                    <option value="">Todos os Estados</option>
                    {riskStatuses.map(st => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>

                  {canWriteProjects && (
                    <button
                      type="button"
                      onClick={() => {
                        resetRiskForm();
                        setShowRiskModal(true);
                      }}
                      className="flex items-center gap-1.5 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" /> Identificar Risco
                    </button>
                  )}
                </div>
              </div>

              {/* Risks List */}
              {projRiskItems.filter(ri => {
                const matchesSearch = !riskSearchQuery.trim() || 
                  (ri.title || '').toLowerCase().includes(riskSearchQuery.toLowerCase()) ||
                  (ri.description || '').toLowerCase().includes(riskSearchQuery.toLowerCase());
                const matchesCategory = !riskFilterCategory || ri.categoryId === riskFilterCategory;
                const matchesStatus = !riskFilterStatus || ri.statusId === riskFilterStatus;
                return matchesSearch && matchesCategory && matchesStatus;
              }).length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-semibold flex flex-col items-center gap-3">
                  <ShieldAlert className="w-8 h-8 text-slate-300" />
                  <span>Não foram encontrados riscos com os critérios definidos.</span>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full min-w-[900px] text-left text-xs divide-y divide-slate-100">
                      <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200/80 whitespace-nowrap select-none">
                        <tr>
                          <th className="px-5 py-3.5">Título / Categoria</th>
                          <th className="px-3 py-3.5">Responsável</th>
                          <th className="px-3 py-3.5 text-center">Probabilidade</th>
                          <th className="px-3 py-3.5 text-center">Impacto</th>
                          <th className="px-3 py-3.5 text-center">Nível de Risco</th>
                          <th className="px-3 py-3.5 text-center">Prioridade</th>
                          <th className="px-4 py-3.5 text-center">Estado</th>
                          <th className="px-3 py-3.5 text-center">Próx. Revisão</th>
                          <th className="px-5 py-3.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {projRiskItems.filter(ri => {
                          const matchesSearch = !riskSearchQuery.trim() || 
                            (ri.title || '').toLowerCase().includes(riskSearchQuery.toLowerCase()) ||
                            (ri.description || '').toLowerCase().includes(riskSearchQuery.toLowerCase());
                          const matchesCategory = !riskFilterCategory || ri.categoryId === riskFilterCategory;
                          const matchesStatus = !riskFilterStatus || ri.statusId === riskFilterStatus;
                          return matchesSearch && matchesCategory && matchesStatus;
                        }).map(item => {
                          const level = getRiskLevelDetails(item.probability, item.impact);
                          const isExpanded = expandedRiskId === item.id;
                          const ownerName = item.ownerId ? getUserName(item.ownerId) : 'Sem responsável';

                          return (
                            <React.Fragment key={item.id}>
                              <tr className={`hover:bg-slate-50/50 transition-colors ${isExpanded ? 'bg-blue-50/20' : ''}`}>
                                <td className="px-5 py-3.5">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-bold text-slate-900 text-xs">{item.title}</span>
                                    <span className="text-[10px] text-slate-400 font-semibold">{getRiskCategoryName(item.categoryId)}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-3.5 text-slate-600">
                                  <div className="flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="font-semibold">{ownerName}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-3.5 text-center font-extrabold text-slate-800 text-[13px]">{item.probability}</td>
                                <td className="px-3 py-3.5 text-center font-extrabold text-slate-800 text-[13px]">{item.impact}</td>
                                <td className="px-3 py-3.5 text-center">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center justify-center gap-1 max-w-[130px] mx-auto ${level.color}`}>
                                    <span>{level.dot}</span>
                                    <span>{level.label} ({level.score})</span>
                                  </span>
                                </td>
                                <td className="px-3 py-3.5 text-center">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-extrabold border border-slate-200">
                                    {getRiskPriorityName(item.priorityId)}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-extrabold">
                                    {getRiskStatusName(item.statusId)}
                                  </span>
                                </td>
                                <td className="px-3 py-3.5 text-center text-slate-500 font-semibold">{item.reviewDate || '-'}</td>
                                <td className="px-5 py-3.5 text-right space-x-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRiskId(isExpanded ? null : item.id)}
                                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                    title={isExpanded ? "Ocultar Detalhes" : "Ver Detalhes"}
                                  >
                                    <Info className="w-4 h-4" />
                                  </button>
                                  {canWriteProjects && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleEditRisk(item)}
                                        className="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                                        title="Editar Risco"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRisk(item.id)}
                                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                        title="Eliminar Risco"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </td>
                              </tr>

                              {/* Expanded Row */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={9} className="bg-slate-50/80 px-8 py-5 border-t border-b border-slate-100">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700 font-medium leading-relaxed">
                                      <div className="space-y-3">
                                        <div>
                                          <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Descrição do Risco</span>
                                          <p className="bg-white p-3 rounded-xl border border-slate-100 text-slate-800 whitespace-pre-wrap shadow-2xs font-semibold">
                                            {item.description || <span className="text-slate-400 italic">Sem descrição registada.</span>}
                                          </p>
                                        </div>
                                        <div>
                                          <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Consequência</span>
                                          <p className="bg-white p-3 rounded-xl border border-slate-100 text-slate-800 whitespace-pre-wrap shadow-2xs font-semibold">
                                            {item.consequence || <span className="text-slate-400 italic">Sem consequências registadas.</span>}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="space-y-3">
                                        <div>
                                          <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Plano de Mitigação</span>
                                          <p className="bg-white p-3 rounded-xl border border-slate-100 text-slate-800 whitespace-pre-wrap shadow-2xs font-semibold">
                                            {item.mitigationPlan || <span className="text-slate-400 italic">Sem plano de mitigação registado.</span>}
                                          </p>
                                        </div>
                                        <div>
                                          <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Plano de Contingência</span>
                                          <p className="bg-white p-3 rounded-xl border border-slate-100 text-slate-800 whitespace-pre-wrap shadow-2xs font-semibold">
                                            {item.contingencyPlan || <span className="text-slate-400 italic">Sem plano de contingência registado.</span>}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ANÁLISE DO PROJETO */}
          {activeDetailTab === 'analise' && (
            <div className="p-6 space-y-6 animate-fade-in">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  Análise Geral do Projeto
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Estatísticas acumuladas de carga horária, técnicos, desvios de datas e distribuição de tarefas</p>
              </div>

              {/* Stats & Charts Content */}
              {(() => {
                let totalWorkloadMins = 0;
                let totalEstMins = 0;
                let totalActMins = 0;
                const technicianIds = new Set<string>();
                const taskCountsByType: Record<string, { count: number; workloadMins: number; estMins: number; actMins: number }> = {};
                const taskCountsByTech: Record<string, { count: number; workloadMins: number }> = {};

                const parseMins = (timeStr?: string) => {
                  if (!timeStr) return 0;
                  const parts = timeStr.split(':').map(Number);
                  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    return parts[0] * 60 + parts[1];
                  }
                  return 0;
                };

                projTasks.forEach(t => {
                  const estM = parseMins(t.estimatedHours);
                  const actM = parseMins(t.actualHours);
                  const taskWorkload = actM > 0 ? actM : estM;

                  totalWorkloadMins += taskWorkload;
                  totalEstMins += estM;
                  totalActMins += actM;

                  if (t.assigneeIds && t.assigneeIds.length > 0) {
                    t.assigneeIds.forEach(id => {
                      technicianIds.add(id);
                      const uName = getUserName(id) || 'Técnico';
                      if (!taskCountsByTech[uName]) {
                        taskCountsByTech[uName] = { count: 0, workloadMins: 0 };
                      }
                      taskCountsByTech[uName].count += 1;
                      taskCountsByTech[uName].workloadMins += taskWorkload;
                    });
                  } else {
                    const unassigned = 'Sem Técnico Atribuído';
                    if (!taskCountsByTech[unassigned]) {
                      taskCountsByTech[unassigned] = { count: 0, workloadMins: 0 };
                    }
                    taskCountsByTech[unassigned].count += 1;
                    taskCountsByTech[unassigned].workloadMins += taskWorkload;
                  }

                  const typeName = getTaskTypeName(t.taskTypeId, taskTypes) || 'Geral';
                  if (!taskCountsByType[typeName]) {
                    taskCountsByType[typeName] = { count: 0, workloadMins: 0, estMins: 0, actMins: 0 };
                  }
                  taskCountsByType[typeName].count += 1;
                  taskCountsByType[typeName].workloadMins += taskWorkload;
                  taskCountsByType[typeName].estMins += estM;
                  taskCountsByType[typeName].actMins += actM;
                });

                const formatMins = (m: number) => {
                  const hrs = Math.floor(m / 60);
                  const mins = m % 60;
                  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
                };

                const startDateStr = selectedProj.startDate ? new Date(selectedProj.startDate + 'T00:00:00').toLocaleDateString('pt-PT') : 'Não definida';
                const deliveryDateStr = selectedProj.deliveryDate ? new Date(selectedProj.deliveryDate + 'T00:00:00').toLocaleDateString('pt-PT') : 'Não definida';
                const estimatedDateStr = selectedProj.estimatedDate ? new Date(selectedProj.estimatedDate + 'T00:00:00').toLocaleDateString('pt-PT') : 'Não definida';
                const scheduledDateStr = selectedProj.scheduledDate ? new Date(selectedProj.scheduledDate + 'T00:00:00').toLocaleDateString('pt-PT') : 'Não definida';

                let daysDiffAdjudicationToDelivery = '-';
                if (selectedProj.startDate && selectedProj.deliveryDate) {
                  const diffTime = new Date(selectedProj.deliveryDate).getTime() - new Date(selectedProj.startDate).getTime();
                  const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
                  daysDiffAdjudicationToDelivery = `${diffDays} dias`;
                }

                let daysDiffEstimatedToDelivery = '-';
                if (selectedProj.deliveryDate && selectedProj.estimatedDate) {
                  const diffTime = new Date(selectedProj.estimatedDate).getTime() - new Date(selectedProj.deliveryDate).getTime();
                  const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
                  daysDiffEstimatedToDelivery = diffDays > 0 ? `+${diffDays}d (Atraso)` : `${diffDays}d`;
                }

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Card 1: Carga Horária */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Carga horária</span>
                        <div className="text-xl font-black text-slate-900">{formatMins(totalWorkloadMins)}h</div>
                        <p className="text-[10px] text-slate-500 font-medium truncate">Soma de horas efetivas e estimativas pendentes</p>
                      </div>

                      {/* Card 2: Prazo Venda */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Prazo de Entrega (Venda)</span>
                        <div className="text-xl font-black text-slate-900">{daysDiffAdjudicationToDelivery}</div>
                        <div className="text-[10px] text-slate-500 font-medium">De {startDateStr} a {deliveryDateStr}</div>
                      </div>

                      {/* Card 3: Desvio Estimativa Real */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Desvio de Estimativa Real</span>
                        <div className={`text-xl font-black ${daysDiffEstimatedToDelivery.includes('Atraso') ? 'text-amber-600' : 'text-slate-900'}`}>
                          {daysDiffEstimatedToDelivery}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">Estimada real: {estimatedDateStr}</div>
                      </div>
                    </div>

                    {/* Contagem por Tipo de Tarefa */}
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                      <div className="p-4 bg-slate-50 border-b border-slate-100 font-extrabold text-xs text-slate-800 uppercase tracking-wide">
                        Contagem e Carga Horária por Tipo de Tarefa
                      </div>
                      <div className="overflow-x-auto w-full">
                        <table className="w-full min-w-[420px] text-left border-collapse text-xs">
                          <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200/80 whitespace-nowrap select-none">
                            <tr>
                              <th className="px-4 py-2.5">Tipo de Tarefa</th>
                              <th className="px-4 py-2.5 text-center">N.º de Tarefas</th>
                              <th className="px-4 py-2.5 text-right">Carga Horária</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                            {Object.keys(taskCountsByType).length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-4 py-6 text-center text-slate-400 italic font-normal">Nenhuma tarefa registada para este projeto.</td>
                              </tr>
                            ) : (
                              Object.entries(taskCountsByType).map(([tName, data]) => (
                                <tr key={tName} className="hover:bg-slate-50">
                                  <td className="px-4 py-3 font-extrabold text-slate-800">{tName}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full font-extrabold">{data.count}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{formatMins(data.workloadMins)}h</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Contagem e Carga Horária por Técnico */}
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                      <div className="p-4 bg-slate-50 border-b border-slate-100 font-extrabold text-xs text-slate-800 uppercase tracking-wide">
                        Contagem e Carga Horária por Técnico
                      </div>
                      <div className="overflow-x-auto w-full">
                        <table className="w-full min-w-[420px] text-left border-collapse text-xs">
                          <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200/80 whitespace-nowrap select-none">
                            <tr>
                              <th className="px-4 py-2.5">Técnico</th>
                              <th className="px-4 py-2.5 text-center">N.º de Tarefas</th>
                              <th className="px-4 py-2.5 text-right">Carga Horária</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                            {Object.keys(taskCountsByTech).length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-4 py-6 text-center text-slate-400 italic font-normal">Nenhum técnico atribuído a tarefas deste projeto.</td>
                              </tr>
                            ) : (
                              Object.entries(taskCountsByTech).map(([techName, data]) => (
                                <tr key={techName} className="hover:bg-slate-50">
                                  <td className="px-4 py-3 font-extrabold text-slate-800">{techName}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full font-extrabold">{data.count}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{formatMins(data.workloadMins)}h</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      ) : isEditing ? (
        
        // 2. PROJECT EDIT OR CREATE FORM
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 -sm animate-fade-in">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">
              {editingId ? `Editar Projeto: ID ${editingId}` : 'Adicionar novo projeto'}
            </h2>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="text-xs font-semibold text-white bg-black hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-900"
              >
                Gravar Alterações
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-bold text-slate-700">
            
            {/* Client Suggested Select */}
            <div className="space-y-1 relative" id="client-autocomplete-container">
              <label className="block text-slate-500">Cliente *</label>
              <div className="relative">
                <input 
                  type="text" 
                  required
                  value={clientSearchQuery}
                  onChange={e => {
                    setClientSearchQuery(e.target.value);
                    setShowClientSuggestions(true);
                  }}
                  onFocus={() => setShowClientSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowClientSuggestions(false), 250)}
                  placeholder="Pesquisar cliente por nome..."
                  className="w-full p-2.5 pr-8 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none bg-white font-semibold text-slate-800"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
              </div>

              {showClientSuggestions && (
                <div className="absolute z-50 left-0 right-0 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl -lg mt-1 p-1">
                  {autocompleteClients.length > 0 ? (
                    autocompleteClients.map(c => {
                      const isSelected = formClient === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => {
                            setFormClient(c.id);
                            setClientSearchQuery(`${c.clientName} (${c.shortName})`);
                            setShowClientSuggestions(false);
                          }}
                          className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 cursor-pointer ${
                            isSelected 
                              ? 'bg-blue-50 text-blue-800 font-bold' 
                              : 'hover:bg-slate-50 text-slate-700 font-semibold'
                          }`}
                        >
                          <span className="truncate">{c.clientName}</span>
                          <span className="text-[10px] text-slate-400 font-normal">{c.shortName} • {c.location || 'Sem localização'}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-slate-400 italic text-[11px] font-medium">
                      Nenhum cliente encontrado
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-slate-500">Nome do projeto *</label>
              <input 
                type="text" 
                required
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Ex: Instalação de Balança Multicabeçal e Tapete Rejeitor"
                className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-sm font-semibold"
              />
            </div>

            {/* Description */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-slate-500">Descrição</label>
              <textarea 
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                rows={4}
                placeholder="Introduza os detalhes do projeto..."
                className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none text-xs font-medium"
              />
            </div>

            {/* Budget */}
            <div className="space-y-1">
              <label className="block text-slate-500">Valor da venda (€)</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-slate-400 font-bold">€</span>
                <input 
                  type="number" 
                  value={formBudget}
                  onChange={e => setFormBudget(Number(e.target.value))}
                  className="w-full pl-8 pr-3 p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none font-semibold"
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="block text-slate-500 font-bold">Categorias</label>
              <div className="border border-slate-200 rounded-xl p-3 max-h-[120px] overflow-y-auto bg-slate-50/50 space-y-1.5">
                {projectCategories.filter(c => !c.deleted).map(c => {
                  const isChecked = formCategories.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setFormCategories(formCategories.filter(id => id !== c.id));
                          } else {
                            setFormCategories([...formCategories, c.id]);
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      {c.name}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Project status */}
            <div className="space-y-1">
              <label className="block text-slate-500">Estado do projeto</label>
              <select 
                value={formStatus}
                onChange={e => setFormStatus(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
              >
                {sortedStatuses.filter(s => !s.deleted || s.id === formStatus).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Project Manager (Team Type Users) */}
            <div className="space-y-1">
              <label className="block text-slate-500">Project Leader *</label>
              <select 
                required
                value={formProjManager}
                onChange={e => setFormProjManager(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
              >
                <option value="">Escolher utilizador</option>
                {(() => {
                  const projGroupIds = appConfig?.projManagerGroupIds || (appConfig?.projManagerGroupId ? [appConfig.projManagerGroupId] : []);
                  const filteredUsers = projGroupIds.length > 0
                    ? users.filter(u => projGroupIds.includes(u.roleId || '') && !u.deleted)
                    : users.filter(u => u.type === 'Team' && !u.deleted);
                  
                  // Keep currently selected user even if deleted or not in the group
                  if (formProjManager && !filteredUsers.some(u => u.id === formProjManager)) {
                    const currentMgr = users.find(u => u.id === formProjManager);
                    if (currentMgr) {
                      filteredUsers.push(currentMgr);
                    }
                  }

                  filteredUsers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }));

                  return filteredUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ));
                })()}
              </select>
            </div>

            {/* Field Manager (Team Type Users) */}
            <div className="space-y-1">
              <label className="block text-slate-500">Técnico responsável</label>
              <select 
                value={formFieldManager}
                onChange={e => setFormFieldManager(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
              >
                <option value="">Escolher utilizador</option>
                {(() => {
                  const fieldGroupIds = appConfig?.fieldManagerGroupIds || (appConfig?.fieldManagerGroupId ? [appConfig.fieldManagerGroupId] : []);
                  const filteredUsers = fieldGroupIds.length > 0
                    ? users.filter(u => fieldGroupIds.includes(u.roleId || '') && !u.deleted)
                    : users.filter(u => u.type === 'Team' && !u.deleted);
                  
                  // Keep currently selected user even if deleted or not in the group
                  if (formFieldManager && !filteredUsers.some(u => u.id === formFieldManager)) {
                    const currentMgr = users.find(u => u.id === formFieldManager);
                    if (currentMgr) {
                      filteredUsers.push(currentMgr);
                    }
                  }

                  filteredUsers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }));

                  return filteredUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ));
                })()}
              </select>
            </div>

            {/* Sales Representative */}
            <div className="space-y-1">
              <label className="block text-slate-500">Gestor de vendas</label>
              <select 
                value={formSales}
                onChange={e => setFormSales(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
              >
                <option value="">Escolher utilizador</option>
                {(() => {
                  const salesGroupIds = appConfig?.salesRepGroupIds || (appConfig?.salesRepGroupId ? [appConfig.salesRepGroupId] : []);
                  const filteredUsers = salesGroupIds.length > 0
                    ? users.filter(u => salesGroupIds.includes(u.roleId || '') && !u.deleted)
                    : users.filter(u => (u.type === 'Sales' || u.type === 'Team') && !u.deleted);
                  
                  // Keep currently selected user even if deleted or not in the group
                  if (formSales && !filteredUsers.some(u => u.id === formSales)) {
                    const currentSales = users.find(u => u.id === formSales);
                    if (currentSales) {
                      filteredUsers.push(currentSales);
                    }
                  }

                  filteredUsers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }));

                  return filteredUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ));
                })()}
              </select>
            </div>

            {/* Demo Checkbox */}
            <div className="space-y-1 flex items-center h-full pt-4 pl-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={formDemo}
                  onChange={e => setFormDemo(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <span className="text-slate-700">Marcar como Projeto de Demonstração</span>
              </label>
            </div>

            {/* Dates: Start & Delivery */}
            <div className="space-y-1">
              <label className="block text-slate-500">Data de adjudicação *</label>
              <input 
                type="date" 
                required
                value={formStartDate}
                onChange={e => setFormStartDate(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Pazo de entrega da venda</label>
              <input 
                type="date" 
                value={formDeliveryDate}
                onChange={e => setFormDeliveryDate(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
              />
            </div>

            {/* Dates: Estimated & Scheduled */}
            <div className="space-y-1">
              <label className="block text-slate-500">Data estimada real</label>
              <input 
                type="date" 
                value={formEstimatedDate}
                onChange={e => setFormEstimatedDate(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Data agendada com cliente</label>
              <input 
                type="date" 
                value={formScheduledDate}
                onChange={e => setFormScheduledDate(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
              />
            </div>

            {/* Client Contact Details */}
            <div className="space-y-4 md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-slate-400" />
                Contactos do Cliente no Projeto
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-500 text-xs">Nome</label>
                  <input 
                    type="text" 
                    value={formClientContactName}
                    onChange={e => setFormClientContactName(e.target.value)}
                    placeholder="Nome completo"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-500 text-xs">Email</label>
                  <input 
                    type="email" 
                    value={formClientContactEmail}
                    onChange={e => setFormClientContactEmail(e.target.value)}
                    placeholder="email@cliente.pt"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-500 text-xs">Telefone</label>
                  <input 
                    type="tel" 
                    value={formClientContactPhone}
                    onChange={e => setFormClientContactPhone(e.target.value)}
                    placeholder="+351 912345678"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Integration Fields: Install No & SF Opport No */}
            <div className="space-y-1">
              <label className="block text-slate-500">Install Project</label>
              <input 
                type="text" 
                value={formInstallNo}
                onChange={e => setFormInstallNo(e.target.value)}
                placeholder="Ex: IP-2026-092"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Oportunidade SF</label>
              <input 
                type="text" 
                value={formSFNo}
                onChange={e => setFormSFNo(e.target.value)}
                placeholder="Ex: SF-OPP-1044"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold font-mono"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label className="block text-slate-500">Prioridade</label>
              <select 
                value={formPriority}
                onChange={e => setFormPriority(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
              >
                {projectPriorities.filter(p => !p.deleted || matchId(p.id, formPriority)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Teams Involved (Multiple Choice checkbox list) */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-slate-500 mb-1.5">Equipas envolvidas</label>
              <div className="flex flex-wrap gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                {projectTeams.filter(team => !team.deleted || formTeams.some(tid => matchId(tid, team.id))).map(team => (
                  <label key={team.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={formTeams.some(tid => matchId(tid, team.id))}
                      onChange={() => handleToggleTeam(team.id)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-slate-700">{team.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Partners Involved (Multiple Choice checkbox list) */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-slate-500 mb-1.5">Parceiros externos</label>
              <div className="flex flex-wrap gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                {projectPartners.filter(p => !p.deleted || formPartners.some(pid => matchId(pid, p.id))).map(p => (
                  <label key={p.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={formPartners.some(pid => matchId(pid, p.id))}
                      onChange={() => handleTogglePartner(p.id)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-slate-700">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Documents lists input */}
            <div className="space-y-2 md:col-span-2">
              <label className="block text-slate-500">Esquemas Técnicos / Documentos (Anexos)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newDocName}
                  onChange={e => setNewDocName(e.target.value)}
                  placeholder="Introduza o nome do ficheiro (ex: Esquema_Pneumatico_v1.pdf)"
                  className="flex-1 p-2 border border-slate-200 rounded-xl"
                />
                <button 
                  type="button"
                  onClick={addDocument}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl font-bold"
                >
                  Adicionar
                </button>
              </div>
              
              {formDocs.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formDocs.map((doc, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg">
                      <span className="font-semibold truncate max-w-[200px]">{doc}</span>
                      <button 
                        type="button" 
                        onClick={() => removeDocument(idx)}
                        className="text-red-500 hover:text-red-700 font-extrabold ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Default Tasks Selection section */}
            {!editingId && defaultTasks && defaultTasks.length > 0 && (
              <div className="space-y-2 md:col-span-2 border-t border-slate-100 pt-5 mt-2">
                <label className="block text-slate-800 font-extrabold text-sm flex items-center gap-1.5 mb-1">
                  <ListTodo className="w-4 h-4 text-emerald-600" />
                  Modelos de Tarefa por Defeito
                </label>
                <p className="text-slate-400 text-[10px] font-medium leading-relaxed mb-3">
                  Selecione quais as tarefas padrão que deseja que sejam criadas automaticamente associadas a este novo projeto.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                  {defaultTasks.map(dt => (
                    <label 
                      key={dt.id} 
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        selectedDefaultTaskIds.includes(dt.id)
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input 
                        type="checkbox"
                        checked={selectedDefaultTaskIds.includes(dt.id)}
                        onChange={() => toggleDefaultTask(dt.id)}
                        className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                      />
                      <div className="text-[11px] leading-tight font-semibold flex-1">
                        <div className="flex justify-between items-center gap-1 font-bold text-slate-800">
                          <span className="truncate max-w-[150px]">{dt.title}</span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono flex-shrink-0">
                            {dt.estimatedHours}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5 truncate max-w-[200px]">
                          {dt.description || "Sem descrição."}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

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
              className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors -sm"
            >
              Gravar Alterações
            </button>
          </div>
        </form>

      ) : (

        // 3. MAIN PROJECTS PIPELINE DASHBOARD (LIST VIEW)
        <div className="bg-white rounded-2xl border border-slate-200 -sm overflow-hidden animate-fade-in">
          
          {/* List Header and Filter controls */}
          <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/60 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">Lista de projetos</h2>
                <p className="text-xs text-slate-500 mt-0.5">Consulta e pesquisa de projetos</p>
              </div>
              {canWriteProjects && (
                <button 
                  type="button"
                  onClick={() => openForm(null)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" /> Novo projeto
                </button>
              )}
            </div>

            {/* Filter inputs */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex-1 min-w-[240px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar por título, ID ou referência de instalação..."
                  className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
                />
              </div>

              {/* Category dropdown */}
              <select 
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="">Todas as Categorias</option>
                {projectCategories.filter(c => !c.deleted).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {/* Manager dropdown */}
              <select 
                value={filterManager}
                onChange={e => setFilterManager(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="">Todos os Gestores</option>
                {users.filter(u => !u.deleted && projects.some(p => !p.deleted && (p.projectManagerId === u.id || matchId(p.projectManagerId, u.id))))
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }))
                  .map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                }
              </select>

              {/* Status dropdown */}
              <select 
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="">Todos os Estados</option>
                {sortedStatuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              {/* Completed filter checkbox */}
              <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 select-none cursor-pointer hover:bg-slate-50 transition-colors">
                <input 
                  type="checkbox"
                  checked={showCompleted}
                  onChange={e => setShowCompleted(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 cursor-pointer"
                />
                <span>Mostrar concluídos</span>
              </label>
            </div>
          </div>

          {/* Table list output */}
          <div className="overflow-x-auto w-full">
            {filteredProjects.length === 0 ? (
              <div className="p-10 text-center text-slate-400 font-medium text-xs">Nenhum projeto encontrado para os filtros selecionados.</div>
            ) : (
              <table className="w-full min-w-[700px] text-left border-collapse">
                <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200/80 whitespace-nowrap select-none">
                  <tr>
                    <th className="px-5 py-3.5 text-left">IP / Gestor</th>
                    <th className="px-5 py-3.5 text-left">Projeto</th>
                    <th className="px-5 py-3.5 text-left">Datas</th>
                    <th className="px-5 py-3.5 text-left">Estado</th>
                    <th className="px-5 py-3.5 text-left">Risco / Prioridade</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-100">
                  {paginatedProjects.map(proj => {
                    const calcRisk = getProjectCalculatedRisk(proj.id, projectRiskItems);
                    const isCritical = calcRisk.score >= 16;
                    return (
                      <tr 
                        key={proj.id} 
                        className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                          isCritical ? 'border-l-4 border-l-rose-600 bg-rose-50/10' : ''
                        }`}
                        onClick={() => setSelectedProjectId(proj.id)}
                      >
                        <td className="px-5 py-4">
                          <div className="font-mono font-bold text-slate-800">{proj.installProjectNo || '-'}</div>
                          <div className="text-[12px] text-slate-500 font-medium">{getUserName(proj.projectManagerId)}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {isCritical && (
                              <span className="w-1.5 h-7 bg-rose-600 rounded-full shrink-0" title="Risco Crítico do Projeto" />
                            )}
                            <div>
                              <div className="text-xs text-blue-600 font-medium">{getClientName(proj.clientId)}</div>
                              <div className="font-extrabold text-slate-800 line-clamp-1 text-sm">{proj.title}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-500 font-medium">
                          <div>Venda: {proj.startDate || '-'}</div>
                          <div>Entrega: {proj.scheduledDate || proj.estimatedDate || proj.deliveryDate || '-'}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            proj.statusId === 'ps-5' || proj.statusId === 'ps-4'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : proj.statusId === 'ps-7'
                              ? 'bg-amber-50 text-amber-700 border border-amber-100'
                              : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}>
                            {getStatusName(proj.statusId)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border inline-flex items-center gap-1 ${calcRisk.color}`}>
                              <span>{calcRisk.dot}</span>
                              <span>Risco: {calcRisk.label}</span>
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium pl-0.5">
                              Prioridade: {getPriorityName(proj.priorityId)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Project List Pagination Controls */}
          {totalProjects > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 bg-slate-50/70 border-t border-slate-200/80 text-xs gap-3 font-medium">
              <div className="flex items-center gap-3 text-slate-500 font-medium">
                <span>
                  A mostrar <span className="font-bold text-slate-700">{totalProjects === 0 ? 0 : startProjectIndex + 1}</span> a{' '}
                  <span className="font-bold text-slate-700">{endProjectIndex}</span> de{' '}
                  <span className="font-bold text-slate-700">{totalProjects}</span> projetos
                </span>
                <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                  <span className="text-slate-400">Por página:</span>
                  <select
                    value={projectPageSize}
                    onChange={e => {
                      setProjectPageSize(Number(e.target.value));
                      setProjectCurrentPage(1);
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

              {totalProjectPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setProjectCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={validProjectPage === 1}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Anterior</span>
                  </button>
                  
                  <div className="flex items-center gap-1 mx-1">
                    {getPaginationPages(validProjectPage, totalProjectPages).map((p, idx) => (
                      p === '...' ? (
                        <span key={`ellipsis-proj-${idx}`} className="px-1 text-slate-400 font-bold">...</span>
                      ) : (
                        <button
                          key={`page-proj-${p}`}
                          onClick={() => setProjectCurrentPage(Number(p))}
                          className={`min-w-[28px] h-7 px-1.5 flex items-center justify-center rounded-lg font-bold text-xs transition-colors ${
                            validProjectPage === p
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
                    onClick={() => setProjectCurrentPage(prev => Math.min(prev + 1, totalProjectPages))}
                    disabled={validProjectPage === totalProjectPages}
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

      {/* Modal do Cronograma em Ecrã Cheio */}
      {isFullTimelineModalOpen && selectedProj && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-6 transition-all duration-300">
          <div className="w-full max-w-[95vw] h-[90vh] bg-white rounded-2xl -2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm md:text-base uppercase tracking-wider">
                    Cronograma de 30 Dias: {selectedProj.title}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    Navegue e reagende tarefas arrastando as barras coloridas
                  </p>
                </div>
              </div>

              {/* Top Controls & Navigation */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-md px-2.5 py-1 hidden sm:inline-block">
                  {(() => {
                    const end = new Date(cronogramaStartDate);
                    end.setDate(end.getDate() + 29);
                    return `${cronogramaStartDate.toLocaleDateString('pt-PT')} a ${end.toLocaleDateString('pt-PT')}`;
                  })()}
                </span>
                
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={shiftCronogramaPrev}
                    className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 cursor-pointer transition-colors"
                    title="Voltar 5 dias"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> -5d
                  </button>
                  <button
                    type="button"
                    onClick={resetCronogramaToDefault}
                    className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 cursor-pointer transition-colors"
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={shiftCronogramaNext}
                    className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 cursor-pointer transition-colors"
                    title="Avançar 5 dias"
                  >
                    +5d <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setIsFullTimelineModalOpen(false)}
                  className="p-1.5 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
                  title="Fechar modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body - Scrollable Timeline Table */}
            <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50/50">
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs h-full flex flex-col">
                <div className="overflow-auto flex-1">
                  <table className="w-full min-w-[1850px] text-xs text-left border-collapse table-fixed">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200 whitespace-nowrap select-none">
                      <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                        <th className="p-3.5 sticky left-0 bg-slate-50 border-r border-slate-200 font-bold text-slate-700 w-56 min-w-[210px] shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-30 text-[11px] uppercase tracking-wider">
                          Tarefa
                        </th>
                        {(() => {
                          const days = [];
                          for (let i = 0; i < 30; i++) {
                            const d = new Date(cronogramaStartDate);
                            d.setDate(cronogramaStartDate.getDate() + i);
                            const dayStr = formatDateToString(d);
                            const isToday = dayStr === formatDateToString(new Date());
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            
                            days.push(
                              <th 
                                key={`modal-th-${dayStr}`} 
                                onClick={() => {
                                  setIsFullTimelineModalOpen(false);
                                  setShowAddTaskForm(true);
                                  setNewTaskEstDate(dayStr);
                                  setShowImportTaskForm(false);
                                  setTimeout(() => {
                                    document.getElementById('add-task-form-panel')?.scrollIntoView({ behavior: 'smooth' });
                                  }, 150);
                                }}
                                className={`p-2 border-r border-slate-200/80 text-center min-w-[55px] font-bold cursor-pointer hover:bg-slate-200/50 transition-colors ${
                                  isToday ? 'bg-amber-100/60 text-amber-950 border-x border-amber-300' :
                                  isWeekend ? 'bg-slate-100/70 text-slate-500 hover:bg-slate-200/40' : 'text-slate-600'
                                }`}
                                title="Clique para adicionar tarefa neste dia"
                              >
                                <div className="text-[10px] uppercase font-semibold text-slate-400">
                                  {d.toLocaleDateString('pt-PT', { weekday: 'short' }).charAt(0).toUpperCase()}
                                </div>
                                <div className={`text-xs ${isToday ? 'font-extrabold text-amber-900' : ''}`}>{d.getDate()}</div>
                                <div className="text-[8px] font-normal text-slate-400">
                                  {d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')}
                                </div>
                              </th>
                            );
                          }
                          return days;
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Project Dates Summary Row */}
                      <tr className="bg-slate-50/60 border-b border-slate-200">
                        <td className="p-2.5 sticky left-0 bg-slate-100 border-r border-slate-200 font-bold text-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10">
                          <div className="flex items-center gap-1.5 text-blue-800">
                            <Flag className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[10px] uppercase font-bold tracking-wide">Marcos do Projeto</span>
                          </div>
                        </td>
                        {(() => {
                          const cells = [];
                          for (let i = 0; i < 30; i++) {
                            const d = new Date(cronogramaStartDate);
                            d.setDate(cronogramaStartDate.getDate() + i);
                            const dayStr = formatDateToString(d);
                            const isToday = dayStr === formatDateToString(new Date());
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            
                            const isProjStart = selectedProj.startDate === dayStr;
                            const isProjDelivery = selectedProj.deliveryDate === dayStr;
                            const isProjEstimated = selectedProj.estimatedDate === dayStr;
                            const isProjScheduled = selectedProj.scheduledDate === dayStr;

                            cells.push(
                              <td key={`modal-cell-proj-${dayStr}`} className={`p-1 border-r border-slate-200/80 text-center align-middle ${isToday ? 'bg-amber-50/40' : isWeekend ? 'bg-slate-100/40' : ''}`}>
                                <div className="flex flex-col gap-0.5 items-center justify-center">
                                  {isProjStart && (
                                    <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[8px] font-extrabold rounded shadow-xs scale-90" title="Data de Início do Projeto">
                                      INÍCIO
                                    </span>
                                  )}
                                  {isProjDelivery && (
                                    <span className="px-1.5 py-0.5 bg-emerald-600 text-white text-[8px] font-extrabold rounded shadow-xs scale-90" title="Data de Entrega do Projeto">
                                      ENTREGA
                                    </span>
                                  )}
                                  {isProjEstimated && !isProjDelivery && (
                                    <span className="px-1.5 py-0.5 bg-slate-700 text-white text-[8px] font-extrabold rounded shadow-xs scale-90" title="Previsão de Conclusão">
                                      PREVISTO
                                    </span>
                                  )}
                                  {isProjScheduled && !isProjStart && (
                                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[8px] font-extrabold rounded shadow-xs scale-90" title="Instalação/Agendamento">
                                      AGENDADO
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          }
                          return cells;
                        })()}
                      </tr>

                      {/* Sorted Task Rows */}
                      {(() => {
                        const sortedTasks = [...projTasks].sort((a, b) => {
                          const dateA = a.startDate || a.estimatedDate || a.endDate || '';
                          const dateB = b.startDate || b.estimatedDate || b.endDate || '';
                          return dateA.localeCompare(dateB);
                        });

                        if (sortedTasks.length === 0) {
                          return (
                            <tr>
                              <td colSpan={31} className="p-8 text-center text-slate-400 italic">
                                Nenhuma tarefa ativa associada a este projeto. Crie ou importe tarefas acima.
                              </td>
                            </tr>
                          );
                        }

                        return sortedTasks.map(t => {
                          const stat = taskStatuses.find(s => s.id === t.statusId);
                          const assigneesText = t.assigneeIds && t.assigneeIds.length > 0
                            ? t.assigneeIds.map(uid => getUserName(uid)).join(', ')
                            : 'Não alocado';
                          
                          const conflicts = getTaskConflicts(t);

                          return (
                            <tr key={`modal-row-task-${t.id}`} className="border-b border-slate-100 hover:bg-slate-50/20 group">
                              <td 
                                onClick={() => openTaskDetailsModal(t)}
                                className="p-3 sticky left-0 bg-white group-hover:bg-slate-50 hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10 font-medium cursor-pointer transition-colors"
                                title={`Clique para ver/editar: ${t.title}`}
                              >
                                <div className="space-y-1">
                                  <div className="font-bold text-slate-800 text-xs truncate max-w-[190px] group-hover:text-blue-600 transition-colors" title={t.title}>
                                    {t.title}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-extrabold border tracking-wider ${
                                      t.statusId === 'ts-3' || t.statusId === '99999999-9999-9999-9999-999999999903'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                        : t.statusId === 'ts-2' || t.statusId === '99999999-9999-9999-9999-999999999902'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200/50'
                                        : 'bg-blue-50 text-blue-700 border-blue-200/50'
                                    }`}>{getTaskStatusName(t.statusId, taskStatuses)}</span>
                                    
                                    <span className="text-[10px] text-slate-500 font-bold truncate max-w-[150px]">
                                      👤 {assigneesText}
                                    </span>
                                  </div>

                                  {/* Task Alerts & Warnings */}
                                  {conflicts.length > 0 && (
                                    <div className="space-y-1 pt-1">
                                      {conflicts.map((c, idx) => (
                                        <div 
                                          key={`modal-conflict-${idx}`} 
                                          className="flex items-start gap-1 p-1 bg-red-50 text-red-700 border border-red-200/60 rounded-md text-[9px] font-semibold leading-tight hover:bg-red-100 transition-colors"
                                          title={c.details}
                                        >
                                          <ShieldAlert className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                          <span className="break-words">{c.details}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              {(() => {
                                const dayCells = [];
                                for (let i = 0; i < 30; i++) {
                                  const d = new Date(cronogramaStartDate);
                                  d.setDate(cronogramaStartDate.getDate() + i);
                                  const dayStr = formatDateToString(d);
                                  const isToday = dayStr === formatDateToString(new Date());
                                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                  const isActive = isTaskActiveOnDay(t, dayStr);
                                  
                                  dayCells.push(
                                    <td 
                                      key={`modal-daycell-${t.id}-${dayStr}`}
                                      onDragOver={(e) => e.preventDefault()}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        if (!canWriteTasks) {
                                          alert('Não tem permissão para alterar tarefas.');
                                          return;
                                        }
                                        const taskId = e.dataTransfer.getData('taskId');
                                        if (taskId && updateTask) {
                                          const existingTask = tasks.find(t => t.id === taskId);
                                          if (existingTask && existingTask.startDate === dayStr && existingTask.endDate === dayStr && existingTask.estimatedDate === dayStr) {
                                            return;
                                          }
                                          updateTask(taskId, {
                                            startDate: dayStr,
                                            endDate: dayStr,
                                            estimatedDate: dayStr,
                                          });
                                        }
                                      }}
                                      className={`p-1 border-r border-slate-200/80 text-center align-middle relative min-w-[55px] ${
                                        isActive ? 'bg-blue-50/10' : ''
                                      } ${
                                        isToday ? 'bg-amber-50/30' : 
                                        isWeekend ? 'bg-slate-50/60' : ''
                                      }`}
                                    >
                                      {isActive && (
                                        <div 
                                          draggable={canWriteTasks}
                                          onDragStart={(e) => {
                                            e.stopPropagation();
                                            if (!canWriteTasks) {
                                              e.preventDefault();
                                              return;
                                            }
                                            e.dataTransfer.setData('taskId', t.id);
                                          }}
                                          className={`py-1.5 px-1 rounded-lg text-[9px] font-bold text-white -sm cursor-grab active:cursor-grabbing hover:scale-105 hover:brightness-95 active:scale-95 transition-all select-none overflow-hidden truncate max-w-[50px] mx-auto ${
                                            t.statusId === 'ts-3' 
                                              ? 'bg-emerald-500 hover:bg-emerald-600' 
                                              : t.statusId === 'ts-2'
                                              ? 'bg-amber-500 hover:bg-amber-600'
                                              : 'bg-blue-500 hover:bg-blue-600'
                                          }`}
                                          title={`Tarefa: ${t.title}\nEstado: ${stat?.name || 'Pendente'}\nTécnico: ${assigneesText}\n(Arraste para outro dia para reagendar)`}
                                        >
                                          {t.title.substring(0, 5)}..
                                        </div>
                                      )}
                                    </td>
                                  );
                                }
                                return dayCells;
                              })()}
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-wrap gap-4 items-center justify-between text-[10px] font-bold text-slate-500 flex-shrink-0">
              <div className="flex flex-wrap gap-4 items-center">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Pendente</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Em Progresso</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Concluído</span>
                <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 border border-red-200 bg-red-50 text-red-600 rounded flex items-center justify-center text-[8px]">⚠️</span> Alertas</span>
                <span className="text-[10px] text-slate-400 italic font-medium">Arraste as barras coloridas das tarefas no cronograma para reagendá-las em novos dias.</span>
              </div>
              <button
                type="button"
                onClick={() => setIsFullTimelineModalOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-colors cursor-pointer text-xs -md -slate-100"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {showRiskModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs font-bold text-slate-700">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-blue-600" />
                {editingRiskId ? 'Editar Risco Identificado' : 'Identificar Novo Risco de Projeto'}
              </h3>
              <button
                type="button"
                onClick={() => setShowRiskModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveRisk} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700">
                
                {/* Title */}
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-slate-500 font-bold">Título do Risco *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Atraso na entrega de equipamentos críticos"
                    value={riskTitle}
                    onChange={e => setRiskTitle(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden font-semibold text-slate-800"
                  />
                </div>

                {/* Category & Owner */}
                <div className="space-y-1">
                  <label className="block text-slate-500 font-bold">Categoria do Risco *</label>
                  <select
                    required
                    value={riskCategoryId}
                    onChange={e => setRiskCategoryId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden bg-white font-semibold text-slate-800 cursor-pointer"
                  >
                    {riskCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500 font-bold">Responsável / Proprietário do Risco</label>
                  <select
                    value={riskOwnerId}
                    onChange={e => setRiskOwnerId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden bg-white font-semibold text-slate-800 cursor-pointer"
                  >
                    <option value="">Sem responsável (Geral)</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                {/* Identification Date & suggested review date */}
                <div className="space-y-1">
                  <label className="block text-slate-500 font-bold">Data de Identificação *</label>
                  <input
                    type="date"
                    required
                    value={riskIdentificationDate}
                    onChange={e => {
                      const val = e.target.value;
                      setRiskIdentificationDate(val);
                      if (!editingRiskId) {
                        setRiskReviewDate(calculateSuggestedReviewDate(riskProbability, riskImpact, val));
                      }
                    }}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden font-semibold text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-slate-500 font-bold">Data da Próxima Revisão *</label>
                    <span className="text-[9px] text-blue-600 font-extrabold uppercase bg-blue-50 px-1.5 py-0.5 rounded">Sugestão Automática</span>
                  </div>
                  <input
                    type="date"
                    required
                    value={riskReviewDate}
                    onChange={e => setRiskReviewDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden font-semibold text-slate-800"
                  />
                </div>

                {/* Probability & Impact */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <span className="block text-[10px] uppercase font-black text-slate-500 tracking-wider">Avaliação da Probabilidade</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={riskProbability}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setRiskProbability(val);
                        if (!editingRiskId) {
                          setRiskReviewDate(calculateSuggestedReviewDate(val, riskImpact, riskIdentificationDate));
                        }
                      }}
                      className="flex-1 accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                    />
                    <span className="w-10 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center font-black text-blue-800 text-sm">{riskProbability}</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wide">
                    <span>Muito Baixo (1)</span>
                    <span>Muito Alto (5)</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <span className="block text-[10px] uppercase font-black text-slate-500 tracking-wider">Avaliação do Impacto</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={riskImpact}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setRiskImpact(val);
                        if (!editingRiskId) {
                          setRiskReviewDate(calculateSuggestedReviewDate(riskProbability, val, riskIdentificationDate));
                        }
                      }}
                      className="flex-1 accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                    />
                    <span className="w-10 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center font-black text-blue-800 text-sm">{riskImpact}</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wide">
                    <span>Muito Baixo (1)</span>
                    <span>Muito Alto (5)</span>
                  </div>
                </div>

                {/* Auto Calculated Risk Score Badge */}
                <div className="md:col-span-2 flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Nível de Risco Calculado</span>
                    <span className="text-xs font-semibold text-slate-300">Fórmula: Probabilidade ({riskProbability}) × Impacto ({riskImpact})</span>
                  </div>
                  {(() => {
                    const level = getRiskLevelDetails(riskProbability, riskImpact);
                    return (
                      <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border shadow-sm ${level.color}`}>
                        {level.dot} {level.label} ({level.score})
                      </span>
                    );
                  })()}
                </div>

                {/* State & Priority */}
                <div className="space-y-1">
                  <label className="block text-slate-500 font-bold">Estado do Risco *</label>
                  <select
                    required
                    value={riskStatusId}
                    onChange={e => setRiskStatusId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden bg-white font-semibold text-slate-800 cursor-pointer"
                  >
                    {riskStatuses.map(st => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500 font-bold">Prioridade *</label>
                  <select
                    required
                    value={riskPriorityId}
                    onChange={e => setRiskPriorityId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden bg-white font-semibold text-slate-800 cursor-pointer"
                  >
                    {riskPriorities.map(pr => (
                      <option key={pr.id} value={pr.id}>{pr.name}</option>
                    ))}
                  </select>
                </div>

                {/* Description & Consequence */}
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-slate-500 font-bold">Descrição do Risco</label>
                  <textarea
                    rows={2}
                    placeholder="Descreva detalhadamente o risco e os fatores de ocorrência..."
                    value={riskDescription}
                    onChange={e => setRiskDescription(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden font-semibold text-slate-800 placeholder-slate-400"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-slate-500 font-bold">Impacto / Consequência</label>
                  <textarea
                    rows={2}
                    placeholder="Quais as consequências reais para o projeto caso este risco se materialize?"
                    value={riskConsequence}
                    onChange={e => setRiskConsequence(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden font-semibold text-slate-800 placeholder-slate-400"
                  />
                </div>

                {/* Action Plans */}
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-slate-500 font-bold">Plano de Mitigação (Ações Preventivas)</label>
                  <textarea
                    rows={2}
                    placeholder="Quais as ações preventivas para reduzir a probabilidade de ocorrência?"
                    value={riskMitigationPlan}
                    onChange={e => setRiskMitigationPlan(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden font-semibold text-slate-800 placeholder-slate-400"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-slate-500 font-bold">Plano de Contingência (Ações Corretivas)</label>
                  <textarea
                    rows={2}
                    placeholder="Qual o plano de ação caso o risco se materialize de facto?"
                    value={riskContingencyPlan}
                    onChange={e => setRiskContingencyPlan(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-hidden font-semibold text-slate-800 placeholder-slate-400"
                  />
                </div>

              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRiskModal(false)}
                  className="px-5 py-2.5 text-xs font-extrabold text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {editingRiskId ? 'Gravar Alterações' : 'Adicionar Item de Risco'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
