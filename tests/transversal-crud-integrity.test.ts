import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { POST as createTask } from '../app/api/v1/tasks/route';
import { DELETE as deleteTask } from '../app/api/v1/tasks/[id]/route';
import { DELETE as deleteClient } from '../app/api/v1/clients/[id]/route';
import { POST as createTicket } from '../app/api/v1/tickets/route';
import { PATCH as updateTicket } from '../app/api/v1/tickets/[id]/route';
import { DELETE as deletePlanningAllocation } from '../app/api/v1/planning-allocations/[id]/route';
import * as authModule from '../lib/auth/authorization';
import * as serverDbModule from '../lib/supabase/server';
import * as supabaseSyncModule from '../lib/supabaseSync';
import { NextRequest } from 'next/server';

const mockAuthenticatedUser: authModule.AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000099',
  email: 'admin@empresa.pt',
  name: 'Administrador',
  roleId: 'ug-1',
  isAdmin: true,
  isSuperAdmin: true,
  approved: true,
};

const validUUIDClient = 'a0000000-0000-0000-0000-000000000001';
const validUUIDProject = 'b0000000-0000-0000-0000-000000000002';
const validUUIDUser = 'c0000000-0000-0000-0000-000000000003';

describe('FASE 27 — Integridade CRUD Transversal', () => {
  let authSpy: any;
  let serverDbSpy: any;
  let syncGetSpy: any;
  let syncSaveSpy: any;
  let mockDbData: any;
  let mockTableErrors: Record<string, any>;

  beforeEach(() => {
    mockTableErrors = {};

    mockDbData = {
      clients: [
        { id: validUUIDClient, client_name: 'Cliente Importante', deleted: false, version: 1 },
      ],
      projects: [
        {
          id: validUUIDProject,
          project_title: 'Projeto Industrial Ativo',
          client_id: validUUIDClient,
          deleted: false,
          version: 1,
        },
      ],
      users: [
        { id: mockAuthenticatedUser.id, name: 'Admin', deleted: false, approved: true },
        { id: validUUIDUser, name: 'Técnico Especialista', deleted: false, approved: true },
      ],
      tasks: [
        {
          id: 'task-alloc-1',
          project_id: validUUIDProject,
          task_title: 'Instalação Elétrica',
          status_id: 'ts-1',
          deleted: false,
          version: 1,
        },
      ],
      task_assignees: [],
      planning_allocations: [
        {
          id: 'alloc-confirmed-1',
          task_id: 'task-alloc-1',
          resource_id: validUUIDUser,
          date: '2026-09-30',
          start_time: '09:00',
          end_time: '13:00',
          status: 'CONFIRMED',
          version: 1,
        },
      ],
    };

    authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
      return { success: true, user: mockAuthenticatedUser, requestId: 'req-fase-27' };
    });

    const createChain = (items: any[]) => {
      const obj: any = {
        data: items,
        error: null,
        eq: (col2: string, val2: any) => createChain(items.filter((r) => r[col2] === val2)),
        in: (col2: string, vals: any[]) => createChain(items.filter((r) => vals.includes(r[col2]))),
        order: () => obj,
        limit: (n: number) => createChain(items.slice(0, n)),
        maybeSingle: async () => ({ data: items[0] || null, error: null }),
        single: async () => ({ data: items[0] || null, error: null }),
        range: async () => ({ data: items, count: items.length, error: null }),
        then: (cb: any) => Promise.resolve({ data: items, error: null, count: items.length }).then(cb),
      };
      return obj;
    };

    const buildMockQuery = (table: string) => {
      const allRows = mockDbData[table] || [];
      return {
        select: (cols?: string, opts?: any) => {
          const chain = createChain(allRows);
          chain.eq = (col: string, val: any) => createChain(allRows.filter((r: any) => r[col] === val));
          chain.in = (col: string, vals: any[]) => createChain(allRows.filter((r: any) => vals.includes(r[col])));
          return chain;
        },
        insert: async (rows: any[]) => {
          if (mockTableErrors[table]) {
            return { error: { message: mockTableErrors[table] } };
          }
          if (!mockDbData[table]) mockDbData[table] = [];
          mockDbData[table].push(...rows);
          return { error: null };
        },
        update: (payload: any) => {
          const filters: Record<string, any> = {};
          const updateObj: any = {
            eq: (col: string, val: any) => {
              filters[col] = val;
              return updateObj;
            },
            select: async (cols?: string) => {
              const matchedItems = (mockDbData[table] || []).filter((r: any) => {
                for (const [k, v] of Object.entries(filters)) {
                  if (r[k] !== v) return false;
                }
                return true;
              });
              for (const item of matchedItems) {
                Object.assign(item, payload);
              }
              return { data: matchedItems.map((item: any) => ({ id: item.id })), error: null };
            },
            then: (cb: any) => {
              const matchedItems = (mockDbData[table] || []).filter((r: any) => {
                for (const [k, v] of Object.entries(filters)) {
                  if (r[k] !== v) return false;
                }
                return true;
              });
              for (const item of matchedItems) {
                Object.assign(item, payload);
              }
              return Promise.resolve({ data: matchedItems, error: null }).then(cb);
            },
          };
          return updateObj;
        },
        delete: () => {
          return {
            eq: (col: string, val: any) => {
              if (mockTableErrors[table]) {
                return Promise.resolve({ error: { message: mockTableErrors[table] } });
              }
              mockDbData[table] = (mockDbData[table] || []).filter((r: any) => r[col] !== val);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    };

    serverDbSpy = spyOn(serverDbModule, 'getServerDbClient').mockImplementation(async () => {
      return {
        from: (table: string) => buildMockQuery(table),
      } as any;
    });

    syncGetSpy = spyOn(supabaseSyncModule, 'getActiveStateFromSupabase').mockImplementation(async () => {
      return {
        success: true,
        data: {
          clients: mockDbData.clients,
          projects: mockDbData.projects,
          users: mockDbData.users,
          tickets: [
            {
              id: 'tck-1',
              ticketNumber: 'TCK-2026-001',
              title: 'Ticket Teste',
              status: 'aberto',
              clientId: validUUIDClient,
              deleted: false,
              createdDate: '2026-01-01T00:00:00.000Z',
              updatedDate: '2026-01-01T00:00:00.000Z',
            },
          ],
          notifications: [],
        } as any,
      };
    });

    syncSaveSpy = spyOn(supabaseSyncModule, 'saveActiveStateToSupabase').mockImplementation(async (state: any) => {
      return { success: true };
    });
  });

  afterEach(() => {
    authSpy?.mockRestore();
    serverDbSpy?.mockRestore();
    syncGetSpy?.mockRestore();
    syncSaveSpy?.mockRestore();
  });

  describe('1. Tasks — Rollback na Inserção de Relações e Proteção de Dependências', () => {
    it('Se inserção de task_assignees falhar, a tarefa criada é limpa e a API devolve erro 500 (sem criação parcial)', async () => {
      mockTableErrors.task_assignees = 'Falha de rede ao associar responsáveis';

      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: validUUIDProject,
          title: 'Tarefa com Falha em Assignees',
          assignedUserIds: [validUUIDUser],
        }),
      });

      const res = await createTask(req);
      expect(res.status).not.toBe(201);
      expect(res.status).toBe(500);

      // Garante que a tarefa não ficou criada/orfã na base de dados
      const createdTask = mockDbData.tasks.find((t: any) => t.task_title === 'Tarefa com Falha em Assignees');
      expect(createdTask).toBeUndefined();
    });

    it('Bloqueia eliminação de Task com alocações de planeamento ativas (409 Conflict)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-alloc-1', {
        method: 'DELETE',
      });

      const res = await deleteTask(req, { params: Promise.resolve({ id: 'task-alloc-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('alocação(ões) de planeamento ativa(s)');
      // Garante que a tarefa não foi eliminada
      expect(mockDbData.tasks.find((t: any) => t.id === 'task-alloc-1').deleted).toBe(false);
    });

    it('Permite eliminação de Task quando as alocações associadas foram canceladas ou não existem (200)', async () => {
      // Cancelar a alocação existente
      mockDbData.planning_allocations[0].status = 'CANCELLED';

      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-alloc-1', {
        method: 'DELETE',
      });

      const res = await deleteTask(req, { params: Promise.resolve({ id: 'task-alloc-1' }) });
      expect(res.status).toBe(200);
      expect(mockDbData.tasks.find((t: any) => t.id === 'task-alloc-1').deleted).toBe(true);
    });
  });

  describe('2. Clients — Proteção de Dependências no DELETE', () => {
    it('Bloqueia eliminação de Client com projetos ativos associados (409 Conflict)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/clients/${validUUIDClient}`, {
        method: 'DELETE',
      });

      const res = await deleteClient(req, { params: Promise.resolve({ id: validUUIDClient }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('projeto(s) ativo(s) associado(s)');
      expect(mockDbData.clients.find((c: any) => c.id === validUUIDClient).deleted).toBe(false);
    });

    it('Permite eliminação de Client quando todos os projetos associados estão eliminados ou inexistentes (200)', async () => {
      mockDbData.projects[0].deleted = true;

      const req = new NextRequest(`http://localhost:3000/api/v1/clients/${validUUIDClient}`, {
        method: 'DELETE',
      });

      const res = await deleteClient(req, { params: Promise.resolve({ id: validUUIDClient }) });
      expect(res.status).toBe(200);
      expect(mockDbData.clients.find((c: any) => c.id === validUUIDClient).deleted).toBe(true);
    });
  });

  describe('3. Tickets — Validação Relacional e Não-Exposição de Sucesso Falso', () => {
    it('Rejeita criação de Ticket associado a Cliente inexistente (400 Bad Request)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Ticket sem Cliente Válido',
          clientId: 'client-inexistente-999',
        }),
      });

      const res = await createTicket(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('cliente');
    });

    it('Se gravação de persistência de Ticket falhar, não devolve 200/201 (retorna 500)', async () => {
      syncSaveSpy.mockImplementation(async () => {
        return { success: false, message: 'Falha simulada ao persistir tickets na base de dados' };
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Ticket com Falha na Persistência',
        }),
      });

      const res = await createTicket(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  describe('4. Planning Allocations — Regras Estritas de Eliminação', () => {
    it('Impede DELETE de alocação de planeamento em estado CONFIRMED (400 Bad Request com CANNOT_DELETE_CONFIRMED)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/planning-allocations/alloc-confirmed-1', {
        method: 'DELETE',
      });

      const res = await deletePlanningAllocation(req, { params: Promise.resolve({ id: 'alloc-confirmed-1' }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('Alocações confirmadas não podem ser eliminadas');
    });
  });
});
