import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { GET as getProjects, POST as createProject } from '../app/api/v1/projects/route';
import { GET as getProject, PATCH as updateProject, DELETE as deleteProject } from '../app/api/v1/projects/[id]/route';
import { GET as getTasks, POST as createTask } from '../app/api/v1/tasks/route';
import { GET as getTask, PATCH as updateTask, DELETE as deleteTask } from '../app/api/v1/tasks/[id]/route';
import * as authModule from '../lib/auth/authorization';
import * as serverDbModule from '../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const mockAuthenticatedUser: authModule.AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000099',
  email: 'gestor@empresa.pt',
  name: 'Gestor Projetos',
  roleId: 'ug-1',
  isAdmin: true,
  isSuperAdmin: true,
  approved: true,
};

const validUUID1 = 'a0000000-0000-0000-0000-000000000001';
const validUUID2 = 'b0000000-0000-0000-0000-000000000002';
const validUUID3 = 'c0000000-0000-0000-0000-000000000003';
const validUUID4 = 'd0000000-0000-0000-0000-000000000004';
const validUUID5 = 'e0000000-0000-0000-0000-000000000005';

describe('FASE 28 — Integridade Operacional de Projects & Tasks', () => {
  let authSpy: any;
  let serverDbSpy: any;
  let mockDbData: any;

  beforeEach(() => {
    mockDbData = {
      clients: [
        { id: validUUID1, client_name: 'Cliente Alfa', deleted: false },
        { id: validUUID2, client_name: 'Cliente Eliminado', deleted: true },
      ],
      project_status: [
        { id: validUUID3, name: 'Em Execução', deleted: false, sort_order: 1 },
      ],
      project_category: [
        { id: validUUID4, name: 'AVAC', deleted: false, sort_order: 1 },
      ],
      project_priority: [
        { id: 'prio-1', name: 'Média', deleted: false, sort_order: 1 },
      ],
      users: [
        { id: mockAuthenticatedUser.id, name: 'Gestor', deleted: false },
        { id: validUUID5, name: 'Técnico Ativo', deleted: false },
        { id: 'u-deleted-999', name: 'Técnico Inativo', deleted: true },
      ],
      projects: [
        {
          id: 'proj-ativo-1',
          project_title: 'Instalação Solar Hospital',
          client_id: validUUID1,
          status_id: validUUID3,
          category_id: validUUID4,
          deleted: false,
          version: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'proj-eliminado-1',
          project_title: 'Projeto Antigo Eliminado',
          client_id: validUUID1,
          deleted: true,
          version: 1,
        },
      ],
      tasks: [
        {
          id: 'task-ativa-1',
          project_id: 'proj-ativo-1',
          task_title: 'Montagem de Painéis',
          task_description: 'Instalar estruturas na cobertura',
          status_id: 'ts-1',
          estimated_hours: '8 hours',
          deleted: false,
          version: 1,
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 'task-eliminada-1',
          project_id: 'proj-ativo-1',
          task_title: 'Tarefa Removida',
          deleted: true,
          version: 1,
        },
      ],
      task_assignees: [
        { task_id: 'task-ativa-1', user_id: validUUID5 },
      ],
      quotes: [],
      project_materials: [],
      planning_allocations: [],
      project_teams_link: [],
      project_partners_link: [],
      project_category_link: [],
      project_risk_link: [],
      project_priority_link: [],
    };

    authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
      return { success: true, user: mockAuthenticatedUser, requestId: 'req-proj-task-test' };
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
          if (!mockDbData[table]) mockDbData[table] = [];
          mockDbData[table].push(...rows);
          return { error: null };
        },
        update: (payload: any) => {
          return {
            eq: (col: string, val: any) => {
              const chain: any = {
                eq: (col2: string, val2: any) => {
                  const item = (mockDbData[table] || []).find((r: any) => r[col] === val && r[col2] === val2);
                  if (item) Object.assign(item, payload);
                  return Promise.resolve({ error: null });
                },
                then: (cb: any) => {
                  const item = (mockDbData[table] || []).find((r: any) => r[col] === val);
                  if (item) Object.assign(item, payload);
                  return Promise.resolve({ error: null }).then(cb);
                },
              };
              return chain;
            },
          };
        },
        delete: () => {
          return {
            eq: (col: string, val: any) => {
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
  });

  afterEach(() => {
    authSpy?.mockRestore();
    serverDbSpy?.mockRestore();
  });

  describe('1. Projects — Validação & OCC & Dependências', () => {
    it('1. Cria Project válido com dados e referências ativas (201)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Novo Chiller Bloco B',
          clientId: validUUID1,
          statusId: validUUID3,
          categoryId: validUUID4,
          budgetValue: 125000,
        }),
      });

      const res = await createProject(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Novo Chiller Bloco B');
    });

    it('2. Rejeita relação de cliente inexistente ou eliminado (400)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Projeto Inválido',
          clientId: validUUID2, // Cliente eliminado
        }),
      });

      const res = await createProject(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('Cliente');
    });

    it('3. Atualiza Project existente com sucesso (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Instalação Solar Hospital - Fase 2',
          version: 1,
        }),
      });

      const res = await updateProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.title).toBe('Instalação Solar Hospital - Fase 2');
    });

    it('4. OCC correto — incrementa versão após atualização', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Título Atualizado OCC', version: 1 }),
      });

      const res = await updateProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(200);
      expect((await res.json()).data.version).toBe(2);
    });

    it('5. OCC incorreto — bloqueia atualização e retorna 409 Conflict', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Título Conflituoso', version: 99 }),
      });

      const res = await updateProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('Conflito de concorrência');
    });

    it('6. Bloqueia eliminação de Project com tarefas ativas associadas (409 Conflict)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'DELETE',
      });

      const res = await deleteProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('tarefa(s) ativa(s)');
    });

    it('7. Elimina Project sem dependências ativas com soft delete (200)', async () => {
      // Remove a tarefa ativa para deixar o projeto sem dependências
      mockDbData.tasks = [];

      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'DELETE',
      });

      const res = await deleteProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(200);
      expect(mockDbData.projects.find((p: any) => p.id === 'proj-ativo-1').deleted).toBe(true);
    });
  });

  describe('2. Tasks — Integridade de Vínculos & Operações', () => {
    it('8. Cria Task associada a Project ativo (201)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'proj-ativo-1',
          title: 'Ligação de Cabos Principais',
          description: 'Passagem de cabos de 50mm2',
          estimatedHours: 4,
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.title).toBe('Ligação de Cabos Principais');
    });

    it('9. Rejeita criação de Task associada a Project inexistente (400 Bad Request)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'proj-inexistente-999',
          title: 'Tarefa Órfã',
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('projeto');
    });

    it('10. Rejeita criação de Task associada a Project eliminado (400 Bad Request)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'proj-eliminado-1',
          title: 'Tarefa em Projeto Eliminado',
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(400);
    });

    it('11. Rejeita atribuição de utilizador inexistente ou inativo à Task (400 Bad Request)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'proj-ativo-1',
          title: 'Tarefa com Utilizador Inexistente',
          assignedUserIds: ['u-deleted-999'],
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('utilizadores responsáveis');
    });

    it('12. Rejeita GET individual de Task eliminada (404 Not Found)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-eliminada-1', {
        method: 'GET',
      });

      const res = await getTask(req, { params: Promise.resolve({ id: 'task-eliminada-1' }) });
      expect(res.status).toBe(404);
    });

    it('13. Elimina Task com soft delete (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-ativa-1', {
        method: 'DELETE',
      });

      const res = await deleteTask(req, { params: Promise.resolve({ id: 'task-ativa-1' }) });
      expect(res.status).toBe(200);
      expect(mockDbData.tasks.find((t: any) => t.id === 'task-ativa-1').deleted).toBe(true);
    });
  });

  describe('3. Segurança & Permissões', () => {
    it('14. Retorna 401 Unauthorized para pedido não autenticado', async () => {
      authSpy.mockImplementation(async () => ({
        success: false,
        response: NextResponse.json({ success: false, message: 'Não autenticado' }, { status: 401 }),
      }));

      const req = new NextRequest('http://localhost:3000/api/v1/projects', { method: 'GET' });
      const res = await getProjects(req);
      expect(res.status).toBe(401);
    });

    it('15. Retorna 403 Forbidden para utilizador sem permissão exigida', async () => {
      authSpy.mockImplementation(async () => ({
        success: false,
        response: NextResponse.json({ success: false, message: 'Sem permissão' }, { status: 403 }),
      }));

      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', { method: 'DELETE' });
      const res = await deleteProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(403);
    });
  });
});
