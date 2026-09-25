import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { POST as createTask } from '../app/api/v1/tasks/route';
import { POST as createMaterial } from '../app/api/v1/project-materials/route';
import { POST as createTicket } from '../app/api/v1/tickets/route';
import { GET as getProject } from '../app/api/v1/projects/[id]/route';
import { GET as getTask } from '../app/api/v1/tasks/[id]/route';
import { GET as getClient } from '../app/api/v1/clients/[id]/route';
import * as authModule from '../lib/auth/authorization';
import * as serverDbModule from '../lib/supabase/server';
import * as syncModule from '../lib/supabaseSync';
import { NextRequest } from 'next/server';

const mockUser: authModule.AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000099',
  email: 'admin@empresa.pt',
  name: 'Administrador',
  roleId: 'ug-1',
  isAdmin: true,
  isSuperAdmin: true,
  approved: true,
};

describe('FASE 25-B — Auditoria e Correção BOLA/IDOR (Resource Authorization & Reference Validation)', () => {
  let authSpy: any;
  let permSpy: any;
  let serverDbSpy: any;
  let syncSpy: any;

  beforeEach(() => {
    authSpy = spyOn(authModule, 'requireAuth').mockResolvedValue({
      success: true,
      user: mockUser,
      requestId: 'test-req-id',
    });
    permSpy = spyOn(authModule, 'requirePermission').mockResolvedValue({
      success: true,
      user: mockUser,
      requestId: 'test-req-id',
    });

    syncSpy = spyOn(syncModule, 'getActiveStateFromSupabase').mockResolvedValue({
      success: true,
      data: {
        projects: [],
        clients: [],
        tasks: [],
        projectMaterials: [],
        tickets: [],
      } as any,
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

    const mockClient: any = {
      from: (table: string) => ({
        select: (cols?: string) => createChain([]),
        insert: async (rows: any[]) => ({ error: null }),
        update: () => ({ eq: () => ({ then: (cb: any) => Promise.resolve({ error: null }).then(cb) }) }),
        delete: () => ({ eq: () => ({ then: (cb: any) => Promise.resolve({ error: null }).then(cb) }) }),
      }),
    };

    serverDbSpy = spyOn(serverDbModule, 'getServerDbClient').mockResolvedValue(mockClient);
  });

  afterEach(() => {
    if (authSpy) authSpy.mockRestore();
    if (permSpy) permSpy.mockRestore();
    if (serverDbSpy) serverDbSpy.mockRestore();
    if (syncSpy) syncSpy.mockRestore();
  });

  describe('Teste A: Rejeição de referências diretas a recursos inexistentes/eliminados em Tasks', () => {
    it('bloqueia criação de tarefas associadas a projectId inexistente/eliminado com HTTP 400', async () => {
      const nonExistentProjectId = '00000000-0000-4000-a000-000000000999';
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user-id': 'u-test-user',
        },
        body: JSON.stringify({
          projectId: nonExistentProjectId,
          title: 'Nova Tarefa com Projeto Inválido',
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success === false || !!json.error).toBe(true);
      const msg = json.message || json.error?.message || '';
      expect(msg.toLowerCase()).toContain('projeto');
    });
  });

  describe('Teste B: Rejeição de referências diretas em Project Materials', () => {
    it('devolve HTTP 404 ao tentar criar material para projeto inexistente', async () => {
      const nonExistentProjectId = '00000000-0000-4000-a000-000000000999';
      const req = new NextRequest('http://localhost:3000/api/v1/project-materials', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          projectId: nonExistentProjectId,
          description: 'Cabo Elétrico 3x2.5mm',
          supplier: 'Fornecedor Teste',
        }),
      });

      const res = await createMaterial(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success === false || !!json.error).toBe(true);
      const msg = json.message || json.error?.message || '';
      expect(msg.toLowerCase()).toContain('projeto');
    });
  });

  describe('Teste C: Rejeição de referências diretas em Tickets', () => {
    it('devolve HTTP 400 ao associar cliente ou responsável inexistente/eliminado', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Ticket Teste BOLA/IDOR',
          clientId: 'client-invalido-999',
        }),
      });

      const res = await createTicket(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success === false || !!json.error).toBe(true);
      const msg = json.message || json.error?.message || '';
      expect(msg.toLowerCase()).toContain('cliente');
    });
  });

  describe('Teste D: Consulta por ID de recursos inexistentes', () => {
    it('devolve HTTP 404 para projeto inexistente', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects/non-existent-id', {
        method: 'GET',
      });

      const res = await getProject(req, { params: Promise.resolve({ id: 'non-existent-id' }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success === false || !!json.error).toBe(true);
    });

    it('devolve HTTP 404 para tarefa inexistente', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/non-existent-id', {
        method: 'GET',
      });

      const res = await getTask(req, { params: Promise.resolve({ id: 'non-existent-id' }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success === false || !!json.error).toBe(true);
    });

    it('devolve HTTP 404 para cliente inexistente', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/clients/non-existent-id', {
        method: 'GET',
      });

      const res = await getClient(req, { params: Promise.resolve({ id: 'non-existent-id' }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success === false || !!json.error).toBe(true);
    });
  });
});
