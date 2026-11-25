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
import { createAbsenceActions } from '@/domains/absences/modules/absenceActions';
import { createUserActions } from '@/domains/administration/modules/userActions';
import { createProjectMaterialActions } from '@/domains/projects/modules/projectMaterialActions';
import { createProjectRiskActions } from '@/domains/projects/modules/projectRiskActions';
import { createConfigActions } from '@/domains/administration/modules/configActions';
import { createReferenceActions } from '@/domains/administration/modules/referenceActions';
import { createSpecialDayActions } from '@/domains/calendar/modules/specialDayActions';
import { createDefaultTaskActions } from '@/domains/tasks/modules/defaultTaskActions';
import { createCommunicationActions } from '@/domains/communication/modules/communicationActions';
import { createProjectActions } from '@/domains/projects/modules/projectActions';
import { createTaskActions } from '@/domains/tasks/modules/taskActions';
import { createCommentActions } from '@/domains/projects/modules/commentActions';
import { createClientActions } from '@/domains/clients/modules/clientActions';
import { ERPState, AppConfiguration, Project, Task, Comment, UserAbsence, User, Client, SpecialDay } from '../lib/types';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { mapStateToUUIDs } from '../lib/supabaseSync';
import { getDefaultTaskStatusId, matchTaskStatusId } from '../lib/utils';
import { apiRequestError, authenticatedRequest, getAuthHeaders, readRequest } from '../lib/clientAuth';
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

