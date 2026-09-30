import { describe, it, expect, mock } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createTaskServer, updateTaskServer, deleteTaskServer, resolveStatusUuid, resolveTaskTypeUuid } from '../lib/tasks/taskService';

describe('FASE 68 — TASKS ATOMIC RPC / POSTGRESQL CANONICAL ALIGNMENT', () => {

  describe('1. Migration Canonical Integrity & Contract Verification', () => {
    const migrationPath = join(
      process.cwd(),
      'supabase/migrations/20260930000000_fix_tasks_atomic_rpcs_coalesce_type_mismatch.sql'
    );

    it('a migration canónica 20260930000000 existe e define search_path = public', () => {
      expect(existsSync(migrationPath)).toBe(true);
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('SET search_path = public;');
    });

    it('remove overloads antigos para prevenir chamadas ambíguas', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.create_task_atomic');
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.update_task_atomic');
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.delete_task_atomic');
    });

    it('declara SECURITY DEFINER em todas as 3 RPCs', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      const securityDefinerMatches = sql.match(/SECURITY DEFINER/g);
      expect(securityDefinerMatches).not.toBeNull();
      expect(securityDefinerMatches!.length).toBeGreaterThanOrEqual(3);
    });

    it('concede privilégios EXECUTE exclusivamente a authenticated e service_role', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_task_atomic');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.update_task_atomic');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.delete_task_atomic');
      expect(sql).toContain('TO authenticated, service_role;');
    });

    it('não contém COALESCE(text, uuid) e resolve status_id / task_type_id para UUID canónico', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).not.toContain('COALESCE(p_status_id, status_id)');
      expect(sql).toContain('v_status_uuid');
      expect(sql).toContain('COALESCE(v_status_uuid, status_id)');
    });

    it('suporta project_id = NULL em create e update', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('p_project_id UUID DEFAULT NULL');
      expect(sql).toContain('IF p_project_id IS NOT NULL THEN');
      expect(sql).toContain('project_id = CASE WHEN p_update_project_id THEN p_project_id ELSE project_id END');
    });
  });

  describe('2. Helpers de Resolução Canónica de Identificadores (UUID & Legacy IDs)', () => {
    it('resolveStatusUuid mapeia strings legacy ts-1..ts-4 para UUIDs canónicos da base de dados', () => {
      expect(resolveStatusUuid('ts-1')).toBe('99999999-9999-9999-9999-999999999901');
      expect(resolveStatusUuid('ts-2')).toBe('99999999-9999-9999-9999-999999999902');
      expect(resolveStatusUuid('ts-3')).toBe('99999999-9999-9999-9999-999999999903');
      expect(resolveStatusUuid('ts-4')).toBe('99999999-9999-9999-9999-999999999904');
    });

    it('resolveStatusUuid preserva UUIDs válidos e aplica default para vazio/null', () => {
      const customUuid = '7a53f944-7953-4493-991f-732836b5a36f';
      expect(resolveStatusUuid(customUuid)).toBe(customUuid);
      expect(resolveStatusUuid(null)).toBe('99999999-9999-9999-9999-999999999901');
      expect(resolveStatusUuid('')).toBe('99999999-9999-9999-9999-999999999901');
    });

    it('resolveTaskTypeUuid mapeia strings legacy tt-1..tt-X e preserva UUIDs', () => {
      expect(resolveTaskTypeUuid('tt-1')).toBe('88888888-8888-8888-8888-000000000001');
      const validUuid = '36742500-5c1b-6a6f-1410-928f50aaaaaa';
      expect(resolveTaskTypeUuid(validUuid)).toBe(validUuid);
      expect(resolveTaskTypeUuid(null)).toBeNull();
      expect(resolveTaskTypeUuid('')).toBeNull();
    });
  });

  describe('3. Contrato de Criação (createTaskServer)', () => {
    it('1. Criar tarefa com Project válido envia project_id e devolve DTO persistido', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(fnName).toBe('create_task_atomic');
          expect(args.p_project_id).toBe('proj-uuid-1');
          expect(args.p_task_title).toBe('Tarefa A');
          return {
            data: {
              id: args.p_id,
              project_id: args.p_project_id,
              task_title: args.p_task_title,
              status_id: args.p_status_id,
              version: 1,
              deleted: false,
            },
            error: null,
          };
        }),
      } as any;

      const res = await createTaskServer(mockSupabase, {
        title: 'Tarefa A',
        projectId: 'proj-uuid-1',
        userId: 'user-1',
      });

      expect(res.success).toBe(true);
      expect(res.data?.projectId).toBe('proj-uuid-1');
      expect(res.data?.title).toBe('Tarefa A');
      expect(res.data?.version).toBe(1);
    });

    it('2. Criar tarefa com project_id = NULL é explicitamente permitido e propaga null', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(fnName).toBe('create_task_atomic');
          expect(args.p_project_id).toBeNull();
          return {
            data: {
              id: args.p_id,
              project_id: null,
              task_title: args.p_task_title,
              status_id: args.p_status_id,
              version: 1,
              deleted: false,
            },
            error: null,
          };
        }),
      } as any;

      const res = await createTaskServer(mockSupabase, {
        title: 'Tarefa Sem Projeto',
        projectId: null,
        userId: 'user-1',
      });

      expect(res.success).toBe(true);
      expect(res.data?.projectId).toBeNull();
      expect(res.data?.version).toBe(1);
    });

    it('3 & 4. Rejeitar projeto inexistente ou eliminado com 400 Bad Request (P0002 / 23503)', async () => {
      const mockSupabase = {
        rpc: mock(async () => {
          return {
            data: null,
            error: { code: 'P0002', message: 'Projeto associado não existe ou foi eliminado.' },
          };
        }),
      } as any;

      const res = await createTaskServer(mockSupabase, {
        title: 'Tarefa Invalida',
        projectId: 'proj-inexistente',
        userId: 'user-1',
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toContain('não existe ou foi eliminado');
    });

    it('5. Rejeitar utilizador sem tasks:write com 403 Forbidden (42501)', async () => {
      const mockSupabase = {
        rpc: mock(async () => {
          return {
            data: null,
            error: { code: '42501', message: 'Sem permissão para criar tarefas.' },
          };
        }),
      } as any;

      const res = await createTaskServer(mockSupabase, {
        title: 'Tarefa Não Autorizada',
        userId: 'user-sem-permissoes',
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('4. Contrato de Edição (updateTaskServer)', () => {
    it('6. Atualizar sem alterar Project preserva project_id existente com p_update_project_id = false', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(args.p_update_project_id).toBe(false);
          expect(args.p_project_id).toBeNull();
          expect(args.p_expected_version).toBe(1);
          return {
            data: {
              id: args.p_id,
              project_id: 'proj-original-uuid',
              task_title: args.p_task_title,
              version: 2,
            },
            error: null,
          };
        }),
        from: () => ({ select: () => ({ eq: () => ({ data: [] }) }) }),
      } as any;

      const res = await updateTaskServer(mockSupabase, 'task-uuid', {
        title: 'Novo Titulo',
        version: 1,
        userId: 'user-1',
      });

      expect(res.success).toBe(true);
      expect(res.data?.version).toBe(2);
      expect(res.data?.projectId).toBe('proj-original-uuid');
    });

    it('7. Remover Project (Project -> NULL) envia p_update_project_id = true e p_project_id = null', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(args.p_update_project_id).toBe(true);
          expect(args.p_project_id).toBeNull();
          return {
            data: {
              id: args.p_id,
              project_id: null,
              task_title: 'Tarefa Desassociada',
              version: 3,
            },
            error: null,
          };
        }),
        from: () => ({ select: () => ({ eq: () => ({ data: [] }) }) }),
      } as any;

      const res = await updateTaskServer(mockSupabase, 'task-uuid', {
        projectId: null,
        version: 2,
        userId: 'user-1',
      });

      expect(res.success).toBe(true);
      expect(res.data?.projectId).toBeNull();
      expect(res.data?.version).toBe(3);
    });

    it('8 & 9. Associar ou alterar Project envia p_update_project_id = true e novo project_id', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(args.p_update_project_id).toBe(true);
          expect(args.p_project_id).toBe('novo-proj-uuid');
          return {
            data: {
              id: args.p_id,
              project_id: 'novo-proj-uuid',
              version: 4,
            },
            error: null,
          };
        }),
        from: () => ({ select: () => ({ eq: () => ({ data: [] }) }) }),
      } as any;

      const res = await updateTaskServer(mockSupabase, 'task-uuid', {
        projectId: 'novo-proj-uuid',
        version: 3,
        userId: 'user-1',
      });

      expect(res.success).toBe(true);
      expect(res.data?.projectId).toBe('novo-proj-uuid');
      expect(res.data?.version).toBe(4);
    });

    it('10. Rejeitar projeto inexistente na edição com 400 Bad Request', async () => {
      const mockSupabase = {
        rpc: mock(async () => {
          return {
            data: null,
            error: { code: '23503', message: 'O projeto especificado não existe ou foi eliminado.' },
          };
        }),
      } as any;

      const res = await updateTaskServer(mockSupabase, 'task-uuid', {
        projectId: 'proj-fantasma',
        version: 1,
        userId: 'user-1',
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
    });

    it('11 & 12. OCC: Conflito de concorrência devolve 409 Conflict quando a versão diverge (P0001)', async () => {
      const mockSupabase = {
        rpc: mock(async () => {
          return {
            data: null,
            error: { code: 'P0001', message: 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' },
          };
        }),
      } as any;

      const res = await updateTaskServer(mockSupabase, 'task-uuid', {
        title: 'Titulo Desatualizado',
        version: 1, // mas na BD já está na version 2
        userId: 'user-1',
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(409);
      expect(res.error).toContain('Conflito de concorrência');
    });

    it('13. Rejeitar update sem tasks:write com 403 Forbidden (42501)', async () => {
      const mockSupabase = {
        rpc: mock(async () => {
          return {
            data: null,
            error: { code: '42501', message: 'Sem permissão para editar tarefas.' },
          };
        }),
      } as any;

      const res = await updateTaskServer(mockSupabase, 'task-uuid', {
        title: 'Titulo',
        userId: 'user-sem-permissao',
      });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('5. Contrato de Eliminação (deleteTaskServer)', () => {
    it('14. Delete autorizado soft-deleta a tarefa atomicamente', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(fnName).toBe('delete_task_atomic');
          expect(args.p_id).toBe('task-del-uuid');
          expect(args.p_expected_version).toBe(2);
          return {
            data: { id: args.p_id, deleted: true, version: 3 },
            error: null,
          };
        }),
      } as any;

      const res = await deleteTaskServer(mockSupabase, 'task-del-uuid', 'user-admin', 2);
      expect(res.success).toBe(true);
    });

    it('15. Delete sem tasks:delete devolve 403 Forbidden (42501)', async () => {
      const mockSupabase = {
        rpc: mock(async () => {
          return {
            data: null,
            error: { code: '42501', message: 'Sem permissão para eliminar tarefas.' },
          };
        }),
      } as any;

      const res = await deleteTaskServer(mockSupabase, 'task-del-uuid', 'user-sem-delete', 1);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(403);
    });

    it('16. Delete com OCC inválido devolve 409 Conflict (P0001)', async () => {
      const mockSupabase = {
        rpc: mock(async () => {
          return {
            data: null,
            error: { code: 'P0001', message: 'Conflito de concorrência (OCC)' },
          };
        }),
      } as any;

      const res = await deleteTaskServer(mockSupabase, 'task-del-uuid', 'user-admin', 1);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(409);
    });
  });

  describe('6. Transacionalidade e Sincronização Atómica de Assignees', () => {
    it('17. Atualização de assignees propaga p_update_assignees = true e lista de UUIDs', async () => {
      const userList = ['user-uuid-1', 'user-uuid-2'];
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(args.p_update_assignees).toBe(true);
          expect(args.p_assignee_user_ids).toEqual(userList);
          return {
            data: { id: args.p_id, version: 2 },
            error: null,
          };
        }),
        from: () => ({ select: () => ({ eq: () => ({ data: userList.map(u => ({ user_id: u })) }) }) }),
      } as any;

      const res = await updateTaskServer(mockSupabase, 'task-uuid', {
        assignedUserIds: userList,
        version: 1,
        userId: 'user-1',
      });

      expect(res.success).toBe(true);
      expect(res.data?.assignedUserIds).toEqual(userList);
    });

    it('18. Zero fallbacks de escrita direta em tasks ou task_assignees no domínio taskService', () => {
      const code = readFileSync(join(process.cwd(), 'lib/tasks/taskService.ts'), 'utf-8');
      expect(code).not.toContain("sb.from('tasks').insert");
      expect(code).not.toContain("sb.from('tasks').update");
      expect(code).not.toContain("sb.from('task_assignees').insert");
      expect(code).not.toContain("sb.from('task_assignees').delete");
    });
  });
});
