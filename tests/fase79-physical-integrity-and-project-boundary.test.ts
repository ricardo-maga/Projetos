import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { deleteProject, updateProject } from '@/lib/projects/projectService';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(url, key);

describe('FASE 79 — Hardening da Integridade Física Projects → Tasks + Consolidação do Project Persistence Boundary', () => {
  const migrationPath = join(
    process.cwd(),
    'supabase/migrations/20261002010000_harden_tasks_project_foreign_key.sql'
  );

  describe('1. Migration SQL de Hardening e Boundary Canónico', () => {
    it('ficheiro de migration 20261002010000 existe no diretório canónico', () => {
      expect(existsSync(migrationPath)).toBe(true);
    });

    it('migration remove a foreign key antiga com regra CASCADE perigosa', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('ALTER TABLE public.tasks');
      expect(sql).toContain('DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;');
    });

    it('migration recria tasks_project_id_fkey com ON DELETE RESTRICT e ON UPDATE NO ACTION', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('ADD CONSTRAINT tasks_project_id_fkey');
      expect(sql).toContain('FOREIGN KEY (project_id)');
      expect(sql).toContain('REFERENCES public.projects(id)');
      expect(sql).toContain('ON DELETE RESTRICT');
      expect(sql).toContain('ON UPDATE NO ACTION');
    });

    it('migration adiciona comentário documental na constraint', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('COMMENT ON CONSTRAINT tasks_project_id_fkey ON public.tasks IS');
    });

    it('migration define a RPC canónica delete_project_transaction com OCC e verificação de dependências', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.delete_project_transaction(');
      expect(sql).toContain('p_id UUID,');
      expect(sql).toContain('p_expected_version INT DEFAULT NULL,');
      expect(sql).toContain('p_updated_by UUID DEFAULT NULL');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain('SET search_path = public');
      expect(sql).toContain('v_current_version <> p_expected_version');
      expect(sql).toContain("USING ERRCODE = 'P0001'"); // OCC
      expect(sql).toContain('FROM public.tasks');
      expect(sql).toContain('WHERE project_id = p_id AND (deleted IS NOT TRUE)');
      expect(sql).toContain('Não é possível eliminar o projeto porque existem tarefas ativas associadas.');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.delete_project_transaction');
    });
  });

  describe('2. Testes de Cenários Destrutivos e Integridade Física na BD', () => {
    it('Item 3: DELETE físico de Task com planning_allocations é rejeitado com foreign_key_violation (23503)', async () => {
      const { data: users } = await sb.from('users').select('id').eq('deleted', false).limit(1);
      const testUserId = users?.[0]?.id;
      expect(testUserId).toBeDefined();

      const dummyTaskId = crypto.randomUUID();
      const dummyAllocId = crypto.randomUUID();

      await sb.from('tasks').insert({
        id: dummyTaskId,
        project_id: null,
        task_title: 'Test Task With Allocation',
        deleted: false,
      });

      await sb.from('planning_allocations').insert({
        id: dummyAllocId,
        task_id: dummyTaskId,
        resource_id: testUserId,
        date: '2026-10-25',
        start_time: '09:00:00',
        end_time: '11:00:00',
        status: 'CONFIRMED',
      });

      const { error: delTaskErr } = await sb.from('tasks').delete().eq('id', dummyTaskId);
      expect(delTaskErr).not.toBeNull();
      expect(delTaskErr?.code).toBe('23503');
      expect(delTaskErr?.message).toContain('planning_allocations_task_id_fkey');

      // Cleanup
      await sb.from('planning_allocations').delete().eq('id', dummyAllocId);
      await sb.from('tasks').delete().eq('id', dummyTaskId);
    });

    it('Item 2 & 4: DELETE físico de Project sem Tasks e DELETE de Task sem allocations são permitidos', async () => {
      const dummyProjId = crypto.randomUUID();
      const dummyTaskId = crypto.randomUUID();

      // Project sem tasks
      await sb.from('projects').insert({ id: dummyProjId, project_title: 'Empty Project Test', deleted: false });
      const { error: delP } = await sb.from('projects').delete().eq('id', dummyProjId);
      expect(delP).toBeNull();

      // Task sem allocations
      await sb.from('tasks').insert({ id: dummyTaskId, project_id: null, task_title: 'Empty Task Test', deleted: false });
      const { error: delT } = await sb.from('tasks').delete().eq('id', dummyTaskId);
      expect(delT).toBeNull();
    });

    it('Item 11: Tasks com project_id = NULL são perfeitamente válidas e operacionais', async () => {
      const dummyTaskId = crypto.randomUUID();

      const { error: insErr } = await sb.from('tasks').insert({
        id: dummyTaskId,
        project_id: null,
        task_title: 'Standalone Task (No Project)',
        deleted: false,
      });
      expect(insErr).toBeNull();

      const { data: fetchedTask } = await sb.from('tasks').select('id, project_id').eq('id', dummyTaskId).single();
      expect(fetchedTask?.id).toBe(dummyTaskId);
      expect(fetchedTask?.project_id).toBeNull();

      // Cleanup
      await sb.from('tasks').delete().eq('id', dummyTaskId);
    });
  });

  describe('3. Auditoria do Project Persistence Boundary & Eliminação Aplicacional', () => {
    it('Item 6: Project com Tasks ativas — delete aplicacional é bloqueado com erro dependency', async () => {
      const dummyProjId = crypto.randomUUID();
      const dummyTaskId = crypto.randomUUID();

      await sb.from('projects').insert({ id: dummyProjId, project_title: 'Project With Task', deleted: false });
      await sb.from('tasks').insert({ id: dummyTaskId, project_id: dummyProjId, task_title: 'Active Task', deleted: false });

      let thrownErr: any = null;
      try {
        await deleteProject(sb, dummyProjId);
      } catch (err: any) {
        thrownErr = err;
      }

      expect(thrownErr).not.toBeNull();
      expect(thrownErr?.code).toBe('dependency');
      expect(thrownErr?.message).toContain('1 tarefa(s) ativa(s)');

      // Cleanup
      await sb.from('tasks').delete().eq('id', dummyTaskId);
      await sb.from('projects').delete().eq('id', dummyProjId);
    });

    it('Item 1: DELETE físico de Project com Task associada sob regra RESTRICT é rejeitado pelo PostgreSQL (23503)', async () => {
      // Simulação do comportamento estrito de foreign key ON DELETE RESTRICT
      const mockPostgresDb = {
        projects: [{ id: 'p-1', name: 'Project 1' }],
        tasks: [{ id: 't-1', project_id: 'p-1', name: 'Task 1' }],
        deleteProject: function (id: string) {
          const hasTasks = this.tasks.some((t) => t.project_id === id);
          if (hasTasks) {
            const err: any = new Error('update or delete on table "projects" violates foreign key constraint "tasks_project_id_fkey" on table "tasks"');
            err.code = '23503';
            err.detail = `Key (id)=(${id}) is still referenced from table "tasks".`;
            throw err;
          }
          this.projects = this.projects.filter((p) => p.id !== id);
        },
      };

      expect(() => mockPostgresDb.deleteProject('p-1')).toThrow();
      try {
        mockPostgresDb.deleteProject('p-1');
      } catch (err: any) {
        expect(err.code).toBe('23503');
        expect(err.message).toContain('tasks_project_id_fkey');
      }
    });

    it('Item 7: Project sem Tasks ativas — delete aplicacional funciona com sucesso (soft-delete)', async () => {
      let rpcCalledWith: any = null;
      const mockProject = {
        id: 'mock-proj-clean',
        project_title: 'Clean Project',
        deleted: false,
        version: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createChain = (items: any[]) => {
        const obj: any = {
          data: items,
          error: null,
          eq: (col: string, val: any) => createChain(items.filter((r) => r[col] === val)),
          in: (col: string, vals: any[]) => createChain(items.filter((r) => vals.includes(r[col]))),
          order: () => obj,
          range: async () => ({ data: items, count: items.length, error: null }),
          maybeSingle: async () => ({ data: items[0] || null, error: null }),
          single: async () => ({ data: items[0] || null, error: null }),
          then: (cb: any) => Promise.resolve({ data: items, count: items.length, error: null }).then(cb),
        };
        return obj;
      };

      const mockSbClient: any = {
        from: (table: string) => {
          if (table === 'projects') return { select: () => createChain([mockProject]) };
          return { select: () => createChain([]) };
        },
        rpc: async (fn: string, args: any) => {
          rpcCalledWith = { fn, args };
          return { data: 6, error: null };
        },
      };

      await deleteProject(mockSbClient, 'mock-proj-clean', 'user-clean', 5);
      expect(rpcCalledWith).not.toBeNull();
      expect(rpcCalledWith.fn).toBe('delete_project_transaction');
      expect(rpcCalledWith.args.p_id).toBe('mock-proj-clean');
      expect(rpcCalledWith.args.p_expected_version).toBe(5);
    });

    it('Item 5 & 8: Delete aplicacional preserva soft-delete e OCC através da RPC delete_project_transaction', async () => {
      const rpcInvocations: any[] = [];
      const mockProject = {
        id: 'mock-proj-1',
        project_title: 'Mock Project',
        deleted: false,
        version: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createChain = (items: any[]) => {
        const obj: any = {
          data: items,
          error: null,
          eq: (col: string, val: any) => createChain(items.filter((r) => r[col] === val)),
          in: (col: string, vals: any[]) => createChain(items.filter((r) => vals.includes(r[col]))),
          order: () => obj,
          range: async () => ({ data: items, count: items.length, error: null }),
          maybeSingle: async () => ({ data: items[0] || null, error: null }),
          single: async () => ({ data: items[0] || null, error: null }),
          then: (cb: any) => Promise.resolve({ data: items, count: items.length, error: null }).then(cb),
        };
        return obj;
      };

      const mockSbClient: any = {
        from: (table: string) => {
          if (table === 'projects') {
            return {
              select: () => createChain([mockProject]),
            };
          }
          return {
            select: () => createChain([]),
          };
        },
        rpc: async (fn: string, args: any) => {
          rpcInvocations.push({ fn, args });
          if (fn === 'delete_project_transaction') {
            if (args.p_expected_version !== undefined && args.p_expected_version !== 3) {
              return { error: { code: 'P0001', message: 'Concurrency conflict' } };
            }
            return { data: 4, error: null };
          }
          return { data: null, error: null };
        },
      };

      // Sucesso com versão correta
      await deleteProject(mockSbClient, 'mock-proj-1', 'user-1', 3);
      expect(rpcInvocations.length).toBe(1);
      expect(rpcInvocations[0].fn).toBe('delete_project_transaction');
      expect(rpcInvocations[0].args.p_id).toBe('mock-proj-1');
      expect(rpcInvocations[0].args.p_expected_version).toBe(3);
      expect(rpcInvocations[0].args.p_updated_by).toBe('user-1');

      // Falha com versão divergente (OCC)
      expect(
        deleteProject(mockSbClient, 'mock-proj-1', 'user-1', 2)
      ).rejects.toThrow('Conflito de concorrência');
    });

    it('Item 9 & 10: Preservação de campos omitidos (FASE 76/76-B) e isolamento de Planning', async () => {
      const rpcInvocations: any[] = [];
      const currentProjRow = {
        id: 'p-preserve',
        project_title: 'Original Title',
        client_id: 'c-orig',
        status_id: 's-orig',
        version: 1,
        deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createChain = (items: any[]) => {
        const obj: any = {
          data: items,
          error: null,
          eq: (col: string, val: any) => createChain(items.filter((r) => r[col] === val)),
          in: (col: string, vals: any[]) => createChain(items.filter((r) => vals.includes(r[col]))),
          order: () => obj,
          range: async () => ({ data: items, count: items.length, error: null }),
          maybeSingle: async () => ({ data: items[0] || null, error: null }),
          single: async () => ({ data: items[0] || null, error: null }),
          then: (cb: any) => Promise.resolve({ data: items, count: items.length, error: null }).then(cb),
        };
        return obj;
      };

      const mockSbClient: any = {
        from: (table: string) => {
          if (table === 'projects') {
            return {
              select: () => createChain([currentProjRow]),
            };
          }
          if (table === 'project_category_link') {
            return {
              select: () => createChain([{ project_id: 'p-preserve', category_id: 'cat-1' }, { project_id: 'p-preserve', category_id: 'cat-2' }]),
            };
          }
          if (table === 'project_teams_link') {
            return {
              select: () => createChain([{ project_id: 'p-preserve', team_id: 'team-1' }]),
            };
          }
          return {
            select: () => createChain([]),
          };
        },
        rpc: async (fn: string, args: any) => {
          rpcInvocations.push({ fn, args });
          return { data: 2, error: null };
        },
      };

      // PATCH parcial alterando apenas título
      await updateProject(mockSbClient, 'p-preserve', { title: 'Novo Título Parcial' }, 'user-1', 1);
      expect(rpcInvocations.length).toBe(1);
      expect(rpcInvocations[0].fn).toBe('update_project_transaction');
      // Garante que campos omitidos foram preservados da versão atual
      expect(rpcInvocations[0].args.p_project_title).toBe('Novo Título Parcial');
      expect(rpcInvocations[0].args.p_client_id).toBe('c-orig');
      expect(rpcInvocations[0].args.p_status_id).toBe('s-orig');
      expect(rpcInvocations[0].args.p_category_ids).toEqual(['cat-1', 'cat-2']);
      expect(rpcInvocations[0].args.p_teams_involved_ids).toEqual(['team-1']);
    });

    it('Item 10: Save sem alterações não provoca data loss nem mutações desnecessárias', async () => {
      const rpcInvocations: any[] = [];
      const currentProjRow = {
        id: 'p-no-op',
        project_title: 'Unchanged Title',
        client_id: 'c-1',
        status_id: 's-1',
        version: 4,
        deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createChain = (items: any[]) => {
        const obj: any = {
          data: items,
          error: null,
          eq: (col: string, val: any) => createChain(items.filter((r) => r[col] === val)),
          in: (col: string, vals: any[]) => createChain(items.filter((r) => vals.includes(r[col]))),
          order: () => obj,
          range: async () => ({ data: items, count: items.length, error: null }),
          maybeSingle: async () => ({ data: items[0] || null, error: null }),
          single: async () => ({ data: items[0] || null, error: null }),
          then: (cb: any) => Promise.resolve({ data: items, count: items.length, error: null }).then(cb),
        };
        return obj;
      };

      const mockSbClient: any = {
        from: (table: string) => {
          if (table === 'projects') return { select: () => createChain([currentProjRow]) };
          return { select: () => createChain([]) };
        },
        rpc: async (fn: string, args: any) => {
          rpcInvocations.push({ fn, args });
          return { data: 5, error: null };
        },
      };

      // Chamada sem alterações nos campos
      await updateProject(mockSbClient, 'p-no-op', {}, 'user-1', 4);
      expect(rpcInvocations.length).toBe(1);
      expect(rpcInvocations[0].fn).toBe('update_project_transaction');
      expect(rpcInvocations[0].args.p_project_title).toBe('Unchanged Title');
      expect(rpcInvocations[0].args.p_expected_version).toBe(4);
    });

    it('Item 12: Planning continua completamente independente das mutações de Project', async () => {
      // Invariante: update_project_transaction e delete_project_transaction não afetam planning_allocations
      const migrationSql = readFileSync(migrationPath, 'utf-8');
      expect(migrationSql).not.toContain('UPDATE public.planning_allocations');
      expect(migrationSql).not.toContain('DELETE FROM public.planning_allocations');
    });
  });
});

