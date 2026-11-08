import type { Dispatch, SetStateAction } from 'react';
import type { Client, ERPState } from '@/lib/types';
import { getAuthHeaders } from '@/lib/clientAuth';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface ClientActionContext {
  isDbConfigured: boolean;
  state: ERPState | null;
  setState: Dispatch<SetStateAction<ERPState | null>>;
  setSyncStatus: Dispatch<SetStateAction<SyncStatus>>;
  setSyncError: Dispatch<SetStateAction<string | null>>;
  matchId: (left?: string | null, right?: string | null) => boolean;
  logAudit: (action: string, entityType: string, entityId?: string, entityName?: string, details?: string) => unknown;
  getApiErrorMessage: (result: any, fallback: string) => string;
}

export function createClientActions({
  isDbConfigured, state, setState, setSyncStatus, setSyncError, matchId, logAudit, getApiErrorMessage,
}: ClientActionContext) {
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

  return { addClient, updateClient, deleteClient };
}
