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

import { useState, useEffect, useMemo, useCallback } from 'react';
import { applyLegacyVersions } from '../lib/supabase/legacyWriteBatch';
import { buildLegacySyncPayload } from '../lib/supabase/syncPayload';
import { ERPState, AppConfiguration, Project, Task, Comment, UserAbsence, User, Client, Equipment, Ticket } from '../lib/types';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { mapStateToUUIDs, fetchAuditLogsFromSupabase, logAuditEventToSupabase } from '../lib/supabaseSync';
import { getDefaultTaskStatusId, matchTaskStatusId } from '../lib/utils';
import { getAuthHeaders, getClientUser, clearClientSession } from '../lib/clientAuth';
import { apiCreateTask, apiUpdateTask, apiDeleteTask, parseTaskHoursToFloat } from '../lib/taskOperations';

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
            
            // Try fetching audit logs
            if (isSupabaseConfigured) {
              fetchAuditLogsFromSupabase(100).then(res => {
                if (res.success && res.data) {
                  setState(prev => prev ? { ...prev, auditLogs: res.data } : null);
                }
              }).catch(() => {});
            }

            setState(mapped);
            setSyncStatus('synced');
            setSyncError(null);
            setIsInitialDataLoaded(true);
            console.log('Authoritative data loaded from Supabase SQL database');
            return true;
          } else {
            // Database is connected but empty/unseeded. Initialize with clean baseline
            const freshState = mapStateToUUIDs(CLEAN_BASELINE_STATE);
            const initRes = await fetch('/api/supabase/sync', {
              method: 'POST',
              headers,
              body: JSON.stringify(freshState),
            });
            const initJson = await initRes.json().catch(() => ({}));
            if (initRes.ok && initJson.success) {
              setState(freshState);
              setSyncStatus('synced');
              setSyncError(null);
              setIsInitialDataLoaded(true);
              return true;
            } else {
              setSyncStatus('error');
              setSyncError(initJson.message || 'Erro ao inicializar tabelas na base de dados.');
              setIsInitialDataLoaded(false);
              return false;
            }
          }
        } else {
          setSyncStatus('error');
          setSyncError(syncResult.message || 'Erro retornado pela base de dados.');
          setIsInitialDataLoaded(false);
          return false;
        }
      } else {
        const errJson = await syncRes.json().catch(() => ({}));
        const msg = errJson.message || `Erro do servidor ao contactar a base de dados (Status: ${syncRes.status}).`;
        if (syncRes.status === 401) {
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
      const msg = err?.message || 'Erro de rede ao contactar a base de dados.';
      setSyncStatus('error');
      setSyncError(msg);
      setIsInitialDataLoaded(false);
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

  // ==================== PROJECTS CRUD ====================
  const addProject = async (project: Omit<Project, 'id' | 'deleted' | 'createdDate' | 'updatedDate'>) => {
    const now = new Date().toISOString();

    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada.';
      setSyncStatus('error');
      setSyncError(msg);
      throw new Error(msg);
    }

    const apiPayload = {
      title: project.title,
      clientId: project.clientId || undefined,
      installProjectNo: project.installProjectNo || undefined,
      sfOpportunityNo: (project as any).sfOpportunityNo || undefined,
      description: project.description || '',
      statusId: project.statusId || undefined,
      categoryId: project.categoryId || undefined,
      categoryIds: project.categoryIds || (project.categoryId ? [project.categoryId] : []),
      priorityId: project.priorityId || undefined,
      riskId: project.riskId || undefined,
      projectManagerId: project.projectManagerId || undefined,
      fieldManagerId: project.fieldManagerId || undefined,
      salesRepId: project.salesRepId || undefined,
      teamsInvolvedIds: project.teamsInvolvedIds || [],
      partnersIds: project.partnersIds || [],
      startDate: project.startDate || undefined,
      deliveryDate: project.deliveryDate || undefined,
      estimatedDate: project.estimatedDate || undefined,
      scheduledDate: project.scheduledDate || undefined,
      forecastDate: project.forecastDate || undefined,
      completedDate: (project as any).completedDate || undefined,
      budgetValue: Number(project.budgetValue || 0),
      isUrgent: Boolean((project as any).isUrgent),
      demo: Boolean(project.demo),
      documents: project.documents || [],
      clientContactName: project.clientContactName || '',
      clientContactEmail: project.clientContactEmail || '',
      clientContactPhone: project.clientContactPhone || '',
      color: (project as any).color || undefined,
      notes: (project as any).notes || undefined,
    };

    try {
      setSyncStatus('syncing');
      setSyncError(null);
      const headers = getAuthHeaders();
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify(apiPayload),
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success && result.data) {
        const newProj: Project = {
          ...project,
          id: result.data.id,
          title: result.data.title || project.title,
          clientId: result.data.clientId || project.clientId,
          statusId: result.data.statusId || project.statusId,
          categoryId: result.data.categoryId || project.categoryId,
          categoryIds: result.data.categoryIds || project.categoryIds || [],
          priorityId: result.data.priorityId || project.priorityId,
          riskId: result.data.riskId || project.riskId,
          projectManagerId: result.data.projectManagerId || project.projectManagerId,
          fieldManagerId: result.data.fieldManagerId || project.fieldManagerId,
          salesRepId: result.data.salesRepId || project.salesRepId,
          teamsInvolvedIds: result.data.teamsInvolvedIds || project.teamsInvolvedIds || [],
          partnersIds: result.data.partnersIds || project.partnersIds || [],
          budgetValue: Number(result.data.budgetValue ?? project.budgetValue ?? 0),
          deleted: false,
          createdDate: result.data.createdAt || now,
          updatedDate: result.data.updatedAt || now,
          version: result.data.version || 1,
        };

        logAudit('CREATE', 'PROJECT', newProj.id, newProj.title, `Criado o projeto "${newProj.title}" (Cód. Instalação: ${newProj.installProjectNo || 'N/A'})`);

        setState(prev => prev ? ({ ...prev, projects: [newProj, ...prev.projects] }) : prev);
        await refreshFromDatabase();

        setSyncStatus('synced');
        return newProj;
      } else {
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a criação do projeto (${res.status}).`);
        console.error('Erro na criação do projeto:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        alert(`Erro ao criar projeto: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção na criação do projeto:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de projetos.';
      setSyncStatus('error');
      setSyncError(errMsg);
      alert(`Erro de comunicação: ${errMsg}`);
      throw err;
    }
  };

  const updateProject = async (id: string, updates: Partial<Omit<Project, 'id' | 'createdDate'>>) => {
    const now = new Date().toISOString();

    const existingProj = state?.projects?.find(p => p.id === id);
    if (!existingProj) {
      throw new Error(`Projeto ${id} não encontrado localmente.`);
    }

    const currentVersion = (existingProj as any).version || 1;
    const projName = updates.title || existingProj.title || id;

    const patchPayload: Record<string, any> = {
      version: currentVersion
    };

    if (updates.title !== undefined) patchPayload.title = updates.title;
    if (updates.clientId !== undefined) patchPayload.clientId = updates.clientId;
    if (updates.description !== undefined) patchPayload.description = updates.description;
    if ((updates as any).installProjectNo !== undefined) patchPayload.installProjectNo = (updates as any).installProjectNo;
    if ((updates as any).sfOpportunityNo !== undefined) patchPayload.sfOpportunityNo = (updates as any).sfOpportunityNo;
    if (updates.statusId !== undefined) patchPayload.statusId = updates.statusId;
    if (updates.categoryId !== undefined) patchPayload.categoryId = updates.categoryId;
    if (updates.categoryIds !== undefined) patchPayload.categoryIds = updates.categoryIds;
    if (updates.priorityId !== undefined) patchPayload.priorityId = updates.priorityId;
    if (updates.riskId !== undefined) patchPayload.riskId = updates.riskId;
    if (updates.projectManagerId !== undefined) patchPayload.projectManagerId = updates.projectManagerId;
    if (updates.fieldManagerId !== undefined) patchPayload.fieldManagerId = updates.fieldManagerId;
    if (updates.salesRepId !== undefined) patchPayload.salesRepId = updates.salesRepId;
    if (updates.teamsInvolvedIds !== undefined) patchPayload.teamsInvolvedIds = updates.teamsInvolvedIds;
    if (updates.partnersIds !== undefined) patchPayload.partnersIds = updates.partnersIds;
    if (updates.startDate !== undefined) patchPayload.startDate = updates.startDate;
    if (updates.deliveryDate !== undefined) patchPayload.deliveryDate = updates.deliveryDate;
    if (updates.estimatedDate !== undefined) patchPayload.estimatedDate = updates.estimatedDate;
    if (updates.scheduledDate !== undefined) patchPayload.scheduledDate = updates.scheduledDate;
    if (updates.forecastDate !== undefined) patchPayload.forecastDate = updates.forecastDate;
    if ((updates as any).completedDate !== undefined) patchPayload.completedDate = (updates as any).completedDate;
    if (updates.budgetValue !== undefined) patchPayload.budgetValue = Number(updates.budgetValue || 0);
    if ((updates as any).isUrgent !== undefined) patchPayload.isUrgent = (updates as any).isUrgent;
    if (updates.demo !== undefined) patchPayload.demo = updates.demo;
    if (updates.documents !== undefined) patchPayload.documents = updates.documents;
    if (updates.clientContactName !== undefined) patchPayload.clientContactName = updates.clientContactName;
    if (updates.clientContactEmail !== undefined) patchPayload.clientContactEmail = updates.clientContactEmail;
    if (updates.clientContactPhone !== undefined) patchPayload.clientContactPhone = updates.clientContactPhone;
    if ((updates as any).color !== undefined) patchPayload.color = (updates as any).color;
    if ((updates as any).notes !== undefined) patchPayload.notes = (updates as any).notes;

    try {
      setSyncStatus('syncing');
      setSyncError(null);
      const headers = getAuthHeaders();
      const res = await fetch(`/api/v1/projects/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patchPayload),
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      let finalRes = res;
      let finalResult = result;

      if (res.status === 409) {
        const serverVersion = (result.details?.currentVersion ?? result.error?.details?.currentVersion) ?? (
          typeof result.error?.message === 'string' && result.error.message.match(/versão atual:\s*(\d+)/i)
            ? parseInt(result.error.message.match(/versão atual:\s*(\d+)/i)![1], 10)
            : undefined
        );
        if (typeof serverVersion === 'number') {
          const retryRes = await fetch(`/api/v1/projects/${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ ...patchPayload, version: serverVersion }),
          });
          const retryResult = await retryRes.json().catch(() => ({ success: false }));
          if (retryRes.ok && retryResult.success && retryResult.data) {
            finalRes = retryRes;
            finalResult = retryResult;
          } else {
            setState(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                projects: prev.projects.map(p => p.id === id ? { ...p, version: serverVersion } : p),
              };
            });
          }
        }
      }

      if (finalRes.status === 409) {
        const errMsg = getApiErrorMessage(finalResult, 'Conflito de concorrência ao atualizar projeto. O projeto foi alterado por outro utilizador.');
        alert(errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        throw new Error(errMsg);
      }

      if (finalRes.ok && finalResult.success && finalResult.data) {
        const nextVersion = finalResult.data.version || (currentVersion + 1);

        let detailMsg = `Atualizado projeto "${projName}"`;
        if (updates.title && existingProj && updates.title !== existingProj.title) {
          detailMsg = `Nome do projeto alterado de "${existingProj.title}" para "${updates.title}"`;
        } else if (updates.statusId && existingProj && updates.statusId !== existingProj.statusId) {
          const oldStatus = state?.projectStatuses?.find(s => s.id === existingProj.statusId)?.name || existingProj.statusId;
          const newStatus = state?.projectStatuses?.find(s => s.id === updates.statusId)?.name || updates.statusId;
          detailMsg = `Estado do projeto "${projName}" alterado de "${oldStatus}" para "${newStatus}"`;
        }

        logAudit('UPDATE', 'PROJECT', id, projName, detailMsg);

        setState(prev => {
          if (!prev) return prev;
          const serverProj = finalResult.data;
          const updatedProj: Project = {
            id: serverProj.id || id,
            title: serverProj.title || '',
            clientId: serverProj.clientId || '',
            description: serverProj.description || '',
            installProjectNo: serverProj.installProjectNo || '',
            sfOpportunityNo: serverProj.sfOpportunityNo || '',
            statusId: serverProj.statusId || '',
            categoryId: serverProj.categoryId || (Array.isArray(serverProj.categoryIds) && serverProj.categoryIds[0]) || '',
            categoryIds: Array.isArray(serverProj.categoryIds) ? serverProj.categoryIds : [],
            priorityId: serverProj.priorityId || '',
            riskId: serverProj.riskId || '',
            projectManagerId: serverProj.projectManagerId || '',
            fieldManagerId: serverProj.fieldManagerId || '',
            salesRepId: serverProj.salesRepId || '',
            teamsInvolvedIds: Array.isArray(serverProj.teamsInvolvedIds) ? serverProj.teamsInvolvedIds : [],
            partnersIds: Array.isArray(serverProj.partnersIds) ? serverProj.partnersIds : [],
            startDate: serverProj.startDate || '',
            deliveryDate: serverProj.deliveryDate || '',
            estimatedDate: serverProj.estimatedDate || '',
            scheduledDate: serverProj.scheduledDate || '',
            forecastDate: serverProj.forecastDate || '',
            budgetValue: typeof serverProj.budgetValue === 'number' ? serverProj.budgetValue : 0,
            demo: Boolean(serverProj.demo),
            documents: Array.isArray(serverProj.documents) ? serverProj.documents : [],
            clientContactName: serverProj.clientContactName || '',
            clientContactEmail: serverProj.clientContactEmail || '',
            clientContactPhone: serverProj.clientContactPhone || '',
            createdById: serverProj.createdBy || serverProj.createdById || '',
            deleted: Boolean(serverProj.deleted),
            createdDate: serverProj.createdAt || serverProj.createdDate || '',
            updatedDate: serverProj.updatedAt || serverProj.updatedDate || now,
            version: typeof serverProj.version === 'number' ? serverProj.version : nextVersion,
          };

          let newProjects = prev.projects.map(p => {
            if (p.id === id) {
              return updatedProj;
            }
            return p;
          });
          let newTasks = prev.tasks;
          let newNotifs = prev.notifications || [];

          return {
            ...prev,
            projects: newProjects,
            tasks: newTasks,
            notifications: newNotifs
          };
        });

        if (updates.statusId && updates.statusId !== existingProj.statusId && state?.automationRules?.some(r => r.enabled && !r.deleted && r.triggerType === 'project_status_changed')) {
          await refreshFromDatabase();
        } else {
          setSyncStatus('synced');
        }
        return true;
      } else {
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a alteração do projeto (${res.status}).`);
        console.error('Erro na atualização do projeto:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        alert(`Erro ao atualizar projeto: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção na atualização do projeto:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de projetos.';
      setSyncStatus('error');
      setSyncError(errMsg);
      alert(`Erro de comunicação: ${errMsg}`);
      throw err;
    }
  };

  const deleteProject = async (id: string) => {
    const existingProj = state?.projects?.find(p => p.id === id);
    if (!existingProj) return;

    try {
      setSyncStatus('syncing');
      setSyncError(null);
      const headers = getAuthHeaders();
      const res = await fetch(`/api/v1/projects/${id}`, {
        method: 'DELETE',
        headers,
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success) {
        logAudit('DELETE', 'PROJECT', id, existingProj?.title, `Eliminado projeto "${existingProj?.title || id}"`);
        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            projects: prev.projects.map(p => p.id === id ? { ...p, deleted: true } : p)
          };
        });
        setSyncStatus('synced');
        return true;
      } else {
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a eliminação do projeto (${res.status}).`);
        console.error('Erro ao eliminar projeto:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        alert(`Erro ao eliminar projeto: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção ao eliminar projeto:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de projetos.';
      setSyncStatus('error');
      setSyncError(errMsg);
      alert(`Erro de comunicação: ${errMsg}`);
      throw err;
    }
  };

  // ==================== TASKS CRUD ====================
  const parseHoursToFloat = (hoursStr: any): number => {
    return parseTaskHoursToFloat(hoursStr);
  };

  const addTask = async (task: Omit<Task, 'id' | 'deleted' | 'createdDate'>) => {
    const now = new Date().toISOString();

    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada.';
      setSyncStatus('error');
      setSyncError(msg);
      throw new Error(msg);
    }

    const resolvedStatusId = (() => {
      if (task.statusId && task.statusId !== 'ts-1') {
        const match = (state?.taskStatuses || []).find(s => s.id === task.statusId || matchTaskStatusId(s.id, task.statusId));
        if (match) return match.id;
        return task.statusId;
      }
      return getDefaultTaskStatusId(state?.taskStatuses || []);
    })();

    try {
      setSyncStatus('syncing');
      setSyncError(null);

      const opResult = await apiCreateTask({
        projectId: task.projectId,
        title: task.title,
        description: task.description || '',
        statusId: resolvedStatusId,
        taskTypeId: task.taskTypeId || undefined,
        priorityId: task.priorityId || null,
        estimatedHours: task.estimatedHours,
        actualHours: task.actualHours,
        startDate: task.startDate || undefined,
        startTime: task.startTime || undefined,
        endDate: task.endDate || undefined,
        endTime: task.endTime || undefined,
        estimatedDate: task.estimatedDate || undefined,
        notes: task.notes || undefined,
        assigneeIds: task.assigneeIds || [],
      });

      if (opResult.success && opResult.data) {
        const newTask: Task = opResult.data;

        logAudit('CREATE', 'TASK', newTask.id, newTask.title, `Criada a tarefa "${newTask.title}"`);

        setState(prev => {
          if (!prev) return prev;
          let newTasks = [newTask, ...prev.tasks];
          let newProjects = prev.projects;
          let newNotifs = prev.notifications || [];

          return {
            ...prev,
            tasks: newTasks,
            projects: newProjects,
            notifications: newNotifs
          };
        });
        await refreshFromDatabase();

        setSyncStatus('synced');
        return newTask;
      } else {
        const errMsg = opResult.error || `A base de dados rejeitou a criação da tarefa.`;
        console.error('Erro na criação da tarefa:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        if (opResult.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message: errMsg } }));
          }
        }
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção na criação da tarefa:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de tarefas.';
      setSyncStatus('error');
      setSyncError(errMsg);
      throw err;
    }
  };

  const addTasks = async (tasksList: Omit<Task, 'id' | 'deleted' | 'createdDate'>[]) => {
    const results: Task[] = [];
    for (const t of tasksList) {
      const created = await addTask(t);
      results.push(created);
    }
    return results;
  };

  const updateTask = async (id: string, updates: Partial<Omit<Task, 'id' | 'createdDate'>>) => {
    const now = new Date().toISOString();

    const existingTask = state?.tasks?.find(t => t.id === id);
    if (!existingTask) {
      throw new Error(`Tarefa ${id} não encontrada localmente.`);
    }

    const currentVersion = (existingTask as any).version || 1;
    const taskTitle = updates.title || existingTask.title || id;

    try {
      setSyncStatus('syncing');
      setSyncError(null);

      const opResult = await apiUpdateTask(id, {
        version: currentVersion,
        projectId: updates.projectId,
        title: updates.title,
        description: updates.description,
        statusId: updates.statusId,
        taskTypeId: updates.taskTypeId,
        priorityId: updates.priorityId,
        estimatedHours: updates.estimatedHours,
        actualHours: updates.actualHours,
        startDate: updates.startDate,
        startTime: updates.startTime,
        endDate: updates.endDate,
        endTime: updates.endTime,
        estimatedDate: updates.estimatedDate,
        completedDate: updates.completedDate,
        notes: updates.notes,
        assigneeIds: updates.assigneeIds,
      });

      if (opResult.status === 409 || !opResult.success || !opResult.data) {
        const errMsg = opResult.error || 'Conflito de concorrência ou erro ao atualizar tarefa.';
        setSyncStatus('error');
        setSyncError(errMsg);
        if (opResult.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message: errMsg } }));
          }
        }
        throw new Error(errMsg);
      }

      const updatedTask = opResult.data;
      const nextVersion = updatedTask.version || (currentVersion + 1);

      let detailMsg = `Atualizada tarefa "${taskTitle}"`;
      if (updates.statusId && updates.statusId !== existingTask.statusId) {
        const oldStatus = state?.taskStatuses?.find(s => s.id === existingTask.statusId || matchTaskStatusId(s.id, existingTask.statusId))?.name || existingTask.statusId;
        const newStatus = state?.taskStatuses?.find(s => s.id === updates.statusId || matchTaskStatusId(s.id, updates.statusId))?.name || updates.statusId;
        detailMsg = `Estado da tarefa "${taskTitle}" alterado de "${oldStatus}" para "${newStatus}"`;
      } else if (updates.title && updates.title !== existingTask.title) {
        detailMsg = `Título da tarefa alterado de "${existingTask.title}" para "${updates.title}"`;
      }
      logAudit('UPDATE', 'TASK', id, taskTitle, detailMsg);

      setState(prev => {
        if (!prev) return prev;
        const targetTask = prev.tasks.find(t => t.id === id);
        let newTasks = prev.tasks.map(t => {
          if (t.id === id) {
            return updatedTask;
          }
          return t;
        });
        let newProjects = prev.projects;
        let newNotifs = prev.notifications || [];

        return {
          ...prev,
          tasks: newTasks,
          projects: newProjects,
          notifications: newNotifs
        };
      });
      await refreshFromDatabase();

      setSyncStatus('synced');
      return true;
    } catch (err: any) {
      console.error('Exceção na atualização da tarefa:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de tarefas.';
      setSyncStatus('error');
      setSyncError(errMsg);
      throw err;
    }
  };

  const deleteTask = async (id: string) => {
    const existingTask = state?.tasks?.find(t => t.id === id);
    if (!existingTask) return;

    try {
      setSyncStatus('syncing');
      setSyncError(null);

      const opResult = await apiDeleteTask(id);

      if (opResult.success) {
        logAudit('DELETE', 'TASK', id, existingTask?.title, `Eliminada a tarefa "${existingTask?.title || id}"`);
        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map(t => t.id === id ? { ...t, deleted: true } : t)
          };
        });
        setSyncStatus('synced');
        return true;
      } else {
        const errMsg = opResult.error || `A base de dados rejeitou a eliminação da tarefa.`;
        console.error('Erro ao eliminar tarefa:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        if (opResult.status === 401) {
          clearClientSession();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp_auth_session_expired', { detail: { message: errMsg } }));
          }
        }
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção ao eliminar tarefa:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de tarefas.';
      setSyncStatus('error');
      setSyncError(errMsg);
      throw err;
    }
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
  const addAbsence = (absence: Omit<UserAbsence, 'id' | 'createdDate'>) => {
    const newAbsence: UserAbsence = {
      ...absence,
      id: crypto.randomUUID(),
      createdDate: new Date().toISOString()
    };
    saveState(prev => ({
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

  // ==================== CLIENTS CRUD (FASE 33: DEDICATED API) ====================
  const addClient = async (clientData: Omit<Client, 'id' | 'deleted' | 'createdDate'> | any) => {
    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada.';
      setSyncStatus('error');
      setSyncError(msg);
      throw new Error(msg);
    }

    try {
      setSyncStatus('syncing');
      setSyncError(null);

      const clientName = (clientData.clientName || clientData.name || '').trim();
      const shortName = (clientData.shortName || clientData.code || '').trim();
      const location = (clientData.location || clientData.address || '').trim();
      const taxId = (clientData.taxId || '').trim();
      const contactPerson = (clientData.contactPerson || '').trim();
      const contactEmail = (clientData.contactEmail || clientData.email || '').trim();
      const contactPhone = (clientData.contactPhone || clientData.phone || '').trim();
      const notes = (clientData.notes || '').trim();
      const color = clientData.color || '#3b82f6';

      const payload: Record<string, any> = {
        clientName,
        shortName,
        location,
        taxId,
        contactPerson,
        contactEmail,
        contactPhone,
        notes,
        color,
      };

      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/v1/clients', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success && result.data) {
        const s = result.data;
        const newClient: Client = {
          id: s.id,
          clientName: s.clientName || '',
          shortName: s.shortName || '',
          location: s.location || '',
          taxId: s.taxId || '',
          contactPerson: s.contactPerson || '',
          contactEmail: s.contactEmail || '',
          contactPhone: s.contactPhone || '',
          notes: s.notes || '',
          deleted: Boolean(s.deleted),
          createdDate: s.createdDate || s.createdAt || '',
          version: s.version || 1,
        };

        logAudit('CREATE', 'CLIENT', newClient.id, newClient.clientName, `Criado cliente "${newClient.clientName}"`);

        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            clients: [newClient, ...(prev.clients || [])]
          };
        });

        setSyncStatus('synced');
        return newClient;
      } else {
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a criação do cliente (${res.status}).`);
        console.error('Erro na criação do cliente:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        alert(`Erro ao criar cliente: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção na criação do cliente:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de clientes.';
      setSyncStatus('error');
      setSyncError(errMsg);
      alert(`Erro de comunicação: ${errMsg}`);
      throw err;
    }
  };

  const updateClient = async (id: string, updates: Partial<Omit<Client, 'id' | 'createdDate'>> | any) => {
    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada.';
      setSyncStatus('error');
      setSyncError(msg);
      throw new Error(msg);
    }

    try {
      setSyncStatus('syncing');
      setSyncError(null);

      const existingClient = state?.clients?.find(c => matchId(c.id, id));
      const currentVersion = existingClient?.version || 1;

      const payload: Record<string, any> = {
        version: currentVersion,
      };

      if (updates.clientName !== undefined || updates.name !== undefined) {
        payload.clientName = (updates.clientName || updates.name || '').trim();
      }
      if (updates.shortName !== undefined || updates.code !== undefined) {
        payload.shortName = (updates.shortName || updates.code || '').trim();
      }
      if (updates.location !== undefined || updates.address !== undefined) {
        payload.location = (updates.location || updates.address || '').trim();
      }
      if (updates.taxId !== undefined) {
        payload.taxId = (updates.taxId || '').trim();
      }
      if (updates.contactPerson !== undefined) {
        payload.contactPerson = (updates.contactPerson || '').trim();
      }
      if (updates.contactEmail !== undefined || updates.email !== undefined) {
        payload.contactEmail = (updates.contactEmail || updates.email || '').trim();
      }
      if (updates.contactPhone !== undefined || updates.phone !== undefined) {
        payload.contactPhone = (updates.contactPhone || updates.phone || '').trim();
      }
      if (updates.notes !== undefined) {
        payload.notes = (updates.notes || '').trim();
      }
      if (updates.color !== undefined) {
        payload.color = updates.color;
      }

      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/v1/clients/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success && result.data) {
        const s = result.data;
        const updatedClient: Client = {
          id: s.id,
          clientName: s.clientName || '',
          shortName: s.shortName || '',
          location: s.location || '',
          taxId: s.taxId || '',
          contactPerson: s.contactPerson || '',
          contactEmail: s.contactEmail || '',
          contactPhone: s.contactPhone || '',
          notes: s.notes || '',
          deleted: Boolean(s.deleted),
          createdDate: s.createdDate || s.createdAt || '',
          version: s.version,
        };

        logAudit('UPDATE', 'CLIENT', id, updatedClient.clientName, `Atualizado cliente "${updatedClient.clientName}"`);

        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            clients: (prev.clients || []).map(c => matchId(c.id, id) ? updatedClient : c)
          };
        });

        setSyncStatus('synced');
        return updatedClient;
      } else {
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a alteração do cliente (${res.status}).`);
        console.error('Erro na atualização do cliente:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        alert(`Erro ao atualizar cliente: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção na atualização do cliente:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de clientes.';
      setSyncStatus('error');
      setSyncError(errMsg);
      alert(`Erro de comunicação: ${errMsg}`);
      throw err;
    }
  };

  const deleteClient = async (id: string) => {
    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada.';
      setSyncStatus('error');
      setSyncError(msg);
      throw new Error(msg);
    }

    try {
      setSyncStatus('syncing');
      setSyncError(null);

      const existingClient = state?.clients?.find(c => matchId(c.id, id));
      const headers = getAuthHeaders();
      const res = await fetch(`/api/v1/clients/${id}`, {
        method: 'DELETE',
        headers,
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success) {
        logAudit('DELETE', 'CLIENT', id, existingClient?.clientName, `Eliminado cliente "${existingClient?.clientName || id}"`);

        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            clients: (prev.clients || []).map(c => matchId(c.id, id) ? { ...c, deleted: true } : c)
          };
        });

        setSyncStatus('synced');
        return true;
      } else {
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a eliminação do cliente (${res.status}).`);
        console.error('Erro ao eliminar cliente:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        alert(`Erro ao eliminar cliente: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção ao eliminar cliente:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de clientes.';
      setSyncStatus('error');
      setSyncError(errMsg);
      alert(`Erro de comunicação: ${errMsg}`);
      throw err;
    }
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
  const updateConfig = (updates: Record<string, any>) => {
    return saveState(prev => ({
      ...prev,
      appConfig: { ...prev.appConfig, ...updates }
    }));
  };

  // ==================== AUX TABLES CRUD ====================
  type AuxTableName = 'projectStatuses' | 'projectCategories' | 'projectRisks' | 'projectPriorities' | 'projectTeams' | 'projectPartners' | 'userGroups' | 'taskStatuses' | 'taskTypes' | 'riskCategories' | 'riskStatuses' | 'riskPriorities' | 'ticketStatuses';

  const addAuxRecord = (tableName: AuxTableName, name: string, extra?: { scale?: number }) => {
    const isUUIDTable = ['taskTypes', 'taskStatuses', 'userGroups', 'ticketStatuses', 'projectCategories', 'projectStatuses', 'projectRisks', 'projectPriorities', 'projectTeams', 'projectPartners', 'riskCategories', 'riskStatuses', 'riskPriorities'].includes(tableName);
    const prefix = tableName === 'taskTypes' ? 'tt' : tableName === 'taskStatuses' ? 'ts' : tableName === 'ticketStatuses' ? 'tks' : tableName.slice(0, 3);
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
  const addSpecialDay = (date: string, name: string) => {
    saveState(prev => ({
      ...prev,
      specialDays: [...(prev.specialDays || []), { id: genId('sd'), date, name }]
    }));
  };

  const deleteSpecialDay = (id: string) => deleteSyncedEntity('specialDays', id);

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


  // ==================== TICKETS & SUPORTE (FASE 32: DEDICATED API) ====================
  const addTicket = async (
    ticketData: Omit<Ticket, 'id' | 'ticketNumber' | 'createdDate' | 'updatedDate'>
  ) => {
    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada.';
      setSyncStatus('error');
      setSyncError(msg);
      throw new Error(msg);
    }

    try {
      setSyncStatus('syncing');
      setSyncError(null);
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/v1/tickets', {
        method: 'POST',
        headers,
        body: JSON.stringify(ticketData),
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success && result.data) {
        const newTicket: Ticket = result.data;
        logAudit('CREATE', 'TICKET', newTicket.id, newTicket.title, `Criado o ticket "${newTicket.ticketNumber || newTicket.title}"`);

        setState(prev => {
          if (!prev) return prev;
          let newNotifs = prev.notifications || [];
          if (newTicket.assignedToId && newTicket.source !== 'email' && newTicket.source !== 'teams' && newTicket.source !== 'portal') {
            newNotifs = [{
              id: genId('notif'),
              userId: newTicket.assignedToId,
              title: `Novo Ticket Atribuído: ${newTicket.ticketNumber}`,
              message: `Foi-lhe atribuído o ticket ${newTicket.ticketNumber}: "${newTicket.title}".`,
              isRead: false,
              createdDate: new Date().toISOString(),
              linkUrl: `?tab=tickets&ticketId=${newTicket.id}`
            }, ...newNotifs];
          }
          return {
            ...prev,
            tickets: [newTicket, ...(prev.tickets || [])],
            notifications: newNotifs
          };
        });

        setSyncStatus('synced');
        return newTicket;
      } else {
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a criação do ticket (${res.status}).`);
        console.error('Erro na criação do ticket:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        alert(`Erro ao criar ticket: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção na criação do ticket:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de tickets.';
      setSyncStatus('error');
      setSyncError(errMsg);
      alert(`Erro de comunicação: ${errMsg}`);
      throw err;
    }
  };

  const updateTicket = async (id: string, updates: Partial<Ticket>) => {
    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada.';
      setSyncStatus('error');
      setSyncError(msg);
      throw new Error(msg);
    }

    try {
      setSyncStatus('syncing');
      setSyncError(null);
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/v1/tickets/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...updates, syncVersion: state?.tickets?.find(ticket => ticket.id === id)?.syncVersion }),
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success && result.data) {
        const updatedTicket: Ticket = result.data;
        const ticketName = updatedTicket.ticketNumber || updatedTicket.title || id;
        logAudit('UPDATE', 'TICKET', id, ticketName, `Atualizado o ticket "${ticketName}"`);

        setState(prev => {
          if (!prev) return prev;
          let newNotifs = prev.notifications || [];
          const existing = (prev.tickets || []).find(t => t.id === id);

          if (updates.assignedToId && existing && updates.assignedToId !== existing.assignedToId) {
            newNotifs = [{
              id: genId('notif'),
              userId: updates.assignedToId,
              title: `Ticket Atribuído: ${updatedTicket.ticketNumber || id}`,
              message: `Foi-lhe atribuído o ticket ${updatedTicket.ticketNumber || id}: "${updatedTicket.title}".`,
              isRead: false,
              createdDate: new Date().toISOString(),
              linkUrl: `?tab=tickets&ticketId=${id}`
            }, ...newNotifs];
          }

          return {
            ...prev,
            tickets: (prev.tickets || []).map(t => t.id === id ? updatedTicket : t),
            notifications: newNotifs
          };
        });

        setSyncStatus('synced');
        return updatedTicket;
      } else {
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a alteração do ticket (${res.status}).`);
        console.error('Erro na atualização do ticket:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        alert(`Erro ao atualizar ticket: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção na atualização do ticket:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de tickets.';
      setSyncStatus('error');
      setSyncError(errMsg);
      alert(`Erro de comunicação: ${errMsg}`);
      throw err;
    }
  };

  const deleteTicket = async (id: string) => {
    if (!isDbConfigured) {
      const msg = 'Gravação bloqueada: A base de dados não está configurada.';
      setSyncStatus('error');
      setSyncError(msg);
      throw new Error(msg);
    }

    try {
      setSyncStatus('syncing');
      setSyncError(null);
      const headers = getAuthHeaders();
      const res = await fetch(`/api/v1/tickets/${id}`, {
        method: 'DELETE',
        headers,
      });

      const result = await res.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (res.ok && result.success) {
        logAudit('DELETE', 'TICKET', id, id, `Eliminado o ticket "${id}"`);
        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            tickets: (prev.tickets || []).filter(t => t.id !== id)
          };
        });

        setSyncStatus('synced');
        return true;
      } else {
        const errMsg = getApiErrorMessage(result, `A base de dados rejeitou a eliminação do ticket (${res.status}).`);
        console.error('Erro ao eliminar ticket:', errMsg);
        setSyncStatus('error');
        setSyncError(errMsg);
        alert(`Erro ao eliminar ticket: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('Exceção ao eliminar ticket:', err);
      const errMsg = err?.message || 'Falha de comunicação com a API de tickets.';
      setSyncStatus('error');
      setSyncError(errMsg);
      alert(`Erro de comunicação: ${errMsg}`);
      throw err;
    }
  };

  const validateAndApproveTicket = async (
    ticketId: string, 
    validation: { 
      clientId?: string; 
      assignedToId?: string; 
      priority?: string; 
      category?: string; 
      taskTypeId?: string; 
      validationNotes?: string; 
    }
  ) => {
    return updateTicket(ticketId, {
      status: 'aberto',
      clientId: validation.clientId,
      assignedToId: validation.assignedToId,
      priority: validation.priority,
      category: validation.category,
      taskTypeId: validation.taskTypeId,
      validationNotes: validation.validationNotes,
    });
  };

  const convertTicketToTask = async (
    ticketId: string,
    taskData: {
      projectId: string;
      title: string;
      description?: string;
      assigneeIds: string[];
      estimatedDate?: string;
      estimatedHours?: string;
      taskTypeId?: string;
      statusId?: string;
      notes?: string;
    }
  ) => {
    const defaultStatus = state?.taskStatuses?.find(s => !s.deleted)?.id || 'ts-1';
    // 1. Create task using authoritative addTask (/api/v1/tasks)
    const createdTask = await addTask({
      projectId: taskData.projectId,
      title: taskData.title,
      description: taskData.description || '',
      statusId: taskData.statusId || defaultStatus,
      assigneeIds: taskData.assigneeIds || [],
      estimatedDate: taskData.estimatedDate || '',
      estimatedHours: taskData.estimatedHours || '',
      actualHours: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      notes: taskData.notes || '',
      taskTypeId: taskData.taskTypeId,
    });

    // 2. Update ticket using authoritative updateTicket (/api/v1/tickets/:id)
    await updateTicket(ticketId, {
      status: 'convertido',
      convertedTaskId: createdTask.id,
      convertedProjectId: taskData.projectId,
    });

    return createdTask.id;
  };

  const resolveTicketDirectly = async (ticketId: string, resolutionNotes: string) => {
    return updateTicket(ticketId, {
      status: 'resolvido',
      resolutionNotes,
      resolvedDate: new Date().toISOString(),
    });
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
    
    addEquipment,
    updateEquipment,
    deleteEquipment,

    // Tickets
    addTicket,
    updateTicket,
    deleteTicket,
    validateAndApproveTicket,
    convertTicketToTask,
    resolveTicketDirectly,
    
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
    refreshFromDatabase,
    saveState,

  };
}
