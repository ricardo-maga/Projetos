'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ERPState, Project, Task, Comment, UserAbsence, User, Client, Material, Quote, BillOfMaterial, Equipment } from '../lib/types';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, mapStateToUUIDs } from '../lib/supabaseSync';
import { getDefaultTaskStatusId, matchTaskStatusId } from '../lib/utils';

const STORAGE_KEY = 'gestao_projetos_erp_state_v1';

const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('erp_session');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.token) {
          headers['Authorization'] = `Bearer ${parsed.token}`;
        }
      }
    } catch (e) {}
  }
  return headers;
};

// Clean baseline with zero mock entities (no mock clients, projects, tasks or materials)
const getEmptyState = (): ERPState => ({
  ...CLEAN_BASELINE_STATE
});

export function useERP() {
  // Start with null so that only authoritative data from the database is rendered
  const [state, setState] = useState<ERPState | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isDbConfigured, setIsDbConfigured] = useState<boolean>(false);

  // Authoritative fetch directly from database (bypasses any local stale cache)
  const refreshFromDatabase = useCallback(async (): Promise<boolean> => {
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const headers = getAuthHeaders();
      const syncRes = await fetch('/api/supabase/sync', { headers });
      if (syncRes.ok) {
        const syncResult = await syncRes.json();
        if (syncResult.success) {
          if (syncResult.data) {
            const mapped = mapStateToUUIDs(syncResult.data);
            setState(mapped);
            setSyncStatus('synced');
            setSyncError(null);
            console.log('Authoritative data loaded from Supabase SQL database');
            return true;
          } else {
            // Database is connected but empty/unseeded. Initialize with clean baseline
            const freshState = mapStateToUUIDs(CLEAN_BASELINE_STATE);
            setState(freshState);
            const initRes = await fetch('/api/supabase/sync', {
              method: 'POST',
              headers,
              body: JSON.stringify(freshState),
            });
            const initJson = await initRes.json().catch(() => ({}));
            if (initRes.ok && initJson.success) {
              setSyncStatus('synced');
              setSyncError(null);
              return true;
            } else {
              setSyncStatus('error');
              setSyncError(initJson.message || 'Erro ao inicializar tabelas na base de dados.');
              return false;
            }
          }
        } else {
          setSyncStatus('error');
          setSyncError(syncResult.message || 'Erro retornado pela base de dados.');
          return false;
        }
      } else {
        const errJson = await syncRes.json().catch(() => ({}));
        const msg = errJson.message || `Erro do servidor ao contactar a base de dados (Status: ${syncRes.status}).`;
        setSyncStatus('error');
        setSyncError(msg);
        return false;
      }
    } catch (err: any) {
      const msg = err?.message || 'Erro de rede ao contactar a base de dados.';
      setSyncStatus('error');
      setSyncError(msg);
      return false;
    }
  }, []);

  // Load state strictly from database on mount
  useEffect(() => {
    // Purge any legacy localStorage state cache to prevent using stale or mock data
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('gestao_projetos_erp_state');
        localStorage.removeItem('gestao_projetos_erp_state_v0');
      } catch (e) {}
    }

    const loadState = async () => {
      let configured = isSupabaseConfigured;

      try {
        const configRes = await fetch('/api/supabase/config');
        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData && typeof configData.isConfigured === 'boolean') {
            configured = configData.isConfigured;
          }
        }
      } catch (configErr) {
        console.warn('Could not check Supabase config from server:', configErr);
      }

      setIsDbConfigured(configured);

      if (!configured) {
        setSyncStatus('error');
        setSyncError('A base de dados não está configurada no servidor. Por razões de integridade, a aplicação não permite operar com dados não gravados na base de dados.');
        // Provide empty baseline with zero records so app layout can render without crashing
        setState(mapStateToUUIDs(CLEAN_BASELINE_STATE));
        return;
      }

      await refreshFromDatabase();
    };

    loadState();
  }, [refreshFromDatabase]);

  // Robust, fail-safe database write with automatic state rollback on any failure
  const saveState = async (updater: ERPState | ((prev: ERPState) => ERPState)): Promise<{ success: boolean; message?: string }> => {
    if (!state) {
      return { success: false, message: 'Estado da aplicação não inicializado.' };
    }

    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada. Não é permitido criar ou alterar dados fora da base de dados.';
      setSyncStatus('error');
      setSyncError(msg);
      return { success: false, message: msg };
    }

    const prevState = state;
    const computed = typeof updater === 'function' ? updater(prevState) : updater;
    const nextState = mapStateToUUIDs(computed);

    // Apply optimistic update for responsive UI
    setState(nextState);
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/supabase/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify(nextState),
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success) {
        setSyncStatus('synced');
        setSyncError(null);
        return { success: true };
      } else {
        // ROLLBACK! The write was not accepted by the database
        console.error('Falha na gravação na base de dados. A reverter estado local:', result?.message);
        setState(prevState);
        const errMsg = result?.message || `A base de dados rejeitou a gravação (${res.status}). A alteração foi revertida para garantir que apenas dados válidos da base de dados são mantidos.`;
        setSyncStatus('error');
        setSyncError(errMsg);
        return { success: false, message: errMsg };
      }
    } catch (netErr: any) {
      // ROLLBACK on network or server error
      console.error('Exceção de rede durante a gravação na base de dados. A reverter estado local:', netErr);
      setState(prevState);
      const errMsg = netErr?.message || 'Falha de comunicação com a base de dados. A alteração foi revertida para proteção de integridade.';
      setSyncStatus('error');
      setSyncError(errMsg);
      return { success: false, message: errMsg };
    }
  };

  // Reset to clean default baseline (no mock data)
  const resetToDefault = () => {
    if (confirm('Aviso: Esta ação irá repor as tabelas de configuração limpas e remover todos os projetos, tarefas e materiais diretamente na base de dados. Deseja continuar?')) {
      saveState(CLEAN_BASELINE_STATE);
    }
  };

  // Clear all data (reset to empty state directly in database)
  const clearAllData = () => {
    if (confirm('Tem a certeza que deseja limpar todos os projetos, tarefas, clientes e materiais da base de dados? Esta ação é definitiva na base de dados.')) {
      saveState(prev => ({
        ...CLEAN_BASELINE_STATE,
        appConfig: prev.appConfig,
        users: prev.users,
      }));
    }
  };

  // Import entire state from JSON string
  const importState = (jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr) as ERPState;
      if (parsed && parsed.projects && parsed.tasks && parsed.users) {
        saveState(parsed);
        return true;
      }
    } catch (e) {
      console.error('Import failed', e);
    }
    return false;
  };

  const sortedState: ERPState = useMemo(() => {
    if (!state) return CLEAN_BASELINE_STATE;
    
    const sortByOrder = (a: any, b: any) => {
      if (a.sort_order !== undefined && b.sort_order !== undefined) {
        return a.sort_order - b.sort_order;
      }
      if (a.scale !== undefined && b.scale !== undefined) {
        return a.scale - b.scale;
      }
      return 0;
    };

    return {
      ...state,
      projectCategories: [...(state.projectCategories || [])].sort(sortByOrder),
      projectStatuses: [...(state.projectStatuses || [])].sort(sortByOrder),
      projectRisks: [...(state.projectRisks || [])].sort(sortByOrder),
      projectPriorities: [...(state.projectPriorities || [])].sort(sortByOrder),
      projectTeams: [...(state.projectTeams || [])].sort(sortByOrder),
      projectPartners: [...(state.projectPartners || [])].sort(sortByOrder),
      userGroups: [...(state.userGroups || [])].sort(sortByOrder),
      taskStatuses: [...(state.taskStatuses || [])].sort(sortByOrder),
      taskTypes: [...(state.taskTypes || [])].sort(sortByOrder),
      riskCategories: [...(state.riskCategories || [])].sort(sortByOrder),
      riskStatuses: [...(state.riskStatuses || [])].sort(sortByOrder),
      riskPriorities: [...(state.riskPriorities || [])].sort(sortByOrder),
    };
  }, [state]);

  if (!state) {
    return {
      loading: true,
      state: CLEAN_BASELINE_STATE,
      resetToDefault: () => {},
      clearAllData: () => {},
      importState: () => false,
      refreshFromDatabase,
      saveState,
      syncStatus,
      syncError,
      isDbConfigured,
      // Empty handlers for safety before load
      addProject: () => {}, updateProject: () => {}, deleteProject: () => {},
      addTask: () => {}, updateTask: () => {}, deleteTask: () => {},
      addComment: () => {}, deleteComment: () => {},
      addAbsence: () => {}, deleteAbsence: () => {},
      addUser: () => {}, updateUser: () => {}, deleteUser: () => {},
      addClient: () => {}, updateClient: () => {}, deleteClient: () => {},
      addMaterial: () => {}, updateMaterial: () => {}, deleteMaterial: () => {},
      addProjectMaterial: () => {}, updateProjectMaterial: () => {}, deleteProjectMaterial: () => {},
      addQuote: () => {}, updateQuote: () => {}, deleteQuote: () => {},
      addBOMItem: () => {}, updateBOMItem: () => {}, deleteBOMItem: () => {},
      addEquipment: () => {}, updateEquipment: () => {}, deleteEquipment: () => {},
      updateConfig: () => {},
      addAuxRecord: () => {}, updateAuxRecord: () => {}, deleteAuxRecord: () => {}, reorderAuxRecords: () => {},
      addSpecialDay: () => {}, deleteSpecialDay: () => {},
      addDefaultTask: () => {}, updateDefaultTask: () => {}, deleteDefaultTask: () => {},
      updateNotificationSetting: () => {},
      markNotificationAsRead: () => {},
      markAllNotificationsAsRead: () => {},
      addNotification: () => {},
      addAutomationRule: () => {},
      updateAutomationRule: () => {},
      deleteAutomationRule: () => {},
      toggleAutomationRule: () => {},
      runAutomationRule: () => {}
    };
  }

  // Helper to match IDs flexibly
  const matchId = (idA?: string | null, idB?: string | null) => {
    if (!idA || !idB) return false;
    if (idA === idB) return true;
    const cleanA = idA.replace(/-/g, '').trim().toLowerCase();
    const cleanB = idB.replace(/-/g, '').trim().toLowerCase();
    return cleanA === cleanB;
  };

  // Helper to generate IDs
  const genId = (prefix: string) => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // ==================== PROJECTS CRUD ====================
  const addProject = (project: Omit<Project, 'id' | 'deleted' | 'createdDate' | 'updatedDate'>) => {
    const now = new Date().toISOString();
    const newProj: Project = {
      ...project,
      id: genId('p'),
      deleted: false,
      createdDate: now,
      updatedDate: now,
    };
    saveState(prev => ({
      ...prev,
      projects: [newProj, ...prev.projects]
    }));
    return newProj;
  };

  const updateProject = (id: string, updates: Partial<Omit<Project, 'id' | 'createdDate'>>) => {
    const now = new Date().toISOString();
    saveState(prev => {
      let newProjects = prev.projects.map(p => p.id === id ? { ...p, ...updates, updatedDate: now } as Project : p);
      let newTasks = prev.tasks;
      let newNotifs = prev.notifications || [];

      // Trigger automations if statusId changed
      if (updates.statusId) {
        const activeRules = (prev.automationRules || []).filter(r => r.enabled && r.triggerType === 'project_status_changed');
        for (const rule of activeRules) {
          if (!rule.triggerCondition?.toStatusId || rule.triggerCondition.toStatusId === updates.statusId) {
            for (const action of rule.actions) {
              if (action.type === 'create_default_tasks') {
                const projectTasks = newTasks.filter(t => t.projectId === id && !t.deleted);
                if (projectTasks.length === 0 && prev.defaultTasks && prev.defaultTasks.length > 0) {
                  const autoTasks: Task[] = prev.defaultTasks.map(dt => ({
                    id: genId('t'),
                    projectId: id,
                    title: dt.title,
                    description: dt.description || '',
                    estimatedHours: dt.estimatedHours || '08:00',
                    actualHours: '00:00',
                    startDate: now.split('T')[0],
                    startTime: '09:00',
                    endDate: now.split('T')[0],
                    endTime: '18:00',
                    estimatedDate: now.split('T')[0],
                    notes: 'Gerada automaticamente pela regra de automação.',
                    statusId: getDefaultTaskStatusId(prev.taskStatuses || []),
                    assigneeIds: [],
                    deleted: false,
                    createdDate: now
                  }));
                  newTasks = [...autoTasks, ...newTasks];
                }
              } else if (action.type === 'send_notification') {
                newNotifs = [{
                  id: genId('notif'),
                  userId: 'all',
                  title: action.params?.notificationTitle || 'Projeto Atualizado',
                  message: action.params?.notificationMessage || 'Regra de automação executada no projeto.',
                  isRead: false,
                  createdDate: now,
                  linkUrl: `/projects?project=${id}`
                }, ...newNotifs];
              }
            }
          }
        }
      }

      return {
        ...prev,
        projects: newProjects,
        tasks: newTasks,
        notifications: newNotifs
      };
    });
  };

  const deleteProject = (id: string) => {
    const now = new Date().toISOString();
    saveState(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, deleted: true, updatedDate: now } : p)
    }));
  };

  // ==================== TASKS CRUD ====================
  const addTask = (task: Omit<Task, 'id' | 'deleted' | 'createdDate'>) => {
    const now = new Date().toISOString();
    const resolvedStatusId = (() => {
      if (task.statusId && task.statusId !== 'ts-1') {
        const match = (state.taskStatuses || []).find(s => s.id === task.statusId || matchTaskStatusId(s.id, task.statusId));
        if (match) return match.id;
        return task.statusId;
      }
      return getDefaultTaskStatusId(state.taskStatuses || []);
    })();

    const newTask: Task = {
      ...task,
      statusId: resolvedStatusId,
      id: genId('t'),
      deleted: false,
      createdDate: now
    };
    saveState(prev => {
      let newTasks = [newTask, ...prev.tasks];
      let newProjects = prev.projects;
      let newNotifs = prev.notifications || [];

      // Trigger 'task_created' automations
      const activeRules = (prev.automationRules || []).filter(r => r.enabled && r.triggerType === 'task_created');
      for (const rule of activeRules) {
        for (const action of rule.actions) {
          if (action.type === 'send_notification') {
            newNotifs = [{
              id: genId('notif'),
              userId: action.params?.targetUserId || 'all',
              title: action.params?.notificationTitle || 'Nova Tarefa Criada',
              message: action.params?.notificationMessage || `Nova tarefa "${newTask.title}" adicionada.`,
              isRead: false,
              createdDate: now,
              linkUrl: `/projects?project=${newTask.projectId}`
            }, ...newNotifs];
          } else if (action.type === 'change_project_status' && action.params?.targetStatusId) {
            newProjects = newProjects.map(p => p.id === newTask.projectId ? { ...p, statusId: action.params!.targetStatusId!, updatedDate: now } : p);
          }
        }
      }

      return {
        ...prev,
        tasks: newTasks,
        projects: newProjects,
        notifications: newNotifs
      };
    });
    return newTask;
  };

  const addTasks = (tasksList: Omit<Task, 'id' | 'deleted' | 'createdDate'>[]) => {
    const now = new Date().toISOString();
    const defaultStatusId = getDefaultTaskStatusId(state.taskStatuses || []);
    const newTasks: Task[] = tasksList.map(task => {
      const resolvedStatusId = (() => {
        if (task.statusId && task.statusId !== 'ts-1') {
          const match = (state.taskStatuses || []).find(s => s.id === task.statusId || matchTaskStatusId(s.id, task.statusId));
          if (match) return match.id;
          return task.statusId;
        }
        return defaultStatusId;
      })();
      return {
        ...task,
        statusId: resolvedStatusId,
        id: genId('t'),
        deleted: false,
        createdDate: now
      };
    });
    saveState(prev => ({
      ...prev,
      tasks: [...newTasks, ...prev.tasks]
    }));
    return newTasks;
  };

  const updateTask = (id: string, updates: Partial<Omit<Task, 'id' | 'createdDate'>>) => {
    const now = new Date().toISOString();
    saveState(prev => {
      const targetTask = prev.tasks.find(t => t.id === id);
      let newTasks = prev.tasks.map(t => t.id === id ? { ...t, ...updates } as Task : t);
      let newProjects = prev.projects;
      let newNotifs = prev.notifications || [];

      if (targetTask && updates.statusId) {
        const activeRules = (prev.automationRules || []).filter(r => r.enabled && r.triggerType === 'task_status_changed');
        for (const rule of activeRules) {
          if (!rule.triggerCondition?.toStatusId || rule.triggerCondition.toStatusId === updates.statusId) {
            for (const action of rule.actions) {
              if (action.type === 'change_project_status' && action.params?.targetStatusId) {
                const projectTasks = newTasks.filter(t => t.projectId === targetTask.projectId && !t.deleted);
                const completedStatusId = updates.statusId;
                const allCompleted = projectTasks.length > 0 && projectTasks.every(t => t.statusId === completedStatusId);
                if (allCompleted) {
                  newProjects = newProjects.map(p => p.id === targetTask.projectId ? { ...p, statusId: action.params!.targetStatusId!, updatedDate: now } : p);
                }
              } else if (action.type === 'send_notification') {
                newNotifs = [{
                  id: genId('notif'),
                  userId: 'all',
                  title: action.params?.notificationTitle || 'Tarefa Concluída',
                  message: action.params?.notificationMessage || 'Regra de automação executada.',
                  isRead: false,
                  createdDate: now,
                  linkUrl: `/projects?project=${targetTask.projectId}`
                }, ...newNotifs];
              }
            }
          }
        }
      }

      return {
        ...prev,
        tasks: newTasks,
        projects: newProjects,
        notifications: newNotifs
      };
    });
  };

  const deleteTask = (id: string) => {
    saveState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { ...t, deleted: true } : t)
    }));
  };

  // ==================== COMMENTS CRUD ====================
  const addComment = (projectId: string, authorId: string, text: string) => {
    const newComment: Comment = {
      id: genId('com'),
      projectId,
      authorId,
      comment: text,
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      comments: [...prev.comments, newComment]
    }));
  };

  const deleteComment = (id: string) => {
    saveState(prev => ({
      ...prev,
      comments: prev.comments.filter(c => c.id !== id)
    }));
  };

  // ==================== ABSENCES CRUD ====================
  const addAbsence = (absence: Omit<UserAbsence, 'id' | 'createdDate'>) => {
    const newAbsence: UserAbsence = {
      ...absence,
      id: genId('abs'),
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      userAbsences: [newAbsence, ...prev.userAbsences]
    }));
  };

  const deleteAbsence = (id: string) => {
    saveState(prev => ({
      ...prev,
      userAbsences: prev.userAbsences.filter(a => a.id !== id)
    }));
  };

  // ==================== USERS CRUD ====================
  const addUser = (user: Omit<User, 'id' | 'deleted' | 'createdDate'>) => {
    const newUser: User = {
      ...user,
      id: genId('u'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      users: [...prev.users, newUser]
    }));
  };

  const updateUser = (id: string, updates: Partial<Omit<User, 'id' | 'createdDate'>>) => {
    saveState(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === id ? { ...u, ...updates } as User : u)
    }));
  };

  const deleteUser = (id: string) => {
    saveState(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === id ? { ...u, deleted: true } : u)
    }));
  };

  // ==================== CLIENTS CRUD ====================
  const addClient = (client: Omit<Client, 'id' | 'deleted' | 'createdDate'>) => {
    const newClient: Client = {
      ...client,
      id: genId('c'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      clients: [newClient, ...prev.clients]
    }));
    return newClient;
  };

  const updateClient = (id: string, updates: Partial<Omit<Client, 'id' | 'createdDate'>>) => {
    saveState(prev => ({
      ...prev,
      clients: (prev.clients || []).map(c => matchId(c.id, id) ? { ...c, ...updates } as Client : c)
    }));
  };

  const deleteClient = (id: string) => {
    saveState(prev => ({
      ...prev,
      clients: (prev.clients || []).map(c => matchId(c.id, id) ? { ...c, deleted: true } : c)
    }));
  };

  // ==================== MATERIALS CRUD ====================
  const addMaterial = (material: Omit<Material, 'id' | 'deleted' | 'createdDate'>) => {
    const newMat: Material = {
      ...material,
      id: genId('m'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      materials: [newMat, ...prev.materials]
    }));
  };

  const updateMaterial = (id: string, updates: Partial<Omit<Material, 'id' | 'createdDate'>>) => {
    saveState(prev => ({
      ...prev,
      materials: prev.materials.map(m => m.id === id ? { ...m, ...updates } as Material : m)
    }));
  };

  const deleteMaterial = (id: string) => {
    saveState(prev => ({
      ...prev,
      materials: prev.materials.map(m => m.id === id ? { ...m, deleted: true } : m)
    }));
  };

  // ==================== PROJECT MATERIALS CRUD ====================
  const addProjectMaterial = (pm: Omit<import('../lib/types').ProjectMaterial, 'id' | 'deleted' | 'createdDate'>) => {
    const newPM: import('../lib/types').ProjectMaterial = {
      ...pm,
      id: genId('pm'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      projectMaterials: [newPM, ...(prev.projectMaterials || [])]
    }));
    return newPM;
  };

  const updateProjectMaterial = (id: string, updates: Partial<Omit<import('../lib/types').ProjectMaterial, 'id' | 'createdDate'>>) => {
    saveState(prev => ({
      ...prev,
      projectMaterials: (prev.projectMaterials || []).map(p => matchId(p.id, id) ? { ...p, ...updates } as import('../lib/types').ProjectMaterial : p)
    }));
  };

  const deleteProjectMaterial = (id: string) => {
    saveState(prev => ({
      ...prev,
      projectMaterials: (prev.projectMaterials || []).map(p => matchId(p.id, id) ? { ...p, deleted: true } : p)
    }));
  };

  // ==================== PROJECT RISK ITEMS CRUD ====================
  const addProjectRiskItem = (risk: Omit<import('../lib/types').ProjectRiskItem, 'id' | 'deleted' | 'createdDate'>) => {
    const newRisk: import('../lib/types').ProjectRiskItem = {
      ...risk,
      id: genId('pri'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      projectRiskItems: [newRisk, ...(prev.projectRiskItems || [])]
    }));
    return newRisk;
  };

  const updateProjectRiskItem = (id: string, updates: Partial<Omit<import('../lib/types').ProjectRiskItem, 'id' | 'createdDate'>>) => {
    saveState(prev => ({
      ...prev,
      projectRiskItems: (prev.projectRiskItems || []).map(r => matchId(r.id, id) ? { ...r, ...updates } as import('../lib/types').ProjectRiskItem : r)
    }));
  };

  const deleteProjectRiskItem = (id: string) => {
    saveState(prev => ({
      ...prev,
      projectRiskItems: (prev.projectRiskItems || []).map(r => matchId(r.id, id) ? { ...r, deleted: true } : r)
    }));
  };

  // ==================== QUOTES CRUD ====================
  const addQuote = (quote: Omit<Quote, 'id' | 'deleted' | 'createdDate'>) => {
    const newQuote: Quote = {
      ...quote,
      id: genId('q'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      quotes: [newQuote, ...prev.quotes]
    }));
    return newQuote;
  };

  const updateQuote = (id: string, updates: Partial<Omit<Quote, 'id' | 'createdDate'>>) => {
    const now = new Date().toISOString();
    saveState(prev => {
      const existingQuote = prev.quotes.find(q => q.id === id);
      const newQuotes = prev.quotes.map(q => q.id === id ? { ...q, ...updates } as Quote : q);
      let newNotifs = prev.notifications || [];
      let newProjects = prev.projects;

      const isApprovedNow = updates.status && ['Aprovado', 'Ap. Cliente', 'approved'].includes(updates.status) && existingQuote?.status !== updates.status;

      if (isApprovedNow) {
        const activeRules = (prev.automationRules || []).filter(r => r.enabled && r.triggerType === 'quote_approved');
        for (const rule of activeRules) {
          for (const action of rule.actions) {
            if (action.type === 'send_notification') {
              newNotifs = [{
                id: genId('notif'),
                userId: action.params?.targetUserId || 'all',
                title: action.params?.notificationTitle || 'Orçamento Aprovado',
                message: action.params?.notificationMessage || `O orçamento "${existingQuote?.id || id}" foi aprovado pelo cliente.`,
                isRead: false,
                createdDate: now,
                linkUrl: existingQuote?.projectId ? `/projects?project=${existingQuote.projectId}` : '/quotes'
              }, ...newNotifs];
            } else if (action.type === 'change_project_status' && action.params?.targetStatusId && existingQuote?.projectId) {
              newProjects = newProjects.map(p => p.id === existingQuote.projectId ? { ...p, statusId: action.params!.targetStatusId!, updatedDate: now } : p);
            }
          }
        }
      }

      return {
        ...prev,
        quotes: newQuotes,
        notifications: newNotifs,
        projects: newProjects
      };
    });
  };

  const deleteQuote = (id: string) => {
    saveState(prev => ({
      ...prev,
      quotes: prev.quotes.map(q => q.id === id ? { ...q, deleted: true } : q)
    }));
  };

  // ==================== BILL OF MATERIALS CRUD ====================
  const addBOMItem = (bomItem: Omit<BillOfMaterial, 'id' | 'deleted' | 'createdDate'>) => {
    const newItem: BillOfMaterial = {
      ...bomItem,
      id: genId('bom'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    
    saveState(prev => {
      const nextBOM = [...prev.billOfMaterials, newItem];
      let nextQuotes = prev.quotes;
      const quote = prev.quotes.find(q => q.id === bomItem.quoteId);
      if (quote) {
        const quoteBOMs = nextBOM.filter(b => b.quoteId === bomItem.quoteId && !b.deleted);
        const total = quoteBOMs.reduce((sum, b) => {
          const mat = prev.materials.find(m => m.id === b.materialId);
          return sum + (mat ? mat.unitCost * b.quantity : 0);
        }, 0);
        nextQuotes = prev.quotes.map(q => q.id === bomItem.quoteId ? { ...q, totalValue: total } : q);
      }
      return {
        ...prev,
        billOfMaterials: nextBOM,
        quotes: nextQuotes
      };
    });
  };

  const updateBOMItem = (id: string, updates: Partial<Omit<BillOfMaterial, 'id' | 'createdDate'>>) => {
    saveState(prev => {
      const nextBOM = prev.billOfMaterials.map(b => b.id === id ? { ...b, ...updates } as BillOfMaterial : b);
      const item = prev.billOfMaterials.find(b => b.id === id);
      let nextQuotes = prev.quotes;
      if (item) {
        const quoteId = item.quoteId;
        const quoteBOMs = nextBOM.filter(b => b.quoteId === quoteId && !b.deleted);
        const total = quoteBOMs.reduce((sum, b) => {
          const mat = prev.materials.find(m => m.id === b.materialId);
          return sum + (mat ? mat.unitCost * b.quantity : 0);
        }, 0);
        nextQuotes = prev.quotes.map(q => q.id === quoteId ? { ...q, totalValue: total } : q);
      }
      return {
        ...prev,
        billOfMaterials: nextBOM,
        quotes: nextQuotes
      };
    });
  };

  const deleteBOMItem = (id: string) => {
    saveState(prev => {
      const nextBOM = prev.billOfMaterials.map(b => b.id === id ? { ...b, deleted: true } : b);
      const item = prev.billOfMaterials.find(b => b.id === id);
      let nextQuotes = prev.quotes;
      if (item) {
        const quoteId = item.quoteId;
        const quoteBOMs = nextBOM.filter(b => b.quoteId === quoteId && !b.deleted);
        const total = quoteBOMs.reduce((sum, b) => {
          const mat = prev.materials.find(m => m.id === b.materialId);
          return sum + (mat ? mat.unitCost * b.quantity : 0);
        }, 0);
        nextQuotes = prev.quotes.map(q => q.id === quoteId ? { ...q, totalValue: total } : q);
      }
      return {
        ...prev,
        billOfMaterials: nextBOM,
        quotes: nextQuotes
      };
    });
  };

  // ==================== EQUIPMENT CRUD ====================
  const addEquipment = (equipment: Omit<Equipment, 'id' | 'deleted' | 'createdDate'>) => {
    const newEq: Equipment = {
      ...equipment,
      id: genId('eq'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      equipmentList: [newEq, ...prev.equipmentList]
    }));
  };

  const updateEquipment = (id: string, updates: Partial<Omit<Equipment, 'id' | 'createdDate'>>) => {
    saveState(prev => ({
      ...prev,
      equipmentList: prev.equipmentList.map(eq => eq.id === id ? { ...eq, ...updates } as Equipment : eq)
    }));
  };

  const deleteEquipment = (id: string) => {
    saveState(prev => ({
      ...prev,
      equipmentList: prev.equipmentList.map(eq => eq.id === id ? { ...eq, deleted: true } : eq)
    }));
  };

  // ==================== APP CONFIGURATION ====================
  const updateConfig = (updates: Partial<typeof state.appConfig>) => {
    saveState(prev => ({
      ...prev,
      appConfig: { ...prev.appConfig, ...updates }
    }));
  };

  // ==================== AUX TABLES CRUD ====================
  type AuxTableName = 'projectStatuses' | 'projectCategories' | 'projectRisks' | 'projectPriorities' | 'projectTeams' | 'projectPartners' | 'userGroups' | 'taskStatuses' | 'taskTypes' | 'riskCategories' | 'riskStatuses' | 'riskPriorities';

  const addAuxRecord = (tableName: AuxTableName, name: string, extra?: { scale?: number }) => {
    const prefix = tableName === 'taskTypes' ? 'tt' : tableName === 'taskStatuses' ? 'ts' : tableName.slice(0, 3);
    const id = genId(prefix);
    
    saveState(prev => {
      const newRecord = {
        id,
        name,
        deleted: false,
        sort_order: (prev[tableName] as any[] || []).length,
        ...(extra || {})
      };
      return {
        ...prev,
        [tableName]: [...(prev[tableName] as any[] || []), newRecord]
      };
    });
  };

  const updateAuxRecord = (tableName: AuxTableName, id: string, updates: any) => {
    saveState(prev => ({
      ...prev,
      [tableName]: (prev[tableName] as any[] || []).map(item => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  const deleteAuxRecord = (tableName: AuxTableName, id: string) => {
    saveState(prev => ({
      ...prev,
      [tableName]: (prev[tableName] as any[] || []).map(item => item.id === id ? { ...item, deleted: true } : item)
    }));
  };

  const reorderAuxRecords = (tableName: AuxTableName, newItems: any[]) => {
    saveState(prev => ({
      ...prev,
      [tableName]: newItems.map((item, index) => ({ ...item, sort_order: index }))
    }));
  };

  // ==================== SPECIAL DAYS ====================
  const addSpecialDay = (date: string, name: string) => {
    saveState(prev => ({
      ...prev,
      specialDays: [...(prev.specialDays || []), { id: genId('sd'), date, name }]
    }));
  };

  const deleteSpecialDay = (id: string) => {
    saveState(prev => ({
      ...prev,
      specialDays: (prev.specialDays || []).filter(sd => sd.id !== id)
    }));
  };

  // ==================== DEFAULT TASKS ====================
  const addDefaultTask = (title: string, description: string, estimatedHours: string, taskTypeId?: string) => {
    const newTask = {
      id: genId('dt'),
      title,
      description,
      estimatedHours,
      taskTypeId
    };
    saveState(prev => ({
      ...prev,
      defaultTasks: [...(prev.defaultTasks || []), newTask]
    }));
  };

  const updateDefaultTask = (id: string, updates: Partial<{ title: string; description: string; estimatedHours: string; taskTypeId?: string }>) => {
    saveState(prev => ({
      ...prev,
      defaultTasks: (prev.defaultTasks || []).map(dt => dt.id === id ? { ...dt, ...updates } : dt)
    }));
  };

  const deleteDefaultTask = (id: string) => {
    saveState(prev => ({
      ...prev,
      defaultTasks: (prev.defaultTasks || []).filter(dt => dt.id !== id)
    }));
  };

    // ==================== NOTIFICATIONS ====================
  const updateNotificationSetting = (id: string, updates: any) => {
    saveState(prev => ({
      ...prev,
      notificationSettings: (prev.notificationSettings || []).map(ns => ns.id === id ? { ...ns, ...updates } : ns)
    }));
  };

  const markNotificationAsRead = (id: string) => {
    saveState(prev => ({
      ...prev,
      notifications: (prev.notifications || []).map(n => n.id === id ? { ...n, isRead: true } : n)
    }));
  };

  const markAllNotificationsAsRead = (userId: string) => {
    saveState(prev => ({
      ...prev,
      notifications: (prev.notifications || []).map(n => (!n.userId || n.userId === userId || n.userId === 'all') ? { ...n, isRead: true } : n)
    }));
  };

  const addNotification = (userId: string, title: string, message: string, linkUrl?: string) => {
    const newNotif = {
      id: genId('notif'),
      userId,
      title,
      message,
      isRead: false,
      createdDate: new Date().toISOString(),
      linkUrl
    };
    saveState(prev => ({
      ...prev,
      notifications: [newNotif, ...(prev.notifications || [])]
    }));
  };

  // ==================== AUTOMATION RULES ====================
  const addAutomationRule = (rule: Omit<import('../lib/types').AutomationRule, 'id' | 'createdDate'>) => {
    const newRule: import('../lib/types').AutomationRule = {
      ...rule,
      id: genId('rule'),
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
      ...prev,
      automationRules: [newRule, ...(prev.automationRules || [])]
    }));
  };

  const updateAutomationRule = (id: string, updates: Partial<import('../lib/types').AutomationRule>) => {
    saveState(prev => ({
      ...prev,
      automationRules: (prev.automationRules || []).map(r => r.id === id ? { ...r, ...updates } as import('../lib/types').AutomationRule : r)
    }));
  };

  const deleteAutomationRule = (id: string) => {
    saveState(prev => ({
      ...prev,
      automationRules: (prev.automationRules || []).filter(r => r.id !== id)
    }));
  };

  const toggleAutomationRule = (id: string) => {
    saveState(prev => ({
      ...prev,
      automationRules: (prev.automationRules || []).map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    }));
  };

  const runAutomationRule = (ruleId: string, projectId?: string) => {
    const now = new Date().toISOString();
    saveState(prev => {
      const rule = (prev.automationRules || []).find(r => r.id === ruleId);
      if (!rule) return prev;

      let targetProjId = projectId;
      if (!targetProjId) {
        const firstProj = prev.projects.find(p => !p.deleted);
        targetProjId = firstProj?.id;
      }

      let newTasks = prev.tasks;
      let newProjects = prev.projects;
      let newNotifs = prev.notifications || [];

      for (const action of rule.actions) {
        if (action.type === 'create_default_tasks' && targetProjId) {
          if (prev.defaultTasks && prev.defaultTasks.length > 0) {
            const autoTasks: Task[] = prev.defaultTasks.map(dt => ({
              id: genId('t'),
              projectId: targetProjId!,
              title: dt.title,
              description: dt.description || '',
              estimatedHours: dt.estimatedHours || '08:00',
              actualHours: '00:00',
              startDate: now.split('T')[0],
              startTime: '09:00',
              endDate: now.split('T')[0],
              endTime: '18:00',
              estimatedDate: now.split('T')[0],
              notes: 'Gerada manualmente por teste da regra de automação.',
              statusId: getDefaultTaskStatusId(prev.taskStatuses || []),
              assigneeIds: [],
              deleted: false,
              createdDate: now
            }));
            newTasks = [...autoTasks, ...newTasks];
          }
        } else if (action.type === 'change_project_status' && action.params?.targetStatusId && targetProjId) {
          newProjects = newProjects.map(p => p.id === targetProjId ? { ...p, statusId: action.params!.targetStatusId!, updatedDate: now } : p);
        } else if (action.type === 'send_notification') {
          newNotifs = [{
            id: genId('notif'),
            userId: action.params?.targetUserId || 'all',
            title: action.params?.notificationTitle || 'Regra Executada',
            message: action.params?.notificationMessage || 'Regra de automação disparada.',
            isRead: false,
            createdDate: now,
            linkUrl: targetProjId ? `/projects?project=${targetProjId}` : '/projects'
          }, ...newNotifs];
        }
      }

      return {
        ...prev,
        tasks: newTasks,
        projects: newProjects,
        notifications: newNotifs
      };
    });
  };

  return {
    loading: false,
    state: sortedState,
    resetToDefault,
    clearAllData,
    importState,
    syncStatus,
    syncError,
    isDbConfigured,
    
    // CRUD exposed
    addProject,
    updateProject,
    deleteProject,
    
    addTask,
    addTasks,
    updateTask,
    deleteTask,
    
    addComment,
    deleteComment,
    
    addAbsence,
    deleteAbsence,
    
    addUser,
    updateUser,
    deleteUser,
    
    addClient,
    updateClient,
    deleteClient,
    
    addMaterial,
    updateMaterial,
    deleteMaterial,
    
    addProjectMaterial,
    updateProjectMaterial,
    deleteProjectMaterial,
    
    addProjectRiskItem,
    updateProjectRiskItem,
    deleteProjectRiskItem,
    
    addQuote,
    updateQuote,
    deleteQuote,
    
    addBOMItem,
    updateBOMItem,
    deleteBOMItem,
    
    addEquipment,
    updateEquipment,
    deleteEquipment,
    
    updateConfig,
    
    addAuxRecord,
    updateAuxRecord,
    deleteAuxRecord,
    reorderAuxRecords,
    addSpecialDay,
    deleteSpecialDay,

    addDefaultTask,
    updateDefaultTask,
    deleteDefaultTask,
    updateNotificationSetting,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    addNotification,
    addAutomationRule,
    updateAutomationRule,
    deleteAutomationRule,
    toggleAutomationRule,
    runAutomationRule,
    refreshFromDatabase,
    saveState
  };
}
