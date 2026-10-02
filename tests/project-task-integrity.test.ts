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
const validUUIDTeam = 'f0000000-0000-0000-0000-000000000006';
const validUUIDPartner = 'f0000000-0000-0000-0000-000000000007';

describe('FASE 28-A — Integridade Operacional de Projects & Tasks', () => {
  let authSpy: any;
  let serverDbSpy: any;
  let mockDbData: any;
  let mockTableErrors: Record<string, any>;
  let onBeforeUpdateProjectsHook: (() => void) | null = null;
  let onBeforeUpdateTasksHook: (() => void) | null = null;

  beforeEach(() => {
    mockTableErrors = {};
    onBeforeUpdateProjectsHook = null;
    onBeforeUpdateTasksHook = null;

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
      project_teams: [
        { id: validUUIDTeam, name: 'Equipa Solar', deleted: false },
      ],
      project_partners: [
        { id: validUUIDPartner, name: 'Parceiro Instalador', deleted: false },
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
              if (table === 'projects' && onBeforeUpdateProjectsHook) {
                onBeforeUpdateProjectsHook();
              }
              if (table === 'tasks' && onBeforeUpdateTasksHook) {
                onBeforeUpdateTasksHook();
              }
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
              if (table === 'projects' && onBeforeUpdateProjectsHook) {
                onBeforeUpdateProjectsHook();
              }
              if (table === 'tasks' && onBeforeUpdateTasksHook) {
                onBeforeUpdateTasksHook();
              }
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
        rpc: async (fn: string, args: any) => {
          if (fn === 'create_project_transaction') {
            if (mockTableErrors['projects']) return { error: { message: mockTableErrors['projects'] } };
            if (mockTableErrors['project_teams_link'] && args.p_teams_involved_ids?.length > 0) return { error: { message: 'equipas: ' + mockTableErrors['project_teams_link'] } };
            if (mockTableErrors['project_partners_link'] && args.p_partners_ids?.length > 0) return { error: { message: 'parceiros: ' + mockTableErrors['project_partners_link'] } };
            if (mockTableErrors['project_category_link'] && args.p_category_ids?.length > 0) return { error: { message: 'categorias: ' + mockTableErrors['project_category_link'] } };

            const newProj = {
              id: args.p_id,
              demo: args.p_demo,
              client_id: args.p_client_id,
              project_title: args.p_project_title,
              project_description: args.p_project_description,
              status_id: args.p_status_id,
              category_id: args.p_category_ids?.[0] || null,
              project_manager_id: args.p_project_manager_id,
              field_manager_id: args.p_field_manager_id,
              sales_rep_id: args.p_sales_rep_id,
              start_date: args.p_start_date,
              delivery_date: args.p_delivery_date,
              estimated_date: args.p_estimated_date,
              scheduled_date: args.p_scheduled_date,
              install_project_no: args.p_install_project_no,
              sf_opportunity_no: args.p_sf_opportunity_no,
              documents: args.p_documents,
              budget_value: args.p_budget_value,
              client_contact_name: args.p_client_contact_name,
              client_contact_email: args.p_client_contact_email,
              client_contact_phone: args.p_client_contact_phone,
              color: args.p_color,
              notes: args.p_notes,
              created_by: args.p_created_by,
              is_urgent: args.p_is_urgent,
              deleted: false,
              version: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            mockDbData.projects.push(newProj);
            if (args.p_priority_id) mockDbData.project_priority_link.push({ project_id: args.p_id, priority_id: args.p_priority_id });
            if (args.p_risk_id) mockDbData.project_risk_link.push({ project_id: args.p_id, risk_id: args.p_risk_id });
            (args.p_category_ids || []).forEach((c: string) => mockDbData.project_category_link.push({ project_id: args.p_id, category_id: c }));
            (args.p_teams_involved_ids || []).forEach((t: string) => mockDbData.project_teams_link.push({ project_id: args.p_id, team_id: t }));
            (args.p_partners_ids || []).forEach((p: string) => mockDbData.project_partners_link.push({ project_id: args.p_id, partner_id: p }));
            return { data: args.p_id, error: null };
          }
          if (fn === 'update_project_transaction') {
            if (onBeforeUpdateProjectsHook) onBeforeUpdateProjectsHook();
            const proj = mockDbData.projects.find((p: any) => p.id === args.p_id);
            if (!proj) return { error: { message: 'Project not found' } };
            if (args.p_expected_version !== undefined && proj.version !== args.p_expected_version) {
              return { error: { code: 'P0001', message: `Concurrency conflict: current version is ${proj.version}, expected ${args.p_expected_version}` } };
            }
            if (mockTableErrors['project_teams_link'] && args.p_teams_involved_ids?.length > 0) return { error: { message: 'equipas: ' + mockTableErrors['project_teams_link'] } };
            if (mockTableErrors['project_partners_link'] && args.p_partners_ids?.length > 0) return { error: { message: 'parceiros: ' + mockTableErrors['project_partners_link'] } };
            if (mockTableErrors['project_category_link'] && args.p_category_ids?.length > 0) return { error: { message: 'categorias: ' + mockTableErrors['project_category_link'] } };

            proj.version = (proj.version || 1) + 1;
            proj.project_title = args.p_project_title;
            proj.project_description = args.p_project_description;
            proj.client_id = args.p_client_id;
            proj.status_id = args.p_status_id;
            proj.category_id = args.p_category_ids?.[0] || null;
            proj.updated_at = new Date().toISOString();

            if (args.p_priority_id !== undefined) {
              mockDbData.project_priority_link = mockDbData.project_priority_link.filter((l: any) => l.project_id !== args.p_id);
              if (args.p_priority_id) mockDbData.project_priority_link.push({ project_id: args.p_id, priority_id: args.p_priority_id });
            }
            if (args.p_risk_id !== undefined) {
              mockDbData.project_risk_link = mockDbData.project_risk_link.filter((l: any) => l.project_id !== args.p_id);
              if (args.p_risk_id) mockDbData.project_risk_link.push({ project_id: args.p_id, risk_id: args.p_risk_id });
            }
            if (args.p_category_ids !== undefined) {
              mockDbData.project_category_link = mockDbData.project_category_link.filter((l: any) => l.project_id !== args.p_id);
              args.p_category_ids.forEach((c: string) => mockDbData.project_category_link.push({ project_id: args.p_id, category_id: c }));
            }
            if (args.p_teams_involved_ids !== undefined) {
              mockDbData.project_teams_link = mockDbData.project_teams_link.filter((l: any) => l.project_id !== args.p_id);
              args.p_teams_involved_ids.forEach((t: string) => mockDbData.project_teams_link.push({ project_id: args.p_id, team_id: t }));
            }
            if (args.p_partners_ids !== undefined) {
              mockDbData.project_partners_link = mockDbData.project_partners_link.filter((l: any) => l.project_id !== args.p_id);
              args.p_partners_ids.forEach((p: string) => mockDbData.project_partners_link.push({ project_id: args.p_id, partner_id: p }));
            }
            return { data: proj.version, error: null };
          }
          if (fn === 'delete_project_transaction') {
            const proj = mockDbData.projects.find((p: any) => p.id === args.p_id);
            if (!proj) return { error: { code: 'P0002', message: 'Project not found' } };
            if (args.p_expected_version !== undefined && proj.version !== args.p_expected_version) {
              return { error: { code: 'P0001', message: `Concurrency conflict: current version is ${proj.version}, expected ${args.p_expected_version}` } };
            }
            proj.deleted = true;
            proj.version = (proj.version || 1) + 1;
            proj.updated_at = new Date().toISOString();
            proj.updated_by = args.p_updated_by || null;
            return { data: proj.version, error: null };
          }
          if (fn === 'create_task_atomic') {
            const newTask = {
              id: args.p_id,
              project_id: args.p_project_id,
              task_title: args.p_task_title,
              task_description: args.p_task_description,
              status_id: args.p_status_id || 'ts-1',
              task_type_id: args.p_task_type_id || null,
              estimated_hours: args.p_estimated_hours,
              actual_hours: args.p_actual_hours,
              start_date: args.p_start_date,
              start_time: args.p_start_time,
              end_date: args.p_end_date,
              end_time: args.p_end_time,
              estimated_date: args.p_estimated_date,
              completed_date: args.p_completed_date,
              notes: args.p_notes,
              is_milestone: args.p_is_milestone || false,
              deleted: false,
              version: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              created_by: args.p_created_by,
              updated_by: args.p_created_by,
            };
            mockDbData.tasks.push(newTask);
            (args.p_assignee_user_ids || []).forEach((uid: string) => {
              mockDbData.task_assignees.push({ task_id: args.p_id, user_id: uid });
            });
            return { data: newTask, error: null };
          }
          if (fn === 'update_task_atomic') {
            if (onBeforeUpdateTasksHook) onBeforeUpdateTasksHook();
            const task = mockDbData.tasks.find((t: any) => t.id === args.p_id);
            if (!task) return { error: { code: 'P0002', message: 'Tarefa não encontrada' } };
            if (args.p_expected_version !== undefined && args.p_expected_version !== null && task.version !== args.p_expected_version) {
              return { error: { code: 'P0001', message: `Conflito de concorrência: current version is ${task.version}, expected ${args.p_expected_version}` } };
            }
            task.version = (task.version || 1) + 1;
            if (args.p_update_project_id) task.project_id = args.p_project_id;
            if (args.p_task_title) task.task_title = args.p_task_title;
            if (args.p_status_id) task.status_id = args.p_status_id;
            if (args.p_task_type_id !== null && args.p_task_type_id !== undefined) task.task_type_id = args.p_task_type_id;
            if (args.p_estimated_hours) task.estimated_hours = args.p_estimated_hours;
            if (args.p_actual_hours) task.actual_hours = args.p_actual_hours;
            if (args.p_start_date) task.start_date = args.p_start_date;
            if (args.p_start_time) task.start_time = args.p_start_time;
            if (args.p_end_date) task.end_date = args.p_end_date;
            if (args.p_end_time) task.end_time = args.p_end_time;
            if (args.p_estimated_date) task.estimated_date = args.p_estimated_date;
            if (args.p_completed_date) task.completed_date = args.p_completed_date;
            if (args.p_task_description !== null && args.p_task_description !== undefined) task.task_description = args.p_task_description;
            if (args.p_notes !== null && args.p_notes !== undefined) task.notes = args.p_notes;
            if (args.p_is_milestone !== null && args.p_is_milestone !== undefined) task.is_milestone = args.p_is_milestone;
            task.updated_at = new Date().toISOString();

            if (args.p_update_assignees) {
              mockDbData.task_assignees = mockDbData.task_assignees.filter((a: any) => a.task_id !== args.p_id);
              (args.p_assignee_user_ids || []).forEach((uid: string) => {
                mockDbData.task_assignees.push({ task_id: args.p_id, user_id: uid });
              });
            }
            return { data: task, error: null };
          }
          if (fn === 'delete_task_atomic') {
            if (onBeforeUpdateTasksHook) onBeforeUpdateTasksHook();
            const task = mockDbData.tasks.find((t: any) => t.id === args.p_id);
            if (!task) return { error: { code: 'P0002', message: 'Tarefa não encontrada' } };
            if (args.p_expected_version !== undefined && args.p_expected_version !== null && task.version !== args.p_expected_version) {
              return { error: { code: 'P0001', message: `Conflito de concorrência: current version is ${task.version}, expected ${args.p_expected_version}` } };
            }
            task.deleted = true;
            task.version = (task.version || 1) + 1;
            task.updated_at = new Date().toISOString();
            return { data: task, error: null };
          }
          return { data: null, error: { message: `Unknown RPC function ${fn}` } };
        },
      } as any;
    });
  });

  afterEach(() => {
    authSpy?.mockRestore();
    serverDbSpy?.mockRestore();
  });

  describe('1. Projects — OCC Efetivo & Tratamento de Erros em Relações', () => {
    it('Cria Project válido com referências ativas (201)', async () => {
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

    it('UPDATE com versão correta → sucesso (200) e incrementa versão', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Instalação Solar Hospital - Atualizado',
          version: 1,
        }),
      });

      const res = await updateProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.version).toBe(2);
      expect(mockDbData.projects.find((p: any) => p.id === 'proj-ativo-1').version).toBe(2);
    });

    it('UPDATE com versão incorreta → 409 Conflict', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Tentativa Conflituosa',
          version: 99,
        }),
      });

      const res = await updateProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('Conflito de concorrência');
    });

    it('Simulação de conflito entre leitura e UPDATE → 409 Conflict', async () => {
      // Simula uma alteração concorrente que ocorre logo antes do UPDATE ser executado na BD
      onBeforeUpdateProjectsHook = () => {
        const proj = mockDbData.projects.find((p: any) => p.id === 'proj-ativo-1');
        if (proj) proj.version = 2; // Outro utilizador acabou de gravar a versão 2
      };

      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Título pós-leitura',
          version: 1,
        }),
      });

      const res = await updateProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('Conflito de concorrência');
    });

    it('Falha na atualização de project_teams_link não resulta em 200 (retorna erro)', async () => {
      mockTableErrors.project_teams_link = 'Falha simulada na base de dados de equipas';

      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          teamsInvolvedIds: [validUUIDTeam],
          version: 1,
        }),
      });

      const res = await updateProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).not.toBe(200);
      expect(res.status).toBe(400);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('equipas');
    });

    it('Falha na atualização de project_partners_link não resulta em 200 (retorna erro)', async () => {
      mockTableErrors.project_partners_link = 'Falha simulada na base de dados de parceiros';

      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          partnersIds: [validUUIDPartner],
          version: 1,
        }),
      });

      const res = await updateProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).not.toBe(200);
      expect(res.status).toBe(400);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('parceiros');
    });

    it('Falha na atualização de project_category_link não resulta em 200 (retorna erro)', async () => {
      mockTableErrors.project_category_link = 'Falha simulada na base de dados de categorias';

      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          categoryIds: [validUUID4],
          version: 1,
        }),
      });

      const res = await updateProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).not.toBe(200);
      expect(res.status).toBe(400);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('categorias');
    });

    it('Bloqueia eliminação de Project com tarefas ativas associadas (409 Conflict)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'DELETE',
      });

      const res = await deleteProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('tarefa(s) ativa(s)');
    });

    it('Elimina Project sem dependências ativas com soft delete (200)', async () => {
      mockDbData.tasks = [];

      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-ativo-1', {
        method: 'DELETE',
      });

      const res = await deleteProject(req, { params: Promise.resolve({ id: 'proj-ativo-1' }) });
      expect(res.status).toBe(200);
      expect(mockDbData.projects.find((p: any) => p.id === 'proj-ativo-1').deleted).toBe(true);
    });
  });

  describe('2. Tasks — Server-Authoritative & OCC no UPDATE e DELETE', () => {
    it('Cria Task associada a Project ativo (201)', async () => {
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

    it('UPDATE devolve o estado persistido pelo servidor (server-authoritative)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-ativa-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Montagem de Painéis - Fase Concluída',
          description: 'Nova descrição guardada na BD',
          version: 1,
        }),
      });

      const res = await updateTask(req, { params: Promise.resolve({ id: 'task-ativa-1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      // Confirma que os dados devolvidos refletem o registo lido do servidor
      expect(json.data.id).toBe('task-ativa-1');
      expect(json.data.title).toBe('Montagem de Painéis - Fase Concluída');
      expect(json.data.description).toBe('Nova descrição guardada na BD');
      expect(json.data.version).toBe(2);
      expect(json.data.assignedUserIds).toEqual([validUUID5]);
    });

    it('UPDATE de Task com versão incorreta → 409 Conflict', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-ativa-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Alteração Conflituosa',
          version: 99,
        }),
      });

      const res = await updateTask(req, { params: Promise.resolve({ id: 'task-ativa-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('Conflito de concorrência');
    });

    it('DELETE de Task com versão correta → sucesso (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-ativa-1', {
        method: 'DELETE',
      });

      const res = await deleteTask(req, { params: Promise.resolve({ id: 'task-ativa-1' }) });
      expect(res.status).toBe(200);
      const taskInDb = mockDbData.tasks.find((t: any) => t.id === 'task-ativa-1');
      expect(taskInDb.deleted).toBe(true);
      expect(taskInDb.version).toBe(2);
    });

    it('DELETE de Task com conflito de versão → 409 Conflict', async () => {
      // Simula alteração concorrente na BD na tarefa antes da execução da eliminação
      onBeforeUpdateTasksHook = () => {
        const task = mockDbData.tasks.find((t: any) => t.id === 'task-ativa-1');
        if (task) task.version = 99; // Outro processo alterou a tarefa entre a leitura e a escrita
      };

      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-ativa-1', {
        method: 'DELETE',
      });

      const res = await deleteTask(req, { params: Promise.resolve({ id: 'task-ativa-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.message || json.error?.message || '';
      expect(msg).toContain('Conflito de concorrência');
    });

    it('Rejeita GET individual de Task eliminada (404 Not Found)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-eliminada-1', {
        method: 'GET',
      });

      const res = await getTask(req, { params: Promise.resolve({ id: 'task-eliminada-1' }) });
      expect(res.status).toBe(404);
    });
  });

  describe('3. Segurança & Permissões', () => {
    it('Retorna 401 Unauthorized para pedido não autenticado', async () => {
      authSpy.mockImplementation(async () => ({
        success: false,
        response: NextResponse.json({ success: false, message: 'Não autenticado' }, { status: 401 }),
      }));

      const req = new NextRequest('http://localhost:3000/api/v1/projects', { method: 'GET' });
      const res = await getProjects(req);
      expect(res.status).toBe(401);
    });

    it('Retorna 403 Forbidden para utilizador sem permissão exigida', async () => {
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
