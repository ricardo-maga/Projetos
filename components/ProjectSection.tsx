'use client';

import { M3FilterChip, M3SectionHeader, M3SegmentedControl } from './M3';
import { Tabs } from './ui/Tabs';
import ProjectAnalytics from './ProjectAnalytics';
import React, { useState, useEffect } from 'react';
import { Project, Client, Comment, Task, TaskType, DefaultTask, UserAbsence, ProjectMaterial, ProjectRiskItem, RiskCategory, RiskStatus, RiskPriority } from '../lib/types';
import { 
  Plus, Search, Edit2, Trash2, ArrowLeft, Calendar, FileText, 
  Sparkles, DollarSign, Users, ShieldAlert, PlusCircle, MessageSquare, ListTodo, CheckSquare, BrainCircuit,
  X, Clock, ChevronLeft, ChevronRight, AlertTriangle, AlertCircle, Info, Flag, Bell, Maximize2, Link2, UserCheck, Check,
  Package, Truck, CheckCircle2, Boxes, Tag, ShoppingBag, BarChart3, Loader2
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { AssigneeSelector } from './AssigneeSelector';
import TaskDetailsModal, { TaskModalMode } from './TaskDetailsModal';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import Textarea from './ui/Textarea';

import { hasPermission } from '../lib/permissions';
import { stringToUUID } from '../lib/supabaseSync';
import { getAuthHeaders } from '../lib/clientAuth';
import { normalizeTaskFromApiResponse } from '../lib/taskOperations';
import { getProjectCalculatedRisk, getTaskStatusName, getDefaultTaskStatusId, matchTaskStatusId, getTaskTypeName, getDefaultTaskTypeId, checkTaskSchedulingConflicts, stripSecondsFromHours, formatToOnlyHours, getProjectStatusStyle, getTaskStatusStyle, translateToCanonicalRoleIds } from '../lib/utils';

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
  addTasks?: (tasks: any[]) => any;
  updateTask: (id: string, updates: any) => void;
  deleteTask?: (id: string) => void;
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
  addProjectRiskItem?: (item: any) => Promise<{ success: boolean; message?: string }>;
  updateProjectRiskItem?: (id: string, updates: any) => Promise<{ success: boolean; message?: string }>;
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
  deleteTask,
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
  const [isSavingRisk, setIsSavingRisk] = useState(false);
  const riskSaveInFlight = React.useRef(false);
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
  const [projectListView, setProjectListView] = useState<'lista' | 'analise'>('lista');
  const [filterStatusGroup, setFilterStatusGroup] = useState<'active' | 'implementation' | 'all' | 'completed'>('active');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterManager, setFilterManager] = useState('');

  // Project List Pagination state
  const [projectPageSize, setProjectPageSize] = useState<number>(25);
  const [projectCurrentPage, setProjectCurrentPage] = useState<number>(1);

  // Reset pagination when any filter or page size changes
  useEffect(() => {
    setProjectCurrentPage(1);
  }, [search, filterCategory, filterStatus, filterManager, filterStatusGroup, projectPageSize]);
  
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
  
  // Retain existing document metadata when saving; document controls are hidden.
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

  // Task Import Form State in Project Details
  const [showImportTaskForm, setShowImportTaskForm] = useState(false);
  const [selectedImportModelTaskIds, setSelectedImportModelTaskIds] = useState<string[]>([]);

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

  // Unified Task Modal State in ProjectSection (FASE 30-A)
  const [taskModalState, setTaskModalState] = useState<{
    isOpen: boolean;
    task: Task | null;
    mode: TaskModalMode;
    initialDate?: string;
  }>({
    isOpen: false,
    task: null,
    mode: 'edit',
  });

  const openTaskDetailsModal = (task: Task, mode: TaskModalMode = 'edit') => {
    setTaskModalState({
      isOpen: true,
      task,
      mode,
    });
  };

  const openCreateTaskModal = (initialDate?: string) => {
    if (!canWriteTasks) {
      alert('Não tem permissão para criar tarefas.');
      return;
    }
    setTaskModalState({
      isOpen: true,
      task: null,
      mode: 'create',
      initialDate,
    });
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
      const existingCats = proj.categoryIds && proj.categoryIds.length > 0 ? proj.categoryIds : (proj.categoryId ? [proj.categoryId] : []);
      setFormCategories(existingCats);
      setFormCategory(proj.categoryId || existingCats[0] || '');
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
      const matchingPrio = projectPriorities.find(p => matchId(p.id, proj.priorityId))?.id || proj.priorityId || '';
      setFormPriority(matchingPrio);
      setFormBudget(proj.budgetValue);
      setFormDemo(Boolean(proj.demo));
      setFormTeams(proj.teamsInvolvedIds || (proj as any).teamIds || []);
      setFormPartners(proj.partnersIds || (proj as any).partnerIds || []);
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
      const defaultCat = projectCategories.find(c => !c.deleted)?.id || '';
      setFormCategory(defaultCat);
      setFormCategories(defaultCat ? [defaultCat] : []);
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
      const defaultPrio = projectPriorities.find(p => !p.deleted)?.id || '';
      setFormPriority(defaultPrio);
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
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteProjects) {
      alert('Não tem permissão para criar ou editar projetos.');
      return;
    }

    let finalClientId = formClient;
    const trimmedQuery = clientSearchQuery.trim();

    if (trimmedQuery) {
      // 1. Check if the currently set formClient is valid in our client list
      const clientByFormId = (clients || []).find(c => c && !c.deleted && matchId(c.id, formClient));

      // 2. Search for any client matching by name, shortName, or concatenated format
      const existingByName = (clients || []).find(c => 
        c && !c.deleted && (
          c.clientName.toLowerCase().trim() === trimmedQuery.toLowerCase() ||
          (c.shortName && c.shortName.toLowerCase().trim() === trimmedQuery.toLowerCase()) ||
          `${c.clientName} (${c.shortName})`.toLowerCase().trim() === trimmedQuery.toLowerCase() ||
          (c.shortName ? `${c.clientName} (${c.shortName})` : c.clientName).toLowerCase().trim() === trimmedQuery.toLowerCase()
        )
      );

      if (clientByFormId && (!existingByName || existingByName.id === clientByFormId.id)) {
        finalClientId = clientByFormId.id;
      } else if (existingByName) {
        finalClientId = existingByName.id;
      } else if (!formClient || !(clients || []).some(c => c && !c.deleted && matchId(c.id, formClient))) {
        // Create new client dynamically since name was typed but doesn't exist
        let clientNameInput = trimmedQuery;
        let shortNameInput = trimmedQuery;
        if (trimmedQuery.includes('(') && trimmedQuery.endsWith(')')) {
          const parts = trimmedQuery.split('(');
          clientNameInput = parts[0].trim();
          shortNameInput = parts[1].replace(')', '').trim();
        }

        const newClient = await addClient({
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

    const finalCategoryIds = formCategories.length > 0 ? formCategories : (formCategory ? [formCategory] : []);
    const finalCategory = finalCategoryIds[0] || formCategory || '';

    const payload = {
      title: formTitle,
      description: formDesc,
      clientId: finalClientId,
      categoryId: finalCategory,
      categoryIds: finalCategoryIds,
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
      demo: Boolean(formDemo),
      teamsInvolvedIds: formTeams,
      partnersIds: formPartners,
      documents: formDocs,
      clientContactName: formClientContactName,
      clientContactEmail: formClientContactEmail,
      clientContactPhone: formClientContactPhone,
      createdById: currentUser?.id || '11111111-1111-1111-1111-111111111111', 
    };

    try {
      if (editingId) {
        await updateProject(editingId, payload);
      } else {
        const newProj = await addProject(payload);
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
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('[PROJECT FORM ERROR]', err);
      // Keep form open for correction on failure
    }
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
  const getUserName = (id: string, fallback = '-') => (id ? (users.find(u => matchId(u.id, id))?.name || fallback) : fallback);

  const getProjectStatusScale = React.useCallback((statusId: string): number => {
    if (!statusId) return 1;
    const s = projectStatuses.find(st => matchId(st.id, statusId) || st.id === statusId);
    if (!s) return 1;
    const name = (s.name || '').toLowerCase();
    if (name.includes('concl') || name.includes('finaliz') || name.includes('fechad') || name.includes('cancel') || name.includes('suspen')) {
      return 5;
    }
    if (name.includes('implement')) {
      return 4;
    }
    if (name.includes('ensaios')) {
      return 4;
    }
    if (name.includes('prepara')) {
      return 3;
    }
    if (name.includes('iniciad')) {
      return 2;
    }
    if (name.includes('por iniciar')) {
      return 1;
    }
    if (s.scale !== undefined) {
      if (s.scale >= 5) return 5;
      return s.scale;
    }
    return 1;
  }, [projectStatuses]);

  const isProjectLevel5 = React.useCallback((statusId: string): boolean => {
    return getProjectStatusScale(statusId) === 5;
  }, [getProjectStatusScale]);

  const matchesStatusGroup = React.useCallback((statusId: string) => {
    if (filterStatusGroup === 'all') return true;
    const lvl = getProjectStatusScale(statusId);
    if (filterStatusGroup === 'active') return lvl >= 1 && lvl <= 4;
    if (filterStatusGroup === 'implementation') return lvl === 4;
    if (filterStatusGroup === 'completed') return lvl >= 5;
    return true;
  }, [filterStatusGroup, getProjectStatusScale]);

  const handleStatusGroupChange = (group: 'active' | 'implementation' | 'all' | 'completed') => {
    setFilterStatusGroup(group);
    if (filterStatus) {
      const scale = getProjectStatusScale(filterStatus);
      const matchesNewGroup =
        group === 'all' ? true :
        group === 'active' ? (scale >= 1 && scale <= 4) :
        group === 'implementation' ? (scale === 4) :
        group === 'completed' ? (scale >= 5) : true;
      if (!matchesNewGroup) {
        setFilterStatus('');
      }
    }
  };

  const getProjectFlowLevel = (statusId: string): number => {
    if (isProjectLevel5(statusId)) return 5;
    const s = projectStatuses.find(st => matchId(st.id, statusId));
    if (s && s.scale !== undefined) return Math.min(s.scale, 5);
    return 0;
  };

  // --- SERVER SIDE FETCHING LOGIC ---
  const [serverProjects, setServerProjects] = useState<Project[]>([]);
  const [totalServerProjects, setTotalServerProjects] = useState(0);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [settledProjectsKey, setSettledProjectsKey] = useState<string | null>(null);
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [serverSelectedProj, setServerSelectedProj] = useState<Project | null>(null);
  const [serverTasks, setServerTasks] = useState<Task[]>([]);
  const [loadedProjectIdForTasks, setLoadedProjectIdForTasks] = useState<string | null>(null);
  const [isServerTasksLoading, setIsServerTasksLoading] = useState(false);
  const projectsQueryKey = JSON.stringify([projectCurrentPage, projectPageSize, search, filterCategory, filterStatus, filterManager, filterStatusGroup, refreshTrigger]);
  const projectsListPending = isLoadingProjects || settledProjectsKey !== projectsQueryKey;

  useEffect(() => {
    if (selectedProjectId) return;
    let isMounted = true;
    const fetchProj = async () => {
      setIsLoadingProjects(true);
      setProjectsLoadError(null);
      try {
        const query = new URLSearchParams({
          page: projectCurrentPage.toString(),
          pageSize: projectPageSize.toString(),
          search: search,
          categoryId: filterCategory,
          statusId: filterStatus,
          managerId: filterManager,
          statusGroup: filterStatusGroup
        });
        const res = await fetch(`/api/v1/projects?${query.toString()}`, { headers: getAuthHeaders() });
        const result = await res.json();
        if (!res.ok || !result.success || !Array.isArray(result.data)) {
          throw new Error(result.message || 'Não foi possível carregar os projetos.');
        }
        if (isMounted) {
          setServerProjects(result.data);
          setTotalServerProjects(result.total ?? result.count ?? 0);
        }
      } catch (err) {
        if (isMounted) setProjectsLoadError('Não foi possível carregar os projetos. Tente novamente.');
      } finally {
        if (isMounted) {
          setSettledProjectsKey(projectsQueryKey);
          setIsLoadingProjects(false);
        }
      }
    };
    fetchProj();
    return () => { isMounted = false; };
  }, [projectCurrentPage, projectPageSize, search, filterCategory, filterStatus, filterManager, filterStatusGroup, selectedProjectId, projects, refreshTrigger, projectsQueryKey]); // Refresh after canonical project mutations.

  useEffect(() => {
    let isMounted = true;
    if (!selectedProjectId) {
      Promise.resolve().then(() => {
        if (isMounted) {
          setServerSelectedProj(null);
          setServerTasks([]);
          setLoadedProjectIdForTasks(null);
          setIsServerTasksLoading(false);
        }
      });
      return;
    }

    setServerTasks([]);
    setLoadedProjectIdForTasks(null);
    setIsServerTasksLoading(true);

    const fetchDetails = async () => {
      try {
        const res = await fetch(`/api/v1/projects/${selectedProjectId}`, { headers: getAuthHeaders() });
        if (res.ok) {
          const result = await res.json();
          if (result.success && isMounted) setServerSelectedProj(result.data);
        }
      } catch (err) {}

      try {
        const taskRes = await fetch(`/api/v1/tasks?projectId=${selectedProjectId}&pageSize=100`, { headers: getAuthHeaders() });
        if (taskRes.ok) {
          const taskResult = await taskRes.json();
          if (taskResult.success && isMounted) {
            const rawList = taskResult.data || [];
            const normalized = rawList.map((t: any) => normalizeTaskFromApiResponse(t));
            setServerTasks(normalized);
            setLoadedProjectIdForTasks(selectedProjectId);
          }
        }
      } catch (err) {
      } finally {
        if (isMounted) {
          setIsServerTasksLoading(false);
        }
      }
    };
    fetchDetails();
    return () => { isMounted = false; };
  }, [selectedProjectId, refreshTrigger]);

  // Fallback client-side filtering matching server logic
  const filteredLocalProjects = React.useMemo(() => {
    return projects.filter(p => {
      if (p.deleted) return false;
      if (!matchesStatusGroup(p.statusId)) return false;
      if (filterCategory && !matchId(p.categoryId, filterCategory)) return false;
      if (filterStatus && !matchId(p.statusId, filterStatus)) return false;
      if (filterManager && !matchId(p.projectManagerId, filterManager)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (p.title || '').toLowerCase().includes(q);
        const matchNo = (p.installProjectNo || '').toLowerCase().includes(q);
        const matchSf = (p.sfOpportunityNo || '').toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);

        const client = clients.find(c => matchId(c.id, p.clientId));
        const matchClient = client ? (client.clientName || '').toLowerCase().includes(q) || (client.shortName || '').toLowerCase().includes(q) : false;

        const manager = users.find(u => matchId(u.id, p.projectManagerId));
        const matchManager = manager ? (manager.name || '').toLowerCase().includes(q) : false;

        if (!matchTitle && !matchNo && !matchSf && !matchDesc && !matchClient && !matchManager) return false;
      }
      return true;
    });
  }, [projects, matchesStatusGroup, filterCategory, filterStatus, filterManager, search, clients, users]);

  const baseProjects = serverProjects.length > 0 ? serverProjects : projects;

  const filteredProjects = React.useMemo(() => {
    return baseProjects.filter(p => {
      if (p.deleted) return false;
      if (!matchesStatusGroup(p.statusId)) return false;
      if (filterCategory && !matchId(p.categoryId, filterCategory)) return false;
      if (filterStatus && !matchId(p.statusId, filterStatus)) return false;
      if (filterManager && !matchId(p.projectManagerId, filterManager)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (p.title || '').toLowerCase().includes(q);
        const matchNo = (p.installProjectNo || '').toLowerCase().includes(q);
        const matchSf = (p.sfOpportunityNo || '').toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);

        const client = clients.find(c => matchId(c.id, p.clientId));
        const matchClient = client ? (client.clientName || '').toLowerCase().includes(q) || (client.shortName || '').toLowerCase().includes(q) : false;

        const manager = users.find(u => matchId(u.id, p.projectManagerId));
        const matchManager = manager ? (manager.name || '').toLowerCase().includes(q) : false;

        if (!matchTitle && !matchNo && !matchSf && !matchDesc && !matchClient && !matchManager) return false;
      }
      return true;
    });
  }, [baseProjects, matchesStatusGroup, filterCategory, filterStatus, filterManager, search, clients, users]);

  // Use server data if available, fallback to props
  const activeProjects = filteredProjects;
  // The API already filters and paginates. Never re-slice its page or fall
  // back to the global snapshot after a legitimate empty response.
  const paginatedProjects = serverProjects;
  const totalProjects = totalServerProjects;
  const totalProjectPages = Math.max(1, Math.ceil(totalProjects / projectPageSize));
  const validProjectPage = Math.min(projectCurrentPage, totalProjectPages);
  const startProjectIndex = (validProjectPage - 1) * projectPageSize;
  const endProjectIndex = startProjectIndex + paginatedProjects.length;

  // Canonical mutations refresh the parent snapshot. Prefer its newer version
  // over the detail fetch cache so status controls and lifecycle never lag.
  const canonicalSelectedProj = projects.find(p => p.id === selectedProjectId);
  const selectedProj = canonicalSelectedProj && (!serverSelectedProj || (canonicalSelectedProj.version ?? 0) >= (serverSelectedProj.version ?? 0))
    ? canonicalSelectedProj : serverSelectedProj || activeProjects.find(p => p.id === selectedProjectId);
  const projTasks = React.useMemo(() => {
    if (!selectedProjectId) return [];
    if (loadedProjectIdForTasks === selectedProjectId) {
      return serverTasks;
    }
    return tasks.filter(t => t.projectId === selectedProjectId && !t.deleted);
  }, [selectedProjectId, loadedProjectIdForTasks, serverTasks, tasks]);


  const projComments = comments.filter(c => matchId(c.projectId, selectedProjectId));
  const projMaterials = (projectMaterials || []).filter(pm => matchId(pm.projectId, selectedProjectId) && !pm.deleted);
  const materialGroupsDict: Record<string, ProjectMaterial[]> = {};
  projMaterials.forEach(m => {
    const supKey = (m.supplier || 'Sem Fornecedor').trim();
    if (!materialGroupsDict[supKey]) materialGroupsDict[supKey] = [];
    materialGroupsDict[supKey].push(m);
  });
  const projMaterialsGrouped = Object.entries(materialGroupsDict);
  const todayStr = new Date().toISOString().split('T')[0];

  const missingMaterialsCount = projMaterials.filter(m => {
    const st = pendingMaterialStatuses[m.id] || m.status;
    return st !== 'em_armazem' && st !== 'em_stock';
  }).length;
  const hasMissingMaterials = missingMaterialsCount > 0;

  const warningMaterialsCount = projMaterials.filter(m => {
    const st = pendingMaterialStatuses[m.id] || m.status;
    const notInWarehouse = st !== 'em_armazem' && st !== 'em_stock';
    if (!notInWarehouse) return false;

    const isPorEncomendar = st === 'por_encomendar' || (typeof st === 'string' && st.toLowerCase().includes('por_encomendar'));
    let deliveryDateOnly = m.expectedDeliveryDate ? m.expectedDeliveryDate.trim().split('T')[0] : '';
    if (deliveryDateOnly.includes('/')) {
      const parts = deliveryDateOnly.split('/');
      if (parts.length === 3) {
        deliveryDateOnly = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    const isPastDeliveryDate = Boolean(deliveryDateOnly && todayStr > deliveryDateOnly);

    return isPorEncomendar || isPastDeliveryDate;
  }).length;
  const hasMaterialWarning = warningMaterialsCount > 0;

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
  const handleSaveRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (riskSaveInFlight.current) return;
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

    riskSaveInFlight.current = true;
    setIsSavingRisk(true);
    try {
      const result = editingRiskId
        ? await updateProjectRiskItem?.(editingRiskId, riskData)
        : await addProjectRiskItem?.(riskData);
      if (!result?.success) {
        alert(result?.message || 'Não foi possível gravar o risco. Tente novamente.');
        return;
      }
      resetRiskForm();
      setShowRiskModal(false);
    } catch {
      alert('Não foi possível gravar o risco. Tente novamente.');
    } finally {
      riskSaveInFlight.current = false;
      setIsSavingRisk(false);
    }
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
    <div className="m3-projects space-y-6">

      {/* 1. If viewing detail & NOT editing */}
      {selectedProj && !isEditing ? (
        <Card className="bg-surface rounded-card border border-border -sm overflow-hidden animate-fade-in">

          {/* Header Action Row */}
          <div className="p-5 border-b border-border bg-surface-muted flex flex-wrap gap-4 items-center justify-between">
            <Button variant="ghost" size="sm"
              onClick={() => setSelectedProjectId(null)}
              className="flex items-center gap-2 text-body-sm text-text-secondary hover:text-text-primary font-semibold"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Button>
            <div className="flex flex-wrap gap-2">
              <IconButton variant="ghost" size="sm" aria-label="Copiar link do projeto"
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control text-body-sm font-bold transition-all border ${
                  copiedLink
                    ? 'bg-success/10 border-success/20 text-success-strong'
                    : 'bg-surface border-border hover:bg-surface-muted text-text-secondary hover:text-text-primary'
                }`}
                title="Copiar link do projeto"
              >
                <Link2 className="w-3.5 h-3.5" />

              </IconButton>
              {canWriteProjects && (
                <Button variant="secondary" size="sm"
                  onClick={() => openForm(selectedProj)}
                  className="bg-primary/10 border-primary/20 text-primary"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar Projeto
                </Button>
              )}
              {canDeleteProjects && (
                <Button variant="ghost" size="sm"
                  onClick={() => {
                    if (!canDeleteProjects) {
                      alert('Não tem permissão para eliminar projetos.');
                      return;
                    }
                    const projTasks = (tasks || []).filter(t => t.projectId === selectedProj.id && !t.deleted);
                    if (projTasks.length > 0) {
                      alert(`Não é possível eliminar o projeto "${selectedProj.title}" porque tem ${projTasks.length} tarefa(s) associada(s). Conclua ou remova primeiro as tarefas.`);
                      return;
                    }

                    askConfirmation(
                      'Confirmar Eliminação de Projeto',
                      `Tem a certeza que deseja eliminar o projeto "${selectedProj.title}" permanentemente? Esta ação não pode ser desfeita.`,
                      async () => {
                        try {
                          await deleteProject(selectedProj.id);
                          setSelectedProjectId(null);
                        } catch (err) {
                          // Handled in useERP (alerted and state preserved)
                        }
                      }
                    );
                  }}
                  className="text-error hover:text-error hover:bg-error/10"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </Button>
              )}
            </div>
          </div>

          {/* PROJECT BANNER HEADER (Client, Name, Risk, Priority, Material status) */}
          <div className="p-6 bg-surface border-b border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-heading-md font-semibold text-primary">{getClientName(selectedProj.clientId)}</span>
                {selectedProj.demo && <span className="text-caption font-bold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">Demo</span>}
              </div>
              <h1 className="text-heading-lg text-text-primary tracking-tight">{selectedProj.title}</h1>
              <p className="text-body-sm text-text-secondary font-mono">IP: {selectedProj.installProjectNo || 'S/N'} • Oportunidade SF: {selectedProj.sfOpportunityNo || 'S/N'}</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {hasMaterialWarning && (
                <span className="text-body-sm font-bold uppercase px-3 py-1.5 rounded-control bg-error/10 text-error border border-error/20 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0" />
                  <span>Material em falta ({warningMaterialsCount})</span>
                </span>
              )}
              {(() => {
                const calcRisk = getProjectCalculatedRisk(selectedProj.id, projectRiskItems);
                return (
                  <span className={`text-body-sm font-extrabold uppercase px-3 py-1.5 rounded-control border flex items-center gap-1.5 ${calcRisk.color}`}>
                    <span>{calcRisk.dot}</span>
                    <span>Risco: {calcRisk.label}</span>
                  </span>
                );
              })()}
              <span className="text-body-sm font-bold uppercase px-3 py-1.5 rounded-control bg-surface-muted text-text-secondary border border-border">
                Prioridade: {getPriorityName(selectedProj.priorityId)}
              </span>
            </div>
          </div>

          {/* Project lifecycle: labels represent database status scale, not task completion. */}
          {(() => {
            const currentStatus = projectStatuses.find(s => s.id === selectedProj.statusId);
            const rawScale = currentStatus ? (currentStatus.scale ?? 1) : 1;
            const displayScale = [1, 2, 3, 4].includes(rawScale) ? rawScale : rawScale >= 5 ? 5 : 1;
            const statusStyle = getProjectStatusStyle(selectedProj.statusId, projectStatuses);
            const levels = ['Iniciado', 'Preparação', 'FAT', 'Instalação', 'Concluído'];

            return (
              <ol aria-label="Fases do projeto" className="grid grid-cols-1 md:grid-cols-5 p-4 border-b border-border-subtle bg-surface-muted/50">
                {levels.map((label, idx) => {
                  const scale = idx + 1;
                  const isCurrent = scale === displayScale;
                  const isPassed = scale < displayScale;
                  const circleClass = isCurrent
                    ? `${statusStyle.badgeClass} ring-2 ring-primary/20`
                    : isPassed
                      ? 'bg-surface-elevated border-border text-text-primary'
                      : 'bg-surface-muted border-border text-text-secondary';
                  return (
                    <li key={scale} aria-current={isCurrent ? 'step' : undefined}
                      className="relative min-w-0 flex items-center gap-3 p-3 md:flex-col md:text-center">
                      {idx < levels.length - 1 && (
                        <span aria-hidden="true"
                          className={`absolute left-7 top-7 bottom-[-28px] w-0.5 md:left-1/2 md:right-auto md:bottom-auto md:h-0.5 md:w-full ${scale + 1 === displayScale ? statusStyle.dotClass : 'bg-border'}`} />
                      )}
                      <span aria-hidden="true" className={`relative z-10 flex shrink-0 items-center justify-center w-8 h-8 rounded-full border-2 text-label font-semibold ${circleClass}`}>
                        {isPassed ? <Check className="w-4 h-4" /> : scale}
                      </span>
                      <div className="relative z-10 min-w-0 flex flex-wrap items-center gap-2 md:flex-col md:gap-1">
                        <span className={`text-body-sm break-words ${isCurrent ? statusStyle.textClass + ' font-semibold' : 'text-text-secondary'}`}>
                          <span className="sr-only">Nível {scale}: </span>{label}
                        </span>
                        {isPassed && <span className="sr-only">Etapa anterior à atual</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            );
          })()}

          {/* Project Separators Header (Tabs: Visão Geral / Tarefas / Material / Riscos / Análise) */}
          <nav aria-label="Secções do projeto" className="border-b border-border bg-surface px-3 sm:px-6 pt-2 overflow-x-auto w-full scrollbar-thin">
            <div className="flex flex-wrap gap-2 py-3">
              <M3FilterChip selected={activeDetailTab === 'geral'}
                type="button"
                onClick={() => setActiveDetailTab('geral')}
                className="shrink-0"
              >
                <FileText className="w-4 h-4 shrink-0" /> Visão Geral
              </M3FilterChip>
              <M3FilterChip selected={activeDetailTab === 'tarefas'}
                type="button"
                onClick={() => setActiveDetailTab('tarefas')}
                className="shrink-0"
              >
                <ListTodo className="w-4 h-4 shrink-0" /> Tarefas ({projTasks.length})
              </M3FilterChip>
              <M3FilterChip selected={activeDetailTab === 'material'}
                type="button"
                onClick={() => setActiveDetailTab('material')}
                className="shrink-0"
              >
                <Package className="w-4 h-4 shrink-0" /> Material ({projMaterials.length})
                {hasMissingMaterials && (
                  <span className="w-2.5 h-2.5 rounded-full bg-error animate-ping inline-block shrink-0" />
                )}
              </M3FilterChip>
              <M3FilterChip selected={activeDetailTab === 'riscos'}
                type="button"
                onClick={() => {
                  setActiveDetailTab('riscos');
                  resetRiskForm();
                }}
                className="shrink-0"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" /> Riscos ({projRiskItems.length})
                {projCriticalRisksCount > 0 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-error animate-ping inline-block shrink-0" />
                )}
              </M3FilterChip>
              <M3FilterChip selected={activeDetailTab === 'analise'}
                type="button"
                onClick={() => setActiveDetailTab('analise')}
                className="shrink-0"
              >
                <BarChart3 className="w-4 h-4 shrink-0" /> Análise
              </M3FilterChip>
            </div>
          </nav>

          {/* TAB 1: VISÃO GERAL */}
          {activeDetailTab === 'geral' && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">

              {/* Left Content Column (Main info) */}
              <div className="md:col-span-8 space-y-6">

                {/* Description Block */}
                <div className="bg-surface-muted p-4 rounded-control border border-border-subtle">
                  <h3 className="font-bold text-body-sm uppercase text-text-muted mb-2 flex items-center gap-1"><FileText className="w-3.5 h-3.5"/> Descrição do Projeto</h3>
                  <p className="text-body-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{selectedProj.description || 'Sem descrição registada.'}</p>
                </div>

              {/* Tabs Switcher: Calendário vs Cronograma */}
              <div className="space-y-4">
                <Tabs tabs={[{ id: 'calendario', label: 'Calendário mensal', icon: <Calendar className="w-4 h-4" /> },
                  { id: 'cronograma', label: 'Cronograma', icon: <Clock className="w-4 h-4" /> }]}
                  activeTabId={projectViewTab} onChange={id => setProjectViewTab(id as 'calendario' | 'cronograma')} variant="line" />

                {projectViewTab === 'calendario' ? (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-bold text-text-primary text-body-sm uppercase tracking-wider flex items-center gap-2">Calendário Mensal do Projeto</h3>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <IconButton variant="ghost" size="sm" aria-label="Mês anterior"
                          type="button"
                          onClick={() => setCalMonthOffset(o => o - 1)}
                          className="flex items-center justify-center p-1.5 bg-surface hover:bg-surface-muted border border-border rounded-lg text-text-secondary cursor-pointer transition-colors"
                          title="Mês anterior"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </IconButton>
                        <Button variant="ghost" size="sm" aria-label="Voltar para o mês atual"
                          type="button"
                          onClick={resetCalMonthToToday}
                          className="px-2.5 py-1 bg-surface hover:bg-surface-muted border border-border rounded-lg text-caption font-bold text-text-secondary cursor-pointer transition-colors"
                          title="Voltar para o mês atual"
                        >
                          Hoje
                        </Button>
                        <IconButton variant="ghost" size="sm" aria-label="Mês seguinte"
                          type="button"
                          onClick={() => setCalMonthOffset(o => o + 1)}
                          className="flex items-center justify-center p-1.5 bg-surface hover:bg-surface-muted border border-border rounded-lg text-text-secondary cursor-pointer transition-colors"
                          title="Mês seguinte"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </IconButton>
                        <span className="text-body-sm font-bold text-text-secondary min-w-[120px] text-center my-auto ml-2 capitalize">
                          {(() => {
                            const targetDate = selectedProj.startDate ? new Date(selectedProj.startDate + 'T00:00:00') : new Date();
                            targetDate.setMonth(targetDate.getMonth() + calMonthOffset);
                            return `${targetDate.toLocaleDateString('pt-PT', { month: 'long' })} ${targetDate.getFullYear()}`;
                          })()}
                        </span>
                      </div>
                    </div>
                    <div className="bg-surface border border-border rounded-control overflow-hidden -sm">
                      <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-muted text-caption font-bold text-text-secondary uppercase text-center">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                          <div key={d} className="py-2 border-r border-border-subtle last:border-0">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 text-body-sm">
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
                            cells.push(<div key={`empty-${i}`} className="min-h-[80px] p-2 border-b border-r border-border-subtle bg-surface-muted/50"></div>);
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
                              return typeName.toLowerCase().includes('lembrete') || typeName.toLowerCase().includes('marco') || (t.title && (t.title.toLowerCase().includes('lembrete') || t.title.toLowerCase().includes('marco')));
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
                                  openCreateTaskModal(dateStr);
                                  setShowImportTaskForm(false);
                                }}
                                className={`min-h-[110px] p-1.5 border-b border-r border-border-subtle last:border-r-0 relative group transition-colors hover:bg-surface-muted/50 cursor-pointer flex flex-col justify-start ${
                                  isWeekend || isSpecial ? 'bg-surface-muted/60' : 'bg-surface'
                                }`}
                                title="Clique no dia para adicionar uma nova tarefa ou lembrete"
                              >
                                <div className="flex justify-between items-start mb-1 flex-shrink-0">
                                  <span className={`inline-block w-5 h-5 text-center leading-5 rounded-full font-bold text-caption ${
                                    dateStr === new Date().toISOString().split('T')[0] ? 'bg-warning text-white shadow-2xs' : 'text-text-secondary'
                                  }`}>{d}</span>
                                  {sd && <span className="text-caption font-bold text-text-muted truncate max-w-[50px]" title={sd.name}>{sd.name.substring(0, 8)}...</span>}
                                </div>

                                <div className="flex flex-col gap-1 overflow-y-auto max-h-[100px] pr-0.5 custom-scrollbar">
                                  {/* Início de Projeto */}
                                  {isProjStart && (
                                    <div
                                      className="px-1.5 py-0.5 rounded-md bg-primary text-white text-caption font-extrabold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Início / Adjudicação do projeto: ${selectedProj.title}`}
                                    >
                                      <span className="shrink-0 text-caption">🚀</span>
                                      <span className="truncate">Início Proj.</span>
                                    </div>
                                  )}

                                  {/* Prazo de Entrega */}
                                  {isProjDelivery && (
                                    <div
                                      className="px-1.5 py-0.5 rounded-md bg-success-strong text-white text-caption font-semibold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Prazo de entrega do projeto: ${selectedProj.title}`}
                                    >
                                      <span className="shrink-0 text-caption">🏁</span>
                                      <span className="truncate">Prazo Entrega</span>
                                    </div>
                                  )}

                                  {/* Previsão Real */}
                                  {isProjEstimated && !isProjDelivery && (
                                    <div
                                      className="px-1.5 py-0.5 rounded-md bg-purple-100 border border-purple-200 text-purple-900 text-caption font-extrabold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Previsão real de entrega: ${selectedProj.title}`}
                                    >
                                      <span className="shrink-0 text-caption">🔮</span>
                                      <span className="truncate">Prev. Entrega</span>
                                    </div>
                                  )}

                                  {/* Agendamento */}
                                  {isProjScheduled && !isProjStart && (
                                    <div
                                      className="px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-caption font-extrabold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Agendamento do projeto: ${selectedProj.title}`}
                                    >
                                      <span className="shrink-0 text-caption">📅</span>
                                      <span className="truncate">Agendamento</span>
                                    </div>
                                  )}

                                  {/* Lembretes de Projeto */}
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
                                      className="px-1.5 py-0.5 rounded-md bg-warning text-white text-caption font-black flex items-center gap-1 truncate cursor-pointer hover:bg-warning transition-colors shadow-2xs"
                                      title={`Lembrete: ${m.title}\nClique para ver/editar`}
                                    >
                                      <span className="shrink-0 text-caption">🔔</span>
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
                                        className="px-1.5 py-0.5 rounded-md bg-surface-muted border border-border text-text-primary text-caption font-bold flex items-center gap-1.5 truncate cursor-grab active:cursor-grabbing hover:bg-border transition-colors shadow-2xs"
                                        title={`Tarefa: ${t.title}\nTécnicos: ${assigneesText}\nClique para ver/editar`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
                                        <span className="truncate">{t.title}</span>
                                      </div>
                                    );
                                  })}

                                  {/* Materiais do Projeto */}
                                  {materialsOnDay.map(pm => (
                                    <div
                                      key={pm.id}
                                      className="px-1.5 py-0.5 rounded-md bg-sky-100 border border-sky-200 text-sky-900 text-caption font-bold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Receção Prevista de Material: ${pm.description}\nFornecedor: ${pm.supplier || '-'}\nQtd: ${pm.quantity}`}
                                    >
                                      <span className="shrink-0 text-caption">📦</span>
                                      <span className="truncate">{pm.description}</span>
                                    </div>
                                  ))}

                                  {/* Revisões de Risco */}
                                  {risksOnDay.map(ri => (
                                    <div
                                      key={ri.id}
                                      className="px-1.5 py-0.5 rounded-md bg-error/10 border border-error/20 text-error text-caption font-bold flex items-center gap-1 truncate shadow-2xs"
                                      title={`Revisão de Risco do Projeto: ${ri.title}`}
                                    >
                                      <span className="shrink-0 text-caption">⚠️</span>
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
                              cells.push(<div key={`empty-end-${i}`} className="min-h-[110px] p-2 border-b border-r border-border-subtle bg-surface-muted/50"></div>);
                            }
                          }

                          return cells;
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  // 30-Day Timeline (Cronograma)
                  <div className="space-y-4 animate-fade-in" id="project-timeline-container">
                    <div className="flex items-center justify-between bg-surface-muted p-3 rounded-control border border-border/60">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-text-primary text-body-sm uppercase tracking-wider">Cronograma</h4>
                        <span className="text-caption font-bold text-primary bg-primary/10 border border-primary/20 rounded-md px-2 py-0.5">
                          {(() => {
                            const end = new Date(cronogramaStartDate);
                            end.setDate(end.getDate() + 29);
                            return `${cronogramaStartDate.toLocaleDateString('pt-PT')} a ${end.toLocaleDateString('pt-PT')}`;
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <IconButton variant="ghost" aria-label="Voltar 5 dias"
                          type="button"
                          onClick={shiftCronogramaPrev}
                          className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-muted border border-border rounded-lg text-caption font-bold text-text-secondary cursor-pointer transition-colors"
                          title="Voltar 5 dias"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </IconButton>
                        <Button variant="ghost" size="sm" aria-label="Voltar para a janela de 5 dias antes de hoje"
                          type="button"
                          onClick={resetCronogramaToDefault}
                          className="px-2.5 py-1 bg-surface hover:bg-surface-muted border border-border rounded-lg text-caption font-bold text-text-secondary cursor-pointer transition-colors"
                          title="Voltar para a janela de 5 dias antes de hoje"
                        >
                          Hoje
                        </Button>
                        <IconButton variant="ghost" aria-label="Avançar 5 dias"
                          type="button"
                          onClick={shiftCronogramaNext}
                          className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-muted border border-border rounded-lg text-caption font-bold text-text-secondary cursor-pointer transition-colors"
                          title="Avançar 5 dias"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </IconButton>
                        <Button variant="ghost" size="sm" aria-label="Abrir cronograma em ecrã cheio"
                          type="button"
                          onClick={() => setIsFullTimelineModalOpen(true)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 hover:bg-primary/10 border border-primary/20 text-primary hover:text-primary rounded-lg text-caption font-bold cursor-pointer transition-colors ml-1"
                          title="Abrir cronograma em ecrã cheio"
                          id="btn-ecra-cheio"
                        >
                          <Maximize2 className="w-3.5 h-3.5" /> Ecrã cheio
                        </Button>
                      </div>
                    </div>

                    <Card className="bg-surface border border-border rounded-card overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1850px] text-body-sm text-left border-collapse table-fixed">
                          <thead className="bg-surface-muted text-caption uppercase tracking-wider text-text-secondary font-bold border-b border-border whitespace-nowrap select-none">
                            <tr className="bg-surface-muted border-b border-border">
                              <th className="p-3.5 sticky left-0 bg-surface-muted border-r border-border font-bold text-text-secondary w-56 min-w-[210px] shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-20 text-caption uppercase tracking-wider">
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
                                        openCreateTaskModal(dayStr);
                                        setShowImportTaskForm(false);
                                      }}
                                      className={`p-2 border-r border-border/80 text-center min-w-[55px] font-bold cursor-pointer hover:bg-border/50 transition-colors ${
                                        isToday ? 'bg-warning/60 text-warning border-x border-warning/20' :
                                        isWeekend ? 'bg-surface-muted/70 text-text-secondary hover:bg-border/40' : 'text-text-secondary'
                                      }`}
                                      title="Clique para adicionar tarefa neste dia"
                                    >
                                      <div className="text-caption uppercase font-semibold text-text-muted">
                                        {d.toLocaleDateString('pt-PT', { weekday: 'short' }).charAt(0).toUpperCase()}
                                      </div>
                                      <div className={`text-body-sm ${isToday ? 'font-extrabold text-warning' : ''}`}>{d.getDate()}</div>
                                      <div className="text-caption font-normal text-text-muted">
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
                            <tr className="bg-surface-muted/60 border-b border-border">
                              <td className="p-2.5 sticky left-0 bg-surface-muted border-r border-border font-bold text-text-secondary shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10">
                                <div className="flex items-center gap-1.5 text-primary">
                                  <Flag className="w-3.5 h-3.5 text-primary" />
                                  <span className="text-caption uppercase font-bold tracking-wide">Lembretes do Projeto</span>
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
                                    <td key={dayStr} className={`p-1 border-r border-border/80 text-center align-middle ${isToday ? 'bg-warning/40' : isWeekend ? 'bg-surface-muted/40' : ''}`}>
                                      <div className="flex flex-col gap-0.5 items-center justify-center">
                                        {isProjStart && (
                                          <span className="px-1.5 py-0.5 bg-primary text-white text-caption font-extrabold rounded shadow-xs scale-90" title="Data de Início do Projeto">
                                            INÍCIO
                                          </span>
                                        )}
                                        {isProjDelivery && (
                                          <span className="px-1.5 py-0.5 bg-success-strong text-white text-caption font-semibold rounded shadow-xs" title="Data de Entrega do Projeto">
                                            ENTREGA
                                          </span>
                                        )}
                                        {isProjEstimated && !isProjDelivery && (
                                          <span className="px-1.5 py-0.5 bg-surface-elevated text-text-primary text-caption font-semibold rounded shadow-xs" title="Previsão de Conclusão">
                                            PREVISTO
                                          </span>
                                        )}
                                        {isProjScheduled && !isProjStart && (
                                          <span className="px-1.5 py-0.5 bg-primary text-white text-caption font-extrabold rounded shadow-xs scale-90" title="Instalação/Agendamento">
                                            AGENDADO
                                          </span>
                                        )}
                                        {risksOnDay.map(ri => (
                                          <span key={ri.id} className="px-1 py-0.5 bg-error text-white text-caption font-extrabold rounded shadow-xs flex items-center gap-0.5 scale-90 truncate max-w-[50px]" title={`Revisão de Risco: ${ri.title}`}>
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
                                    <td colSpan={31} className="p-8 text-center text-text-muted italic">
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
                                  <tr key={t.id} className="border-b border-border-subtle hover:bg-surface-muted/20 group">
                                    <td
                                      onClick={() => openTaskDetailsModal(t)}
                                      className="p-3 sticky left-0 bg-surface group-hover:bg-surface-muted hover:bg-surface-muted border-r border-border shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10 font-medium cursor-pointer transition-colors"
                                      title={`Clique para ver/editar: ${t.title}`}
                                    >
                                      <div className="space-y-1">
                                        <div className="font-bold text-text-primary text-body-sm truncate max-w-[190px] group-hover:text-primary transition-colors" title={t.title}>
                                          {t.title}
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={`px-1.5 py-0.5 rounded-full text-caption font-extrabold border tracking-wider ${
                                            t.statusId === 'ts-3' || t.statusId === '99999999-9999-9999-9999-999999999903'
                                              ? 'bg-success/10 text-success-strong border-success/50'
                                              : t.statusId === 'ts-2' || t.statusId === '99999999-9999-9999-9999-999999999902'
                                              ? 'bg-warning/10 text-warning border-warning/50'
                                              : 'bg-primary/10 text-primary border-primary/50'
                                          }`}>{getTaskStatusName(t.statusId, taskStatuses)}</span>

                                          <span className="text-caption text-text-secondary font-bold truncate max-w-[150px]">
                                            👤 {assigneesText}
                                          </span>
                                        </div>

                                        {/* Task Alerts & Warnings in the Row Headers */}
                                        {conflicts.length > 0 && (
                                          <div className="space-y-1 pt-1">
                                            {conflicts.map((c, i) => (
                                              <div
                                                key={i}
                                                className="flex items-start gap-1 p-1 bg-error/10 text-error border border-error/60 rounded-md text-caption font-semibold leading-tight hover:bg-error/10 transition-colors"
                                                title={c.details}
                                              >
                                                <ShieldAlert className="w-3.5 h-3.5 text-error flex-shrink-0 mt-0.5" />
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
                                            className={`p-1 border-r border-border/80 text-center align-middle relative min-w-[55px] ${
                                              isActive ? 'bg-primary/10' : ''
                                            } ${
                                              isToday ? 'bg-warning/30' :
                                              isWeekend ? 'bg-surface-muted/60' : ''
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
                                                className={`py-1.5 px-1 rounded-lg text-caption font-bold text-white -sm cursor-grab active:cursor-grabbing hover:scale-105 hover:brightness-95 active:scale-95 transition-all select-none overflow-hidden truncate max-w-[50px] mx-auto ${
                                                  getTaskStatusStyle(t.statusId, taskStatuses).dotClass
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
                      <div className="bg-surface-muted p-2.5 border-t border-slate-150 flex flex-wrap gap-4 justify-center text-caption font-bold text-text-secondary">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-primary"></span> Pendente</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-warning"></span> Em Progresso</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-success"></span> Concluído</span>
                        <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 border border-error/20 bg-error/10 text-error rounded flex items-center justify-center text-caption">⚠️</span> Alertas</span>
                        <span className="text-caption text-text-muted italic font-medium ml-2">Dica: Arraste as barras coloridas para reagendar as tarefas para novos dias no cronograma.</span>
                      </div>
                    </Card>
                  </div>
                )}
              </div>

              {/* Comments Section */}
              <div className="space-y-4">
                <h3 className="font-bold text-text-primary flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Notas & Comentários</h3>

                {/* Comment list */}
                {projComments.length === 0 ? (
                  <p className="text-body-sm text-text-muted italic">Sem comentários ou notas adicionadas.</p>
                ) : (
                  <div className="space-y-3">
                    {projComments.map(c => (
                      <div key={c.id} className="bg-surface-muted p-3 rounded-control border border-border-subtle flex justify-between items-start text-body-sm">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-text-primary">{getUserName(c.authorId)}</span>
                            <span className="text-caption text-text-muted font-mono">{new Date(c.createdDate).toLocaleDateString()}</span>
                          </div>
                          <p className="text-text-secondary italic">&quot;{c.comment}&quot;</p>
                        </div>
                        <Button variant="ghost" size="sm"
                          type="button"
                          onClick={() => {
                            askConfirmation(
                              'Eliminar comentário',
                              'Tem a certeza de que pretende eliminar este comentário/nota?',
                              () => deleteComment(c.id)
                            );
                          }}
                          className="text-error hover:text-error font-semibold text-caption cursor-pointer"
                        >
                          Apagar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Comment input form */}
                <div className="flex gap-2">
                  <Input aria-label="Adicione uma nota sobre o progresso ou alteração técnica..."
                    type="text"
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Adicione uma nota sobre o progresso ou alteração técnica..."
                    className="flex-1 p-2 border border-border rounded-control text-body-sm focus:ring-2 focus:ring-primary/20"
                  />
                  <Button variant="primary" size="sm"
                    onClick={() => {
                      if (newCommentText.trim()) {
                        addComment(selectedProj.id, currentUser?.id || 'u-1', newCommentText.trim());
                        setNewCommentText('');
                      }
                    }}
                    className="px-4 py-2 bg-primary text-white rounded-control text-body-sm font-bold hover:bg-primary transition-colors"
                  >
                    Enviar
                  </Button>
                </div>
              </div>

            </div>

            {/* Right Meta Column (Fields) */}
            <div className="md:col-span-4 bg-surface-muted/70 rounded-card p-5 border border-border-subtle space-y-6 text-body-sm">

              {/*  Status Overview */}


                <div  className="space-y-2.5">
                  <h4 className="font-bold text-caption uppercase text-text-muted tracking-wider">Estado</h4>
                  <Select aria-label="Estado"
                    value={selectedProj.statusId}
                    onChange={(e) => updateProject(selectedProj.id, { statusId: e.target.value })}
                    className={getProjectStatusStyle(selectedProj.statusId, projectStatuses).badgeClass}
                  >
                    {sortedStatuses.filter(s => !s.deleted || s.id === selectedProj.statusId).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2.5">
                  <h4 className="font-bold text-caption uppercase text-text-muted tracking-wider">Categorias</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedProj.categoryIds && selectedProj.categoryIds.length > 0 ? (
                      selectedProj.categoryIds.map(catId => (
                        <span key={catId} className="px-2 py-0.5 bg-surface-muted border border-border rounded text-text-secondary font-semibold font-mono text-caption">
                          {getCategoryName(catId)}
                        </span>
                      ))
                    ) : (
                      <span className="px-2 py-0.5 bg-surface-muted border border-border rounded text-text-secondary font-semibold font-mono text-caption">
                        {getCategoryName(selectedProj.categoryId)}
                      </span>
                    )}
                  </div>
                </div>


              {/* Governance & Team Contacts */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-caption uppercase text-text-muted tracking-wider">Equipa</h4>
                <div className="space-y-1.5 text-text-secondary">
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Project Leader:</span>
                    <span className="font-bold">{getUserName(selectedProj.projectManagerId)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Técnico responsável:</span>
                    <span className="font-bold">{getUserName(selectedProj.fieldManagerId)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Vendedor:</span>
                    <span className="font-bold">{getUserName(selectedProj.salesRepId)}</span>
                  </div>
                </div>
              </div>

              {/* Client Contact Info */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-caption uppercase text-text-muted tracking-wider">Contactos Cliente</h4>
                  <div className="space-y-1.5 text-text-secondary">
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Nome:</span>
                    <span className="font-bold">{selectedProj.clientContactName || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Email:</span>
                    <span className="font-bold">{selectedProj.clientContactEmail || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Telefone:</span>
                    <span className="font-bold">{selectedProj.clientContactPhone || '-'}</span>
                  </div>
                </div>


              </div>

              {/* Timeline Dates */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-caption uppercase text-text-muted tracking-wider">Datas importantes</h4>
                <div className="space-y-1.5 text-text-secondary">
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Data de adjudicação:</span>
                    <span className="font-bold">{selectedProj.startDate || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Prazo de entrega:</span>
                    <span className="font-bold text-primary">{selectedProj.deliveryDate || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Previsão de entrega real:</span>
                    <span className="font-bold">{selectedProj.estimatedDate || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Data agendamento:</span>
                    <span className="font-bold">{selectedProj.scheduledDate || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Systems / ERP Integration numbers */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-caption uppercase text-text-muted tracking-wider">Dados internos</h4>
                <div className="space-y-1.5 text-text-secondary">
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Nº IP:</span>
                    <span className="font-mono font-bold text-text-primary">{selectedProj.installProjectNo || 'S/N'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Oportunidade SF:</span>
                    <span className="font-mono font-bold text-text-primary">{selectedProj.sfOpportunityNo || 'S/N'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="font-medium text-text-secondary">Valor da venda:</span>
                    <span className="font-mono font-bold text-text-primary">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(selectedProj.budgetValue)}</span>
                  </div>
                </div>
              </div>

              {/* Teams */}
              <div className="space-y-3">
                <span className="text-caption text-text-muted uppercase font-bold tracking-wider block mb-1">Equipas de apoio</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedProj.teamsInvolvedIds?.length > 0 ? (
                      selectedProj.teamsInvolvedIds.map(tid => {
                        const team = projectTeams.find(t => matchId(t.id, tid));
                        return (
                          <span key={tid} className="px-2 py-0.5 bg-border text-text-secondary font-bold rounded-md text-caption">
                            {team ? team.name : tid}
                          </span>
                        );
                      })
                    ) : <span className="text-text-muted italic">Sem outras equipas alocadas</span>}
                  </div>
                </div>
                <div>
                  <span className="text-caption text-text-muted uppercase font-bold tracking-wider block mb-1">Parceiros externos</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedProj.partnersIds?.length > 0 ? (
                      selectedProj.partnersIds.map(pid => {
                        const partner = projectPartners.find(p => matchId(p.id, pid));
                        return (
                          <span key={pid} className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary font-bold rounded-md text-caption">
                            {partner ? partner.name : pid}
                          </span>
                        );
                      })
                    ) : <span className="text-text-muted italic">Nenhum parceiro alocado</span>}
                  </div>
                </div>


            </div>

          </div>
          )}

          {/* TAB 2: TAREFAS */}
          {activeDetailTab === 'tarefas' && (
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h3 className="font-extrabold text-text-primary text-base flex items-center gap-2">
                    <ListTodo className="w-5 h-5 text-primary" />
                    Tarefas do Projeto ({projTasks.length})
                  </h3>
                  <p className="text-body-sm text-text-secondary mt-0.5">Gestão de tarefas técnicas, lembretes e prazos de execução</p>
                </div>
                <div className="flex gap-2">
                  {canWriteTasks && (
                    <>
                      <Button variant="ghost" size="sm"
                        type="button"
                        onClick={() => {
                          setShowImportTaskForm(!showImportTaskForm);
                          setTaskModalState(prev => ({ ...prev, isOpen: false, task: null }));
                        }}
                        className="flex items-center gap-1.5 text-body-sm font-extrabold text-success-strong bg-success/10 hover:bg-success/10 border border-success/20 px-3 py-2 rounded-control transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-success-strong" /> Importar Tarefas Modelo
                      </Button>
                      <Button variant="primary" size="sm"
                        type="button"
                        onClick={() => {
                          openCreateTaskModal();
                          setShowImportTaskForm(false);
                        }}
                        className="flex items-center gap-1.5 text-body-sm font-extrabold text-white bg-primary hover:bg-primary px-3.5 py-2 rounded-control transition-colors cursor-pointer shadow-xs"
                      >
                        <Plus className="w-4 h-4 text-white" /> Criar Tarefa / Lembrete
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline Import Task Form */}
              {showImportTaskForm && (
                <div className="bg-surface-muted border border-border rounded-card p-5 space-y-4 text-body-sm font-bold text-text-secondary animate-fade-in shadow-xs" id="import-task-form-panel">
                  <div className="flex justify-between items-center pb-2 border-b border-border">
                    <span className="text-text-primary font-extrabold text-body-sm">Importar Tarefa(s) Modelo</span>
                    <Button variant="ghost" size="sm"
                      type="button"
                      onClick={() => {
                        setShowImportTaskForm(false);
                        setSelectedImportModelTaskIds([]);
                      }}
                      className="text-text-muted hover:text-text-secondary text-base font-normal px-1 cursor-pointer"
                    >
                      ×
                    </Button>
                  </div>

                  <p className="text-text-secondary text-body-sm font-normal leading-relaxed">
                    Selecione um ou mais modelos de engenharia para clonar e adicionar de imediato a este projeto.
                  </p>

                  {defaultTasks && defaultTasks.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                      {defaultTasks.map(dt => {
                        const isChecked = selectedImportModelTaskIds.includes(dt.id);
                        return (
                          <label
                            key={dt.id}
                            className={`flex items-start gap-2.5 p-3 rounded-control border cursor-pointer transition-colors ${
                              isChecked
                                ? "bg-success/10 border-success/20 text-success-strong shadow-2xs"
                                : "bg-surface border-border hover:bg-surface-muted text-text-secondary"
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
                              className="mt-0.5 w-4 h-4 text-success-strong rounded border-border focus:ring-success"
                            />
                            <div className="text-body-sm leading-tight font-semibold flex-1">
                              <div className="flex justify-between items-center gap-1 font-bold text-text-primary">
                                <span className="truncate max-w-[160px]" title={dt.title}>{dt.title}</span>
                                <span className="text-caption px-1.5 py-0.5 bg-surface-muted rounded text-text-secondary font-mono flex-shrink-0">
                                  {dt.estimatedHours}
                                </span>
                              </div>
                              <div className="text-caption text-text-secondary font-normal mt-1 truncate max-w-[200px]" title={dt.description}>
                                {dt.description || "Sem descrição."}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-body-sm text-text-muted italic">Não existem tarefas modelo configuradas.</p>
                  )}

                  <div className="flex justify-end gap-2 pt-3 border-t border-border mt-2">
                    <Button variant="ghost" size="sm"
                      type="button"
                      onClick={() => {
                        setShowImportTaskForm(false);
                        setSelectedImportModelTaskIds([]);
                      }}
                      className="px-4 py-2 bg-surface-muted hover:bg-border text-text-secondary rounded-control font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </Button>
                    <Button variant="ghost" size="sm"
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
                      className="bg-success-strong hover:bg-success-strong text-white"
                    >
                      <Plus className="w-4 h-4" /> Importar ({selectedImportModelTaskIds.length})
                    </Button>
                  </div>
                </div>
              )}



              {/* Tasks List */}
              {isServerTasksLoading ? (
                <div className="bg-surface-muted border border-dashed border-border rounded-card p-8 text-center text-text-muted text-body-sm font-medium animate-pulse flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  A carregar tarefas do projeto...
                </div>
              ) : projTasks.length === 0 ? (
                <div className="bg-surface-muted border border-dashed border-border rounded-card p-8 text-center text-text-muted text-body-sm font-medium">
                  Nenhuma tarefa ou lembrete associado a este projeto.
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
                    <Card
                      key={task.id}
                      onClick={() => openTaskDetailsModal(task)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Abrir tarefa ${task.title}`}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openTaskDetailsModal(task);
                        }
                      }}
                      className="bg-surface border border-border hover:border-primary/20 rounded-card p-4 space-y-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getTaskStatusStyle(task.statusId, taskStatuses).badgeClass}>
                              {getTaskStatusStyle(task.statusId, taskStatuses).name}
                            </Badge>
                            <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 text-caption font-bold rounded flex items-center gap-1">
                              {(getTaskTypeName(task.taskTypeId, taskTypes).toLowerCase().includes('lembrete') || getTaskTypeName(task.taskTypeId, taskTypes).toLowerCase().includes('marco')) && <Bell className="w-3 h-3 text-purple-600" />}
                              {getTaskTypeName(task.taskTypeId, taskTypes)}
                            </span>
                          </div>
                          <h4 className="font-extrabold text-text-primary text-body-sm hover:text-primary transition-colors">{task.title}</h4>
                        </div>
                      </div>
                      {task.description && (
                        <p className="text-body-sm text-text-secondary line-clamp-2">{task.description}</p>
                      )}
                      {/* Responsáveis */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <Users className="w-3.5 h-3.5 text-text-muted shrink-0" />
                        {task.assigneeIds && task.assigneeIds.length > 0 ? (
                          task.assigneeIds.map(uid => (
                            <span key={uid} className="px-1.5 py-0.5 bg-surface-muted text-text-secondary font-bold rounded-md text-caption">
                              {getUserName(uid)}
                            </span>
                          ))
                        ) : (
                          <span className="text-text-muted italic text-caption">Sem atribuição</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-caption text-text-secondary pt-2 border-t border-border-subtle font-medium">
                        <span>Previsão: {task.estimatedDate ? new Date(task.estimatedDate + 'T00:00:00').toLocaleDateString('pt-PT') : 'Sem data'}</span>
                        {task.estimatedHours && <span>Est: {task.estimatedHours}h</span>}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

{/* TAB 3: MATERIAL */}
          {activeDetailTab === 'material' && (
            <div data-m3-exclude data-theme={appConfig?.theme || 'default'} className="p-6 space-y-6">
              {/* Red Warning Banner if material has warning */}
              {hasMaterialWarning ? (
                <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 flex items-center justify-between text-rose-900 shadow-xs animate-fade-in">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
                    <div>
                      <h4 className="font-extrabold text-sm uppercase tracking-wide text-rose-800">Aviso: Material em falta</h4>
                      <p className="text-xs font-semibold text-rose-700 mt-0.5">
                        Este projeto possui {warningMaterialsCount} {warningMaterialsCount === 1 ? 'linha de material com aviso' : 'linhas de material com aviso'} (por encomendar ou com data de entrega ultrapassada).
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
                      <h4 className="font-extrabold text-sm uppercase tracking-wide text-emerald-800">Sem Avisos de Material em Falta</h4>
                      <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                        Não existem materiais por encomendar nem encomendas com data prevista de entrega ultrapassada.
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
                  <h3 className="font-extrabold text-text-primary text-base flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-primary" />
                    Gestão e Mitigação de Riscos do Projeto
                  </h3>
                  <p className="text-body-sm text-text-secondary mt-0.5">Identificação, classificação e acompanhamento de riscos com planos de ação integrados</p>
                </div>
              </div>

              {canWriteProjects && (
                <div className="flex justify-end">
                  <Button variant="primary" size="sm" type="button"
                    onClick={() => { resetRiskForm(); setShowRiskModal(true); }}>
                    <Plus className="w-4 h-4" /> Identificar Risco
                  </Button>
                </div>
              )}

              {/* Risks List */}
              {projRiskItems.length === 0 ? (
                <div className="bg-surface-muted border border-dashed border-border rounded-card p-12 text-center text-text-muted text-body-sm font-semibold flex flex-col items-center gap-3">
                  <ShieldAlert className="w-8 h-8 text-text-muted" />
                  <span>Não existem riscos identificados neste projeto.</span>
                </div>
              ) : (
                <Card className="bg-surface border border-border rounded-card overflow-hidden shadow-xs">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full min-w-[900px] text-left text-body-sm divide-y divide-border-subtle">
                      <thead className="bg-surface-muted/90 text-caption uppercase tracking-wider text-text-secondary font-bold border-b border-border/80 whitespace-nowrap select-none">
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
                      <tbody className="divide-y divide-border-subtle font-medium text-text-secondary">
                        {projRiskItems.map(item => {
                          const level = getRiskLevelDetails(item.probability, item.impact);
                          const isExpanded = expandedRiskId === item.id;
                          const ownerName = item.ownerId ? getUserName(item.ownerId) : 'Sem responsável';

                          return (
                            <React.Fragment key={item.id}>
                              <tr className={`hover:bg-surface-muted/50 transition-colors ${isExpanded ? 'bg-primary/20' : ''}`}>
                                <td className="px-5 py-3.5">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-bold text-text-primary text-body-sm">{item.title}</span>
                                    <span className="text-caption text-text-muted font-semibold">{getRiskCategoryName(item.categoryId)}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-3.5 text-text-secondary">
                                  <div className="flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5 text-text-muted shrink-0" />
                                    <span className="font-semibold">{ownerName}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-3.5 text-center font-extrabold text-text-primary text-label">{item.probability}</td>
                                <td className="px-3 py-3.5 text-center font-extrabold text-text-primary text-label">{item.impact}</td>
                                <td className="px-3 py-3.5 text-center">
                                  <span className={`px-2.5 py-1 rounded-full text-caption font-black uppercase tracking-wider border flex items-center justify-center gap-1 max-w-[130px] mx-auto ${level.color}`}>
                                    <span>{level.dot}</span>
                                    <span>{level.label} ({level.score})</span>
                                  </span>
                                </td>
                                <td className="px-3 py-3.5 text-center">
                                  <span className="px-2 py-0.5 rounded bg-surface-muted text-text-secondary text-caption font-extrabold border border-border">
                                    {getRiskPriorityName(item.priorityId)}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary text-caption font-extrabold">
                                    {getRiskStatusName(item.statusId)}
                                  </span>
                                </td>
                                <td className="px-3 py-3.5 text-center text-text-secondary font-semibold">{item.reviewDate || '-'}</td>
                                <td className="px-5 py-3.5 text-right space-x-1.5">
                                  <IconButton variant="ghost" aria-label={isExpanded ? "Ocultar Detalhes" : "Ver Detalhes"}
                                    type="button"
                                    onClick={() => setExpandedRiskId(isExpanded ? null : item.id)}
                                    className="p-1 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                                    title={isExpanded ? "Ocultar Detalhes" : "Ver Detalhes"}
                                  >
                                    <Info className="w-4 h-4" />
                                  </IconButton>
                                  {canWriteProjects && (
                                    <>
                                      <IconButton variant="ghost" aria-label="Editar Risco"
                                        type="button"
                                        onClick={() => handleEditRisk(item)}
                                        className="p-1 text-text-muted hover:text-primary transition-colors cursor-pointer"
                                        title="Editar Risco"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </IconButton>
                                      <IconButton variant="ghost" aria-label="Eliminar Risco"
                                        type="button"
                                        onClick={() => handleDeleteRisk(item.id)}
                                        className="p-1 text-text-muted hover:text-error transition-colors cursor-pointer"
                                        title="Eliminar Risco"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </IconButton>
                                    </>
                                  )}
                                </td>
                              </tr>

                              {/* Expanded Row */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={9} className="bg-surface-muted/80 px-8 py-5 border-t border-b border-border-subtle">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-body-sm text-text-secondary font-medium leading-relaxed">
                                      <div className="space-y-3">
                                        <div>
                                          <span className="block text-caption uppercase font-bold text-text-muted tracking-wider mb-1">Descrição do Risco</span>
                                          <p className="bg-surface p-3 rounded-control border border-border-subtle text-text-primary whitespace-pre-wrap shadow-2xs font-semibold">
                                            {item.description || <span className="text-text-muted italic">Sem descrição registada.</span>}
                                          </p>
                                        </div>
                                        <div>
                                          <span className="block text-caption uppercase font-bold text-text-muted tracking-wider mb-1">Consequência</span>
                                          <p className="bg-surface p-3 rounded-control border border-border-subtle text-text-primary whitespace-pre-wrap shadow-2xs font-semibold">
                                            {item.consequence || <span className="text-text-muted italic">Sem consequências registadas.</span>}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="space-y-3">
                                        <div>
                                          <span className="block text-caption uppercase font-bold text-text-muted tracking-wider mb-1">Plano de Mitigação</span>
                                          <p className="bg-surface p-3 rounded-control border border-border-subtle text-text-primary whitespace-pre-wrap shadow-2xs font-semibold">
                                            {item.mitigationPlan || <span className="text-text-muted italic">Sem plano de mitigação registado.</span>}
                                          </p>
                                        </div>
                                        <div>
                                          <span className="block text-caption uppercase font-bold text-text-muted tracking-wider mb-1">Plano de Contingência</span>
                                          <p className="bg-surface p-3 rounded-control border border-border-subtle text-text-primary whitespace-pre-wrap shadow-2xs font-semibold">
                                            {item.contingencyPlan || <span className="text-text-muted italic">Sem plano de contingência registado.</span>}
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
                </Card>
              )}
            </div>
          )}

          {/* TAB 5: ANÁLISE DO PROJETO */}
          {activeDetailTab === 'analise' && (
            <div className="p-6 space-y-6 animate-fade-in">
              <div>
                <h3 className="font-extrabold text-text-primary text-base flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Análise Geral do Projeto
                </h3>
                <p className="text-body-sm text-text-secondary mt-0.5">Estatísticas acumuladas de carga horária, técnicos, desvios de datas e distribuição de tarefas</p>
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
                      <div className="bg-surface-muted border border-border rounded-card p-4 space-y-1 shadow-2xs">
                        <span className="text-caption uppercase font-bold text-text-muted tracking-wider">Carga horária</span>
                        <div className="text-xl font-black text-text-primary">{formatMins(totalWorkloadMins)}h</div>
                        <p className="text-caption text-text-secondary font-medium truncate">Soma de horas efetivas e estimativas pendentes</p>
                      </div>

                      {/* Card 2: Prazo Venda */}
                      <div className="bg-surface-muted border border-border rounded-card p-4 space-y-1 shadow-2xs">
                        <span className="text-caption uppercase font-bold text-text-muted tracking-wider">Prazo de Entrega (Venda)</span>
                        <div className="text-xl font-black text-text-primary">{daysDiffAdjudicationToDelivery}</div>
                        <div className="text-caption text-text-secondary font-medium">De {startDateStr} a {deliveryDateStr}</div>
                      </div>

                      {/* Card 3: Desvio Estimativa Real */}
                      <div className="bg-surface-muted border border-border rounded-card p-4 space-y-1 shadow-2xs">
                        <span className="text-caption uppercase font-bold text-text-muted tracking-wider">Desvio de Estimativa Real</span>
                        <div className={`text-xl font-black ${daysDiffEstimatedToDelivery.includes('Atraso') ? 'text-warning' : 'text-text-primary'}`}>
                          {daysDiffEstimatedToDelivery}
                        </div>
                        <div className="text-caption text-text-secondary font-medium">Estimada real: {estimatedDateStr}</div>
                      </div>
                    </div>

                    {/* Contagem por Tipo de Tarefa */}
                    <Card className="bg-surface border border-border rounded-card overflow-hidden shadow-2xs">
                      <div className="p-4 bg-surface-muted border-b border-border-subtle font-extrabold text-body-sm text-text-primary uppercase tracking-wide">
                        Contagem e Carga Horária por Tipo de Tarefa
                      </div>
                      <div className="overflow-x-auto w-full">
                        <table className="w-full min-w-[420px] text-left border-collapse text-body-sm">
                          <thead className="bg-surface-muted/90 text-caption uppercase tracking-wider text-text-secondary font-bold border-b border-border/80 whitespace-nowrap select-none">
                            <tr>
                              <th className="px-4 py-2.5">Tipo de Tarefa</th>
                              <th className="px-4 py-2.5 text-center">N.º de Tarefas</th>
                              <th className="px-4 py-2.5 text-right">Carga Horária</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle font-semibold text-text-secondary">
                            {Object.keys(taskCountsByType).length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-4 py-6 text-center text-text-muted italic font-normal">Nenhuma tarefa registada para este projeto.</td>
                              </tr>
                            ) : (
                              Object.entries(taskCountsByType).map(([tName, data]) => (
                                <tr key={tName} className="hover:bg-surface-muted">
                                  <td className="px-4 py-3 font-extrabold text-text-primary">{tName}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-full font-extrabold">{data.count}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">{formatMins(data.workloadMins)}h</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    {/* Contagem e Carga Horária por Técnico */}
                    <Card className="bg-surface border border-border rounded-card overflow-hidden shadow-2xs">
                      <div className="p-4 bg-surface-muted border-b border-border-subtle font-extrabold text-body-sm text-text-primary uppercase tracking-wide">
                        Contagem e Carga Horária por Técnico
                      </div>
                      <div className="overflow-x-auto w-full">
                        <table className="w-full min-w-[420px] text-left border-collapse text-body-sm">
                          <thead className="bg-surface-muted/90 text-caption uppercase tracking-wider text-text-secondary font-bold border-b border-border/80 whitespace-nowrap select-none">
                            <tr>
                              <th className="px-4 py-2.5">Técnico</th>
                              <th className="px-4 py-2.5 text-center">N.º de Tarefas</th>
                              <th className="px-4 py-2.5 text-right">Carga Horária</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle font-semibold text-text-secondary">
                            {Object.keys(taskCountsByTech).length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-4 py-6 text-center text-text-muted italic font-normal">Nenhum técnico atribuído a tarefas deste projeto.</td>
                              </tr>
                            ) : (
                              Object.entries(taskCountsByTech).map(([techName, data]) => (
                                <tr key={techName} className="hover:bg-surface-muted">
                                  <td className="px-4 py-3 font-extrabold text-text-primary">{techName}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-full font-extrabold">{data.count}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">{formatMins(data.workloadMins)}h</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>
                );
              })()}
            </div>
          )}

        </Card>
      ) : isEditing ? (

        // 2. PROJECT EDIT OR CREATE FORM
        <form onSubmit={handleSubmit} className="bg-surface rounded-card border border-border p-6 space-y-6 -sm animate-fade-in">
          <M3SectionHeader
            title={editingId ? 'Editar projeto' : 'Adicionar novo projeto'}
            description={editingId ? `ID ${editingId}` : undefined}
            actions={<>
              <Button type="button" variant="secondary" size="sm" onClick={() => setIsEditing(false)}>Cancelar</Button>
              <Button type="submit" size="sm">Gravar Alterações</Button>
            </>}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-body-sm font-bold text-text-secondary">

            {/* Client Suggested Select */}
            <div className="space-y-1 relative" id="client-autocomplete-container">
              <label className="block text-text-secondary">Cliente *</label>
              <div className="relative">
                <Input aria-label="Cliente"
                  type="text"
                  required
                  value={clientSearchQuery}
                  onChange={e => {
                    const val = e.target.value;
                    setClientSearchQuery(val);
                    setShowClientSuggestions(true);

                    // Match typed value dynamically to prevent losing client ID
                    const matched = (clients || []).find(c =>
                      c && !c.deleted && (
                        c.clientName.toLowerCase().trim() === val.toLowerCase().trim() ||
                        `${c.clientName} (${c.shortName})`.toLowerCase().trim() === val.toLowerCase().trim() ||
                        (c.shortName && c.shortName.toLowerCase().trim() === val.toLowerCase().trim())
                      )
                    );
                    if (matched) {
                      setFormClient(matched.id);
                    }
                  }}
                  onFocus={() => setShowClientSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowClientSuggestions(false), 250)}
                  placeholder="Pesquisar cliente por nome..."
                  className="w-full p-2.5 pr-8 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-none bg-surface font-semibold text-text-primary"
                />
                <Search className="w-4 h-4 text-text-muted absolute right-3 top-3.5 pointer-events-none" />
              </div>

              {showClientSuggestions && (
                <div className="absolute z-50 left-0 right-0 max-h-60 overflow-y-auto bg-surface border border-border rounded-control -lg mt-1 p-1">
                  {autocompleteClients.length > 0 ? (
                    autocompleteClients.map(c => {
                      const isSelected = formClient === c.id;
                      return (
                        <Button variant="ghost" size="sm"
                          key={c.id}
                          type="button"
                          onMouseDown={() => {
                            setFormClient(c.id);
                            setClientSearchQuery(`${c.clientName} (${c.shortName})`);
                            setShowClientSuggestions(false);
                          }}
                          className={`w-full text-left p-2 rounded-lg text-body-sm transition-colors flex flex-col gap-0.5 cursor-pointer ${
                            isSelected
                              ? 'bg-primary/10 text-primary font-bold'
                              : 'hover:bg-surface-muted text-text-secondary font-semibold'
                          }`}
                        >
                          <span className="truncate">{c.clientName}</span>
                          <span className="text-caption text-text-muted font-normal">{c.shortName} • {c.location || 'Sem localização'}</span>
                        </Button>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-text-muted italic text-caption font-medium">
                      Nenhum cliente encontrado
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-text-secondary">Nome do projeto *</label>
              <Input aria-label="Nome do projeto"
                type="text"
                required
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Ex: Instalação de Balança Multicabeçal e Tapete Rejeitor"
                className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-none text-body-sm font-semibold"
              />
            </div>

            {/* Description */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-text-secondary">Descrição</label>
              <Textarea aria-label="Descrição"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                rows={4}
                placeholder="Introduza os detalhes do projeto..."
                className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-none text-body-sm font-medium"
              />
            </div>

            {/* Budget */}
            <div className="space-y-1">
              <label className="block text-text-secondary">Valor da venda (€)</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-text-muted font-bold">€</span>
                <Input aria-label="Valor da venda (€)"
                  type="number"
                  value={formBudget}
                  onChange={e => setFormBudget(Number(e.target.value))}
                  className="w-full pl-8 pr-3 p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-none font-semibold"
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="block text-text-secondary font-bold">Categorias</label>
              <div className="border border-border rounded-control p-3 max-h-[120px] overflow-y-auto bg-surface-muted/50 space-y-1.5">
                {projectCategories.filter(c => !c.deleted).map(c => {
                  const isChecked = formCategories.some(catId => matchId(catId, c.id));
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-body-sm font-semibold text-text-secondary cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            const next = formCategories.filter(id => !matchId(id, c.id));
                            setFormCategories(next);
                            if (matchId(formCategory, c.id)) {
                              setFormCategory(next[0] || '');
                            }
                          } else {
                            const next = [...formCategories, c.id];
                            setFormCategories(next);
                            if (!formCategory) {
                              setFormCategory(c.id);
                            }
                          }
                        }}
                        className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                      />
                      {c.name}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Project status */}
            <div className="space-y-1">
              <label className="block text-text-secondary">Estado do projeto</label>
              <Select aria-label="Estado do projeto"
                value={formStatus}
                onChange={e => setFormStatus(e.target.value)}
                className="w-full p-2.5 border border-border rounded-control bg-surface font-semibold"
              >
                {sortedStatuses.filter(s => !s.deleted || s.id === formStatus).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>

            {/* Project Manager (Team Type Users) */}
            <div className="space-y-1">
              <label className="block text-text-secondary">Project Leader *</label>
              <Select aria-label="Project Leader"
                required
                value={formProjManager}
                onChange={e => setFormProjManager(e.target.value)}
                className="w-full p-2.5 border border-border rounded-control bg-surface font-semibold"
              >
                <option value="">Escolher utilizador</option>
                {(() => {
                  const projGroupIds = appConfig?.projManagerGroupIds || (appConfig?.projManagerGroupId ? [appConfig.projManagerGroupId] : []);
                  const canonicalRoleIds = translateToCanonicalRoleIds(projGroupIds);
                  let filteredUsers = canonicalRoleIds.length > 0
                    ? users.filter(u => canonicalRoleIds.some(cid => matchId(cid, u.roleId)) && !u.deleted)
                    : [];

                  // Keep currently selected user even if deleted or not in the group to preserve existing data
                  if (formProjManager && !filteredUsers.some(u => matchId(u.id, formProjManager))) {
                    const currentMgr = users.find(u => matchId(u.id, formProjManager));
                    if (currentMgr) {
                      filteredUsers.push(currentMgr);
                    }
                  }

                  filteredUsers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }));

                  return (
                    <>
                      {filteredUsers.length === 0 && (
                        <option disabled value="">
                          (Nenhum utilizador elegível / Configuração inconsistente)
                        </option>
                      )}
                      {filteredUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </>
                  );
                })()}
              </Select>
            </div>

            {/* Field Manager (Team Type Users) */}
            <div className="space-y-1">
              <label className="block text-text-secondary">Técnico responsável</label>
              <Select aria-label="Técnico responsável"
                value={formFieldManager}
                onChange={e => setFormFieldManager(e.target.value)}
                className="w-full p-2.5 border border-border rounded-control bg-surface font-semibold"
              >
                <option value="">Escolher utilizador</option>
                {(() => {
                  const fieldGroupIds = appConfig?.fieldManagerGroupIds || (appConfig?.fieldManagerGroupId ? [appConfig.fieldManagerGroupId] : []);
                  const canonicalRoleIds = translateToCanonicalRoleIds(fieldGroupIds);
                  let filteredUsers = canonicalRoleIds.length > 0
                    ? users.filter(u => canonicalRoleIds.some(cid => matchId(cid, u.roleId)) && !u.deleted)
                    : [];

                  // Keep currently selected user even if deleted or not in the group to preserve existing data
                  if (formFieldManager && !filteredUsers.some(u => matchId(u.id, formFieldManager))) {
                    const currentMgr = users.find(u => matchId(u.id, formFieldManager));
                    if (currentMgr) {
                      filteredUsers.push(currentMgr);
                    }
                  }

                  filteredUsers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }));

                  return (
                    <>
                      {filteredUsers.length === 0 && (
                        <option disabled value="">
                          (Nenhum utilizador elegível / Configuração inconsistente)
                        </option>
                      )}
                      {filteredUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </>
                  );
                })()}
              </Select>
            </div>

            {/* Sales Representative */}
            <div className="space-y-1">
              <label className="block text-text-secondary">Gestor de vendas</label>
              <Select aria-label="Gestor de vendas"
                value={formSales}
                onChange={e => setFormSales(e.target.value)}
                className="w-full p-2.5 border border-border rounded-control bg-surface font-semibold"
              >
                <option value="">Escolher utilizador</option>
                {(() => {
                  const salesGroupIds = appConfig?.salesRepGroupIds || (appConfig?.salesRepGroupId ? [appConfig.salesRepGroupId] : []);
                  const canonicalRoleIds = translateToCanonicalRoleIds(salesGroupIds);
                  let filteredUsers = canonicalRoleIds.length > 0
                    ? users.filter(u => canonicalRoleIds.some(cid => matchId(cid, u.roleId)) && !u.deleted)
                    : [];

                  // Keep currently selected user even if deleted or not in the group to preserve existing data
                  if (formSales && !filteredUsers.some(u => matchId(u.id, formSales))) {
                    const currentSales = users.find(u => matchId(u.id, formSales));
                    if (currentSales) {
                      filteredUsers.push(currentSales);
                    }
                  }

                  filteredUsers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }));

                  return (
                    <>
                      {filteredUsers.length === 0 && (
                        <option disabled value="">
                          (Nenhum utilizador elegível / Configuração inconsistente)
                        </option>
                      )}
                      {filteredUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </>
                  );
                })()}
              </Select>
            </div>

            {/* Demo Checkbox */}
            <div className="space-y-1 flex items-center h-full pt-4 pl-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formDemo}
                  onChange={e => setFormDemo(e.target.checked)}
                  className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                />
                <span className="text-text-secondary">Marcar como Projeto de Demonstração</span>
              </label>
            </div>

            {/* Dates: Start & Delivery */}
            <div className="space-y-1">
              <label className="block text-text-secondary">Data de adjudicação *</label>
              <Input aria-label="Data de adjudicação"
                type="date"
                required
                value={formStartDate}
                onChange={e => setFormStartDate(e.target.value)}
                className="w-full p-2.5 border border-border rounded-control font-semibold text-text-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-text-secondary">Pazo de entrega da venda</label>
              <Input aria-label="Pazo de entrega da venda"
                type="date"
                value={formDeliveryDate}
                onChange={e => setFormDeliveryDate(e.target.value)}
                className="w-full p-2.5 border border-border rounded-control font-semibold text-text-primary"
              />
            </div>

            {/* Dates: Estimated & Scheduled */}
            <div className="space-y-1">
              <label className="block text-text-secondary">Data estimada real</label>
              <Input aria-label="Data estimada real"
                type="date"
                value={formEstimatedDate}
                onChange={e => setFormEstimatedDate(e.target.value)}
                className="w-full p-2.5 border border-border rounded-control font-semibold text-text-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-text-secondary">Data agendada com cliente</label>
              <Input aria-label="Data agendada com cliente"
                type="date"
                value={formScheduledDate}
                onChange={e => setFormScheduledDate(e.target.value)}
                className="w-full p-2.5 border border-border rounded-control font-semibold text-text-primary"
              />
            </div>

            {/* Client Contact Details */}
            <div className="space-y-4 md:col-span-2 p-4 bg-surface-muted border border-border rounded-control">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-text-muted" />
                Contactos do Cliente no Projeto
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-text-secondary text-body-sm">Nome</label>
                  <Input aria-label="Nome"
                    type="text"
                    value={formClientContactName}
                    onChange={e => setFormClientContactName(e.target.value)}
                    placeholder="Nome completo"
                    className="w-full p-2.5 border border-border rounded-control font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-text-secondary text-body-sm">Email</label>
                  <Input aria-label="Email"
                    type="email"
                    value={formClientContactEmail}
                    onChange={e => setFormClientContactEmail(e.target.value)}
                    placeholder="email@cliente.pt"
                    className="w-full p-2.5 border border-border rounded-control font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-text-secondary text-body-sm">Telefone</label>
                  <Input aria-label="Telefone"
                    type="tel"
                    value={formClientContactPhone}
                    onChange={e => setFormClientContactPhone(e.target.value)}
                    placeholder="+351 912345678"
                    className="w-full p-2.5 border border-border rounded-control font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Integration Fields: Install No & SF Opport No */}
            <div className="space-y-1">
              <label className="block text-text-secondary">Install Project</label>
              <Input aria-label="Install Project"
                type="text"
                value={formInstallNo}
                onChange={e => setFormInstallNo(e.target.value)}
                placeholder="Ex: IP-2026-092"
                className="w-full p-2.5 border border-border rounded-control font-semibold font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-text-secondary">Oportunidade SF</label>
              <Input aria-label="Oportunidade SF"
                type="text"
                value={formSFNo}
                onChange={e => setFormSFNo(e.target.value)}
                placeholder="Ex: SF-OPP-1044"
                className="w-full p-2.5 border border-border rounded-control font-semibold font-mono"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label className="block text-text-secondary">Prioridade</label>
              <Select aria-label="Prioridade"
                value={formPriority}
                onChange={e => setFormPriority(e.target.value)}
                className="w-full p-2.5 border border-border rounded-control bg-surface font-semibold"
              >
                {projectPriorities.filter(p => !p.deleted || matchId(p.id, formPriority)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>

            {/* Teams Involved (Multiple Choice checkbox list) */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-text-secondary mb-1.5">Equipas envolvidas</label>
              <div className="flex flex-wrap gap-4 bg-surface-muted p-3 rounded-control border border-border">
                {projectTeams.filter(team => !team.deleted || formTeams.some(tid => matchId(tid, team.id))).map(team => (
                  <label key={team.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formTeams.some(tid => matchId(tid, team.id))}
                      onChange={() => handleToggleTeam(team.id)}
                      className="w-4 h-4 text-primary rounded"
                    />
                    <span className="text-text-secondary">{team.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Partners Involved (Multiple Choice checkbox list) */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-text-secondary mb-1.5">Parceiros externos</label>
              <div className="flex flex-wrap gap-4 bg-surface-muted p-3 rounded-control border border-border">
                {projectPartners.filter(p => !p.deleted || formPartners.some(pid => matchId(pid, p.id))).map(p => (
                  <label key={p.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formPartners.some(pid => matchId(pid, p.id))}
                      onChange={() => handleTogglePartner(p.id)}
                      className="w-4 h-4 text-primary rounded"
                    />
                    <span className="text-text-secondary">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>


            {/* Default Tasks Selection section */}
            {!editingId && defaultTasks && defaultTasks.length > 0 && (
              <div className="space-y-2 md:col-span-2 border-t border-border-subtle pt-5 mt-2">
                <label className="block text-text-primary font-extrabold text-body-sm flex items-center gap-1.5 mb-1">
                  <ListTodo className="w-4 h-4 text-success-strong" />
                  Modelos de Tarefa por Defeito
                </label>
                <p className="text-text-muted text-caption font-medium leading-relaxed mb-3">
                  Selecione quais as tarefas padrão que deseja que sejam criadas automaticamente associadas a este novo projeto.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-surface-muted/50 p-3 rounded-card border border-border-subtle">
                  {defaultTasks.map(dt => (
                    <label
                      key={dt.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-control border cursor-pointer transition-colors ${
                        selectedDefaultTaskIds.includes(dt.id)
                          ? "bg-success/10 border-success/20 text-success-strong"
                          : "bg-surface border-border hover:bg-surface-muted text-text-secondary"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDefaultTaskIds.includes(dt.id)}
                        onChange={() => toggleDefaultTask(dt.id)}
                        className="mt-0.5 w-4 h-4 text-success-strong rounded border-border focus:ring-success"
                      />
                      <div className="text-caption leading-tight font-semibold flex-1">
                        <div className="flex justify-between items-center gap-1 font-bold text-text-primary">
                          <span className="truncate max-w-[150px]">{dt.title}</span>
                          <span className="text-caption px-1.5 py-0.5 bg-surface-muted rounded text-text-secondary font-mono flex-shrink-0">
                            {dt.estimatedHours}
                          </span>
                        </div>
                        <div className="text-caption text-text-muted font-normal mt-0.5 truncate max-w-[200px]">
                          {dt.description || "Sem descrição."}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border-subtle">
            <Button variant="ghost" size="sm"
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-5 py-2.5 bg-surface-muted hover:bg-surface-muted text-text-secondary font-bold rounded-control border border-border"
            >
              Cancelar
            </Button>
            <Button variant="primary" size="sm"
              type="submit"
              className="px-6 py-2.5 bg-primary text-white rounded-control font-bold hover:bg-primary transition-colors -sm"
            >
              Gravar Alterações
            </Button>
          </div>
        </form>

      ) : (

        // Project list and analysis share the existing Foundation tab pattern.
        <div className="space-y-4">
        <Tabs tabs={[{ id: 'lista', label: 'Lista de projetos', icon: <ListTodo className="w-4 h-4" /> }, { id: 'analise', label: 'Análise de projetos', icon: <BarChart3 className="w-4 h-4" /> }]}
          activeTabId={projectListView} onChange={id => setProjectListView(id as 'lista' | 'analise')} variant="line" />
        {projectListView === 'analise' ? <ProjectAnalytics projects={projects} projectStatuses={projectStatuses}
          categories={projectCategories} users={users} clients={clients} materials={projectMaterials} onSelectProject={setSelectedProjectId} /> : (
        <Card className="bg-surface rounded-card border border-border -sm overflow-hidden animate-fade-in">

          {/* List Header and Filter controls */}
          <div className="p-4 sm:p-5 border-b border-border/80 bg-surface-muted/60 space-y-3.5">
            <M3SectionHeader title="Lista de projetos" description="Consulta e pesquisa de projetos"
              actions={canWriteProjects ? <Button type="button" onClick={() => openForm(null)}><Plus className="w-4 h-4" /> Novo projeto</Button> : undefined}
            />

            {/* Filter inputs */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex-1 min-w-[240px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none z-10" />
                <Input aria-label="Pesquisar projetos"
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar por título, ID ou referência de instalação..."
                  className="w-full pl-9 pr-3.5 py-2 bg-surface border border-border rounded-control text-body-sm font-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              <M3SegmentedControl
                label="Filtrar projetos por fase"
                value={filterStatusGroup}
                onChange={handleStatusGroupChange}
                options={[
                  { value: 'active', label: 'Em curso' },
                  { value: 'implementation', label: 'Implementação' },
                  { value: 'all', label: 'Todos' },
                  { value: 'completed', label: 'Concluídos' },
                ]}
                className="m3-project-filters"
              />



              {/* Manager dropdown */}
              <div className="w-full sm:w-56 shrink-0">
              <Select aria-label="Filtrar por gestor"
                value={filterManager}
                onChange={e => setFilterManager(e.target.value)}
                className="px-3 py-2 bg-surface border border-border rounded-control text-body-sm font-semibold text-text-secondary outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
              >
                <option value="">Todos os Gestores</option>
                {users.filter(u => !u.deleted && projects.some(p => !p.deleted && (p.projectManagerId === u.id || matchId(p.projectManagerId, u.id))))
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }))
                  .map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                }
              </Select>
              </div>

            </div>
          </div>

          {/* Table list output */}
          <div className="overflow-x-auto w-full">
            {projectsListPending ? (
              <div role="status" aria-live="polite" className="p-10 flex items-center justify-center gap-2 text-body-sm text-text-secondary">
                <Loader2 aria-hidden="true" className="w-5 h-5 animate-spin" /> A carregar projetos…
              </div>
            ) : projectsLoadError ? (
              <div role="alert" className="p-10 text-center space-y-3 text-body-sm text-text-secondary">
                <p>{projectsLoadError}</p>
                <Button variant="secondary" size="sm" onClick={() => setRefreshTrigger(value => value + 1)}>Tentar novamente</Button>
              </div>
            ) : paginatedProjects.length === 0 ? (
              <div className="p-10 text-center text-text-muted font-medium text-body-sm">Nenhum projeto encontrado para os filtros selecionados.</div>
            ) : (
              <table className="w-full min-w-[700px] text-left border-collapse">
                <thead className="bg-surface-muted/90 text-caption uppercase tracking-wider text-text-secondary font-bold border-b border-border/80 whitespace-nowrap select-none">
                  <tr>
                    <th className="px-5 py-3.5 text-left">IP / Gestor</th>
                    <th className="px-5 py-3.5 text-left">Projeto</th>
                    <th className="px-5 py-3.5 text-left">Datas</th>
                    <th className="px-5 py-3.5 text-left">Estado</th>
                    <th className="px-5 py-3.5 text-left">Risco / Prioridade</th>
                  </tr>
                </thead>
                <tbody className="text-body-sm divide-y divide-border-subtle">
                  {paginatedProjects.map(proj => {
                    const calcRisk = getProjectCalculatedRisk(proj.id, projectRiskItems);
                    const isCritical = calcRisk.score >= 16;
                    return (
                      <tr
                        key={proj.id}
                        className={`hover:bg-surface-muted cursor-pointer transition-colors ${
                          isCritical ? 'border-l-4 border-l-error bg-error/10' : ''
                        }`}
                        onClick={() => setSelectedProjectId(proj.id)}
                      >
                        <td className="px-5 py-4">
                          <div className="font-mono font-bold text-text-primary">{proj.installProjectNo || '-'}</div>
                          <div className="text-caption text-text-secondary font-medium">{getUserName(proj.projectManagerId)}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {isCritical && (
                              <span className="w-1.5 h-7 bg-error rounded-full shrink-0" title="Risco Crítico do Projeto" />
                            )}
                            <div>
                              <div className="text-body-sm text-primary font-medium">{getClientName(proj.clientId)}</div>
                              <Button type="button" variant="ghost" size="sm" className="h-auto min-h-9 px-0 text-body text-left justify-start whitespace-normal text-text-primary"
                                aria-label={`Abrir projeto ${proj.title}`}
                                onClick={event => { event.stopPropagation(); setSelectedProjectId(proj.id); }}>
                                {proj.title}
                              </Button>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-text-secondary font-medium">
                          <div>Venda: {proj.startDate || '-'}</div>
                          <div>Entrega: {proj.scheduledDate || proj.estimatedDate || proj.deliveryDate || '-'}</div>
                        </td>
                        <td className="px-5 py-4">
                          {(() => {
                            const pStyle = getProjectStatusStyle(proj.statusId, projectStatuses);
                            return (
                              <Badge className={pStyle.badgeClass}>
                                {pStyle.name}
                              </Badge>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`text-caption font-extrabold uppercase px-2 py-0.5 rounded border inline-flex items-center gap-1 ${calcRisk.color}`}>
                              <span>{calcRisk.dot}</span>
                              <span>Risco: {calcRisk.label}</span>
                            </span>
                            <span className="text-caption text-text-secondary font-medium pl-0.5">
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
          {!projectsListPending && !projectsLoadError && totalProjects > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 bg-surface-muted/70 border-t border-border/80 text-body-sm gap-3 font-medium">
              <div className="flex items-center gap-3 text-text-secondary font-medium">
                <span>
                  A mostrar <span className="font-bold text-text-secondary">{totalProjects === 0 ? 0 : startProjectIndex + 1}</span> a{' '}
                  <span className="font-bold text-text-secondary">{endProjectIndex}</span> de{' '}
                  <span className="font-bold text-text-secondary">{totalProjects}</span> projetos
                </span>
                <div className="flex items-center gap-1.5 pl-3 border-l border-border">
                  <span className="text-text-muted whitespace-nowrap">Por página:</span>
                  <Select aria-label="Projetos por página"
                    value={projectPageSize}
                    onChange={e => {
                      setProjectPageSize(Number(e.target.value));
                      setProjectCurrentPage(1);
                    }}
                    className="px-2 py-1 bg-surface border border-border rounded-lg text-body-sm font-semibold text-text-secondary outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </Select>
                </div>
              </div>

              {totalProjectPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm"
                    onClick={() => setProjectCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={validProjectPage === 1}
                    className="px-2.5 py-1.5 bg-surface border border-border rounded-lg font-bold text-text-secondary hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Anterior</span>
                  </Button>

                  <div className="flex items-center gap-1 mx-1">
                    {getPaginationPages(validProjectPage, totalProjectPages).map((p, idx) => (
                      p === '...' ? (
                        <span key={`ellipsis-proj-${idx}`} className="px-1 text-text-muted font-bold">...</span>
                      ) : (
                        <Button variant="primary" size="sm"
                          key={`page-proj-${p}`}
                          onClick={() => setProjectCurrentPage(Number(p))}
                          className={`min-w-9 h-9 px-2 flex items-center justify-center rounded-control font-semibold text-body-sm transition-colors ${
                            validProjectPage === p
                              ? 'bg-primary text-white'
                              : 'bg-surface border border-border text-text-secondary hover:bg-surface-muted'
                          }`}
                        >
                          {p}
                        </Button>
                      )
                    ))}
                  </div>

                  <Button variant="ghost" size="sm"
                    onClick={() => setProjectCurrentPage(prev => Math.min(prev + 1, totalProjectPages))}
                    disabled={validProjectPage === totalProjectPages}
                    className="px-2.5 py-1.5 bg-surface border border-border rounded-lg font-bold text-text-secondary hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                  >
                    <span>Seguinte</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
        )}
        </div>
      )}


      {/* Modal do Cronograma em Ecrã Cheio */}
      {isFullTimelineModalOpen && selectedProj && (
        <div className="fixed inset-0 bg-primary/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-6 transition-all duration-300">
          <div className="w-full max-w-[95vw] h-[90vh] bg-surface rounded-card -2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="bg-surface-muted border-b border-border px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-text-primary text-body-sm md:text-base uppercase tracking-wider">
                    Cronograma de 30 Dias: {selectedProj.title}
                  </h3>
                  <p className="text-body-sm font-semibold text-text-secondary">
                    Navegue e reagende tarefas arrastando as barras coloridas
                  </p>
                </div>
              </div>

              {/* Top Controls & Navigation */}
              <div className="flex items-center gap-3">
                <span className="text-caption font-bold text-primary bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1 hidden sm:inline-block">
                  {(() => {
                    const end = new Date(cronogramaStartDate);
                    end.setDate(end.getDate() + 29);
                    return `${cronogramaStartDate.toLocaleDateString('pt-PT')} a ${end.toLocaleDateString('pt-PT')}`;
                  })()}
                </span>

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" aria-label="Voltar 5 dias"
                    type="button"
                    onClick={shiftCronogramaPrev}
                    className="flex items-center gap-1 px-2 py-1 bg-surface hover:bg-surface-muted border border-border rounded-lg text-caption font-bold text-text-secondary cursor-pointer transition-colors"
                    title="Voltar 5 dias"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> -5d
                  </Button>
                  <Button variant="ghost" size="sm"
                    type="button"
                    onClick={resetCronogramaToDefault}
                    className="px-2 py-1 bg-surface hover:bg-surface-muted border border-border rounded-lg text-caption font-bold text-text-secondary cursor-pointer transition-colors"
                  >
                    Hoje
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Avançar 5 dias"
                    type="button"
                    onClick={shiftCronogramaNext}
                    className="flex items-center gap-1 px-2 py-1 bg-surface hover:bg-surface-muted border border-border rounded-lg text-caption font-bold text-text-secondary cursor-pointer transition-colors"
                    title="Avançar 5 dias"
                  >
                    +5d <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Close Button */}
                <IconButton variant="ghost" aria-label="Fechar modal"
                  type="button"
                  onClick={() => setIsFullTimelineModalOpen(false)}
                  className="p-1.5 hover:bg-border border border-border text-text-secondary hover:text-text-primary rounded-control transition-colors cursor-pointer flex items-center justify-center"
                  title="Fechar modal"
                >
                  <X className="w-5 h-5" />
                </IconButton>
              </div>
            </div>

            {/* Modal Body - Scrollable Timeline Table */}
            <div className="flex-1 overflow-auto p-4 md:p-6 bg-surface-muted/50">
              <Card className="bg-surface border border-border rounded-card overflow-hidden shadow-2xs h-full flex flex-col">
                <div className="overflow-auto flex-1">
                  <table className="w-full min-w-[1850px] text-body-sm text-left border-collapse table-fixed">
                    <thead className="bg-surface-muted text-caption uppercase tracking-wider text-text-secondary font-bold border-b border-border whitespace-nowrap select-none">
                      <tr className="bg-surface-muted border-b border-border sticky top-0 z-20">
                        <th className="p-3.5 sticky left-0 bg-surface-muted border-r border-border font-bold text-text-secondary w-56 min-w-[210px] shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-30 text-caption uppercase tracking-wider">
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
                                  openCreateTaskModal(dayStr);
                                  setShowImportTaskForm(false);
                                }}
                                className={`p-2 border-r border-border/80 text-center min-w-[55px] font-bold cursor-pointer hover:bg-border/50 transition-colors ${
                                  isToday ? 'bg-warning/60 text-warning border-x border-warning/20' :
                                  isWeekend ? 'bg-surface-muted/70 text-text-secondary hover:bg-border/40' : 'text-text-secondary'
                                }`}
                                title="Clique para adicionar tarefa neste dia"
                              >
                                <div className="text-caption uppercase font-semibold text-text-muted">
                                  {d.toLocaleDateString('pt-PT', { weekday: 'short' }).charAt(0).toUpperCase()}
                                </div>
                                <div className={`text-body-sm ${isToday ? 'font-extrabold text-warning' : ''}`}>{d.getDate()}</div>
                                <div className="text-caption font-normal text-text-muted">
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
                      <tr className="bg-surface-muted/60 border-b border-border">
                        <td className="p-2.5 sticky left-0 bg-surface-muted border-r border-border font-bold text-text-secondary shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10">
                          <div className="flex items-center gap-1.5 text-primary">
                            <Flag className="w-3.5 h-3.5 text-primary" />
                            <span className="text-caption uppercase font-bold tracking-wide">Lembretes do Projeto</span>
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
                              <td key={`modal-cell-proj-${dayStr}`} className={`p-1 border-r border-border/80 text-center align-middle ${isToday ? 'bg-warning/40' : isWeekend ? 'bg-surface-muted/40' : ''}`}>
                                <div className="flex flex-col gap-0.5 items-center justify-center">
                                  {isProjStart && (
                                    <span className="px-1.5 py-0.5 bg-primary text-white text-caption font-extrabold rounded shadow-xs scale-90" title="Data de Início do Projeto">
                                      INÍCIO
                                    </span>
                                  )}
                                  {isProjDelivery && (
                                    <span className="px-1.5 py-0.5 bg-success-strong text-white text-caption font-extrabold rounded shadow-xs scale-90" title="Data de Entrega do Projeto">
                                      ENTREGA
                                    </span>
                                  )}
                                  {isProjEstimated && !isProjDelivery && (
                                    <span className="px-1.5 py-0.5 bg-surface-elevated text-text-primary text-caption font-extrabold rounded shadow-xs scale-90" title="Previsão de Conclusão">
                                      PREVISTO
                                    </span>
                                  )}
                                  {isProjScheduled && !isProjStart && (
                                    <span className="px-1.5 py-0.5 bg-primary text-white text-caption font-extrabold rounded shadow-xs scale-90" title="Instalação/Agendamento">
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
                              <td colSpan={31} className="p-8 text-center text-text-muted italic">
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
                            <tr key={`modal-row-task-${t.id}`} className="border-b border-border-subtle hover:bg-surface-muted/20 group">
                              <td
                                onClick={() => openTaskDetailsModal(t)}
                                className="p-3 sticky left-0 bg-surface group-hover:bg-surface-muted hover:bg-surface-muted border-r border-border shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10 font-medium cursor-pointer transition-colors"
                                title={`Clique para ver/editar: ${t.title}`}
                              >
                                <div className="space-y-1">
                                  <div className="font-bold text-text-primary text-body-sm truncate max-w-[190px] group-hover:text-primary transition-colors" title={t.title}>
                                    {t.title}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {(() => {
                                      const tStyle = getTaskStatusStyle(t.statusId, taskStatuses);
                                      return (
                                        <span className={`px-1.5 py-0.5 rounded-full text-caption font-extrabold border tracking-wider ${tStyle.badgeClass}`}>
                                          {tStyle.name}
                                        </span>
                                      );
                                    })()}

                                    <span className="text-caption text-text-secondary font-bold truncate max-w-[150px]">
                                      👤 {assigneesText}
                                    </span>
                                  </div>

                                  {/* Task Alerts & Warnings */}
                                  {conflicts.length > 0 && (
                                    <div className="space-y-1 pt-1">
                                      {conflicts.map((c, idx) => (
                                        <div
                                          key={`modal-conflict-${idx}`}
                                          className="flex items-start gap-1 p-1 bg-error/10 text-error border border-error/60 rounded-md text-caption font-semibold leading-tight hover:bg-error/10 transition-colors"
                                          title={c.details}
                                        >
                                          <ShieldAlert className="w-3.5 h-3.5 text-error flex-shrink-0 mt-0.5" />
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
                                      className={`p-1 border-r border-border/80 text-center align-middle relative min-w-[55px] ${
                                        isActive ? 'bg-primary/10' : ''
                                      } ${
                                        isToday ? 'bg-warning/30' :
                                        isWeekend ? 'bg-surface-muted/60' : ''
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
                                          className={`py-1.5 px-1 rounded-lg text-caption font-bold text-white -sm cursor-grab active:cursor-grabbing hover:scale-105 hover:brightness-95 active:scale-95 transition-all select-none overflow-hidden truncate max-w-[50px] mx-auto ${
                                            getTaskStatusStyle(t.statusId, taskStatuses).dotClass
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
              </Card>
            </div>

            {/* Modal Footer */}
            <div className="bg-surface-muted border-t border-border px-6 py-4 flex flex-wrap gap-4 items-center justify-between text-caption font-bold text-text-secondary shrink-0">
              <div className="flex flex-wrap gap-4 items-center">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-primary"></span> Pendente</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-warning"></span> Em Progresso</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-success"></span> Concluído</span>
                <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 border border-error/20 bg-error/10 text-error rounded flex items-center justify-center text-caption">⚠️</span> Alertas</span>
                <span className="text-caption text-text-muted italic font-medium">Arraste as barras coloridas das tarefas no cronograma para reagendá-las em novos dias.</span>
              </div>
              <Button variant="primary" size="sm"
                type="button"
                onClick={() => setIsFullTimelineModalOpen(false)}
                className="px-5 py-2 bg-primary hover:bg-primary text-white rounded-control font-bold transition-colors cursor-pointer text-body-sm -md -slate-100"
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRiskModal && (
        <div className="fixed inset-0 bg-primary/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <Card className="bg-surface rounded-card border border-border shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-body-sm font-bold text-text-secondary">
            {/* Modal Header */}
            <div className="bg-surface-muted border-b border-border-subtle px-6 py-4 flex items-center justify-between">
              <h3 className="text-body-sm font-extrabold text-text-primary flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" />
                {editingRiskId ? 'Editar Risco Identificado' : 'Identificar Novo Risco de Projeto'}
              </h3>
              <IconButton aria-label="Fechar" variant="ghost" size="sm"
                type="button"
                onClick={() => setShowRiskModal(false)}
                className="text-text-muted hover:text-text-secondary text-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </IconButton>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveRisk} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-text-secondary">

                {/* Title */}
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-text-secondary font-bold">Título do Risco *</label>
                  <Input aria-label="Título do Risco"
                    type="text"
                    required
                    placeholder="Ex: Atraso na entrega de equipamentos críticos"
                    value={riskTitle}
                    onChange={e => setRiskTitle(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden font-semibold text-text-primary"
                  />
                </div>

                {/* Category & Owner */}
                <div className="space-y-1">
                  <label className="block text-text-secondary font-bold">Categoria do Risco *</label>
                  <Select aria-label="Categoria do Risco"
                    required
                    value={riskCategoryId}
                    onChange={e => setRiskCategoryId(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden bg-surface font-semibold text-text-primary cursor-pointer"
                  >
                    {riskCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="block text-text-secondary font-bold">Responsável / Proprietário do Risco</label>
                  <Select aria-label="Responsável / Proprietário do Risco"
                    value={riskOwnerId}
                    onChange={e => setRiskOwnerId(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden bg-surface font-semibold text-text-primary cursor-pointer"
                  >
                    <option value="">Sem responsável (Geral)</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                </div>

                {/* Identification Date & suggested review date */}
                <div className="space-y-1">
                  <label className="block text-text-secondary font-bold">Data de Identificação *</label>
                  <Input aria-label="Data de Identificação"
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
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden font-semibold text-text-primary"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-text-secondary font-bold">Data da Próxima Revisão *</label>
                    <span className="text-caption text-primary font-bold uppercase bg-primary/10 px-1.5 py-0.5 rounded">Sugestão Automática</span>
                  </div>
                  <Input
                    type="date"
                    required
                    value={riskReviewDate}
                    onChange={e => setRiskReviewDate(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden font-semibold text-text-primary"
                  />
                </div>

                {/* Probability & Impact */}
                <div className="bg-surface-muted p-4 rounded-card border border-border space-y-3">
                  <span className="block text-caption uppercase font-bold text-text-secondary tracking-wider">Avaliação da Probabilidade</span>
                  <div className="flex items-center gap-3">
                    <Input
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
                      className="flex-1 accent-blue-600 cursor-pointer h-1.5 bg-border rounded-lg appearance-none"
                    />
                    <span className="w-10 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-primary text-body-sm">{riskProbability}</span>
                  </div>
                  <div className="flex justify-between text-caption text-text-muted font-bold uppercase tracking-wide">
                    <span>Muito Baixo (1)</span>
                    <span>Muito Alto (5)</span>
                  </div>
                </div>

                <div className="bg-surface-muted p-4 rounded-card border border-border space-y-3">
                  <span className="block text-caption uppercase font-bold text-text-secondary tracking-wider">Avaliação do Impacto</span>
                  <div className="flex items-center gap-3">
                    <Input
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
                      className="flex-1 accent-blue-600 cursor-pointer h-1.5 bg-border rounded-lg appearance-none"
                    />
                    <span className="w-10 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-primary text-body-sm">{riskImpact}</span>
                  </div>
                  <div className="flex justify-between text-caption text-text-muted font-bold uppercase tracking-wide">
                    <span>Muito Baixo (1)</span>
                    <span>Muito Alto (5)</span>
                  </div>
                </div>

                {/* Auto Calculated Risk Score Badge */}
                <div className="md:col-span-2 flex items-center justify-between p-4 bg-primary text-white rounded-card border border-border shadow-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-caption text-white font-bold uppercase tracking-wider">Nível de Risco Calculado</span>
                    <span className="text-body-sm font-semibold text-white">Fórmula: Probabilidade ({riskProbability}) × Impacto ({riskImpact})</span>
                  </div>
                  {(() => {
                    const level = getRiskLevelDetails(riskProbability, riskImpact);
                    return (
                      <span className={`px-4 py-2 rounded-control text-body-sm font-black uppercase tracking-widest border shadow-sm ${level.color}`}>
                        {level.dot} {level.label} ({level.score})
                      </span>
                    );
                  })()}
                </div>

                {/* State & Priority */}
                <div className="space-y-1">
                  <label className="block text-text-secondary font-bold">Estado do Risco *</label>
                  <Select aria-label="Estado do Risco"
                    required
                    value={riskStatusId}
                    onChange={e => setRiskStatusId(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden bg-surface font-semibold text-text-primary cursor-pointer"
                  >
                    {riskStatuses.map(st => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="block text-text-secondary font-bold">Prioridade *</label>
                  <Select aria-label="Prioridade"
                    required
                    value={riskPriorityId}
                    onChange={e => setRiskPriorityId(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden bg-surface font-semibold text-text-primary cursor-pointer"
                  >
                    {riskPriorities.map(pr => (
                      <option key={pr.id} value={pr.id}>{pr.name}</option>
                    ))}
                  </Select>
                </div>

                {/* Description & Consequence */}
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-text-secondary font-bold">Descrição do Risco</label>
                  <Textarea aria-label="Descrição do Risco"
                    rows={2}
                    placeholder="Descreva detalhadamente o risco e os fatores de ocorrência..."
                    value={riskDescription}
                    onChange={e => setRiskDescription(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden font-semibold text-text-primary placeholder-slate-400"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-text-secondary font-bold">Impacto / Consequência</label>
                  <Textarea aria-label="Impacto / Consequência"
                    rows={2}
                    placeholder="Quais as consequências reais para o projeto caso este risco se materialize?"
                    value={riskConsequence}
                    onChange={e => setRiskConsequence(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden font-semibold text-text-primary placeholder-slate-400"
                  />
                </div>

                {/* Action Plans */}
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-text-secondary font-bold">Plano de Mitigação (Ações Preventivas)</label>
                  <Textarea aria-label="Plano de Mitigação (Ações Preventivas)"
                    rows={2}
                    placeholder="Quais as ações preventivas para reduzir a probabilidade de ocorrência?"
                    value={riskMitigationPlan}
                    onChange={e => setRiskMitigationPlan(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden font-semibold text-text-primary placeholder-slate-400"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-text-secondary font-bold">Plano de Contingência (Ações Corretivas)</label>
                  <Textarea aria-label="Plano de Contingência (Ações Corretivas)"
                    rows={2}
                    placeholder="Qual o plano de ação caso o risco se materialize de facto?"
                    value={riskContingencyPlan}
                    onChange={e => setRiskContingencyPlan(e.target.value)}
                    className="w-full p-2.5 border border-border rounded-control focus:ring-2 focus:ring-primary/20 outline-hidden font-semibold text-text-primary placeholder-slate-400"
                  />
                </div>

              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-border-subtle">
                <Button variant="ghost" size="sm"
                  type="button"
                  onClick={() => setShowRiskModal(false)}
                  className="px-5 py-2.5 text-body-sm font-extrabold text-text-secondary hover:text-text-primary bg-surface-muted hover:bg-surface-muted rounded-control border border-border transition-colors cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button variant="primary" size="sm"
                  type="submit"
                  disabled={isSavingRisk}
                  className="px-6 py-2.5 text-body-sm font-extrabold text-white bg-primary hover:bg-primary rounded-control shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {editingRiskId ? 'Gravar Alterações' : 'Adicionar Item de Risco'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Unified Task Modal (FASE 30 / 30-A) */}
      <TaskDetailsModal
        isOpen={taskModalState.isOpen}
        task={taskModalState.task}
        mode={taskModalState.mode}
        initialProjectId={selectedProj?.id}
        initialDate={taskModalState.initialDate}
        onClose={() => setTaskModalState(prev => ({ ...prev, isOpen: false, task: null }))}
        createTask={async (newTask: any) => {
          const res = await addTask(newTask);
          setRefreshTrigger(prev => prev + 1);
          return res;
        }}
        updateTask={async (id: string, updates: any) => {
          const res = await updateTask(id, updates);
          setRefreshTrigger(prev => prev + 1);
          return res;
        }}
        deleteTask={async (id: string) => {
          if (deleteTask) {
            const res = await deleteTask(id);
            setServerTasks(prev => prev.filter(t => t.id !== id));
            setRefreshTrigger(prev => prev + 1);
            return res;
          }
        }}
        taskStatuses={taskStatuses}
        taskTypes={taskTypes}
        projectPriorities={projectPriorities}
        users={users}
        userGroups={userGroups}
        appConfig={appConfig}
        projects={projects}
        clients={clients}
        absences={absences}
        tasks={tasks}
        canWrite={canWriteTasks}
      />

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
