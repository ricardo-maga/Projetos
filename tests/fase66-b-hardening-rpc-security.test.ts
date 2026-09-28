import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import * as authModule from '@/lib/auth/authorization';
import * as serverDbModule from '@/lib/supabase/server';
import { POST as createTask } from '@/app/api/v1/tasks/route';
import { PATCH as updateTask, DELETE as deleteTask } from '@/app/api/v1/tasks/[id]/route';
import { createTaskServer, updateTaskServer, deleteTaskServer } from '@/lib/tasks/taskService';

describe('FASE 66-B-HARDENING — Tasks RPC Security & Deterministic Errors', () => {
  const validUUIDProjectActive = '11111111-1111-4111-8111-111111111111';
  const validUUIDProjectDeleted = '22222222-2222-4222-8222-222222222222';
  const validUUIDUserApproved = '33333333-3333-4333-8333-333333333333';
  const validUUIDUserUnapproved = '44444444-4444-4444-8444-444444444444';
  const validUUIDUserDeleted = '55555555-5555-4555-8555-555555555555';

  let mockDbData: any;
  let authSpy: any;
  let serverDbSpy: any;

  beforeEach(() => {
    mockDbData = {
      projects: [
        { id: validUUIDProjectActive, project_title: 'Projeto Autorizado Ativo', deleted: false },
        { id: validUUIDProjectDeleted, project_title: 'Projeto Eliminado', deleted: true },
      ],
      users: [
        { id: validUUIDUserApproved, name: 'Utilizador Aprovado', approved: true, deleted: false, role_id: 'ug-1', is_admin: true },
        { id: validUUIDUserUnapproved, name: 'Utilizador Não Aprovado', approved: false, deleted: false, role_id: 'ug-3', is_admin: false },
        { id: validUUIDUserDeleted, name: 'Utilizador Eliminado', approved: true, deleted: true, role_id: 'ug-3', is_admin: false },
      ],
      tasks: [
        {
          id: 'task-sec-1',
          project_id: validUUIDProjectActive,
          task_title: 'Tarefa Existente 1',
          task_description: 'Descrição',
          status_id: 'ts-1',
          task_type_id: null,
          estimated_hours: '4 hours',
          actual_hours: '0 hours',
          deleted: false,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: validUUIDUserApproved,
          updated_by: validUUIDUserApproved,
        },
        {
          id: 'task-standalone-1',
          project_id: null,
          task_title: 'Tarefa Standalone',
          task_description: 'Sem projeto',
          status_id: 'ts-1',
          task_type_id: null,
          estimated_hours: '2 hours',
          actual_hours: '0 hours',
          deleted: false,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: validUUIDUserApproved,
          updated_by: validUUIDUserApproved,
        },
      ],
      task_assignees: [],
      planning_allocations: [],
    };

    authSpy = spyOn(authModule, 'requirePermission').mockImplementation(async () => {
      return {
        success: true,
        user: { id: validUUIDUserApproved, email: 'admin@exemplo.com', role: 'admin' },
        requestId: 'req-sec-test',
      };
    });

    const createChain = (items: any[]) => {
      const obj: any = {
        data: items,
        error: null,
        eq: (col: string, val: any) => createChain(items.filter((r) => r[col] === val)),
        in: (col: string, vals: any[]) => createChain(items.filter((r) => vals.includes(r[col]))),
        order: () => obj,
        range: (from: number, to: number) => Promise.resolve({ data: items.slice(from, to + 1), count: items.length, error: null }),
        maybeSingle: async () => ({ data: items[0] || null, error: null }),
        single: async () => ({ data: items[0] || null, error: null }),
        then: (cb: any) => Promise.resolve({ data: items, error: null, count: items.length }).then(cb),
      };
      return obj;
    };

    serverDbSpy = spyOn(serverDbModule, 'getServerDbClient').mockImplementation(async () => {
      return {
        from: (table: string) => ({
          select: () => createChain(mockDbData[table] || []),
        }),
        rpc: async (fn: string, args: any) => {
          // Simulation of PostgreSQL RPC logic with authorization and deterministic SQLSTATE codes
          const callerUid = args.p_created_by || args.p_updated_by;
          const caller = mockDbData.users.find((u: any) => u.id === callerUid);

          // 1. Authorization check: must be approved and not deleted
          if (caller && (!caller.approved || caller.deleted)) {
            return { data: null, error: { code: '42501', message: 'Utilizador não autorizado ou inativo.' } };
          }

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
              version: 1,
              deleted: false,
            };
            mockDbData.tasks.push(newTask);
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
              task.project_id = args.p_project_id;
            }
            if (args.p_task_title) task.task_title = args.p_task_title;
            return { data: task, error: null };
          }

          if (fn === 'delete_task_atomic') {
            const task = mockDbData.tasks.find((t: any) => t.id === args.p_id && !t.deleted);
            if (!task) return { data: null, error: { code: 'P0002', message: 'Tarefa não encontrada.' } };

            if (args.p_expected_version !== null && args.p_expected_version !== undefined && task.version !== args.p_expected_version) {
              return { data: null, error: { code: 'P0001', message: 'Conflito de concorrência (OCC).' } };
            }

            task.deleted = true;
            task.version = task.version + 1;
            return { data: task, error: null };
          }

          return { data: null, error: { message: `Unknown RPC ${fn}` } };
        },
      } as any;
    });
  });

  afterEach(() => {
    authSpy?.mockRestore();
    serverDbSpy?.mockRestore();
  });

  describe('1. Segurança da RPC SECURITY DEFINER & Validação de Projeto', () => {
    it('utilizador aprovado com projeto autorizado cria tarefa com sucesso (201)', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await createTaskServer(fakeSb, {
        title: 'Tarefa Aprovada',
        projectId: validUUIDProjectActive,
        userId: validUUIDUserApproved,
      });

      expect(res.success).toBe(true);
      expect(res.data?.projectId).toBe(validUUIDProjectActive);
      expect(res.data?.version).toBe(1);
    });

    it('utilizador com projeto inexistente/eliminado é rejeitado com HTTP 400 (código P0002)', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await createTaskServer(fakeSb, {
        title: 'Tarefa com Projeto Inválido',
        projectId: validUUIDProjectDeleted,
        userId: validUUIDUserApproved,
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toBe('O projeto especificado não existe ou foi eliminado.');
    });

    it('utilizador não aprovado é bloqueado na RPC com 42501 (HTTP 403 Forbidden)', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await createTaskServer(fakeSb, {
        title: 'Tentativa por Utilizador Não Aprovado',
        projectId: validUUIDProjectActive,
        userId: validUUIDUserUnapproved,
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.error).toBe('Sem permissão para realizar esta operação.');
    });

    it('utilizador eliminado é bloqueado na RPC com 42501 (HTTP 403 Forbidden)', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await createTaskServer(fakeSb, {
        title: 'Tentativa por Utilizador Eliminado',
        projectId: validUUIDProjectActive,
        userId: validUUIDUserDeleted,
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.error).toBe('Sem permissão para realizar esta operação.');
    });

    it('desassociação de projeto (projectId = null) é permitida para utilizador autorizado sem exigir validação de projeto', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await updateTaskServer(fakeSb, 'task-sec-1', {
        projectId: null,
        version: 1,
        userId: validUUIDUserApproved,
      });

      expect(res.success).toBe(true);
      expect(res.data?.projectId).toBeNull();
      expect(res.data?.version).toBe(2);
    });

    it('reassociação para projeto eliminado no update é rejeitada com HTTP 400 via 23503', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await updateTaskServer(fakeSb, 'task-standalone-1', {
        projectId: validUUIDProjectDeleted,
        version: 1,
        userId: validUUIDUserApproved,
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toBe('O projeto especificado não existe ou foi eliminado.');
    });

    it('update em tarefa não existente devolve HTTP 404 via P0002', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await updateTaskServer(fakeSb, 'task-fantasma-999', {
        title: 'Nome Novo',
        version: 1,
        userId: validUUIDUserApproved,
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(404);
      expect(res.error).toBe('Tarefa não encontrada.');
    });

    it('update com versão divergente devolve HTTP 409 via P0001 (OCC)', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await updateTaskServer(fakeSb, 'task-sec-1', {
        title: 'Conflito',
        version: 99,
        userId: validUUIDUserApproved,
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(409);
      expect(res.error).toContain('Conflito de concorrência');
    });

    it('delete de tarefa inexistente devolve HTTP 404 via P0002', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await deleteTaskServer(fakeSb, 'task-fantasma-999', validUUIDUserApproved, 1);

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(404);
      expect(res.error).toBe('Tarefa não encontrada.');
    });

    it('delete com versão incorreta devolve HTTP 409 via P0001', async () => {
      const fakeSb = await serverDbModule.getServerDbClient();
      const res = await deleteTaskServer(fakeSb, 'task-sec-1', validUUIDUserApproved, 99);

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(409);
      expect(res.error).toContain('Conflito de concorrência');
    });
  });

  describe('2. Auditoria Determinística de SQLSTATE sem Parsing de Texto', () => {
    it('taskService.ts não utiliza rpcError.message?.includes(...) para mapear erros da boundary', () => {
      const content = readFileSync(join(process.cwd(), 'lib/tasks/taskService.ts'), 'utf-8');
      expect(content).not.toContain('rpcError.message?.includes(');
      expect(content).not.toContain('rpcError.message.includes(');
      expect(content).toContain("rpcError.code === 'P0001'");
      expect(content).toContain("rpcError.code === 'P0002'");
      expect(content).toContain("rpcError.code === '23503'");
      expect(content).toContain("rpcError.code === '42501'");
    });

    it('migration SQL 20260928030000 inclui verificações de is_approved() e códigos de erro estruturados', () => {
      const sqlContent = readFileSync(
        join(process.cwd(), 'supabase/migrations/20260928030000_tasks_atomic_rpcs_project_decoupling.sql'),
        'utf-8'
      );
      expect(sqlContent).toContain("auth.role() = 'authenticated' AND NOT public.is_approved()");
      expect(sqlContent).toContain("USING ERRCODE = '42501'");
      expect(sqlContent).toContain("USING ERRCODE = 'P0001'");
      expect(sqlContent).toContain("USING ERRCODE = 'P0002'");
      expect(sqlContent).toContain("USING ERRCODE = '23503'");
    });
  });

  describe('3. Auditoria de Writers e Ausência de Fallbacks', () => {
    it('garante que não existem chamadas .insert() diretas na tabela tasks fora de RPCs', () => {
      const taskServiceContent = readFileSync(join(process.cwd(), 'lib/tasks/taskService.ts'), 'utf-8');
      expect(taskServiceContent).not.toContain(".from('tasks').insert(");
      expect(taskServiceContent).not.toContain(".from('tasks').update(");
      expect(taskServiceContent).not.toContain(".from('tasks').delete(");
    });

    it('garante que não existem escritas (.insert/.update/.delete) na tabela task_assignees fora de RPCs', () => {
      const taskServiceContent = readFileSync(join(process.cwd(), 'lib/tasks/taskService.ts'), 'utf-8');
      expect(taskServiceContent).not.toContain(".from('task_assignees').insert(");
      expect(taskServiceContent).not.toContain(".from('task_assignees').update(");
      expect(taskServiceContent).not.toContain(".from('task_assignees').delete(");
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
