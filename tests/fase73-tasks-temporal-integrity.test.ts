import { describe, it, expect } from 'bun:test';
import { isTaskOnDate } from '@/lib/operationalCalendar';
import { createTaskServer, updateTaskServer, deleteTaskServer } from '@/lib/tasks/taskService';
import { isAllocationOutsideTaskWindow } from '@/lib/planning/summary';
import { validatePlanningAllocation } from '@/lib/planning/validationEngine';
import type { Task } from '@/lib/types';

// Mock DB helper
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
          start_date: pStart,
          end_date: pEnd,
          estimated_date: params.p_estimated_date,
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

describe('FASE 73 — INTEGRIDADE TEMPORAL CANÓNICA DAS TASKS', () => {
  describe('1. Operacionalidade do Calendário (isTaskOnDate)', () => {
    it('A. Apenas estimatedDate -> calendário utiliza estimatedDate', () => {
      const task: Partial<Task> = {
        id: 't-1',
        estimatedDate: '2026-10-10',
        startDate: '',
        endDate: '',
      };
      expect(isTaskOnDate(task as Task, '2026-10-10')).toBe(true);
      expect(isTaskOnDate(task as Task, '2026-10-05')).toBe(false);
    });

    it('B. startDate + endDate -> calendário utiliza startDate', () => {
      const task: Partial<Task> = {
        id: 't-2',
        estimatedDate: '2026-10-15',
        startDate: '2026-10-05',
        endDate: '2026-10-10',
      };
      expect(isTaskOnDate(task as Task, '2026-10-05')).toBe(true);
      expect(isTaskOnDate(task as Task, '2026-10-15')).toBe(false);
    });

    it('Caso parcial: apenas startDate (sem endDate) -> não aceita startDate isolada e recorre a estimatedDate', () => {
      const task: Partial<Task> = {
        id: 't-3',
        estimatedDate: '2026-10-10',
        startDate: '2026-10-05',
        endDate: '',
      };
      expect(isTaskOnDate(task as Task, '2026-10-10')).toBe(true);
      expect(isTaskOnDate(task as Task, '2026-10-05')).toBe(false);
    });
  });

  describe('2. Validação Backend & RPCs (Temporal Integrity Constraints)', () => {
    it('C. Apenas startDate -> criação/atualização rejeitada com erro 23514', async () => {
      const sb = createMockDb();
      const resCreate = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Tarefa Inválida',
        startDate: '2026-10-05',
        endDate: '',
      });

      expect(resCreate.success).toBe(false);
      expect(resCreate.statusCode).toBe(400);
      expect(resCreate.error).toContain('preenchidas em conjunto');
    });

    it('D. Apenas endDate -> criação/atualização rejeitada com erro 23514', async () => {
      const sb = createMockDb();
      const resCreate = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Tarefa Inválida',
        startDate: '',
        endDate: '2026-10-10',
      });

      expect(resCreate.success).toBe(false);
      expect(resCreate.statusCode).toBe(400);
      expect(resCreate.error).toContain('preenchidas em conjunto');
    });

    it('E. endDate < startDate -> rejeitado com erro 23514', async () => {
      const sb = createMockDb();
      const resCreate = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Inverted Dates',
        startDate: '2026-10-10',
        endDate: '2026-10-05',
      });

      expect(resCreate.success).toBe(false);
      expect(resCreate.statusCode).toBe(400);
      expect(resCreate.error).toContain('anterior à data de início');
    });

    it('F. startDate = endDate -> aceite com sucesso', async () => {
      const sb = createMockDb();
      const resCreate = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Single Day Execution',
        startDate: '2026-10-05',
        endDate: '2026-10-05',
      });

      expect(resCreate.success).toBe(true);
      expect(resCreate.data?.startDate).toBe('2026-10-05');
      expect(resCreate.data?.endDate).toBe('2026-10-05');
    });
  });

  describe('3. Suporte Completo a Tarefas sem Projeto (project_id = NULL)', () => {
    it('G. projectId = NULL é aceite na criação, edição e remoção de projeto de uma tarefa', async () => {
      const sb = createMockDb();

      // 1. Criar tarefa sem projeto
      const resCreate = await createTaskServer(sb, {
        userId: 'u-admin',
        title: 'Tarefa Avulsa Sem Projeto',
        projectId: null,
      });
      expect(resCreate.success).toBe(true);
      expect(resCreate.data?.projectId).toBeNull();

      const taskId = resCreate.data!.id;

      // 2. Associar a projeto p-1
      const resAssignProject = await updateTaskServer(sb, taskId, {
        userId: 'u-admin',
        projectId: 'p-1',
        version: 1,
      });
      expect(resAssignProject.success).toBe(true);
      expect(resAssignProject.data?.projectId).toBe('p-1');

      // 3. Remover projeto da tarefa (retirar para NULL)
      const resRemoveProject = await updateTaskServer(sb, taskId, {
        userId: 'u-admin',
        projectId: null,
        version: 2,
      });
      expect(resRemoveProject.success).toBe(true);
      expect(resRemoveProject.data?.projectId).toBeNull();
    });

    it('H. Planning allocation para Task sem Projeto é aceite', async () => {
      const sb = createMockDb([
        { id: 't-no-proj', task_title: 'Tarefa Sem Projeto', project_id: null, deleted: false },
      ]);

      const resVal = await validatePlanningAllocation(sb, {
        taskId: 't-no-proj',
        resourceId: 'u-tech',
        date: '2026-10-07',
        startTime: '09:00',
        endTime: '12:00',
        status: 'CONFIRMED',
      });

      expect(resVal.isValid).toBe(true);
    });
  });

  describe('4. Avisos de Planeamento & Invariante de Eliminação (Planning & Deletion Safety)', () => {
    it('I. Temporal warning do Planning permanece correto com datas parciais ou nulas', () => {
      const taskWithDates = { startDate: '2026-10-05', endDate: '2026-10-10' };
      expect(isAllocationOutsideTaskWindow('2026-10-07', taskWithDates)).toBe(false);
      expect(isAllocationOutsideTaskWindow('2026-10-12', taskWithDates)).toBe(true);

      const taskStartOnly = { startDate: '2026-10-05', endDate: null };
      expect(isAllocationOutsideTaskWindow('2026-10-07', taskStartOnly)).toBe(false);
      expect(isAllocationOutsideTaskWindow('2026-10-02', taskStartOnly)).toBe(true);
    });

    it('J. Eliminar tarefa com alocações de planeamento ativas continua estritamente bloqueado', async () => {
      const sb = createMockDb(
        [{ id: 't-active-planning', task_title: 'Tarefa Planeada', deleted: false }],
        [{ id: 'alloc-1', task_id: 't-active-planning', status: 'CONFIRMED' }]
      );

      const resDelete = await deleteTaskServer(sb, 't-active-planning', 'u-admin');
      expect(resDelete.success).toBe(false);
      expect(resDelete.statusCode).toBe(409);
      expect(resDelete.error).toContain('alocações de planeamento ativas');
    });
  });
});
