'use client';

import React, { useState, useMemo } from 'react';
import { 
  Ticket, 
  User, 
  Client, 
  Project, 
  Task, 
  TaskStatus, 
  TaskType, 
  ProjectPriority, 
  TicketStatus, 
  UserGroup 
} from '../lib/types';
import { AssigneeSelector } from './AssigneeSelector';
import { 
  Ticket as TicketIcon, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ArrowRight, 
  Mail, 
  MessageSquare, 
  FileText, 
  Phone, 
  Share2, 
  UserCheck, 
  CheckSquare, 
  Layers, 
  ExternalLink, 
  Trash2, 
  Edit3, 
  Sparkles, 
  BarChart3, 
  Inbox, 
  Send, 
  ShieldCheck, 
  AlertTriangle,
  FolderPlus,
  RefreshCw,
  Building,
  User as UserIcon,
  Tag,
  Calendar,
  X,
  Eye,
  Check,
  Briefcase
} from 'lucide-react';

interface TicketSectionProps {
  tickets: Ticket[];
  users: User[];
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  taskStatuses: TaskStatus[];
  taskTypes?: TaskType[];
  projectPriorities?: ProjectPriority[];
  ticketStatuses?: TicketStatus[];
  userGroups: UserGroup[];
  currentUser?: User | null;
  appConfig?: any;
  onAddTicket: (ticket: Omit<Ticket, 'id' | 'ticketNumber' | 'createdDate' | 'updatedDate'>) => void;
  onUpdateTicket: (id: string, updates: Partial<Ticket>) => void;
  onDeleteTicket: (id: string) => void;
  onValidateAndApprove: (id: string, data: { clientId?: string; assignedToId?: string; priority?: string; category?: string; taskTypeId?: string; validationNotes?: string }) => void;
  onConvertToTask: (id: string, data: { projectId: string; title: string; description?: string; notes?: string; assigneeIds: string[]; estimatedDate?: string; estimatedHours?: string; taskTypeId?: string; statusId?: string }) => void;
  onResolveDirectly: (id: string, resolutionNotes: string) => void;
  onNavigateToProject?: (projectId: string) => void;
  onAddClient?: (client: any) => any;
}

