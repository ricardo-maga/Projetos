import type { Project } from '@/lib/types';
import { getAuthHeaders } from '@/lib/clientAuth';
import type { Dispatch, SetStateAction } from 'react';
import type { ERPState } from '@/lib/types';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface ActionContext {
  isDbConfigured: boolean;
  state: ERPState | null;
  setState: Dispatch<SetStateAction<ERPState | null>>;
  setSyncStatus: Dispatch<SetStateAction<SyncStatus>>;
  setSyncError: Dispatch<SetStateAction<string | null>>;
  logAudit: (action: string, entityType: string, entityId?: string, entityName?: string, details?: string) => unknown;
  refreshFromDatabase: () => Promise<boolean>;
  getApiErrorMessage: (result: any, fallback: string) => string;
}

export function createProjectActions({
  isDbConfigured, state, setState, setSyncStatus, setSyncError, logAudit, refreshFromDatabase, getApiErrorMessage,
}: ActionContext) {
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

        await refreshFromDatabase();
        setSyncStatus('synced');
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

  return { addProject, updateProject, deleteProject };
}