export function useERP(userId?: string) {
  // Start with null so that only authoritative data from the database is rendered
  const [state, setState] = useState<ERPState | null>(null);
  // Public branding must remain available before authenticated ERP data exists.
  const [publicAppConfig, setPublicAppConfig] = useState<Partial<AppConfiguration> | null>(null);
  const [isInitialDataLoaded, setIsInitialDataLoaded] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const [refreshProgress, setRefreshProgress] = useState<number | null>(null);
  const [materialsStatus, setMaterialsStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const materialsGeneration = useRef(0);
  const [configRuntimeStatus, setConfigRuntimeStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const configRuntimeGeneration = useRef(0);
  const [defaultTasksStatus, setDefaultTasksStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const defaultTasksGeneration = useRef(0);
  const [isDbConfigured, setIsDbConfigured] = useState<boolean>(false);


  const workLoaded = useRef(false);
  const [workStatus, setWorkStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const loadWork = useCallback(async () => {
    const generation = refreshGeneration.current;
    setWorkStatus('loading');
    try {
      const response = await authenticatedRequest('/api/supabase/sync?partition=work', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error('Work read failed');
      const data = mergeSyncPartitions({ work: body.data }, ['work']);
      if (generation !== refreshGeneration.current) return;
      setState(previous => previous ? { ...previous, clients: data.clients, projects: data.projects, tasks: data.tasks } : previous);
      workLoaded.current = true;
      setWorkStatus('loaded');
    } catch {
      if (generation === refreshGeneration.current) setWorkStatus('error');
    }
  }, []);

  const activityLoaded = useRef(false);
  const [activityStatus, setActivityStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const loadActivity = useCallback(async () => {
    const generation = refreshGeneration.current;
    setActivityStatus('loading');
    try {
      const response = await authenticatedRequest('/api/supabase/sync?partition=activity', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error('Falha ao carregar atividade.');
      const data = mergeSyncPartitions({ activity: body.data }, ['activity']);
      if (generation !== refreshGeneration.current) return;
      setState(previous => previous ? { ...previous, comments: data.comments, userAbsences: data.userAbsences, projectRiskItems: data.projectRiskItems } : previous);
      activityLoaded.current = true;
      setActivityStatus('loaded');
    } catch {
      if (generation === refreshGeneration.current) setActivityStatus('error');
    }
  }, []);

  const resetAuthorizedData = useCallback(() => {
    refreshGeneration.current += 1;
    materialsGeneration.current += 1;
    configRuntimeGeneration.current += 1;
    defaultTasksGeneration.current += 1;
    workLoaded.current = false;
    setWorkStatus('idle');
    activityLoaded.current = false;
    setActivityStatus('idle');
    setState(null);
    setIsInitialDataLoaded(false);
    setSyncStatus('idle');
    setSyncError(null);
    setRefreshProgress(null);
    setMaterialsStatus('idle');
    setConfigRuntimeStatus('idle');
    setDefaultTasksStatus('idle');
  }, []);

  const refreshFromDatabase = useCallback(async (): Promise<boolean> => {
    const generation = ++refreshGeneration.current;
    if (!workLoaded.current) setWorkStatus('idle');
    if (!activityLoaded.current) setActivityStatus('idle');
    setRefreshProgress(0);
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const headers = getAuthHeaders();
      const parts: SyncPartition[] = ['directory', 'notifications', ...(workLoaded.current ? ['work' as const] : []), ...(activityLoaded.current ? ['activity' as const] : [])];
      const responses = await Promise.all(parts.map(async partition => {
        const response = await authenticatedRequest('/api/supabase/sync?partition=' + partition, { headers, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok || body.success !== true || !body.data) {
          throw apiRequestError(response, body, 'Não foi possível atualizar os dados. Tente novamente.');
        }
        if (generation === refreshGeneration.current) {
          setRefreshProgress(value => (value ?? 0) + 1);
        }
        return [partition, body.data] as const;
      }));
      if (generation !== refreshGeneration.current) return false;
      const mapped = mapStateToUUIDs(mergeSyncPartitions(Object.fromEntries(responses) as Record<SyncPartition, unknown>, parts));
      setState(previous => previous ? {
        ...mapped,
        projectMaterials: previous.projectMaterials,
        defaultTasks: previous.defaultTasks,
        notificationSettings: previous.notificationSettings,
        automationRules: previous.automationRules,
      } : mapped);
      setSyncStatus('synced');
      setIsDbConfigured(true);
      setIsInitialDataLoaded(true);
      return true;
    } catch (error) {
      if (generation !== refreshGeneration.current) return false;
      refreshGeneration.current += 1;
      console.warn('[ERP LOAD]', error);
      setSyncStatus('error');
      setSyncError('Não foi possível atualizar os dados. Tente novamente.');
      setRefreshProgress(null);
      return false;
    } finally {
      if (generation === refreshGeneration.current) setRefreshProgress(null);
    }
  }, []);

  const loadProjectMaterials = useCallback(async () => {
    const generation = ++materialsGeneration.current;
    setMaterialsStatus('loading');
    try {
      const materials = await listProjectMaterials();
      if (generation !== materialsGeneration.current) return;
      setState(prev => prev ? { ...prev, projectMaterials: materials } : null);
      setMaterialsStatus('loaded');
    } catch (error) {
      if (generation !== materialsGeneration.current) return;
      console.error('[PROJECT MATERIALS LOAD]', error);
      setMaterialsStatus('error');
    }
  }, []);

  const loadConfigRuntime = useCallback(async () => {
    const generation = ++configRuntimeGeneration.current;
    setConfigRuntimeStatus('loading');
    try {
      const response = await authenticatedRequest('/api/supabase/config-runtime', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || result?.success !== true || !Array.isArray(result.data?.notificationSettings) || !Array.isArray(result.data?.automationRules)) {
        throw new Error('Resposta inválida ao carregar as configurações.');
      }
      if (generation !== configRuntimeGeneration.current) return;
      setState(prev => prev ? { ...prev, notificationSettings: result.data.notificationSettings, automationRules: result.data.automationRules } : null);
      setConfigRuntimeStatus('loaded');
    } catch (error) {
      if (generation !== configRuntimeGeneration.current) return;
      console.error('[CONFIG RUNTIME LOAD]', error);
      setConfigRuntimeStatus('error');
    }
  }, []);

  const loadDefaultTasks = useCallback(async () => {
    const generation = ++defaultTasksGeneration.current;
    setDefaultTasksStatus('loading');
    try {
      const response = await authenticatedRequest('/api/supabase/default-tasks', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || result?.success !== true || !Array.isArray(result.data)) {
        throw new Error(`Falha ao carregar templates de tarefas (HTTP ${response.status}): ${result?.message || 'Resposta inválida.'}`);
      }
      if (generation !== defaultTasksGeneration.current) return;
      setState(prev => prev ? { ...prev, defaultTasks: result.data } : null);
      setDefaultTasksStatus('loaded');
    } catch (error) {
      if (generation !== defaultTasksGeneration.current) return;
      console.error('[DEFAULT TASKS LOAD]', error);
      setDefaultTasksStatus('error');
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
        const configRes = await readRequest('/api/supabase/config', { cache: 'no-store' });
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

    };

    void loadState();
  }, []);

  useEffect(() => {
    if (userId) void refreshFromDatabase();
  }, [userId, refreshFromDatabase]);

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
  const { addProject, updateProject, deleteProject } = createProjectActions({
    isDbConfigured, state, setState, setSyncStatus, setSyncError, refreshFromDatabase, getApiErrorMessage,
  });

  const { addTask, addTasks, updateTask, deleteTask } = createTaskActions({
    isDbConfigured, state, setState, setSyncStatus, setSyncError, refreshFromDatabase, getApiErrorMessage,
  });

  const deleteSyncedEntity = async (entity: 'comments' | 'userAbsences' | 'specialDays' | 'defaultTasks', id: string) => {
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const paths = { comments: '/api/v1/projects/comments', userAbsences: '/api/v1/absences', specialDays: '/api/supabase/special-days', defaultTasks: '/api/supabase/default-tasks' };
      const response = await authenticatedRequest(paths[entity] + '/' + encodeURIComponent(id), {
        method: 'DELETE', headers: getAuthHeaders(),
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
  const { addComment, deleteComment } = createCommentActions({ setState, deleteSyncedEntity });

  const { addAbsence, deleteAbsence } = createAbsenceActions({ setState, deleteSyncedEntity });

  const { addUser, updateUser, deleteUser } = createUserActions({ state, refreshFromDatabase });

  const { addClient, updateClient, deleteClient } = createClientActions({
    isDbConfigured, state, setState, setSyncStatus, setSyncError, matchId, getApiErrorMessage,
  });

  const { addProjectMaterial, updateProjectMaterial, deleteProjectMaterial } = createProjectMaterialActions({ state, setState, matchId });

  const { addProjectRiskItem, updateProjectRiskItem, deleteProjectRiskItem } = createProjectRiskActions({ state, setState, matchId, refreshFromDatabase });

  const { updateConfig } = createConfigActions({ state, setState, refreshFromDatabase });
  const { addAuxRecord, updateAuxRecord, deleteAuxRecord, reorderAuxRecords } = createReferenceActions({ state, setState, refreshFromDatabase });

  const { addSpecialDay, updateSpecialDay, deleteSpecialDay } = createSpecialDayActions({ state, setState, setSyncStatus, setSyncError, isDbConfigured, deleteSyncedEntity, refreshFromDatabase, getApiErrorMessage });

  const { addDefaultTask, updateDefaultTask, deleteDefaultTask } = createDefaultTaskActions({ state, setState, setSyncStatus, setSyncError, isDbConfigured, deleteSyncedEntity, loadDefaultTasks, getApiErrorMessage });

  const { updateNotificationSetting, markNotificationAsRead, markAllNotificationsAsRead, addAutomationRule, updateAutomationRule, deleteAutomationRule, toggleAutomationRule } = createCommunicationActions({ state, setState, setSyncError, refreshFromDatabase });



  return {
    isInitialDataLoaded,
    publicAppConfig,
    loading: !isInitialDataLoaded,
    state: sortedState,
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
    addAutomationRule,
    updateAutomationRule,
    deleteAutomationRule,
    toggleAutomationRule,
    refreshFromDatabase,
    refreshProgress,
    resetAuthorizedData,
    loadWork,
    workStatus,
    loadActivity,
    activityStatus,
    loadProjectMaterials,
    materialsStatus,
    loadConfigRuntime,
    configRuntimeStatus,
    loadDefaultTasks,
    defaultTasksStatus,

  };
}
