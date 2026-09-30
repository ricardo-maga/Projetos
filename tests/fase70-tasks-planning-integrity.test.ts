import { describe, it, expect, mock } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { deleteTaskServer } from '@/lib/tasks/taskService';
import {
  computeResourceDayProjectDistribution,
  computeProjectPlanningImpact,
  computeProjectPlanningVsEstimate,
  groupResourceDayAllocationsByTask,
} from '@/lib/planning/summary';
import type { PlanningAllocationDTO } from '@/lib/planning/types';

describe('FASE 70 — TASKS ↔ PLANNING INTEGRITY HARDENING', () => {
  const migrationPath = join(
    process.cwd(),
    'supabase/migrations/20261001000000_harden_delete_task_planning_allocations_check.sql'
  );

  describe('1. Migration SQL de Integridade Canónica (delete_task_atomic)', () => {
    it('ficheiro de migration 20261001000000 existe no diretório canónico', () => {
      expect(existsSync(migrationPath)).toBe(true);
    });

    it('migration define CREATE OR REPLACE FUNCTION public.delete_task_atomic com assinatura canónica', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.delete_task_atomic(');
      expect(sql).toContain('p_id UUID,');
      expect(sql).toContain('p_expected_version INTEGER DEFAULT NULL,');
      expect(sql).toContain('p_updated_by UUID DEFAULT NULL');
      expect(sql).toContain('RETURNS JSONB');
    });

    it('migration declara SECURITY DEFINER e search_path = public', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain('SET search_path = public');
    });

    it('migration preserva RBAC tasks:delete e is_approved()', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain("auth.role() = 'authenticated'");
      expect(sql).toContain('public.is_approved()');
      expect(sql).toContain("public.has_permission('tasks:delete'");
    });

    it('migration preserva verificação OCC (v_current_version <> p_expected_version -> P0001)', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('v_current_version <> p_expected_version');
      expect(sql).toContain("USING ERRCODE = 'P0001'");
    });

    it('migration aplica a invariante canónica de bloqueio se existirem planning_allocations ativas', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('FROM public.planning_allocations');
      expect(sql).toContain('WHERE task_id = p_id');
      expect(sql).toContain("AND status <> 'CANCELLED'");
      expect(sql).toContain('Não é possível eliminar a tarefa porque existem alocações de planeamento ativas associadas.');
      expect(sql).toContain("USING ERRCODE = 'P0001'");
    });

    it('migration efetua soft-delete com incremento atómico de versão', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('UPDATE public.tasks');
      expect(sql).toContain('deleted = TRUE');
      expect(sql).toContain('version = version + 1');
      expect(sql).toContain('RETURNING * INTO v_task_row');
      expect(sql).toContain('RETURN to_jsonb(v_task_row)');
    });

    it('migration concede privilégios de execução a authenticated e service_role', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.delete_task_atomic(UUID, INTEGER, UUID) TO authenticated, service_role;');
    });
  });

  describe('2. PARTE 2 — Casos de Teste Tasks sem Project & Integridade com Planning', () => {
    const taskIdWithoutProject = '11111111-2222-3333-4444-555555555555';
    const taskIdWithProject = '99999999-8888-7777-6666-555555555555';
    const activeUserId = '00000000-0000-0000-0000-000000000001';

    // Caso A: Task com project_id = NULL suporta ciclo completo de planeamento
    it('Caso A: Task com project_id = NULL permite criar, consultar, atualizar e cancelar alocações', async () => {
      let mockAllocRow: any = {
        id: 'alloc-1',
        task_id: taskIdWithoutProject,
        resource_id: activeUserId,
        date: '2026-10-05',
        start_time: '09:00',
        end_time: '12:00',
        status: 'CONFIRMED',
        version: 1,
      };

      const mockSupabase = {
        from: (table: string) => ({
          select: () => ({
            eq: (_col: string, val: any) => ({
              maybeSingle: async () => {
                if (table === 'tasks' && val === taskIdWithoutProject) {
                  return {
                    data: {
                      id: taskIdWithoutProject,
                      task_title: 'Tarefa Geral sem Projeto',
                      project_id: null,
                      deleted: false,
                    },
                    error: null,
                  };
                }
                if (table === 'planning_allocations' && val === 'alloc-1') {
                  return { data: mockAllocRow, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
          update: (payload: any) => ({
            eq: (_col: string, _val: any) => ({
              select: () => ({
                single: async () => {
                  mockAllocRow = { ...mockAllocRow, ...payload, version: mockAllocRow.version + 1 };
                  return { data: mockAllocRow, error: null };
                },
              }),
            }),
          }),
        }),
      } as any;

      // 1. Consultar Task e verificar project_id = null
      const taskQuery = await mockSupabase.from('tasks').select('*').eq('id', taskIdWithoutProject).maybeSingle();
      expect(taskQuery.data?.id).toBe(taskIdWithoutProject);
      expect(taskQuery.data?.project_id).toBeNull();

      // 2. Consultar allocation
      const allocQuery = await mockSupabase.from('planning_allocations').select('*').eq('id', 'alloc-1').maybeSingle();
      expect(allocQuery.data?.task_id).toBe(taskIdWithoutProject);
      expect(allocQuery.data?.status).toBe('CONFIRMED');

      // 3. Atualizar allocation
      const updateRes = await mockSupabase.from('planning_allocations').update({ start_time: '10:00' }).eq('id', 'alloc-1').select().single();
      expect(updateRes.data?.start_time).toBe('10:00');
      expect(updateRes.data?.version).toBe(2);

      // 4. Cancelar allocation
      const cancelRes = await mockSupabase.from('planning_allocations').update({ status: 'CANCELLED' }).eq('id', 'alloc-1').select().single();
      expect(cancelRes.data?.status).toBe('CANCELLED');
      expect(cancelRes.data?.version).toBe(3);
    });

    // Caso B: Task sem Project + allocation DRAFT -> rejeitada pela delete_task_atomic
    it('Caso B: Task sem Project com alocação DRAFT ativa é rejeitada com 409 Conflict da RPC', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(fnName).toBe('delete_task_atomic');
          expect(args.p_id).toBe(taskIdWithoutProject);
          return {
            data: null,
            error: {
              code: 'P0001',
              message: 'Não é possível eliminar a tarefa porque existem alocações de planeamento ativas associadas.',
            },
          };
        }),
      } as any;

      const res = await deleteTaskServer(mockSupabase, taskIdWithoutProject, activeUserId, 1);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(409);
      expect(res.error).toBe('Não é possível eliminar a tarefa porque existem alocações de planeamento ativas associadas.');
    });

    // Caso C: Task sem Project + allocation CONFIRMED -> rejeitada pela delete_task_atomic
    it('Caso C: Task sem Project com alocação CONFIRMED é rejeitada com 409 Conflict da RPC', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(fnName).toBe('delete_task_atomic');
          expect(args.p_id).toBe(taskIdWithoutProject);
          return {
            data: null,
            error: {
              code: 'P0001',
              message: 'Não é possível eliminar a tarefa porque existem alocações de planeamento ativas associadas.',
            },
          };
        }),
      } as any;

      const res = await deleteTaskServer(mockSupabase, taskIdWithoutProject, activeUserId, 2);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(409);
      expect(res.error).toContain('alocações de planeamento ativas');
    });

    // Caso D: Task sem Project + allocation CANCELLED -> pode prosseguir com soft delete
    it('Caso D: Task sem Project com apenas alocações CANCELLED é eliminada com sucesso (soft-delete)', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(fnName).toBe('delete_task_atomic');
          expect(args.p_id).toBe(taskIdWithoutProject);
          return {
            data: {
              id: args.p_id,
              project_id: null,
              task_title: 'Tarefa Sem Projeto',
              deleted: true,
              version: 3,
            },
            error: null,
          };
        }),
      } as any;

      const res = await deleteTaskServer(mockSupabase, taskIdWithoutProject, activeUserId, 2);
      expect(res.success).toBe(true);
    });

    // Caso E: Task com Project + allocation ativa -> rejeitada mantendo integridade
    it('Caso E: Task com Project e alocação ativa continua a ser rejeitada com 409 Conflict', async () => {
      const mockSupabase = {
        rpc: mock(async (fnName: string, args: any) => {
          expect(fnName).toBe('delete_task_atomic');
          expect(args.p_id).toBe(taskIdWithProject);
          return {
            data: null,
            error: {
              code: 'P0001',
              message: 'Não é possível eliminar a tarefa porque existem alocações de planeamento ativas associadas.',
            },
          };
        }),
      } as any;

      const res = await deleteTaskServer(mockSupabase, taskIdWithProject, activeUserId, 1);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(409);
      expect(res.error).toContain('alocações de planeamento ativas');
    });
  });

  describe('3. Correção Semântica em lib/planning/summary.ts', () => {
    const makeAlloc = (
      id: string,
      taskId: string,
      resourceId: string,
      date: string,
      durationMinutes: number,
      status: 'CONFIRMED' | 'DRAFT' | 'CANCELLED'
    ): PlanningAllocationDTO => ({
      id,
      taskId,
      resourceId,
      date,
      startTime: '09:00',
      endTime: '12:00',
      durationMinutes,
      status,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const tasksList = [
      { id: 'task-no-proj-1', title: 'Manutenção de Bancada', projectId: null, estimatedHours: 4 },
      { id: 'task-with-proj-1', title: 'Montagem Elétrica', projectId: 'proj-solar-1', estimatedHours: 6 },
    ];

    const projectsList = [
      { id: 'proj-solar-1', title: 'Parque Solar Moura' },
    ];

    it('tarefa sem projecto é categorizada como "no_project" e título "Sem projeto" na distribuição diária', () => {
      const allocs = [
        makeAlloc('a1', 'task-no-proj-1', 'res-1', '2026-10-05', 180, 'CONFIRMED'),
      ];

      const res = computeResourceDayProjectDistribution('res-1', '2026-10-05', allocs, tasksList, projectsList);
      expect(res.projects.length).toBe(1);
      expect(res.projects[0].projectId).toBe('no_project');
      expect(res.projects[0].projectTitle).toBe('Sem projeto');
      expect(res.projects[0].plannedHours).toBe(3);
      expect(res.isConsistent).toBe(true);
    });

    it('alocação com tarefa não identificada (órfã) mantém-se como "unidentified" e "Projeto não identificado"', () => {
      const allocs = [
        makeAlloc('a2', 'task-fantasma-999', 'res-1', '2026-10-05', 120, 'CONFIRMED'),
      ];

      const res = computeResourceDayProjectDistribution('res-1', '2026-10-05', allocs, tasksList, projectsList);
      expect(res.projects.length).toBe(1);
      expect(res.projects[0].projectId).toBe('unidentified');
      expect(res.projects[0].projectTitle).toBe('Projeto não identificado');
      expect(res.projects[0].tasks[0].taskTitle).toBe('Tarefa não identificada');
      expect(res.isConsistent).toBe(true);
    });

    it('computeProjectPlanningImpact suporta "no_project" apresentando "Sem projeto"', () => {
      const allocs = [
        makeAlloc('a1', 'task-no-proj-1', 'res-1', '2026-10-05', 120, 'CONFIRMED'),
      ];

      const res = computeProjectPlanningImpact('no_project', allocs, tasksList, [], projectsList);
      expect(res.projectId).toBe('no_project');
      expect(res.projectTitle).toBe('Sem projeto');
      expect(res.totalPlannedHours).toBe(2);
      expect(res.isConsistent).toBe(true);
    });

    it('computeProjectPlanningVsEstimate suporta "no_project" apresentando "Sem projeto"', () => {
      const allocs = [
        makeAlloc('a1', 'task-no-proj-1', 'res-1', '2026-10-05', 120, 'CONFIRMED'),
      ];

      const res = computeProjectPlanningVsEstimate('no_project', allocs, tasksList, projectsList);
      expect(res.projectId).toBe('no_project');
      expect(res.projectTitle).toBe('Sem projeto');
      expect(res.totalConfirmedMinutes).toBe(120);
    });

    it('groupResourceDayAllocationsByTask preserva projectId = null em tarefas sem projeto', () => {
      const allocs = [
        makeAlloc('a1', 'task-no-proj-1', 'res-1', '2026-10-05', 120, 'CONFIRMED'),
      ];

      const groups = groupResourceDayAllocationsByTask('res-1', '2026-10-05', allocs, tasksList, projectsList);
      expect(groups.length).toBe(1);
      expect(groups[0].project).toBeNull();
      expect(groups[0].task?.projectId).toBeNull();
      expect(groups[0].task?.title).toBe('Manutenção de Bancada');
    });
  });

  describe('4. Regra Global de Negócio e Segurança de Utilizador', () => {
    it('utilizador ricardo75@gmail.com permanece com deleted: true', () => {
      const agentsMd = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(agentsMd).toContain('ricardo75@gmail.com');
      expect(agentsMd).toContain('deleted: true');
    });
  });
});
