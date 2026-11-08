'use client';

/**
 * ============================================================================
 * ARQUITETURA DE APRESENTAÇÃO — useERP
 * FASE 59: SUPABASE SYNC BOUNDARY & ERPSTATE CONTAINMENT
 * ============================================================================
 * 
 * REGRA ARQUITETURAL:
 * - PostgreSQL = ÚNICA fonte de verdade persistente.
 * - ERPState / useERP = Estado de apresentação e cache temporário no cliente React,
 *   NUNCA a autoridade de persistência.
 * - As mutações de entidades devem migrar progressivamente para o fluxo autoritativo:
 *   UI -> API Dedicada (/api/v1/*) -> Service -> PostgreSQL -> Atualização local
 * ============================================================================
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createProjectActions } from '@/domains/projects/modules/projectActions';
import { createTaskActions } from '@/domains/tasks/modules/taskActions';
import { createClientActions } from '@/domains/clients/modules/clientActions';
import { applyLegacyVersions } from '../lib/supabase/legacyWriteBatch';
import { buildLegacySyncPayload } from '../lib/supabase/syncPayload';
import { ERPState, AppConfiguration, Project, Task, Comment, UserAbsence, User, Client, SpecialDay } from '../lib/types';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { mapStateToUUIDs, fetchAuditLogsFromSupabase, logAuditEventToSupabase } from '../lib/supabaseSync';
import { getDefaultTaskStatusId, matchTaskStatusId } from '../lib/utils';
import { getAuthHeaders, getClientUser, clearClientSession } from '../lib/clientAuth';
import { apiCreateTask, apiUpdateTask, apiDeleteTask, parseTaskHoursToFloat } from '@/domains/tasks/modules/taskOperations';
import { listProjectMaterials, createProjectMaterial as apiCreateProjectMaterial, updateProjectMaterial as apiUpdateProjectMaterial, deleteProjectMaterial as apiDeleteProjectMaterial } from '../lib/projectMaterials/client';
import { mergeSyncPartitions, SYNC_PARTITIONS, type SyncPartition } from '../lib/supabase/syncPartitions';

const STORAGE_KEY = 'gestao_projetos_erp_state_v1';

function getApiErrorMessage(result: any, fallback: string): string {
  if (result?.error?.message) {
    if (result.error.details?.fieldErrors) {
      const fieldErrors = result.error.details.fieldErrors;
      const specificMessages = Object.entries(fieldErrors)
        .flatMap(([, msgs]: [string, any]) => (Array.isArray(msgs) ? msgs : [msgs]))
        .filter(Boolean);
      if (specificMessages.length > 0) {
        return `${result.error.message}: ${specificMessages.join('; ')}`;
      }
    }
    return result.error.message;
  }
  if (result?.message) return result.message;
  if (typeof result?.error === 'string') return result.error;
  return fallback;
}

// Clean baseline with zero mock entities (no mock clients, projects, tasks or materials)
const getEmptyState = (): ERPState => ({
  ...CLEAN_BASELINE_STATE
});

export function useERP() {
  // Start with null so that only authoritative data from the database is rendered
  const [state, setState] = useState<ERPState | null>(null);
  // Public branding must remain available before authenticated ERP data exists.
  const [publicAppConfig, setPublicAppConfig] = useState<Partial<AppConfiguration> | null>(null);
  const [isInitialDataLoaded, setIsInitialDataLoaded] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const [auditStatus, setAuditStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [materialsStatus, setMaterialsStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const materialsGeneration = useRef(0);
  const [configRuntimeStatus, setConfigRuntimeStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const configRuntimeGeneration = useRef(0);
  const [defaultTasksStatus, setDefaultTasksStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const defaultTasksGeneration = useRef(0);
  const [isDbConfigured, setIsDbConfigured] = useState<boolean>(false);


  // Authoritative fetch directly from database (bypasses any local stale cache)
  const refreshFromDatabase = useCallback(async (): Promise<boolean> => {
    const generation = ++refreshGeneration.current;
    materialsGeneration.current += 1;
    configRuntimeGeneration.current += 1;
    defaultTasksGeneration.current += 1;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const headers = getAuthHeaders();
      const responses = await Promise.all((Object.keys(SYNC_PARTITIONS) as SyncPartition[]).map(async partition => {
        const response = await fetch(`/api/supabase/sync?partition=${partition}`, { headers, cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        return { partition, response, body };
      }));
      if (generation !== refreshGeneration.current) return false;
      const failed = responses.find(({ response }) => response.status === 401)
        || responses.find(({ response, body }) => !response.ok || body.success !== true || !body.data);
      if (!failed) {
        const parts = Object.fromEntries(responses.map(({ partition, body }) => [partition, body.data])) as Record<SyncPartition, unknown>;
        const mapped = mapStateToUUIDs(mergeSyncPartitions(parts));
        setState(mapped);
        setAuditStatus('idle');
        setMaterialsStatus('idle');
        setConfigRuntimeStatus('idle');
        setDefaultTasksStatus('idle');
        setSyncStatus('synced');
        setSyncError(null);
        setIsInitialDataLoaded(true);
        return true;
      } else {
        const msg = failed.body.message || `Erro do servidor ao contactar a base de dados (Status: ${failed.response.status}).`;
        if (failed.response.status === 401) {
          // Sessão não autenticada ou expirada: manter não carregado para que o ecrã de login seja exibido
          setSyncStatus('idle');
          setSyncError(null);
          setIsInitialDataLoaded(false);
        } else {
          setSyncStatus('error');
          setSyncError(msg);
          setIsInitialDataLoaded(false);
        }
        return false;
      }
    } catch (err: any) {
      if (generation !== refreshGeneration.current) return false;
      const msg = err?.message || 'Erro de rede ao contactar a base de dados.';
      setSyncStatus('error');
      setSyncError(msg);
      setIsInitialDataLoaded(false);
      return false;
    }
  }, []);

  const loadProjectMaterials = useCallback(async () => {
    const generation = materialsGeneration.current;
    setMaterialsStatus('loading');
    try {
      const materials = await listProjectMaterials();
      if (generation !== materialsGeneration.current) return;
      setState(prev => prev ? { ...prev, projectMaterials: materials } : null);
      setMaterialsStatus('loaded');
    } catch {
      if (generation !== materialsGeneration.current) return;
      setMaterialsStatus('error');
    }
  }, []);

  const loadConfigRuntime = useCallback(async () => {
    const generation = configRuntimeGeneration.current;
    setConfigRuntimeStatus('loading');
    try {
      const response = await fetch('/api/supabase/config-runtime', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || result?.success !== true || !Array.isArray(result.data?.notificationSettings) || !Array.isArray(result.data?.automationRules)) {
        throw new Error('Resposta inválida ao carregar as configurações.');
      }
      if (generation !== configRuntimeGeneration.current) return;
      setState(prev => prev ? { ...prev, notificationSettings: result.data.notificationSettings, automationRules: result.data.automationRules } : null);
      setConfigRuntimeStatus('loaded');
    } catch {
      if (generation !== configRuntimeGeneration.current) return;
      setConfigRuntimeStatus('error');
    }
  }, []);

  const loadDefaultTasks = useCallback(async () => {
    const generation = defaultTasksGeneration.current;
    setDefaultTasksStatus('loading');
    try {
      const response = await fetch('/api/supabase/default-tasks', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || result?.success !== true || !Array.isArray(result.data)) {
        throw new Error('Resposta inválida ao carregar os templates de tarefas.');
      }
      if (generation !== defaultTasksGeneration.current) return;
      setState(prev => prev ? { ...prev, defaultTasks: result.data } : null);
      setDefaultTasksStatus('loaded');
    } catch {
      if (generation !== defaultTasksGeneration.current) return;
      setDefaultTasksStatus('error');
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    setAuditStatus('loading');
    try {
      const result = await fetchAuditLogsFromSupabase(100);
      if (!result.success || !result.data) throw new Error(result.message || 'Não foi possível carregar a auditoria.');
      setState(prev => prev ? { ...prev, auditLogs: result.data! } : null);
      setAuditStatus('loaded');
    } catch {
      setAuditStatus('error');
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
        const configRes = await fetch('/api/supabase/config', { cache: 'no-store' });
        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData && typeof configData.isConfigured === 'boolean') {
            configured = configData.isConfigured;
          }
          if (configData?.appConfig) {
            setPublicAppConfig(configData.appConfig);
            setState(prev => {
              if (!prev) return null; // Never use CLEAN_BASELINE_STATE during boot
              return {
                ...prev,
                appConfig: {
                  ...prev.appConfig,
                  ...configData.appConfig,
                },
              };
            });
          }
        }
      } catch (configErr) {
        console.warn('Could not check Supabase config from server:', configErr);
      }

      setIsDbConfigured(configured);

      if (!configured) {
        setSyncStatus('error');
        setSyncError('A base de dados não está configurada no servidor. Por razões de integridade, a aplicação não permite operar com dados não gravados na base de dados.');
        setIsInitialDataLoaded(false);
        return;
      }

      const ok = await refreshFromDatabase();
      if (!ok) {
        setIsInitialDataLoaded(false);
      }
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
        body: JSON.stringify(buildLegacySyncPayload(prevState, nextState)),
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success) {
        if (result.versions) setState(prev => prev ? applyLegacyVersions(prev, result.versions) : prev);
        setSyncStatus('synced');
        setSyncError(null);
        return { success: true };
      } else {
        // ROLLBACK! The write was not accepted by the database
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a gravação (${res.status}). A alteração foi revertida para garantir que apenas dados válidos da base de dados são mantidos.`);
        console.error('Falha na gravação na base de dados. A reverter estado local:', errMsg);
        setState(prevState);
        if (res.status === 409) await refreshFromDatabase();
        setSyncStatus('error');
        setSyncError(errMsg);

        if (res.status === 401 || result?.message?.includes('Sessão') || result?.message?.includes('autentic')) {
          clearClientSession();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message: errMsg } }));
          }
        }

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
    if (confirm('Esta ação irá repor as definições disponíveis para sincronização. Deseja continuar?')) {
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

  // Helper to record audit log in state and Supabase
  const logAudit = (
    action: string,
    entityType: string,
    entityId?: string,
    entityName?: string,
    details?: string
  ) => {
    let userName = 'Sistema';
    let userEmail = '';
    let userId: string | undefined = undefined;

    const cu = getClientUser();
    if (cu) {
      userId = cu.id;
      userName = cu.name || cu.email || 'Utilizador';
      userEmail = cu.email || '';
    }

    const logItem: import('../lib/types').AuditLog = {
      id: genId('audit'),
      timestamp: new Date().toISOString(),
      userId,
      userName,
      userEmail,
      action,
      entityType,
      entityId,
      entityName,
      details: details || `${action} em ${entityType} ${entityName ? `"${entityName}"` : ''}`,
      createdDate: new Date().toISOString()
    };

    // Update local state auditLogs immediately so UI reflects it instantly
    setState(prev => prev ? {
      ...prev,
      auditLogs: [logItem, ...(prev.auditLogs || [])]
    } : prev);

    // Persist directly to Supabase table audit_logs
    if (isSupabaseConfigured) {
      logAuditEventToSupabase({
        userId,
        userName,
        userEmail,
        action,
        entityType,
        entityId,
        entityName,
        details: logItem.details
      }).catch(err => {
        console.warn('Erro ao gravar audit_log no Supabase:', err);
      });
    }

    return logItem;
  };

  const { addProject, updateProject, deleteProject } = createProjectActions({
    isDbConfigured, state, setState, setSyncStatus, setSyncError, logAudit, refreshFromDatabase, getApiErrorMessage,
  });

  const { addTask, addTasks, updateTask, deleteTask } = createTaskActions({
    isDbConfigured, state, setState, setSyncStatus, setSyncError, logAudit, refreshFromDatabase, getApiErrorMessage,
  });

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

  const deleteSyncedEntity = async (entity: 'comments' | 'userAbsences' | 'specialDays' | 'defaultTasks', id: string) => {
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const response = await fetch('/api/supabase/sync/entity', {
        method: 'DELETE', headers: getAuthHeaders(), body: JSON.stringify({ entity, id }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(getApiErrorMessage(result, 'Não foi possível eliminar o registo.'));
      // Update presentation only after authoritative confirmation; no snapshot save.
      setState(prev => prev ? { ...prev, [entity]: (prev[entity] || []).filter(row => row.id !== id) } : prev);
      setSyncStatus('synced');
      return { success: true };
    } catch (error: any) {
      setSyncStatus('error');
      setSyncError(error.message || 'Erro ao eliminar o registo.');
      return { success: false, message: error.message };
    }
  };
  const deleteComment = (id: string) => deleteSyncedEntity('comments', id);

  // ==================== ABSENCES CRUD ====================
  const addAbsence = async (absence: Omit<UserAbsence, 'id' | 'createdDate'>) => {
    const newAbsence: UserAbsence = {
      ...absence,
      id: crypto.randomUUID(),
      createdDate: new Date().toISOString()
    };
    return await saveState(prev => ({
      ...prev,
      userAbsences: [newAbsence, ...prev.userAbsences]
    }));
  };

  const deleteAbsence = (id: string) => deleteSyncedEntity('userAbsences', id);

  // ==================== USERS CRUD ====================
  const addUser = async (user: Pick<User, 'name' | 'email' | 'type'> & { password: string }) => {
    const response = await fetch('/api/users', {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ name: user.name, email: user.email, type: user.type, password: user.password }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível criar o utilizador.');
    await refreshFromDatabase();
    return result.id as string;
  };

  const updateUser = async (id: string, updates: Partial<Omit<User, 'id' | 'createdDate'>> & { password?: string }) => {
    const existing = state?.users?.find(u => u.id === id);
    if (!existing) throw new Error('Utilizador não encontrado.');
    const response = await fetch('/api/users', {
      method: 'PATCH', headers: getAuthHeaders(),
      body: JSON.stringify({ id, name: updates.name ?? existing.name, email: updates.email ?? existing.email,
        type: updates.type ?? existing.type, password: updates.password }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível atualizar o utilizador.');
    await refreshFromDatabase();
    return true;
  };

  const deleteUser = (id: string) => {
    const existingUser = state?.users?.find(u => u.id === id);
    logAudit('DELETE', 'USER', id, existingUser?.name, `Eliminado utilizador "${existingUser?.name || id}"`);
    return saveState(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === id ? { ...u, deleted: true } : u)
    }));
  };

  const { addClient, updateClient, deleteClient } = createClientActions({
    isDbConfigured, state, setState, setSyncStatus, setSyncError, matchId, logAudit, getApiErrorMessage,
  });

  // ==================== PROJECT MATERIALS CRUD ====================
  const addProjectMaterial = async (pm: Omit<import('../lib/types').ProjectMaterial, 'id' | 'deleted' | 'createdDate'>) => {
    const created = await apiCreateProjectMaterial(pm);
    setState(prev => prev ? ({ ...prev, projectMaterials: [created, ...(prev.projectMaterials || [])] }) : prev);
    return created;
  };

  const updateProjectMaterial = async (id: string, updates: Partial<Omit<import('../lib/types').ProjectMaterial, 'id' | 'createdDate'>>) => {
    const current = state?.projectMaterials?.find(p => matchId(p.id, id));
    const updated = await apiUpdateProjectMaterial(id, { ...updates, syncVersion: current?.syncVersion });
    setState(prev => prev ? ({ ...prev,
      projectMaterials: (prev.projectMaterials || []).map(p => matchId(p.id, id) ? updated : p),
    }) : prev);
    return updated;
  };

  const deleteProjectMaterial = async (id: string) => {
    await apiDeleteProjectMaterial(id);
    setState(prev => prev ? ({ ...prev,
      projectMaterials: (prev.projectMaterials || []).filter(p => !matchId(p.id, id)),
    }) : prev);
  };

  // ==================== PROJECT RISK ITEMS CRUD ====================
  const addProjectRiskItem = (risk: Omit<import('../lib/types').ProjectRiskItem, 'id' | 'deleted' | 'createdDate'>) => {
    const newRisk: import('../lib/types').ProjectRiskItem = {
      ...risk,
      id: genId('pri'),
      deleted: false,
      createdDate: new Date().toISOString()
    };
    return saveState(prev => ({
      ...prev,
      projectRiskItems: [newRisk, ...(prev.projectRiskItems || [])]
    }));
  };

  const updateProjectRiskItem = (id: string, updates: Partial<Omit<import('../lib/types').ProjectRiskItem, 'id' | 'createdDate'>>) => {
    return saveState(prev => ({
      ...prev,
      projectRiskItems: (prev.projectRiskItems || []).map(r => matchId(r.id, id) ? { ...r, ...updates } as import('../lib/types').ProjectRiskItem : r)
    }));
  };

  const deleteProjectRiskItem = (id: string) => {
    return saveState(prev => ({
      ...prev,
      projectRiskItems: (prev.projectRiskItems || []).map(r => matchId(r.id, id) ? { ...r, deleted: true } : r)
    }));
  };

  // ==================== APP CONFIGURATION ====================
  const updateConfig = (updates: Record<string, any>) => {
    return saveState(prev => ({
      ...prev,
      appConfig: { ...prev.appConfig, ...updates }
    }));
  };

  // ==================== AUX TABLES CRUD ====================
  type AuxTableName = 'projectStatuses' | 'projectCategories' | 'projectRisks' | 'projectPriorities' | 'projectTeams' | 'projectPartners' | 'userGroups' | 'taskStatuses' | 'taskTypes' | 'riskCategories' | 'riskStatuses' | 'riskPriorities';

  const addAuxRecord = (tableName: AuxTableName, name: string, extra?: { scale?: number }) => {
    const isUUIDTable = ['taskTypes', 'taskStatuses', 'userGroups', 'projectCategories', 'projectStatuses', 'projectRisks', 'projectPriorities', 'projectTeams', 'projectPartners', 'riskCategories', 'riskStatuses', 'riskPriorities'].includes(tableName);
    const prefix = tableName === 'taskTypes' ? 'tt' : tableName === 'taskStatuses' ? 'ts' : tableName.slice(0, 3);
    const id = isUUIDTable ? crypto.randomUUID() : genId(prefix);
    
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
  const writeSpecialDay = async (url: string, method: 'POST' | 'PATCH', payload: Record<string, unknown>) => {
    if (!isDbConfigured) return { success: false, message: 'A base de dados não está configurada.' };
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const response = await fetch(url, {
        method, headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true || !result.data?.id) {
        const message = getApiErrorMessage(result, 'Não foi possível guardar o dia especial.');
        if (response.status === 409) void refreshFromDatabase();
        if (response.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message } }));
        }
        setSyncStatus('error');
        setSyncError(message);
        return { success: false, message };
      }
      setState(prev => prev ? ({ ...prev, specialDays: method === 'POST'
        ? [...(prev.specialDays || []), result.data]
        : (prev.specialDays || []).map(day => day.id === result.data.id ? result.data : day) }) : prev);
      setSyncStatus('synced');
      return { success: true };
    } catch {
      const message = 'Falha de comunicação ao guardar o dia especial.';
      setSyncStatus('error');
      setSyncError(message);
      return { success: false, message };
    }
  };

  const addSpecialDay = (date: string, name: string) =>
    writeSpecialDay('/api/supabase/special-days', 'POST', { date, name });

  const updateSpecialDay = (id: string, updates: Partial<SpecialDay>) => {
    const current = state?.specialDays?.find(day => day.id === id);
    if (!current?.syncVersion) return Promise.resolve({ success: false, message: 'Recarregue os dias especiais antes de alterar.' });
    return writeSpecialDay(`/api/supabase/special-days/${id}`, 'PATCH', {
      date: updates.date, name: updates.name, syncVersion: current.syncVersion,
    });
  };

  const deleteSpecialDay = (id: string) => deleteSyncedEntity('specialDays', id);

  // ==================== DEFAULT TASKS ====================
  const writeDefaultTask = async (url: string, method: 'POST' | 'PATCH', payload: Record<string, unknown>) => {
    if (!isDbConfigured) return { success: false, message: 'A base de dados não está configurada.' };
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const response = await fetch(url, {
        method, headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true || !result.data?.id) {
        const message = getApiErrorMessage(result, 'Não foi possível guardar o template de tarefa.');
        if (response.status === 409) void loadDefaultTasks();
        if (response.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message } }));
        }
        setSyncStatus('error');
        setSyncError(message);
        return { success: false, message };
      }
      setState(prev => prev ? ({ ...prev, defaultTasks: method === 'POST'
        ? [...(prev.defaultTasks || []), result.data]
        : (prev.defaultTasks || []).map(task => task.id === result.data.id ? result.data : task) }) : prev);
      setSyncStatus('synced');
      return { success: true };
    } catch {
      const message = 'Falha de comunicação ao guardar o template de tarefa.';
      setSyncStatus('error');
      setSyncError(message);
      return { success: false, message };
    }
  };

  const addDefaultTask = (title: string, description: string, estimatedHours: string, taskTypeId?: string) =>
    writeDefaultTask('/api/supabase/default-tasks', 'POST', { title, description, estimatedHours, taskTypeId });

  const updateDefaultTask = (id: string, updates: Partial<{ title: string; description: string; estimatedHours: string; taskTypeId?: string }>) => {
    const current = state?.defaultTasks?.find(task => task.id === id);
    if (!current?.syncVersion) return Promise.resolve({ success: false, message: 'Recarregue os templates de tarefas antes de alterar.' });
    return writeDefaultTask(`/api/supabase/default-tasks/${id}`, 'PATCH', {
      ...updates,
      ...(Object.hasOwn(updates, 'taskTypeId') ? { taskTypeId: updates.taskTypeId ?? null } : {}),
      syncVersion: current.syncVersion,
    });
  };

  const deleteDefaultTask = (id: string) => deleteSyncedEntity('defaultTasks', id);

    // ==================== NOTIFICATIONS ====================
  const updateNotificationSetting = async (id: string, updates: Partial<import('../lib/types').NotificationSetting>) => {
    const setting = state?.notificationSettings?.find(item => item.id === id);
    if (!setting) return { success: false, message: 'Definição não encontrada.' };
    try {
      const response = await fetch('/api/notifications/settings', {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ type: setting.type, updates }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Erro ao guardar a definição.');
      setState(prev => prev ? ({ ...prev, notificationSettings: (prev.notificationSettings || []).map(item =>
        item.id === id ? { ...item, ...updates } : item) }) : prev);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao guardar a definição.';
      setSyncError(message);
      return { success: false, message };
    }
  };

  const markNotificationAsRead = async (id: string) => {
    const response = await fetch('/api/notifications/read', {
      method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ id }),
    });
    if (!response.ok) return { success: false };
    setState(prev => prev ? ({ ...prev, notifications: (prev.notifications || []).map(n =>
      n.id === id ? { ...n, isRead: true } : n) }) : prev);
    return { success: true };
  };

  const markAllNotificationsAsRead = (userId: string) => {
    return fetch('/api/notifications/read', {
      method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ all: true }),
    }).then(response => {
      if (!response.ok) return { success: false };
      setState(prev => prev ? ({ ...prev, notifications: (prev.notifications || []).map(n =>
        n.userId === userId || n.userId === 'all' ? { ...n, isRead: true } : n) }) : prev);
      return { success: true };
    });
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
    return saveState(prev => ({
      ...prev,
      automationRules: [newRule, ...(prev.automationRules || [])]
    }));
  };

  const updateAutomationRule = (id: string, updates: Partial<import('../lib/types').AutomationRule>) => {
    return saveState(prev => ({
      ...prev,
      automationRules: (prev.automationRules || []).map(r => r.id === id ? { ...r, ...updates } as import('../lib/types').AutomationRule : r)
    }));
  };

  const deleteAutomationRule = (id: string) => {
    return saveState(prev => ({
      ...prev,
      automationRules: (prev.automationRules || []).map(r => r.id === id ? { ...r, deleted: true, enabled: false } : r)
    }));
  };

  const toggleAutomationRule = (id: string) => {
    return saveState(prev => ({
      ...prev,
      automationRules: (prev.automationRules || []).map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    }));
  };


  return {
    isInitialDataLoaded,
    publicAppConfig,
    loading: !isInitialDataLoaded,
    state: sortedState,
    resetToDefault,
    clearAllData,
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
    
    addProjectMaterial,
    updateProjectMaterial,
    deleteProjectMaterial,
    
    addProjectRiskItem,
    updateProjectRiskItem,
    deleteProjectRiskItem,
    
    updateConfig,
    
    addAuxRecord,
    updateAuxRecord,
    deleteAuxRecord,
    reorderAuxRecords,
    addSpecialDay,
    updateSpecialDay,
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
    refreshFromDatabase,
    loadAuditLogs,
    auditStatus,
    loadProjectMaterials,
    materialsStatus,
    loadConfigRuntime,
    configRuntimeStatus,
    loadDefaultTasks,
    defaultTasksStatus,
    saveState,

  };
}
