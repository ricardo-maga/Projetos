import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import * as authModule from '@/lib/auth/authorization';
import * as serverDbModule from '@/lib/supabase/server';
import { GET as getTasks, POST as createTask } from '@/app/api/v1/tasks/route';
import { GET as getTask, PATCH as updateTask, DELETE as deleteTask } from '@/app/api/v1/tasks/[id]/route';
import { createTaskServer, updateTaskServer, deleteTaskServer, getTaskServer, listTasksServer, parseTaskHoursToNumber, mapRowToTaskDTO } from '@/lib/tasks/taskService';
import { createTaskSchema, updateTaskSchema, queryTaskSchema } from '@/lib/validations/task';

describe('FASE 66-B — Tasks Persistence Boundary & Project Decoupling', () => {
  const validUUIDProject1 = '11111111-1111-4111-8111-111111111111';
  const validUUIDProject2 = '22222222-2222-4222-8222-222222222222';
  const validUUIDDeletedProject = '33333333-3333-4333-8333-333333333333';
  const validUUIDUser1 = '44444444-4444-4444-8444-444444444444';
  const validUUIDUser2 = '55555555-5555-4555-8555-555555555555';
  const validUUIDDeletedUser = '66666666-6666-4666-8666-666666666666';

  let mockDbData: any;
  let authSpy: any;
  let serverDbSpy: any;

  beforeEach(() => {
    mockDbData = {
      projects: [
        { id: validUUIDProject1, project_title: 'Projeto Alfa', deleted: false },
        { id: validUUIDProject2, project_title: 'Projeto Beta', deleted: false },
        { id: validUUIDDeletedProject, project_title: 'Projeto Eliminado', deleted: true },
      ],
      users: [
        { id: validUUIDUser1, name: 'Engenheiro Ativo 1', email: 'eng1@exemplo.com', deleted: false },
        { id: validUUIDUser2, name: 'Técnico Ativo 2', email: 'tec2@exemplo.com', deleted: false },
        { id: validUUIDDeletedUser, name: 'Utilizador Inativo', email: 'inativo@exemplo.com', deleted: true },
      ],
      tasks: [
        {
          id: 'task-com-projeto-1',
          project_id: validUUIDProject1,
          task_title: 'Instalação de Painéis A',
          task_description: 'Instalação primária',
          status_id: 'ts-1',
          task_type_id: null,
          estimated_hours: '8 hours',
          actual_hours: '4 hours',
          start_date: '2026-10-01',
          start_time: '08:00',
          end_date: '2026-10-01',
          end_time: '17:00',
          estimated_date: '2026-10-01',
          completed_date: null,
          notes: 'Nota 1',
          is_milestone: false,
          deleted: false,
          version: 1,
          created_at: '2026-09-01T08:00:00Z',
          updated_at: '2026-09-01T08:00:00Z',
          created_by: validUUIDUser1,
          updated_by: validUUIDUser1,
        },
        {
          id: 'task-sem-projeto-1',
          project_id: null,
          task_title: 'Manutenção Geral Preventiva',
          task_description: 'Tarefa autónoma sem projeto',
          status_id: 'ts-1',
          task_type_id: null,
          estimated_hours: '5 hours',
          actual_hours: '0 hours',
          start_date: '2026-10-02',
          start_time: '09:00',
          end_date: '2026-10-02',
          end_time: '14:00',
          estimated_date: '2026-10-02',
          completed_date: null,
          notes: null,
          is_milestone: false,
          deleted: false,
          version: 1,
          created_at: '2026-09-02T08:00:00Z',
          updated_at: '2026-09-02T08:00:00Z',
          created_by: validUUIDUser1,
          updated_by: validUUIDUser1,
        },
      ],
      task_assignees: [
        { task_id: 'task-com-projeto-1', user_id: validUUIDUser1 },
      ],
      planning_allocations: [],
    };

    authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
      return {
        success: true,
        user: { id: validUUIDUser1, email: 'admin@exemplo.com', role: 'admin' },
        requestId: 'req-test-66b',
      };
    });

    const createChain = (items: any[]) => {
      const obj: any = {
        data: items,
        error: null,
        eq: (col: string, val: any) => createChain(items.filter((r) => r[col] === val)),
        neq: (col: string, val: any) => createChain(items.filter((r) => r[col] !== val)),
        in: (col: string, vals: any[]) => createChain(items.filter((r) => vals.includes(r[col]))),
        order: () => obj,
        range: (from: number, to: number) => {
          const sliced = items.slice(from, to + 1);
          return Promise.resolve({ data: sliced, count: items.length, error: null });
        },
        maybeSingle: async () => ({ data: items[0] || null, error: null }),
        single: async () => ({ data: items[0] || null, error: null }),
        then: (cb: any) => Promise.resolve({ data: items, error: null, count: items.length }).then(cb),
      };
      return obj;
    };

    const buildMockQuery = (table: string) => {
      const allRows = mockDbData[table] || [];
      return {
        select: (cols?: string, opts?: any) => {
          return createChain(allRows);
        },
        insert: async (rows: any[]) => {
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
        delete: () => ({
          eq: (col: string, val: any) => {
            mockDbData[table] = (mockDbData[table] || []).filter((r: any) => r[col] !== val);
            return Promise.resolve({ error: null });
          },
        }),
      };
    };

    serverDbSpy = spyOn(serverDbModule, 'getServerDbClient').mockImplementation(async () => {
      return {
        from: (table: string) => buildMockQuery(table),
        rpc: async (fn: string, args: any) => {
          if (fn === 'create_task_atomic') {
            if (args.p_project_id) {
              const proj = mockDbData.projects.find((p: any) => p.id === args.p_project_id && !p.deleted);
              if (!proj) {
                return { data: null, error: { code: 'P0002', message: 'Projeto associado não existe ou foi eliminado.' } };
              }
            }

            const newTask = {
              id: args.p_id,
              project_id: args.p_project_id || null,
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
            const task = mockDbData.tasks.find((t: any) => t.id === args.p_id && !t.deleted);
            if (!task) return { data: null, error: { code: 'P0002', message: 'Tarefa não encontrada.' } };

            if (args.p_expected_version !== null && args.p_expected_version !== undefined && task.version !== args.p_expected_version) {
              return { data: null, error: { code: 'P0001', message: 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' } };
            }

            if (args.p_update_project_id && args.p_project_id) {
              const proj = mockDbData.projects.find((p: any) => p.id === args.p_project_id && !p.deleted);
              if (!proj) {
                return { data: null, error: { code: '23503', message: 'Projeto associado não existe ou foi eliminado.' } };
              }
            }

            task.version = task.version + 1;
            if (args.p_update_project_id) {
              task.project_id = args.p_project_id; // can be set to null
            }
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
            const task = mockDbData.tasks.find((t: any) => t.id === args.p_id && !t.deleted);
            if (!task) return { data: null, error: { code: 'P0002', message: 'Tarefa não encontrada.' } };

            if (args.p_expected_version !== null && args.p_expected_version !== undefined && task.version !== args.p_expected_version) {
              return { data: null, error: { code: 'P0001', message: 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' } };
            }

            task.deleted = true;
            task.version = task.version + 1;
            task.updated_at = new Date().toISOString();
            return { data: task, error: null };
          }

          return { data: null, error: { message: `RPC ${fn} not handled` } };
        },
      } as any;
    });
  });

  afterEach(() => {
    authSpy?.mockRestore();
    serverDbSpy?.mockRestore();
  });

  describe('1. Decoupling & Project Association Semantics (Backend / Domain)', () => {
    it('cria tarefa associada a projeto existente com sucesso (201)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: validUUIDProject1,
          title: 'Tarefa Nova Com Projeto',
          estimatedHours: 6,
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.projectId).toBe(validUUIDProject1);
      expect(json.data.title).toBe('Tarefa Nova Com Projeto');
      expect(json.data.version).toBe(1);
    });

    it('cria tarefa SEM projeto associado com projectId = null (201)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: null,
          title: 'Tarefa Standalone Desacoplada',
          estimatedHours: 4,
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.projectId).toBeNull();
      expect(json.data.title).toBe('Tarefa Standalone Desacoplada');
    });

    it('cria tarefa quando projectId é omitido ou string vazia, normalizando para null (201)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Tarefa Sem Campo ProjectId',
          estimatedHours: 2,
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.projectId).toBeNull();
    });

    it('rejeita criação quando projectId referencia projeto inexistente ou eliminado (400 Bad Request)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: validUUIDDeletedProject,
          title: 'Tentativa com Projeto Eliminado',
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      const msg = json.error?.message || json.message || '';
      expect(msg).toContain('projeto especificado não existe ou foi eliminado');
    });

    it('desassocia tarefa de um projeto existente definindo projectId = null no PATCH (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-com-projeto-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: null,
          version: 1,
        }),
      });

      const res = await updateTask(req, { params: Promise.resolve({ id: 'task-com-projeto-1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.projectId).toBeNull();
      expect(json.data.version).toBe(2);
    });

    it('reassocia tarefa sem projeto a um novo projeto válido (200)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-sem-projeto-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: validUUIDProject2,
          version: 1,
        }),
      });

      const res = await updateTask(req, { params: Promise.resolve({ id: 'task-sem-projeto-1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.projectId).toBe(validUUIDProject2);
      expect(json.data.version).toBe(2);
    });
  });

  describe('2. Concorrência Atómica (OCC) e Validações de Domínio', () => {
    it('rejeita UPDATE com conflito de versão (409 Conflict)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-com-projeto-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Conflito de Versão',
          version: 99,
        }),
      });

      const res = await updateTask(req, { params: Promise.resolve({ id: 'task-com-projeto-1' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      const msg = json.error?.message || json.message || '';
      expect(msg).toContain('Conflito de concorrência');
    });

    it('DELETE canónico preserva alocações históricas sem bloquear o soft-delete', async () => {
      mockDbData.planning_allocations.push({
        id: 'alloc-active-1',
        task_id: 'task-com-projeto-1',
        status: 'CONFIRMED',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-com-projeto-1', {
        method: 'DELETE',
      });

      const res = await deleteTask(req, { params: Promise.resolve({ id: 'task-com-projeto-1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockDbData.tasks.find((t: any) => t.id === 'task-com-projeto-1').deleted).toBe(true);
      expect(mockDbData.planning_allocations.find((a: any) => a.id === 'alloc-active-1').status).toBe('CONFIRMED');
    });

    it('permite DELETE de tarefa quando alocações são CANCELLED (200)', async () => {
      mockDbData.planning_allocations.push({
        id: 'alloc-cancelled-1',
        task_id: 'task-com-projeto-1',
        status: 'CANCELLED',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tasks/task-com-projeto-1', {
        method: 'DELETE',
      });

      const res = await deleteTask(req, { params: Promise.resolve({ id: 'task-com-projeto-1' }) });
      expect(res.status).toBe(200);
      const dbTask = mockDbData.tasks.find((t: any) => t.id === 'task-com-projeto-1');
      expect(dbTask.deleted).toBe(true);
    });

    it('valida datas de início e fim: startDate com endDate inferior é rejeitada (422)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Datas Inválidas',
          startDate: '2026-10-10',
          endDate: '2026-10-05',
        }),
      });

      const res = await createTask(req);
      expect(res.status).toBe(422);
    });
  });

  describe('3. Auditoria de Migration SQL e Ausência de Fallbacks', () => {
    it('confirma a existência da migration de desacoplamento de project_id nas RPCs', () => {
      const migrationFile = join(process.cwd(), 'supabase/migrations/20260928030000_tasks_atomic_rpcs_project_decoupling.sql');
      expect(existsSync(migrationFile)).toBe(true);
      const content = readFileSync(migrationFile, 'utf-8');
      expect(content).toContain('p_update_project_id');
      expect(content).toContain('p_project_id UUID DEFAULT NULL');
      expect(content).toContain('CREATE OR REPLACE FUNCTION public.create_task_atomic');
      expect(content).toContain('CREATE OR REPLACE FUNCTION public.update_task_atomic');
      expect(content).toContain('CREATE OR REPLACE FUNCTION public.delete_task_atomic');
    });

    it('garante que taskService não possui fallbacks nem escritas manuais paralelas', () => {
      const serviceFile = join(process.cwd(), 'lib/tasks/taskService.ts');
      const content = readFileSync(serviceFile, 'utf-8');
      expect(content).toContain("sb.rpc('create_task_atomic'");
      expect(content).toContain("sb.rpc('update_task_atomic'");
      expect(content).toContain("sb.rpc('delete_task_atomic'");
      expect(content).not.toContain(".from('tasks').insert(");
      expect(content).not.toContain(".from('tasks').update(");
    });
  });

  describe('4. Conformidade com Regra Global de Utilizador', () => {
    it('garante que ricardo75@gmail.com permanece com deleted: true', () => {
      const rules = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(rules).toContain('ricardo75@gmail.com');
      expect(rules).toContain('deleted: true');
    });
  });
});
