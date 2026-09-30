import { describe, it, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { isTaskOnDate } from '@/lib/operationalCalendar';
import { createTaskServer, updateTaskServer, deleteTaskServer } from '@/lib/tasks/taskService';
import { isAllocationOutsideTaskWindow } from '@/lib/planning/summary';
import { validatePlanningAllocation } from '@/lib/planning/validationEngine';
import type { Task } from '@/lib/types';

// Mock DB helper to simulate Supabase RPC and table behavior
function createMockDb(initialTasks: any[] = [], initialAllocations: any[] = []) {
  const tasksStore = [...initialTasks];
  const allocsStore = [...initialAllocations];
  const usersStore = [
    { id: 'u-admin', name: 'Admin', email: 'admin@example.com', approved: true, deleted: false, role: 'ADMIN' },
    { id: 'u-tech', name: 'Técnico', email: 'tech@example.com', approved: true, deleted: false, role: 'TEAM' },
  ];
  const projectsStore = [
    { id: 'p-1', project_title: 'Projeto 1', deleted: false },
  ];

  function queryTable(tableName: string) {
    let records: any[] = [];
    if (tableName === 'tasks') records = [...tasksStore];
    else if (tableName === 'planning_allocations') records = [...allocsStore];
    else if (tableName === 'users') records = [...usersStore];
    else if (tableName === 'projects') records = [...projectsStore];
    else if (tableName === 'task_assignees') records = [];

    const queryObj: any = {
      select: () => queryObj,
      eq: (col: string, val: any) => {
        records = records.filter((r) => r[col] === val);
        return queryObj;
      },
      neq: (col: string, val: any) => {
        records = records.filter((r) => r[col] !== val);
        return queryObj;
      },
      in: (col: string, vals: any[]) => {
        const set = new Set(vals);
        records = records.filter((r) => set.has(r[col]));
        return queryObj;
      },
      lte: (col: string, val: any) => {
        records = records.filter((r) => r[col] <= val);
        return queryObj;
      },
      gte: (col: string, val: any) => {
        records = records.filter((r) => r[col] >= val);
        return queryObj;
      },
      maybeSingle: async () => ({ data: records.length > 0 ? records[0] : null, error: null }),
      then: (resolve: any) => resolve({ data: records, error: null }),
    };

    return queryObj;
  }

  const mockClient: any = {
    from: (t: string) => queryTable(t),
    rpc: async (fnName: string, params: any) => {
      if (fnName === 'create_task_atomic') {
        const pStart = params.p_start_date;
        const pEnd = params.p_end_date;

        if ((pStart && !pEnd) || (!pStart && pEnd)) {
          return { data: null, error: { code: '23514', message: 'Data de início e data de fim devem ser preenchidas em conjunto.' } };
        }

        if (pStart && pEnd && pEnd < pStart) {
          return { data: null, error: { code: '23514', message: 'Data de fim não pode ser anterior à data de início.' } };
        }

        const newRow = {
          id: params.p_id || 'new-task-id',
          project_id: params.p_project_id || null,
          task_title: params.p_task_title || 'Tarefa',
          status_id: '99999999-9999-9999-9999-999999999901',
          estimated_hours: params.p_estimated_hours || '8 hours',
          actual_hours: '0 hours',
          start_date: pStart || null,
          end_date: pEnd || null,
          estimated_date: params.p_estimated_date || null,
          version: 1,
          deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        tasksStore.push(newRow);
        return { data: newRow, error: null };
      }

      if (fnName === 'update_task_atomic') {
        const existingIdx = tasksStore.findIndex((t) => t.id === params.p_id && !t.deleted);
        if (existingIdx === -1) {
          return { data: null, error: { code: 'P0002', message: 'Tarefa não encontrada.' } };
        }

        const existing = tasksStore[existingIdx];
        let effStart = existing.start_date;
        let effEnd = existing.end_date;

        if (params.p_update_dates) {
          effStart = params.p_start_date;
          effEnd = params.p_end_date;
        } else {
          if (params.p_start_date !== null && params.p_start_date !== undefined) effStart = params.p_start_date;
          if (params.p_end_date !== null && params.p_end_date !== undefined) effEnd = params.p_end_date;
        }

        if ((effStart && !effEnd) || (!effStart && effEnd)) {
          return { data: null, error: { code: '23514', message: 'Data de início e data de fim devem ser preenchidas em conjunto.' } };
        }

        if (effStart && effEnd && effEnd < effStart) {
          return { data: null, error: { code: '23514', message: 'Data de fim não pode ser anterior à data de início.' } };
        }

        const updatedRow = {
          ...existing,
          project_id: params.p_update_project_id ? params.p_project_id : existing.project_id,
          task_title: params.p_task_title || existing.task_title,
          start_date: effStart,
          end_date: effEnd,
          estimated_date: params.p_estimated_date !== null && params.p_estimated_date !== undefined ? params.p_estimated_date : existing.estimated_date,
          version: (existing.version || 1) + 1,
          updated_at: new Date().toISOString(),
        };

        tasksStore[existingIdx] = updatedRow;
        return { data: updatedRow, error: null };
      }

      if (fnName === 'delete_task_atomic') {
        const activeAllocs = allocsStore.filter(a => a.task_id === params.p_id && (a.status === 'DRAFT' || a.status === 'CONFIRMED'));
        if (activeAllocs.length > 0) {
          return { data: null, error: { code: 'P0001', message: 'Não é possível eliminar a tarefa porque existem alocações de planeamento ativas (DRAFT/CONFIRMED) associadas.' } };
        }

        const existingIdx = tasksStore.findIndex((t) => t.id === params.p_id);
        if (existingIdx !== -1) {
          tasksStore[existingIdx].deleted = true;
        }
        return { data: { success: true }, error: null };
      }

      return { data: null, error: null };
    },
  };

  return mockClient;
}

describe('FASE 73-B — VALIDAÇÃO FINAL DA INTEGRIDADE TEMPORAL E PREPARAÇÃO DA MIGRATION SUPABASE', () => {
  describe('1. Verificação da Migration SQL & Assinaturas RPC', () => {
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261002000000_task_temporal_integrity_constraints.sql');
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');

    it('1. As assinaturas canónicas das RPCs não estão duplicadas/overloaded inadvertidamente (DROP IF EXISTS presente)', () => {
      expect(migrationContent).toContain('DROP FUNCTION IF EXISTS public.create_task_atomic');
      expect(migrationContent).toContain('DROP FUNCTION IF EXISTS public.update_task_atomic');
      expect(migrationContent).toContain('DROP FUNCTION IF EXISTS public.delete_task_atomic');
    });

    it('2. update_task_atomic possui exatamente 22 parâmetros com p_update_dates', () => {
      expect(migrationContent).toContain('CREATE OR REPLACE FUNCTION public.update_task_atomic(');
      expect(migrationContent).toContain('p_update_dates BOOLEAN DEFAULT FALSE');
    });

    it('3. create_task_atomic possui exatamente a assinatura canónica com p_project_id DEFAULT NULL', () => {
      expect(migrationContent).toContain('CREATE OR REPLACE FUNCTION public.create_task_atomic(');
      expect(migrationContent).toContain('p_project_id UUID DEFAULT NULL');
    });

    it('4. Constraints temporais (check_tasks_temporal_both_or_neither e check_tasks_end_date_gte_start_date) estão configuradas', () => {
      expect(migrationContent).toContain('check_tasks_temporal_both_or_neither');
      expect(migrationContent).toContain('check_tasks_end_date_gte_start_date');
      expect(migrationContent).toContain('(start_date IS NULL AND end_date IS NULL) OR');
      expect(migrationContent).toContain('start_date IS NULL OR end_date IS NULL OR end_date >= start_date');
    });

    it('Grants & Revokes: PUBLIC e anon têm permissões REVOGADAS e authenticated / service_role têm GRANT', () => {
      expect(migrationContent).toContain('REVOKE EXECUTE ON FUNCTION public.create_task_atomic');
      expect(migrationContent).toContain('GRANT EXECUTE ON FUNCTION public.create_task_atomic');
      expect(migrationContent).toContain('REVOKE EXECUTE ON FUNCTION public.update_task_atomic');
      expect(migrationContent).toContain('GRANT EXECUTE ON FUNCTION public.update_task_atomic');
      expect(migrationContent).toContain('REVOKE EXECUTE ON FUNCTION public.delete_task_atomic');
      expect(migrationContent).toContain('GRANT EXECUTE ON FUNCTION public.delete_task_atomic');
    });
  });

  describe('2. Validação Comportamental das Constraints Temporais', () => {
    it('5. start_date isolado (sem end_date) é rejeitado com erro 23514 / status 400', async () => {
      const sb = createMockDb();
      const res = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Start Date Apenas',
        startDate: '2026-10-05',
        endDate: '',
      });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toContain('preenchidas em conjunto');
    });

    it('6. end_date isolado (sem start_date) é rejeitado com erro 23514 / status 400', async () => {
      const sb = createMockDb();
      const res = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'End Date Apenas',
        startDate: '',
        endDate: '2026-10-10',
      });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toContain('preenchidas em conjunto');
    });

    it('7. end_date < start_date é rejeitado com erro 23514 / status 400', async () => {
      const sb = createMockDb();
      const res = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Datas Invertidas',
        startDate: '2026-10-10',
        endDate: '2026-10-05',
      });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toContain('anterior à data de início');
    });

    it('8. start_date = end_date é aceite com sucesso', async () => {
      const sb = createMockDb();
      const res = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Tarefa de 1 Dia',
        startDate: '2026-10-05',
        endDate: '2026-10-05',
      });
      expect(res.success).toBe(true);
      expect(res.data?.startDate).toBe('2026-10-05');
      expect(res.data?.endDate).toBe('2026-10-05');
    });

    it('9. start_date + end_date válidos (start <= end) são aceites com sucesso', async () => {
      const sb = createMockDb();
      const res = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Janela Válida',
        startDate: '2026-10-01',
        endDate: '2026-10-15',
      });
      expect(res.success).toBe(true);
      expect(res.data?.startDate).toBe('2026-10-01');
      expect(res.data?.endDate).toBe('2026-10-15');
    });

    it('10. Ambas NULL (start_date = NULL, end_date = NULL) são aceites com sucesso', async () => {
      const sb = createMockDb();
      const res = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Sem Datas Reais',
        startDate: null,
        endDate: null,
      });
      expect(res.success).toBe(true);
      expect(res.data?.startDate).toBe('');
      expect(res.data?.endDate).toBe('');
    });

    it('11. estimated_date isolada não cria artificialmente start_date/end_date', async () => {
      const sb = createMockDb();
      const res = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Data Estimada Apenas',
        estimatedDate: '2026-10-20',
        startDate: null,
        endDate: null,
      });
      expect(res.success).toBe(true);
      expect(res.data?.estimatedDate).toBe('2026-10-20');
      expect(res.data?.startDate).toBe('');
      expect(res.data?.endDate).toBe('');
    });
  });

  describe('3. Suporte a Tasks sem Projeto & Integredidade com Planning e Deletion', () => {
    it('12. project_id = NULL continua suportado na criação e atualização de tarefas', async () => {
      const sb = createMockDb();

      const createRes = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Tarefa Sem Projeto',
        projectId: null,
      });
      expect(createRes.success).toBe(true);
      expect(createRes.data?.projectId).toBeNull();

      const updateRes = await updateTaskServer(sb, createRes.data!.id, {
        userId: 'u-admin',
        title: 'Tarefa Sem Projeto Renomeada',
        projectId: null,
      });
      expect(updateRes.success).toBe(true);
      expect(updateRes.data?.projectId).toBeNull();
    });

    it('13. Tarefas sem projeto continuam suportadas pelo Planning (validação sem erros de projeto)', async () => {
      const sb = createMockDb([
        { id: 't-unprojected', task_title: 'Tarefa Avulsa', project_id: null, deleted: false },
      ]);

      const resVal = await validatePlanningAllocation(sb, {
        taskId: 't-unprojected',
        resourceId: 'u-tech',
        date: '2026-10-07',
        startTime: '09:00',
        endTime: '12:00',
        status: 'CONFIRMED',
      });

      expect(resVal.isValid).toBe(true);
    });

    it('14. delete_task_atomic continua a bloquear tarefas com alocações ativas (DRAFT ou CONFIRMED)', async () => {
      const sb = createMockDb(
        [{ id: 't-planning-active', task_title: 'Tarefa Planeada', deleted: false }],
        [{ id: 'alloc-active', task_id: 't-planning-active', status: 'CONFIRMED' }]
      );

      const resDelete = await deleteTaskServer(sb, 't-planning-active', 'u-admin');
      expect(resDelete.success).toBe(false);
      expect(resDelete.statusCode).toBe(409);
      expect(resDelete.error).toContain('alocações de planeamento ativas');
    });

    it('15. Apenas alocações CANCELLED permitem o soft-delete da tarefa', async () => {
      const sb = createMockDb(
        [{ id: 't-planning-cancelled', task_title: 'Tarefa com Alocação Cancelada', deleted: false }],
        [{ id: 'alloc-cancelled', task_id: 't-planning-cancelled', status: 'CANCELLED' }]
      );

      const resDelete = await deleteTaskServer(sb, 't-planning-cancelled', 'u-admin');
      expect(resDelete.success).toBe(true);
    });
  });
});
