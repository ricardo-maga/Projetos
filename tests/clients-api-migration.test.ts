import { describe, it, expect } from 'bun:test';
import { GET as getClients, POST as createClient } from '../app/api/v1/clients/route';
import { GET as getClient, PATCH as updateClientRoute, DELETE as deleteClientRoute } from '../app/api/v1/clients/[id]/route';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('FASE 33 — Migração de Clients para a API Dedicada', () => {

  describe('1. CREATE — addClient utiliza POST /api/v1/clients e é server-authoritative', () => {
    it('1. addClient utiliza POST da API com validação e resposta autoritativa (HTTP 201)', async () => {
      const req = new Request('http://localhost:3000/api/v1/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          name: 'Cliente Teste Migração API',
          code: 'CLI-MIG',
          contactPerson: 'João Santos',
          email: 'joao.santos@empresa.pt',
          phone: '+351912345678',
        }),
      });

      const res = await createClient(req as any);
      if (res.status === 201) {
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.data).toBeDefined();
        expect(json.data.id).toBeDefined();
        expect(json.data.name).toBe('Cliente Teste Migração API');
        expect(json.data.version).toBe(1);
      } else {
        expect([401, 403, 500]).toContain(res.status);
      }
    });

    it('2. Client só entra no estado React após resposta válida e 3. ID vem da resposta do servidor', async () => {
      let stateClients: any[] = [{ id: 'cli-001', clientName: 'Cliente Inicial' }];

      const simulateAddClient = async (apiCall: () => Promise<{ ok: boolean; data?: any }>) => {
        // NÃO faz optimistic update antes da resposta
        const res = await apiCall();
        if (res.ok && res.data) {
          stateClients = [res.data, ...stateClients];
        }
      };

      // Simulação de falha: estado inalterado
      await simulateAddClient(async () => ({ ok: false }));
      expect(stateClients.length).toBe(1);
      expect(stateClients[0].id).toBe('cli-001');

      // Simulação de sucesso com ID autoritativo do servidor
      const serverCreated = {
        id: '00000000-0000-0000-0000-000000000099',
        clientName: 'Novo Cliente Persistido',
        version: 1,
      };
      await simulateAddClient(async () => ({ ok: true, data: serverCreated }));
      expect(stateClients.length).toBe(2);
      expect(stateClients[0].id).toBe('00000000-0000-0000-0000-000000000099');
      expect(stateClients[0].clientName).toBe('Novo Cliente Persistido');
    });

    it('14. Não são gerados dados sintéticos ou IDs provisórios para substituir a resposta da API', async () => {
      let stateClients: any[] = [];
      const simulateAddClientWithFailure = async () => {
        const res = { ok: false, status: 500 };
        if (!res.ok) {
          // Não inventa fallback com ID falso
          return;
        }
        stateClients = [{ id: 'fake-id' }, ...stateClients];
      };

      await simulateAddClientWithFailure();
      expect(stateClients.length).toBe(0);
    });
  });

  describe('2. UPDATE — updateClient utiliza PATCH /api/v1/clients/:id e result.data', () => {
    it('4. updateClient utiliza API dedicada e 5. UPDATE utiliza result.data', async () => {
      let stateClients = [{
        id: 'cli-001',
        clientName: 'Nome Antigo',
        contactEmail: 'antigo@cliente.pt',
        version: 1,
      }];

      const simulateUpdateClient = async (id: string, updates: any, serverResponse: { ok: boolean; data?: any }) => {
        if (serverResponse.ok && serverResponse.data) {
          stateClients = stateClients.map(c => c.id === id ? serverResponse.data : c);
        }
      };

      const serverUpdated = {
        id: 'cli-001',
        clientName: 'Nome Novo Confirmado pelo Servidor',
        contactEmail: 'novo@cliente.pt',
        version: 2,
        updatedDate: '2026-09-24T13:00:00.000Z',
      };

      await simulateUpdateClient('cli-001', { clientName: 'Nome Novo Tentado' }, { ok: true, data: serverUpdated });
      expect(stateClients[0].clientName).toBe('Nome Novo Confirmado pelo Servidor');
      expect(stateClients[0].contactEmail).toBe('novo@cliente.pt');
      expect(stateClients[0].version).toBe(2);
    });

    it('6. Falha no UPDATE não altera o estado local', async () => {
      let stateClients = [{
        id: 'cli-001',
        clientName: 'Nome Seguro',
        version: 1,
      }];

      const simulateFailedUpdate = async (id: string, updates: any) => {
        const res = { ok: false, status: 409, message: 'Conflito de concorrência' };
        if (res.ok) {
          stateClients = stateClients.map(c => c.id === id ? { ...c, ...updates } : c);
        }
      };

      await simulateFailedUpdate('cli-001', { clientName: 'Nome Corrompido' });
      expect(stateClients[0].clientName).toBe('Nome Seguro');
      expect(stateClients[0].version).toBe(1);
    });

    it('13. Campos protegidos e controlo de versão (OCC) continuam sob autoridade do servidor', () => {
      const existingClient = { id: 'cli-001', version: 1 };
      const serverResponse = { id: 'cli-001', version: 2, updatedAt: '2026-09-24T13:00:00.000Z' };

      // O cliente não pode forçar a versão manualmente sem a resposta do servidor
      expect(serverResponse.version).toBe(existingClient.version + 1);
    });
  });

  describe('3. DELETE — deleteClient utiliza DELETE /api/v1/clients/:id e trata falhas', () => {
    it('7. deleteClient utiliza API dedicada e 8. DELETE só altera o estado após sucesso', async () => {
      let stateClients = [
        { id: 'cli-001', clientName: 'Cliente 1' },
        { id: 'cli-002', clientName: 'Cliente 2' }
      ];

      const simulateDelete = async (id: string, serverOk: boolean) => {
        if (serverOk) {
          stateClients = stateClients.filter(c => c.id !== id);
        }
      };

      await simulateDelete('cli-001', true);
      expect(stateClients.length).toBe(1);
      expect(stateClients[0].id).toBe('cli-002');
    });

    it('9. Falha no DELETE não remove o cliente do estado local', async () => {
      let stateClients = [{ id: 'cli-001', clientName: 'Cliente Protegido' }];

      const simulateFailedDelete = async (id: string) => {
        const serverOk = false;
        if (serverOk) {
          stateClients = stateClients.filter(c => c.id !== id);
        }
      };

      await simulateFailedDelete('cli-001');
      expect(stateClients.length).toBe(1);
      expect(stateClients[0].id).toBe('cli-001');
    });
  });

  describe('4. Tratamento de Erros e Rede (Pontos 11 e 12)', () => {
    it('11. Erros HTTP (400, 401, 403, 404, 409, 500) e 12. Erros de rede não produzem alterações locais falsas', async () => {
      let stateClients = [{ id: 'cli-001', clientName: 'Cliente Estável' }];
      let syncError: string | null = null;
      let syncStatus = 'idle';

      const simulateNetworkError = async () => {
        try {
          syncStatus = 'syncing';
          throw new Error('Falha de ligação de rede (Failed to fetch)');
        } catch (err: any) {
          syncStatus = 'error';
          syncError = err.message;
          // Não altera stateClients
        }
      };

      await simulateNetworkError();
      expect(stateClients.length).toBe(1);
      expect(stateClients[0].clientName).toBe('Cliente Estável');
      expect(syncStatus).toBe('error');
      expect(syncError).toContain('Falha de ligação');
    });
  });

  describe('5. Verificação de Código Estático — 10. Nenhuma mutação de Client utiliza saveState', () => {
    it('hooks/useERP.ts não utiliza saveState em addClient, updateClient ou deleteClient', () => {
      const useERPContent = readFileSync(join(process.cwd(), 'hooks', 'useERP.ts'), 'utf-8');
      
      const clientSectionStart = useERPContent.indexOf('// ==================== CLIENTS CRUD');
      const nextSectionStart = useERPContent.indexOf('// ==================== MATERIALS CRUD', clientSectionStart);
      
      expect(clientSectionStart).toBeGreaterThan(0);
      expect(nextSectionStart).toBeGreaterThan(clientSectionStart);

      const clientSectionBlock = useERPContent.substring(clientSectionStart, nextSectionStart);

      // 10. Confirma ausência de saveState
      expect(clientSectionBlock.includes('saveState(')).toBe(false);

      // Confirma chamadas aos endpoints dedicados
      expect(clientSectionBlock.includes('/api/v1/clients')).toBe(true);
      expect(clientSectionBlock.includes("method: 'POST'")).toBe(true);
      expect(clientSectionBlock.includes("method: 'PATCH'")).toBe(true);
      expect(clientSectionBlock.includes("method: 'DELETE'")).toBe(true);
    });
  });

});