export function TicketSection({
  tickets = [],
  users = [],
  clients = [],
  projects = [],
  tasks = [],
  taskStatuses = [],
  taskTypes = [],
  projectPriorities = [],
  ticketStatuses = [],
  userGroups = [],
  currentUser,
  onAddTicket,
  onUpdateTicket,
  onDeleteTicket,
  onValidateAndApprove,
  onConvertToTask,
  onResolveDirectly,
  onNavigateToProject,
  onAddClient
}: TicketSectionProps) {
  // Navigation sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'all' | 'validation' | 'converted' | 'simulator'>('dashboard');

  // Search and Filters (Note: filterClient was explicitly removed per requirements)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterTechnician, setFilterTechnician] = useState<string>('all');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Selected Ticket for Actions / Editing
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Create Manual Ticket Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSource, setNewSource] = useState<'manual' | 'phone' | 'email' | 'teams'>('manual');
  const [newPriority, setNewPriority] = useState(''); // Obrigatório, sem pré-seleção
  const [newTaskTypeId, setNewTaskTypeId] = useState(''); // Obrigatório, em vez de categoria
  const [newClientId, setNewClientId] = useState('');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [newRequesterName, setNewRequesterName] = useState('');
  const [newRequesterEmail, setNewRequesterEmail] = useState('');
  const [newRequesterPhone, setNewRequesterPhone] = useState('');
  const [newAssignedToId, setNewAssignedToId] = useState('');

  // Edit Ticket Form State
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editTaskTypeId, setEditTaskTypeId] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [editClientSearchQuery, setEditClientSearchQuery] = useState('');
  const [showEditClientSuggestions, setShowEditClientSuggestions] = useState(false);
  const [editAssignedToId, setEditAssignedToId] = useState('');
  const [editRequesterName, setEditRequesterName] = useState('');
  const [editRequesterEmail, setEditRequesterEmail] = useState('');
  const [editRequesterPhone, setEditRequesterPhone] = useState('');

  // Validation Form State
  const [valClientId, setValClientId] = useState('');
  const [valClientSearchQuery, setValClientSearchQuery] = useState('');
  const [showValClientSuggestions, setShowValClientSuggestions] = useState(false);
  const [valAssignedToId, setValAssignedToId] = useState('');
  const [valPriority, setValPriority] = useState('');
  const [valTaskTypeId, setValTaskTypeId] = useState('');
  const [valNotes, setValNotes] = useState('');

  // Convert to Task Form State
  const [convProjectId, setConvProjectId] = useState('');
  const [convTaskTitle, setConvTaskTitle] = useState('');
  const [convTaskDescription, setConvTaskDescription] = useState('');
  const [convAssigneeIds, setConvAssigneeIds] = useState<string[]>([]);
  const [convEstimatedDate, setConvEstimatedDate] = useState('');
  const [convEstimatedHours, setConvEstimatedHours] = useState('');
  const [convTaskTypeId, setConvTaskTypeId] = useState('');
  const [convStatusId, setConvStatusId] = useState('');

  // Resolve Ticket Form State
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveNewTechnicianId, setResolveNewTechnicianId] = useState('');

  // Simulator Form State (Email / Teams incoming simulation)
  const [simChannel, setSimChannel] = useState<'teams' | 'email'>('teams');
  const [simSender, setSimSender] = useState('eng.silva@cliente-exemplo.pt');
  const [simChannelName, setSimChannelName] = useState('#obras-gerais');
  const [simSubject, setSimSubject] = useState('Avaria urgente no quadro elétrico de comando');
  const [simBody, setSimBody] = useState('Boa tarde equipa, verificámos um alarme persistente no inversor da linha 2 da instalação. Podem verificar com urgência?');
  const [simSuccessMsg, setSimSuccessMsg] = useState<string | null>(null);

  // Active (non-deleted) tickets
  const activeTickets = useMemo(() => {
    return tickets.filter(t => !t.deleted);
  }, [tickets]);

  // Technicians / Users qualified for tasks
  const activeUsers = useMemo(() => {
    return users.filter(u => !u.deleted && u.approved);
  }, [users]);

  // Active Clients
  const activeClients = useMemo(() => {
    return clients.filter(c => !c.deleted);
  }, [clients]);

  // Active Task Types (from auxiliary tables)
  const activeTaskTypes = useMemo(() => {
    return (taskTypes || []).filter(tt => !tt.deleted);
  }, [taskTypes]);

  // Active Priorities (from auxiliary tables)
  const activePriorities = useMemo(() => {
    return (projectPriorities || []).filter(p => !p.deleted);
  }, [projectPriorities]);

  // Active Ticket Statuses (from auxiliary tables)
  const activeTicketStatuses = useMemo(() => {
    if (ticketStatuses && ticketStatuses.length > 0) {
      return ticketStatuses.filter(s => !s.deleted);
    }
    return [
      { id: 'tks-1', name: 'Validação Pendente', scale: 1 },
      { id: 'tks-2', name: 'Aberto', scale: 2 },
      { id: 'tks-3', name: 'Em Análise', scale: 3 },
      { id: 'tks-4', name: 'Convertido em Tarefa', scale: 4 },
      { id: 'tks-5', name: 'Resolvido', scale: 5 },
      { id: 'tks-6', name: 'Cancelado', scale: 6 },
    ];
  }, [ticketStatuses]);

  // Technicians with assigned tickets only (Requirement: "mostra só os técnicos com tickets atribuidos")
  const techniciansWithTickets = useMemo(() => {
    const assignedUserIds = new Set(
      activeTickets
        .map(t => t.assignedToId)
        .filter((id): id is string => Boolean(id))
    );
    return activeUsers.filter(u => assignedUserIds.has(u.id));
  }, [activeUsers, activeTickets]);

  // Autocomplete suggestions for Client (Create Modal)
  const autocompleteClients = useMemo(() => {
    const query = clientSearchQuery.trim().toLowerCase();
    if (!query) return activeClients.slice(0, 8);
    return activeClients.filter(c => 
      c.clientName.toLowerCase().includes(query) ||
      (c.shortName && c.shortName.toLowerCase().includes(query)) ||
      (c.location && c.location.toLowerCase().includes(query))
    ).slice(0, 10);
  }, [activeClients, clientSearchQuery]);

  // Autocomplete suggestions for Client (Edit Modal)
  const autocompleteEditClients = useMemo(() => {
    const query = editClientSearchQuery.trim().toLowerCase();
    if (!query) return activeClients.slice(0, 8);
    return activeClients.filter(c => 
      c.clientName.toLowerCase().includes(query) ||
      (c.shortName && c.shortName.toLowerCase().includes(query)) ||
      (c.location && c.location.toLowerCase().includes(query))
    ).slice(0, 10);
  }, [activeClients, editClientSearchQuery]);

  // Autocomplete suggestions for Client (Validation Modal)
  const autocompleteValClients = useMemo(() => {
    const query = valClientSearchQuery.trim().toLowerCase();
    if (!query) return activeClients.slice(0, 8);
    return activeClients.filter(c => 
      c.clientName.toLowerCase().includes(query) ||
      (c.shortName && c.shortName.toLowerCase().includes(query)) ||
      (c.location && c.location.toLowerCase().includes(query))
    ).slice(0, 10);
  }, [activeClients, valClientSearchQuery]);

  // Clients mapping
  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach(c => map.set(c.id, c));
    return map;
  }, [clients]);

  // Users mapping
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach(u => map.set(u.id, u));
    return map;
  }, [users]);

  // Task Types mapping
  const taskTypeMap = useMemo(() => {
    const map = new Map<string, TaskType>();
    (taskTypes || []).forEach(tt => map.set(tt.id, tt));
    return map;
  }, [taskTypes]);

  // Priorities mapping
  const priorityMap = useMemo(() => {
    const map = new Map<string, ProjectPriority>();
    (projectPriorities || []).forEach(p => map.set(p.id, p));
    return map;
  }, [projectPriorities]);

  // Status mapping
  const statusMap = useMemo(() => {
    const map = new Map<string, TicketStatus>();
    (ticketStatuses || []).forEach(s => map.set(s.id, s));
    return map;
  }, [ticketStatuses]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return activeTickets.filter(ticket => {
      // Sub-tab specific filters
      if (activeSubTab === 'validation' && ticket.status !== 'validacao' && ticket.status !== 'Validação Pendente') return false;
      if (activeSubTab === 'converted' && ticket.status !== 'convertido' && ticket.status !== 'Convertido em Tarefa') return false;

      // Status filter
      if (filterStatus !== 'all') {
        const ticketStatusName = statusMap.get(ticket.status)?.name || ticket.status;
        const targetStatusName = statusMap.get(filterStatus)?.name || filterStatus;
        if (ticket.status !== filterStatus && ticketStatusName.toLowerCase() !== targetStatusName.toLowerCase()) {
          return false;
        }
      }

      // Source filter
      if (filterSource !== 'all' && ticket.source !== filterSource) return false;

      // Priority filter
      if (filterPriority !== 'all') {
        const ticketPrioName = priorityMap.get(ticket.priority)?.name || ticket.priority;
        const targetPrioName = priorityMap.get(filterPriority)?.name || filterPriority;
        if (ticket.priority !== filterPriority && ticketPrioName.toLowerCase() !== targetPrioName.toLowerCase()) {
          return false;
        }
      }

      // Technician filter (only includes technicians with assigned tickets)
      if (filterTechnician !== 'all') {
        if (filterTechnician === 'unassigned') {
          if (ticket.assignedToId) return false;
        } else if (ticket.assignedToId !== filterTechnician) {
          return false;
        }
      }

      // Search text
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const clientName = ticket.clientId ? (clientMap.get(ticket.clientId)?.clientName || '') : '';
        const techName = ticket.assignedToId ? (userMap.get(ticket.assignedToId)?.name || '') : '';
        const typeName = ticket.taskTypeId ? (taskTypeMap.get(ticket.taskTypeId)?.name || '') : '';
        
        const matchTitle = (ticket.title || '').toLowerCase().includes(query);
        const matchNumber = (ticket.ticketNumber || '').toLowerCase().includes(query);
        const matchDesc = (ticket.description || '').toLowerCase().includes(query);
        const matchClient = clientName.toLowerCase().includes(query);
        const matchTech = techName.toLowerCase().includes(query);
        const matchType = typeName.toLowerCase().includes(query);
        const matchReq = (ticket.requesterName || '').toLowerCase().includes(query) || (ticket.requesterEmail || '').toLowerCase().includes(query);

        if (!matchTitle && !matchNumber && !matchDesc && !matchClient && !matchTech && !matchType && !matchReq) {
          return false;
        }
      }

      return true;
    });
  }, [activeTickets, activeSubTab, filterStatus, filterSource, filterPriority, filterTechnician, searchQuery, clientMap, userMap, taskTypeMap, priorityMap, statusMap]);

  // Metrics for Dashboard
  const metrics = useMemo(() => {
    const total = activeTickets.length;
    const inValidation = activeTickets.filter(t => t.status === 'validacao' || t.status === 'Validação Pendente' || t.status === 'tks-1').length;
    const openOrAnalysis = activeTickets.filter(t => t.status === 'aberto' || t.status === 'em_analise' || t.status === 'Aberto' || t.status === 'Em Análise' || t.status === 'tks-2' || t.status === 'tks-3').length;
    const converted = activeTickets.filter(t => t.status === 'convertido' || t.status === 'Convertido em Tarefa' || t.status === 'tks-4').length;
    const resolved = activeTickets.filter(t => t.status === 'resolvido' || t.status === 'Resolvido' || t.status === 'tks-5').length;

    // Conversion rate
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;
    const resolutionRate = total > 0 ? Math.round(((converted + resolved) / total) * 100) : 0;

    // By source
    const bySource = {
      email: activeTickets.filter(t => t.source === 'email').length,
      teams: activeTickets.filter(t => t.source === 'teams').length,
      manual: activeTickets.filter(t => t.source === 'manual').length,
      other: activeTickets.filter(t => t.source !== 'email' && t.source !== 'teams' && t.source !== 'manual').length,
    };

    // By priority (using activePriorities or standard fallback)
    const priorityCounts = activePriorities.map(p => ({
      priority: p,
      count: activeTickets.filter(t => t.priority === p.name || t.priority === p.id).length
    }));

    // By technician load
    const technicianLoad = techniciansWithTickets.map(tech => {
      const assignedCount = activeTickets.filter(t => t.assignedToId === tech.id && t.status !== 'resolvido' && t.status !== 'Resolvido' && t.status !== 'convertido' && t.status !== 'Convertido em Tarefa').length;
      const totalHandled = activeTickets.filter(t => t.assignedToId === tech.id).length;
      return {
        tech,
        activeCount: assignedCount,
        totalCount: totalHandled
      };
    }).sort((a, b) => b.activeCount - a.activeCount);

    return {
      total,
      inValidation,
      openOrAnalysis,
      converted,
      resolved,
      conversionRate,
      resolutionRate,
      bySource,
      priorityCounts,
      technicianLoad
    };
  }, [activeTickets, activePriorities, techniciansWithTickets]);

  // Helper: Resolve or Create Client via autocomplete text (identical to ProjectSection)
  const resolveOrCreateClient = (selectedId: string, searchQueryText: string): string | undefined => {
    let finalClientId = selectedId;
    const trimmedQuery = searchQueryText.trim();

    if (trimmedQuery) {
      const existing = (clients || []).find(c => 
        c && !c.deleted && (
          c.clientName.toLowerCase().trim() === trimmedQuery.toLowerCase() ||
          `${c.clientName} (${c.shortName})`.toLowerCase().trim() === trimmedQuery.toLowerCase() ||
          c.id === selectedId
        )
      );

      if (existing) {
        finalClientId = existing.id;
      } else if (!selectedId || !(clients || []).some(c => c && c.id === selectedId && !c.deleted)) {
        if (onAddClient) {
          const newClient = onAddClient({
            clientName: trimmedQuery,
            shortName: trimmedQuery,
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
      }
    }

    return finalClientId || undefined;
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setNewTitle('');
    setNewDescription('');
    setNewSource('manual');
    setNewPriority(''); // Sem pré-seleção
    setNewTaskTypeId(''); // Sem pré-seleção
    setNewClientId('');
    setClientSearchQuery('');
    setShowClientSuggestions(false);
    setNewRequesterName(currentUser?.name || '');
    setNewRequesterEmail(currentUser?.email || '');
    setNewRequesterPhone('');
    // Default assign to first active technician or current user if valid
    const defaultTech = activeUsers.find(u => u.id === currentUser?.id)?.id || activeUsers[0]?.id || '';
    setNewAssignedToId(defaultTech);
    setIsCreateModalOpen(true);
  };

  // Submit Create Manual Ticket
  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (!newPriority) {
      alert('Por favor selecione a Prioridade do ticket.');
      return;
    }
    if (!newTaskTypeId) {
      alert('Por favor selecione o Tipo de Tarefa do ticket.');
      return;
    }

    const finalClientId = resolveOrCreateClient(newClientId, clientSearchQuery);

    onAddTicket({
      title: newTitle.trim(),
      description: newDescription.trim(),
      source: newSource,
      sourceDetails: `Criado manualmente por ${currentUser?.name || 'Utilizador'}`,
      priority: newPriority,
      taskTypeId: newTaskTypeId,
      category: taskTypeMap.get(newTaskTypeId)?.name || 'Geral',
      clientId: finalClientId,
      requesterName: newRequesterName.trim() || undefined,
      requesterEmail: newRequesterEmail.trim() || undefined,
      requesterPhone: newRequesterPhone.trim() || undefined,
      assignedToId: newAssignedToId || undefined,
      createdById: currentUser?.id,
      status: newSource === 'email' || newSource === 'teams' ? 'validacao' : 'aberto'
    });

    setIsCreateModalOpen(false);
  };

  // Open Edit Modal
  const handleOpenEditModal = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setEditTitle(ticket.title || '');
    setEditDescription(ticket.description || '');
    setEditStatus(ticket.status || 'aberto');
    setEditPriority(ticket.priority || '');
    setEditTaskTypeId(ticket.taskTypeId || '');
    setEditClientId(ticket.clientId || '');
    const client = ticket.clientId ? clientMap.get(ticket.clientId) : null;
    setEditClientSearchQuery(client ? `${client.clientName} (${client.shortName})` : '');
    setShowEditClientSuggestions(false);
    setEditAssignedToId(ticket.assignedToId || '');
    setEditRequesterName(ticket.requesterName || '');
    setEditRequesterEmail(ticket.requesterEmail || '');
    setEditRequesterPhone(ticket.requesterPhone || '');
    setIsEditModalOpen(true);
  };

  // Submit Edit Ticket
  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !editTitle.trim()) return;
    if (!editPriority) {
      alert('Por favor selecione a Prioridade do ticket.');
      return;
    }
    if (!editTaskTypeId) {
      alert('Por favor selecione o Tipo de Tarefa do ticket.');
      return;
    }

    const finalClientId = resolveOrCreateClient(editClientId, editClientSearchQuery);

    onUpdateTicket(selectedTicket.id, {
      title: editTitle.trim(),
      description: editDescription.trim(),
      status: editStatus,
      priority: editPriority,
      taskTypeId: editTaskTypeId,
      category: taskTypeMap.get(editTaskTypeId)?.name || selectedTicket.category,
      clientId: finalClientId,
      assignedToId: editAssignedToId || undefined,
      requesterName: editRequesterName.trim() || undefined,
      requesterEmail: editRequesterEmail.trim() || undefined,
      requesterPhone: editRequesterPhone.trim() || undefined
    });

    setIsEditModalOpen(false);
    setSelectedTicket(null);
  };

  // Open Validation Modal
  const handleOpenValidationModal = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setValClientId(ticket.clientId || '');
    const client = ticket.clientId ? clientMap.get(ticket.clientId) : null;
    setValClientSearchQuery(client ? `${client.clientName} (${client.shortName})` : '');
    setShowValClientSuggestions(false);
    setValAssignedToId(ticket.assignedToId || activeUsers[0]?.id || '');
    setValPriority(ticket.priority || activePriorities[0]?.name || '');
    setValTaskTypeId(ticket.taskTypeId || activeTaskTypes[0]?.id || '');
    setValNotes(ticket.validationNotes || '');
    setIsValidationModalOpen(true);
  };

  // Submit Validation Approval
  const handleSubmitValidation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    const finalClientId = resolveOrCreateClient(valClientId, valClientSearchQuery);

    onValidateAndApprove(selectedTicket.id, {
      clientId: finalClientId,
      assignedToId: valAssignedToId || undefined,
      priority: valPriority,
      taskTypeId: valTaskTypeId || undefined,
      category: taskTypeMap.get(valTaskTypeId)?.name || selectedTicket.category,
      validationNotes: valNotes.trim() || undefined
    });

    setIsValidationModalOpen(false);
    setSelectedTicket(null);
  };

  // Open Convert to Task Modal
  const handleOpenConvertModal = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    const clientProjects = projects.filter(p => !p.deleted && (!ticket.clientId || p.clientId === ticket.clientId));
    setConvProjectId(clientProjects[0]?.id || projects[0]?.id || '');
    setConvTaskTitle(`[${ticket.ticketNumber}] ${ticket.title}`);
    
    const reqInfo = [
      ticket.requesterName ? `Solicitante: ${ticket.requesterName}` : null,
      ticket.requesterEmail ? `Email: ${ticket.requesterEmail}` : null,
      ticket.requesterPhone ? `Contacto: ${ticket.requesterPhone}` : null,
      ticket.source ? `Canal de Origem: ${ticket.source.toUpperCase()}` : null,
    ].filter(Boolean).join(' | ');

    setConvTaskDescription(
      `Convertido do Ticket: ${ticket.ticketNumber}\n\n${ticket.description || 'Sem descrição.'}`
    );

    setConvAssigneeIds(ticket.assignedToId ? [ticket.assignedToId] : []);
    
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 3);
    setConvEstimatedDate(nextDate.toISOString().split('T')[0]);
    setConvEstimatedHours('4');
    setConvTaskTypeId(ticket.taskTypeId || taskTypes[0]?.id || '');
    setConvStatusId(taskStatuses[0]?.id || '');
    setIsConvertModalOpen(true);
  };

  // Submit Convert to Task
  const handleSubmitConvert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !convProjectId) return;

    onConvertToTask(selectedTicket.id, {
      projectId: convProjectId,
      title: convTaskTitle.trim(),
      description: convTaskDescription.trim(),
      assigneeIds: convAssigneeIds,
      estimatedDate: convEstimatedDate || undefined,
      estimatedHours: convEstimatedHours || undefined,
      taskTypeId: convTaskTypeId || undefined,
      statusId: convStatusId || undefined
    });

    setIsConvertModalOpen(false);
    setSelectedTicket(null);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Open Resolve Modal
  const handleOpenResolveModal = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setResolveNotes(ticket.resolutionNotes || '');
    setResolveNewTechnicianId(ticket.assignedToId || '');
    setIsResolveModalOpen(true);
  };

  const handleReassignTechnician = () => {
    if (!selectedTicket) return;
    if (!resolveNewTechnicianId) {
      alert('Por favor selecione um técnico responsável para reatribuir.');
      return;
    }
    if (resolveNewTechnicianId === selectedTicket.assignedToId) {
      alert('O técnico selecionado já é o responsável por este ticket.');
      return;
    }
    const newTech = users.find(u => u.id === resolveNewTechnicianId);
    onUpdateTicket(selectedTicket.id, { assignedToId: resolveNewTechnicianId });
    alert(`Ticket ${selectedTicket.ticketNumber} reatribuído a ${newTech?.name || 'novo responsável'}. Notificação enviada.`);
    setIsResolveModalOpen(false);
    setSelectedTicket(null);
  };

  // Submit Direct Resolution
  const handleSubmitResolve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    onResolveDirectly(selectedTicket.id, resolveNotes.trim() || 'Resolvido diretamente sem necessidade de conversão em tarefa de obra.');
    setIsResolveModalOpen(false);
    setSelectedTicket(null);
  };

  // Open Detail Modal
  const handleOpenDetailModal = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setIsDetailModalOpen(true);
  };

  // Handle Simulation of Inbound Ticket (Teams / Email)
  const handleRunSimulation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simSubject.trim()) return;

    const defaultPrio = activePriorities[0]?.name || 'media';
    const defaultType = activeTaskTypes[0]?.id || '';

    onAddTicket({
      title: simSubject.trim(),
      description: simBody.trim(),
      source: simChannel,
      sourceDetails: simChannel === 'teams' ? `Microsoft Teams: ${simChannelName} (${simSender})` : `Email: ${simSender}`,
      priority: defaultPrio,
      taskTypeId: defaultType,
      category: taskTypeMap.get(defaultType)?.name || 'Suporte Técnico',
      requesterName: simSender.split('@')[0].replace('.', ' '),
      requesterEmail: simSender,
      createdById: currentUser?.id,
      status: 'validacao'
    });

    setSimSuccessMsg(`Ticket criado com sucesso através do canal ${simChannel === 'teams' ? 'Microsoft Teams' : 'Email'}! Entrou na Fase de Validação.`);
    setTimeout(() => {
      setSimSuccessMsg(null);
      setActiveSubTab('validation');
    }, 1200);
  };

  // Helper badge renderers
  const renderSourceBadge = (source: string) => {
    switch (source) {
      case 'teams':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <MessageSquare className="w-3 h-3 text-indigo-600" />
            MS Teams
          </span>
        );
      case 'email':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Mail className="w-3 h-3 text-sky-600" />
            Email
          </span>
        );
      case 'phone':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Phone className="w-3 h-3 text-amber-600" />
            Telefone
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <FileText className="w-3 h-3 text-slate-600" />
            Manual
          </span>
        );
    }
  };

  const renderStatusBadge = (status: string) => {
    const customStatus = activeTicketStatuses.find(s => s.id === status || s.name.toLowerCase() === status.toLowerCase());
    const label = customStatus ? customStatus.name : status;

    const lower = label.toLowerCase();
    if (lower.includes('valida') || status === 'validacao') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
          <AlertTriangle className="w-3 h-3 text-amber-700" />
          {label}
        </span>
      );
    }
    if (lower.includes('aberto') || status === 'aberto') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <Clock className="w-3 h-3 text-blue-600" />
          {label}
        </span>
      );
    }
    if (lower.includes('análise') || lower.includes('analise') || status === 'em_analise') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
          <Search className="w-3 h-3 text-purple-600" />
          {label}
        </span>
      );
    }
    if (lower.includes('convertido') || status === 'convertido') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-300">
          <CheckSquare className="w-3 h-3 text-emerald-600" />
          {label}
        </span>
      );
    }
    if (lower.includes('resolvido') || status === 'resolvido') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
          <CheckCircle2 className="w-3 h-3 text-teal-600" />
          {label}
        </span>
      );
    }
    if (lower.includes('cancelado') || status === 'cancelado') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <X className="w-3 h-3 text-rose-600" />
          {label}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
        {label}
      </span>
    );
  };

  const renderPriorityBadge = (priority: string) => {
    const priorityObj = activePriorities.find(p => p.name.toLowerCase() === priority.toLowerCase() || p.id === priority);
    const label = priorityObj ? priorityObj.name : priority;
    const lower = label.toLowerCase();

    if (lower.includes('urgente') || lower.includes('crític') || lower.includes('critica')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
          <AlertCircle className="w-3 h-3 text-red-600" />
          {label}
        </span>
      );
    }
    if (lower.includes('alta')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          {label}
        </span>
      );
    }
    if (lower.includes('média') || lower.includes('media')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
          {label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-6" id="ticket-section-container">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <TicketIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Sistema de Tickets & Pedidos de Suporte
                {metrics.inValidation > 0 && (
                  <span className="bg-amber-500 text-white text-xs px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                    {metrics.inValidation} Para Validação
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Registo simplificado de pedidos por Email, Teams ou Manual com encaminhamento para técnicos e conversão em tarefas de obra.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setActiveSubTab('simulator')}
            className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors flex items-center gap-1.5"
            title="Simular receção de ticket por Teams ou Email"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            Simulador Inbound (Teams/Email)
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo Ticket Manual
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('dashboard')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeSubTab === 'dashboard'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Dashboard & Indicadores
        </button>

        <button
          onClick={() => setActiveSubTab('all')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeSubTab === 'all'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Inbox className="w-4 h-4" />
          Todos os Tickets ({activeTickets.length})
        </button>

        <button
          onClick={() => setActiveSubTab('validation')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeSubTab === 'validation'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Fase de Validação ({metrics.inValidation})
        </button>

        <button
          onClick={() => setActiveSubTab('converted')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeSubTab === 'converted'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          Convertidos em Tarefa ({metrics.converted})
        </button>

        <button
          onClick={() => setActiveSubTab('simulator')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeSubTab === 'simulator'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-purple-700 bg-purple-50 hover:bg-purple-100'
          }`}
        >
          <Send className="w-4 h-4" />
          Testar Canais Externos
        </button>
      </div>

      {/* DASHBOARD TAB */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                <span>Total de Tickets</span>
                <TicketIcon className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-black text-slate-900">{metrics.total}</div>
              <div className="text-[11px] text-slate-400 mt-1">Registados na plataforma</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
              <div className="flex items-center justify-between text-amber-700 text-xs font-semibold mb-1">
                <span>Para Validação</span>
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-black text-amber-900">{metrics.inValidation}</div>
              <div className="text-[11px] text-amber-700 mt-1">Aguardam triagem & técnico</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
              <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold mb-1">
                <span>Convertidos em Tarefa</span>
                <CheckSquare className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-900">{metrics.converted}</div>
              <div className="text-[11px] text-emerald-700 mt-1">Taxa de conversão: {metrics.conversionRate}%</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-teal-200 bg-teal-50/20 shadow-xs">
              <div className="flex items-center justify-between text-teal-700 text-xs font-semibold mb-1">
                <span>Resolvidos Diretamente</span>
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
              </div>
              <div className="text-2xl font-black text-teal-900">{metrics.resolved}</div>
              <div className="text-[11px] text-teal-700 mt-1">Esclarecidos sem tarefa</div>
            </div>
          </div>

          {/* Breakdown Section: Sources & Technicians with assigned tickets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* By Source Channel */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-indigo-600" />
                Origem dos Tickets
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-indigo-50/50 border border-indigo-100">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span className="font-semibold text-slate-800">Microsoft Teams</span>
                  </div>
                  <span className="font-bold text-indigo-700">{metrics.bySource.teams}</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-sky-50/50 border border-sky-100">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-sky-600" />
                    <span className="font-semibold text-slate-800">Email Inbound</span>
                  </div>
                  <span className="font-bold text-sky-700">{metrics.bySource.email}</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-600" />
                    <span className="font-semibold text-slate-800">Formulário Manual</span>
                  </div>
                  <span className="font-bold text-slate-700">{metrics.bySource.manual}</span>
                </div>
              </div>
            </div>

            {/* Distribution by Priority */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Prioridades Registadas
              </h3>
              <div className="space-y-2.5 text-xs">
                {metrics.priorityCounts.map(({ priority, count }) => (
                  <div key={priority.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-700">{priority.name}</span>
                    <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">{count}</span>
                  </div>
                ))}
                {metrics.priorityCounts.length === 0 && (
                  <div className="text-center text-slate-400 py-4 italic">Nenhuma prioridade configurada.</div>
                )}
              </div>
            </div>

            {/* Technician Load (Showing only technicians with assigned tickets) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                Técnicos com Tickets Atribuídos ({metrics.technicianLoad.length})
              </h3>
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {metrics.technicianLoad.map(({ tech, activeCount, totalCount }) => (
                  <div key={tech.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">
                        {getInitials(tech.name)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">{tech.name}</div>
                        <div className="text-[10px] text-slate-400">{tech.email}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-indigo-600">{activeCount} pendentes</div>
                      <div className="text-[10px] text-slate-400">{totalCount} total</div>
                    </div>
                  </div>
                ))}

                {metrics.technicianLoad.length === 0 && (
                  <div className="text-center text-slate-400 py-6 text-xs italic">
                    Nenhum técnico com tickets atribuídos no momento.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick List: Urgent or Recent Tickets */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Tickets Recentes & Requerem Acompanhamento</h3>
              <button
                onClick={() => setActiveSubTab('all')}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Ver lista completa ({activeTickets.length}) &rarr;
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-bold border-y border-slate-200">
                  <tr>
                    <th className="py-3 px-3">Nº Ticket</th>
                    <th className="py-3 px-3">Título / Assunto</th>
                    <th className="py-3 px-3">Tipo de Tarefa</th>
                    <th className="py-3 px-3">Cliente / Solicitante</th>
                    <th className="py-3 px-3">Técnico Responsável</th>
                    <th className="py-3 px-3">Prioridade</th>
                    <th className="py-3 px-3">Estado</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeTickets.slice(0, 6).map(ticket => {
                    const client = ticket.clientId ? clientMap.get(ticket.clientId) : null;
                    const tech = ticket.assignedToId ? userMap.get(ticket.assignedToId) : null;
                    const taskType = ticket.taskTypeId ? taskTypeMap.get(ticket.taskTypeId) : null;

                    return (
                      <tr key={ticket.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-indigo-700">
                          {ticket.ticketNumber}
                        </td>
                        <td 
                          className="py-3 px-3 cursor-pointer group hover:bg-indigo-50/60 rounded-md transition-colors"
                          onClick={() => handleOpenResolveModal(ticket)}
                          title="Clique para gerir / resolver este ticket"
                        >
                          <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{ticket.title}</div>
                          {ticket.description && (
                            <div className="text-[11px] text-slate-400 group-hover:text-slate-600 line-clamp-1">{ticket.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-700">
                          {taskType ? taskType.name : ticket.category || '-'}
                        </td>
                        <td className="py-3 px-3">
                          {client ? (
                            <span className="font-medium text-slate-800">{client.clientName}</span>
                          ) : ticket.requesterName ? (
                            <span className="text-slate-600">{ticket.requesterName}</span>
                          ) : (
                            <span className="text-slate-400 italic">Não associado</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {tech ? (
                            <div className="flex items-center gap-1.5 font-medium text-slate-800">
                              <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[9px]">
                                {getInitials(tech.name)}
                              </div>
                              <span className="truncate max-w-[120px]">{tech.name}</span>
                            </div>
                          ) : (
                            <span className="text-amber-600 text-[11px] font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Não Atribuído
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {renderPriorityBadge(ticket.priority)}
                        </td>
                        <td className="py-3 px-3">
                          {renderStatusBadge(ticket.status)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {ticket.status === 'validacao' && (
                              <button
                                onClick={() => handleOpenValidationModal(ticket)}
                                className="px-2 py-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded transition-colors"
                                title="Validar e Atribuir Técnico"
                              >
                                Validar
                              </button>
                            )}

                            {ticket.status !== 'convertido' && ticket.status !== 'resolvido' && ticket.status !== 'validacao' && (
                              <button
                                onClick={() => handleOpenConvertModal(ticket)}
                                className="px-2 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded transition-colors"
                                title="Converter em tarefa"
                              >
                                &rarr; Tarefa
                              </button>
                            )}

                            <button
                              onClick={() => handleOpenEditModal(ticket)}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Editar Ticket"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleOpenDetailModal(ticket)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                              title="Ver Detalhes"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {activeTickets.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Nenhum ticket registado no sistema.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ALL TICKETS & VALIDATION & CONVERTED TABS */}
      {(activeSubTab === 'all' || activeSubTab === 'validation' || activeSubTab === 'converted') && (
        <div className="space-y-4">
          {/* Filter Bar (Without Client filter, with only assigned technicians) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row items-center gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar por nº ticket, título, descrição, tipo de tarefa, solicitante..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Quick Reset Filters */}
              {(filterSource !== 'all' || filterStatus !== 'all' || filterPriority !== 'all' || filterTechnician !== 'all' || searchQuery) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilterSource('all');
                    setFilterStatus('all');
                    setFilterPriority('all');
                    setFilterTechnician('all');
                  }}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                >
                  Limpar Filtros
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
              {/* Canal Source Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Canal de Origem</label>
                <select
                  value={filterSource}
                  onChange={e => setFilterSource(e.target.value)}
                  className="w-full p-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">Todos os Canais</option>
                  <option value="email">Email</option>
                  <option value="teams">Microsoft Teams</option>
                  <option value="manual">Manual</option>
                  <option value="phone">Telefone</option>
                </select>
              </div>

              {/* Status Filter (From Custom Auxiliary Ticket Statuses) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Estado do Ticket</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="w-full p-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">Todos os Estados</option>
                  {activeTicketStatuses.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Priority Filter (From Auxiliary Priorities) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Prioridade</label>
                <select
                  value={filterPriority}
                  onChange={e => setFilterPriority(e.target.value)}
                  className="w-full p-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">Todas as Prioridades</option>
                  {activePriorities.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Technician Filter (Requirement: ONLY show technicians with assigned tickets) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Técnico Responsável</label>
                <select
                  value={filterTechnician}
                  onChange={e => setFilterTechnician(e.target.value)}
                  className="w-full p-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">Todos os Técnicos com Tickets</option>
                  <option value="unassigned">Sem Técnico Atribuído</option>
                  {techniciansWithTickets.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Table of Tickets */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3 w-28">Nº Ticket</th>
                    <th className="py-3 px-3">Título & Descrição</th>
                    <th className="py-3 px-3">Tipo de Tarefa</th>
                    <th className="py-3 px-3">Cliente</th>
                    <th className="py-3 px-3">Técnico Responsável</th>
                    <th className="py-3 px-3">Prioridade</th>
                    <th className="py-3 px-3">Estado</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map(ticket => {
                    const client = ticket.clientId ? clientMap.get(ticket.clientId) : null;
                    const tech = ticket.assignedToId ? userMap.get(ticket.assignedToId) : null;
                    const taskType = ticket.taskTypeId ? taskTypeMap.get(ticket.taskTypeId) : null;

                    return (
                      <tr key={ticket.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-indigo-700">
                          {ticket.ticketNumber}
                        </td>
                        <td 
                          className="py-3 px-3 cursor-pointer group hover:bg-indigo-50/60 rounded-md transition-colors"
                          onClick={() => handleOpenResolveModal(ticket)}
                          title="Clique para gerir / resolver este ticket"
                        >
                          <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{ticket.title}</div>
                          {ticket.description && (
                            <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 group-hover:text-slate-600">{ticket.description}</div>
                          )}
                          {ticket.requesterName && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Solicitante: <span className="font-semibold text-slate-600">{ticket.requesterName}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            <Briefcase className="w-3 h-3 text-slate-500" />
                            {taskType ? taskType.name : ticket.category || 'Geral'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {client ? (
                            <div>
                              <div className="font-semibold text-slate-800">{client.clientName}</div>
                              {client.shortName && <div className="text-[10px] text-slate-400">{client.shortName}</div>}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Cliente Avulso</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {tech ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[9px]">
                                {getInitials(tech.name)}
                              </div>
                              <span className="font-medium text-slate-800 truncate max-w-[120px]">{tech.name}</span>
                            </div>
                          ) : (
                            <span className="text-amber-600 text-[11px] font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Não Atribuído
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {renderPriorityBadge(ticket.priority)}
                        </td>
                        <td className="py-3 px-3">
                          {renderStatusBadge(ticket.status)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Validação Action Button */}
                            {(ticket.status === 'validacao' || ticket.status === 'Validação Pendente') && (
                              <button
                                onClick={() => handleOpenValidationModal(ticket)}
                                className="px-2.5 py-1 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors flex items-center gap-1"
                                title="Validar Ticket & Atribuir Técnico"
                              >
                                <ShieldCheck className="w-3 h-3" />
                                Validar
                              </button>
                            )}

                            {/* Convert to Task Button */}
                            {ticket.status !== 'convertido' && ticket.status !== 'resolvido' && ticket.status !== 'validacao' && (
                              <button
                                onClick={() => handleOpenConvertModal(ticket)}
                                className="px-2.5 py-1 text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors flex items-center gap-1"
                                title="Converter em Tarefa de Obra"
                              >
                                <CheckSquare className="w-3 h-3" />
                                Tarefa
                              </button>
                            )}

                            {/* Resolve Directly Button */}
                            {ticket.status !== 'resolvido' && ticket.status !== 'convertido' && (
                              <button
                                onClick={() => handleOpenResolveModal(ticket)}
                                className="p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                                title="Resolver Diretamente"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}

                            {/* Edit Button */}
                            <button
                              onClick={() => handleOpenEditModal(ticket)}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Editar Ticket"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            {/* View Detail Button */}
                            <button
                              onClick={() => handleOpenDetailModal(ticket)}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                              title="Ver Detalhes"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => {
                                if (window.confirm(`Tem a certeza que deseja eliminar o ticket ${ticket.ticketNumber}?`)) {
                                  onDeleteTicket(ticket.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              title="Eliminar Ticket"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredTickets.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        Nenhum ticket encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SIMULATOR TAB (External channel intake) */}
      {activeSubTab === 'simulator' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs max-w-2xl mx-auto space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Simulador de Ingestão Externa (Teams / Email)</h2>
              <p className="text-xs text-slate-500">
                Teste o fluxo de criação automática de tickets a partir de canais externos. Os tickets entram imediatamente na <strong>Fase de Validação</strong>.
              </p>
            </div>
          </div>

          {simSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {simSuccessMsg}
            </div>
          )}

          <form onSubmit={handleRunSimulation} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Canal de Origem</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSimChannel('teams')}
                  className={`p-3 rounded-xl border flex items-center gap-2 font-semibold transition-all ${
                    simChannel === 'teams'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  Microsoft Teams
                </button>

                <button
                  type="button"
                  onClick={() => setSimChannel('email')}
                  className={`p-3 rounded-xl border flex items-center gap-2 font-semibold transition-all ${
                    simChannel === 'email'
                      ? 'border-sky-600 bg-sky-50/50 text-sky-900 ring-2 ring-sky-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Mail className="w-4 h-4 text-sky-600" />
                  Email de Suporte
                </button>
              </div>
            </div>

            {simChannel === 'teams' ? (
              <div>
                <label className="block font-bold text-slate-700 mb-1">Canal Teams / Equipa</label>
                <input
                  type="text"
                  value={simChannelName}
                  onChange={e => setSimChannelName(e.target.value)}
                  placeholder="#suporte-obras ou #geral"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-800 font-semibold"
                />
              </div>
            ) : null}

            <div>
              <label className="block font-bold text-slate-700 mb-1">Remetente / Solicitante</label>
              <input
                type="text"
                required
                value={simSender}
                onChange={e => setSimSender(e.target.value)}
                placeholder="nome@cliente.pt"
                className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-800 font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Assunto do Pedido</label>
              <input
                type="text"
                required
                value={simSubject}
                onChange={e => setSimSubject(e.target.value)}
                placeholder="Ex: Alarme no inversor ou pedido de assistência"
                className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-800 font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Conteúdo da Mensagem</label>
              <textarea
                rows={3}
                required
                value={simBody}
                onChange={e => setSimBody(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-800"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Simular Receção de Mensagem Externa
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 1. Modal: Criar Novo Ticket Manual */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TicketIcon className="w-5 h-5 text-indigo-600" />
                Criar Novo Ticket de Suporte
              </h3>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCreate} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Título / Assunto do Pedido *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Ex: Substituição de disjuntor diferencial no piso 2"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Canal de Entrada</label>
                  <select
                    value={newSource}
                    onChange={e => setNewSource(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="manual">Manual / Presencial</option>
                    <option value="phone">Telefone</option>
                    <option value="email">Email</option>
                    <option value="teams">Microsoft Teams</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Técnico Responsável (Atribuição) *</label>
                  <select
                    required
                    value={newAssignedToId}
                    onChange={e => setNewAssignedToId(e.target.value)}
                    className="w-full p-2 border border-indigo-300 rounded-lg bg-indigo-50/50 font-semibold text-indigo-900"
                  >
                    <option value="">-- Atribuir Técnico --</option>
                    {activeUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-indigo-600 mt-0.5">O técnico receberá notificação imediata.</p>
                </div>
              </div>

              {/* Client Autocomplete Selection (Permits typing new clients) */}
              <div className="space-y-1 relative" id="ticket-client-autocomplete-container">
                <label className="block font-bold text-slate-700">Cliente (Seleção ou Novo Cliente)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={clientSearchQuery}
                    onChange={e => {
                      setClientSearchQuery(e.target.value);
                      setShowClientSuggestions(true);
                    }}
                    onFocus={() => setShowClientSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowClientSuggestions(false), 250)}
                    placeholder="Pesquisar cliente existente ou digitar nome para criar novo..."
                    className="w-full p-2.5 pr-8 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none bg-white font-semibold text-slate-800"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>

                {showClientSuggestions && (
                  <div className="absolute z-50 left-0 right-0 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg mt-1 p-1">
                    {autocompleteClients.length > 0 ? (
                      autocompleteClients.map(c => {
                        const isSelected = newClientId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => {
                              setNewClientId(c.id);
                              setClientSearchQuery(`${c.clientName} (${c.shortName})`);
                              setShowClientSuggestions(false);
                            }}
                            className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 cursor-pointer ${
                              isSelected 
                                ? 'bg-indigo-50 text-indigo-800 font-bold' 
                                : 'hover:bg-slate-50 text-slate-700 font-semibold'
                            }`}
                          >
                            <span className="truncate">{c.clientName}</span>
                            <span className="text-[10px] text-slate-400 font-normal">{c.shortName} • {c.location || 'Sem localização'}</span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-slate-500 italic text-[11px] font-medium">
                        &quot;{clientSearchQuery}&quot; será criado como novo cliente ao gravar
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Priority & Task Type (Both mandatory, from auxiliary fields) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prioridade (Campos Auxiliares) *</label>
                  <select
                    required
                    value={newPriority}
                    onChange={e => setNewPriority(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Selecione uma Prioridade * --</option>
                    {activePriorities.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Tarefa (Campos Auxiliares) *</label>
                  <select
                    required
                    value={newTaskTypeId}
                    onChange={e => setNewTaskTypeId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Selecione o Tipo de Tarefa * --</option>
                    {activeTaskTypes.map(tt => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Solicitante</label>
                  <input
                    type="text"
                    value={newRequesterName}
                    onChange={e => setNewRequesterName(e.target.value)}
                    placeholder="Nome"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newRequesterEmail}
                    onChange={e => setNewRequesterEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telefone</label>
                  <input
                    type="tel"
                    value={newRequesterPhone}
                    onChange={e => setNewRequesterPhone(e.target.value)}
                    placeholder="Contacto"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Descrição Detalhada do Pedido</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Detalhes sobre a intervenção solicitada..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  Gravar & Notificar Técnico
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Editar Ticket */}
      {isEditModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                Editar Ticket: {selectedTicket.ticketNumber}
              </h3>
              <button 
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedTicket(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitEdit} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Título / Assunto *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Client Autocomplete in Edit */}
              <div className="space-y-1 relative">
                <label className="block font-bold text-slate-700">Cliente (Seleção ou Novo Cliente)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={editClientSearchQuery}
                    onChange={e => {
                      setEditClientSearchQuery(e.target.value);
                      setShowEditClientSuggestions(true);
                    }}
                    onFocus={() => setShowEditClientSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowEditClientSuggestions(false), 250)}
                    placeholder="Pesquisar cliente existente ou digitar nome para criar novo..."
                    className="w-full p-2.5 pr-8 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none bg-white font-semibold text-slate-800"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>

                {showEditClientSuggestions && (
                  <div className="absolute z-50 left-0 right-0 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg mt-1 p-1">
                    {autocompleteEditClients.length > 0 ? (
                      autocompleteEditClients.map(c => {
                        const isSelected = editClientId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => {
                              setEditClientId(c.id);
                              setEditClientSearchQuery(`${c.clientName} (${c.shortName})`);
                              setShowEditClientSuggestions(false);
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
                      <div className="p-3 text-center text-slate-500 italic text-[11px] font-medium">
                        &quot;{editClientSearchQuery}&quot; será criado como novo cliente ao gravar
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Estado do Ticket</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white font-semibold"
                  >
                    {activeTicketStatuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Técnico Responsável</label>
                  <select
                    value={editAssignedToId}
                    onChange={e => setEditAssignedToId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white font-semibold"
                  >
                    <option value="">-- Não Atribuído --</option>
                    {activeUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Priority & Task Type (Mandatory from Aux) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prioridade (Campos Auxiliares) *</label>
                  <select
                    required
                    value={editPriority}
                    onChange={e => setEditPriority(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white font-semibold"
                  >
                    <option value="">-- Selecione uma Prioridade * --</option>
                    {activePriorities.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Tarefa (Campos Auxiliares) *</label>
                  <select
                    required
                    value={editTaskTypeId}
                    onChange={e => setEditTaskTypeId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white font-semibold"
                  >
                    <option value="">-- Selecione o Tipo de Tarefa * --</option>
                    {activeTaskTypes.map(tt => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Solicitante</label>
                  <input
                    type="text"
                    value={editRequesterName}
                    onChange={e => setEditRequesterName(e.target.value)}
                    placeholder="Nome"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editRequesterEmail}
                    onChange={e => setEditRequesterEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telefone</label>
                  <input
                    type="tel"
                    value={editRequesterPhone}
                    onChange={e => setEditRequesterPhone(e.target.value)}
                    placeholder="Contacto"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedTicket(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                >
                  Guardar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Validar Ticket de Canal Externo */}
      {isValidationModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-amber-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
                Validação & Triagem: {selectedTicket.ticketNumber}
              </h3>
              <button 
                onClick={() => {
                  setIsValidationModalOpen(false);
                  setSelectedTicket(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ticket Snapshot info */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 my-4 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">{selectedTicket.title}</span>
                {renderSourceBadge(selectedTicket.source)}
              </div>
              <p className="text-slate-600 text-[11px] whitespace-pre-wrap">{selectedTicket.description || 'Sem descrição.'}</p>
              {selectedTicket.sourceDetails && (
                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200">
                  {selectedTicket.sourceDetails}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmitValidation} className="space-y-4 text-xs">
              {/* Client Autocomplete in Validation */}
              <div className="space-y-1 relative">
                <label className="block font-bold text-slate-700">Associar a Cliente (Seleção ou Novo Cliente)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={valClientSearchQuery}
                    onChange={e => {
                      setValClientSearchQuery(e.target.value);
                      setShowValClientSuggestions(true);
                    }}
                    onFocus={() => setShowValClientSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowValClientSuggestions(false), 250)}
                    placeholder="Pesquisar cliente existente ou digitar nome para criar novo..."
                    className="w-full p-2.5 pr-8 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-200 outline-none bg-white font-semibold text-slate-800"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>

                {showValClientSuggestions && (
                  <div className="absolute z-50 left-0 right-0 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg mt-1 p-1">
                    {autocompleteValClients.length > 0 ? (
                      autocompleteValClients.map(c => {
                        const isSelected = valClientId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => {
                              setValClientId(c.id);
                              setValClientSearchQuery(`${c.clientName} (${c.shortName})`);
                              setShowValClientSuggestions(false);
                            }}
                            className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 cursor-pointer ${
                              isSelected 
                                ? 'bg-amber-50 text-amber-800 font-bold' 
                                : 'hover:bg-slate-50 text-slate-700 font-semibold'
                            }`}
                          >
                            <span className="truncate">{c.clientName}</span>
                            <span className="text-[10px] text-slate-400 font-normal">{c.shortName} • {c.location || 'Sem localização'}</span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-slate-500 italic text-[11px] font-medium">
                        &quot;{valClientSearchQuery}&quot; será criado como novo cliente ao validar
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Atribuir Técnico Responsável *</label>
                <select
                  required
                  value={valAssignedToId}
                  onChange={e => setValAssignedToId(e.target.value)}
                  className="w-full p-2.5 border border-amber-300 rounded-lg bg-amber-50/50 font-semibold text-amber-950"
                >
                  <option value="">-- Selecionar Técnico --</option>
                  {activeUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-amber-700 mt-1">O técnico receberá uma notificação direta.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prioridade *</label>
                  <select
                    required
                    value={valPriority}
                    onChange={e => setValPriority(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  >
                    {activePriorities.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Tarefa *</label>
                  <select
                    required
                    value={valTaskTypeId}
                    onChange={e => setValTaskTypeId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  >
                    {activeTaskTypes.map(tt => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notas de Triagem / Validação</label>
                <textarea
                  rows={2}
                  value={valNotes}
                  onChange={e => setValNotes(e.target.value)}
                  placeholder="Ex: Verificado contrato de manutenção, alocação autorizada..."
                  className="w-full p-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsValidationModalOpen(false);
                    setSelectedTicket(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs"
                >
                  Aprovar, Atribuir & Notificar Técnico
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal: Transformar em Tarefa (Converter Ticket) */}
      {isConvertModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-emerald-900 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-emerald-600" />
                Converter Ticket {selectedTicket.ticketNumber} em Tarefa
              </h3>
              <button 
                onClick={() => {
                  setIsConvertModalOpen(false);
                  setSelectedTicket(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitConvert} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">Projeto de Destino *</label>
                <select
                  required
                  value={convProjectId}
                  onChange={e => setConvProjectId(e.target.value)}
                  className="w-full p-2.5 border border-emerald-300 rounded-lg bg-emerald-50/40 font-semibold text-emerald-900 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Selecionar Projeto --</option>
                  {projects.filter(p => !p.deleted).map(p => {
                    const client = p.clientId ? clientMap.get(p.clientId) : null;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.title} {client ? `(${client.clientName})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Título da Tarefa *</label>
                <input
                  type="text"
                  required
                  value={convTaskTitle}
                  onChange={e => setConvTaskTitle(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tipo de Tarefa</label>
                  <select
                    value={convTaskTypeId}
                    onChange={e => setConvTaskTypeId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">-- Selecionar Tipo --</option>
                    {activeTaskTypes.map(tt => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Estado Inicial</label>
                  <select
                    value={convStatusId}
                    onChange={e => setConvStatusId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  >
                    {taskStatuses.filter(s => !s.deleted).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Técnicos Alocados à Tarefa</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-slate-50">
                  {activeUsers.map(u => {
                    const isChecked = convAssigneeIds.includes(u.id);
                    return (
                      <label key={u.id} className="flex items-center gap-2 p-1 text-slate-800 cursor-pointer hover:bg-white rounded">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setConvAssigneeIds(prev => [...prev, u.id]);
                            } else {
                              setConvAssigneeIds(prev => prev.filter(id => id !== u.id));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="truncate">{u.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data Prevista</label>
                  <input
                    type="date"
                    value={convEstimatedDate}
                    onChange={e => setConvEstimatedDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Horas Estimadas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={convEstimatedHours}
                    onChange={e => setConvEstimatedHours(e.target.value)}
                    placeholder="4"
                    className="w-full p-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Descrição / Instruções da Tarefa</label>
                <textarea
                  rows={4}
                  value={convTaskDescription}
                  onChange={e => setConvTaskDescription(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConvertModalOpen(false);
                    setSelectedTicket(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
                >
                  Criar Tarefa & Atualizar Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: Gestão / Resolução / Reatribuição de Ticket */}
      {isResolveModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                Gerir Ticket {selectedTicket.ticketNumber}
              </h3>
              <button 
                onClick={() => {
                  setIsResolveModalOpen(false);
                  setSelectedTicket(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Ticket Info Card */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <div className="font-bold text-slate-900">{selectedTicket.title}</div>
                <div className="text-slate-500 line-clamp-2">{selectedTicket.description || 'Sem descrição'}</div>
              </div>

              {/* Reassign Technician Section */}
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-2">
                <label className="block font-bold text-indigo-900">Reatribuir Técnico Responsável</label>
                <div className="flex gap-2">
                  <select
                    value={resolveNewTechnicianId}
                    onChange={e => setResolveNewTechnicianId(e.target.value)}
                    className="flex-1 p-2 bg-white border border-indigo-200 rounded-lg text-slate-800"
                  >
                    <option value="">-- Selecionar Técnico --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.type || 'Técnico'})</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleReassignTechnician}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors shadow-xs"
                  >
                    Reatribuir
                  </button>
                </div>
                <p className="text-[10px] text-indigo-700">A reatribuição despoleta automaticamente a notificação para o novo responsável.</p>
              </div>

              {/* Convert to Task Section */}
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-emerald-900">Converter em Tarefa de Obra</div>
                  <div className="text-[10px] text-emerald-700">Transfere o ticket para o cronograma de obra.</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const ticketToConv = selectedTicket;
                    setIsResolveModalOpen(false);
                    handleOpenConvertModal(ticketToConv);
                  }}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <CheckSquare className="w-3.5 h-3.5" /> Converter
                </button>
              </div>

              {/* Direct Resolution Section */}
              <form onSubmit={handleSubmitResolve} className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block font-bold text-slate-700">Resolver Sem Tarefa (Notas de Resolução) *</label>
                <textarea
                  rows={3}
                  required
                  value={resolveNotes}
                  onChange={e => setResolveNotes(e.target.value)}
                  placeholder="Ex: Esclarecido por telefone com o cliente. Dúvida sanada."
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-slate-800"
                />
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResolveModalOpen(false);
                      setSelectedTicket(null);
                    }}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-xs"
                  >
                    Marcar como Resolvido
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal: Ver Detalhes Completos do Ticket */}
      {isDetailModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-md">
                  {selectedTicket.ticketNumber}
                </span>
                <h3 className="text-base font-bold text-slate-900 line-clamp-1">{selectedTicket.title}</h3>
              </div>
              <button 
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedTicket(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {renderStatusBadge(selectedTicket.status)}
              {renderSourceBadge(selectedTicket.source)}
              {renderPriorityBadge(selectedTicket.priority)}
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-700 block mb-1">Descrição:</span>
                <p className="text-slate-600 whitespace-pre-wrap">{selectedTicket.description || 'Sem descrição.'}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase">Cliente</span>
                  <span className="font-semibold text-slate-800">
                    {selectedTicket.clientId ? clientMap.get(selectedTicket.clientId)?.clientName || 'Cliente' : 'Não Associado'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase">Técnico Atribuído</span>
                  <span className="font-semibold text-slate-800">
                    {selectedTicket.assignedToId ? userMap.get(selectedTicket.assignedToId)?.name || 'Técnico' : 'Não Atribuído'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase">Tipo de Tarefa</span>
                  <span className="font-semibold text-slate-800">
                    {selectedTicket.taskTypeId ? taskTypeMap.get(selectedTicket.taskTypeId)?.name || 'Tipo' : selectedTicket.category || 'Geral'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase">Prioridade</span>
                  <span className="font-semibold text-slate-800">
                    {selectedTicket.priority}
                  </span>
                </div>
              </div>

              {(selectedTicket.requesterName || selectedTicket.requesterEmail || selectedTicket.requesterPhone) && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase mb-1">Dados do Solicitante</span>
                  <div className="text-slate-700">
                    {selectedTicket.requesterName && <div>Nome: <strong>{selectedTicket.requesterName}</strong></div>}
                    {selectedTicket.requesterEmail && <div>Email: <strong>{selectedTicket.requesterEmail}</strong></div>}
                    {selectedTicket.requesterPhone && <div>Telefone: <strong>{selectedTicket.requesterPhone}</strong></div>}
                  </div>
                </div>
              )}

              {selectedTicket.convertedTaskId && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
                  <span className="font-bold block mb-1 flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                    Tarefa Gerada no Projeto
                  </span>
                  <p className="text-[11px] text-emerald-700">
                    Este ticket foi convertido com sucesso numa tarefa.
                  </p>
                  {selectedTicket.convertedProjectId && onNavigateToProject && (
                    <button
                      onClick={() => {
                        onNavigateToProject(selectedTicket.convertedProjectId!);
                        setIsDetailModalOpen(false);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 underline"
                    >
                      Ir para o Projeto &rarr;
                    </button>
                  )}
                </div>
              )}

              {selectedTicket.resolutionNotes && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-teal-900">
                  <span className="font-bold block mb-1">Notas de Resolução:</span>
                  <p className="text-[11px] text-teal-800 whitespace-pre-wrap">{selectedTicket.resolutionNotes}</p>
                </div>
              )}

              {selectedTicket.validationNotes && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                  <span className="font-bold block mb-1">Notas da Triagem:</span>
                  <p className="text-[11px] text-amber-800 whitespace-pre-wrap">{selectedTicket.validationNotes}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                Criado em: {selectedTicket.createdDate ? new Date(selectedTicket.createdDate).toLocaleString('pt-PT') : '-'}
              </span>

              <button
                type="button"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedTicket(null);
                }}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
