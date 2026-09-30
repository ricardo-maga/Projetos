import { describe, it, expect } from 'bun:test';
import { isAllocationOutsideTaskWindow } from '@/lib/planning/summary';
import { validatePlanningAllocation } from '@/lib/planning/validationEngine';

// Known real columns for Phase 18 schema verification
const SCHEMA_TABLES: Record<string, string[]> = {
  users: ['id', 'name', 'email', 'deleted', 'approved', 'is_admin', 'role'],
  tasks: ['id', 'task_title', 'estimated_hours', 'deleted', 'status', 'project_id', 'start_date', 'end_date', 'estimated_date'],
  work_schedules: ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at', 'version'],
  work_schedule_periods: ['id', 'schedule_id', 'day_of_week', 'start_time', 'end_time', 'created_at', 'updated_at'],
  resource_work_schedules: ['id', 'resource_id', 'schedule_id', 'created_at', 'updated_at', 'version'],
  work_schedule_overrides: ['id', 'resource_id', 'date', 'is_working_day', 'created_at', 'updated_at', 'version'],
  work_schedule_override_periods: ['id', 'override_id', 'start_time', 'end_time', 'created_at', 'updated_at'],
  non_project_work: ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at', 'version'],
  resource_non_project_allocations: ['id', 'resource_id', 'work_id', 'date', 'start_time', 'end_time', 'status', 'created_at', 'updated_at', 'version'],
  skills: ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at', 'version'],
  resource_skills: ['id', 'resource_id', 'skill_id', 'proficiency_level', 'created_at', 'updated_at', 'version'],
  task_skill_requirements: ['id', 'task_id', 'skill_id', 'is_mandatory', 'created_at', 'updated_at', 'version'],
  planning_allocations: ['id', 'task_id', 'resource_id', 'date', 'start_time', 'end_time', 'status', 'created_at', 'updated_at', 'version'],
  user_absences: ['id', 'user_id', 'absence_start_date', 'absence_end_date', 'is_full_day', 'start_time', 'end_time', 'type', 'reason', 'status', 'version'],
};

function createMockDb(initialData: Record<string, any[]>) {
  const db: Record<string, any[]> = {};
  for (const table of Object.keys(SCHEMA_TABLES)) {
    db[table] = initialData[table] ? JSON.parse(JSON.stringify(initialData[table])) : [];
  }

  function buildQuery(tableName: string) {
    let records = [...(db[tableName] || [])];
    let isSingle = false;

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
        const valSet = new Set(vals);
        records = records.filter((r) => valSet.has(r[col]));
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

  return {
    from: (table: string) => buildQuery(table),
  } as any;
}

describe('FASE 72 — CORREÇÃO DA SEMÂNTICA DE JANELA TEMPORAL DO PLANNING', () => {
  describe('1. Unidade — Pure Logic (isAllocationOutsideTaskWindow)', () => {
    describe('Caso A: Intervalo completo (startDate + endDate)', () => {
      const taskA = { startDate: '2026-10-05', endDate: '2026-10-15' };

      it('1. antes do início -> true', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-02', taskA)).toBe(true);
      });

      it('2. exatamente no início -> false', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-05', taskA)).toBe(false);
      });

      it('3. dentro do intervalo -> false', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-10', taskA)).toBe(false);
      });

      it('4. exatamente no fim -> false', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-15', taskA)).toBe(false);
      });

      it('5. depois do fim -> true', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-18', taskA)).toBe(true);
      });
    });

    describe('Caso B: Apenas início (startDate)', () => {
      const taskB = { startDate: '2026-10-05', endDate: null };

      it('6. antes do início -> true', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-02', taskB)).toBe(true);
      });

      it('7. exatamente no início -> false', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-05', taskB)).toBe(false);
      });

      it('8. depois do início -> false (NÃO gera aviso falso por falta de endDate)', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-06', taskB)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-10-10', taskB)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-11-01', taskB)).toBe(false);
      });
    });

    describe('Caso C: Apenas fim (endDate)', () => {
      const taskC = { startDate: null, endDate: '2026-10-15' };

      it('9. antes do fim -> false', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-01', taskC)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-10-10', taskC)).toBe(false);
      });

      it('10. exatamente no fim -> false', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-15', taskC)).toBe(false);
      });

      it('11. depois do fim -> true', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-18', taskC)).toBe(true);
        expect(isAllocationOutsideTaskWindow('2026-11-01', taskC)).toBe(true);
      });
    });

    describe('Caso D: Sem datas', () => {
      const taskD = { startDate: null, endDate: null, estimatedDate: null };

      it('12. qualquer allocation date -> false', () => {
        expect(isAllocationOutsideTaskWindow('2026-10-01', taskD)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-10-10', taskD)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-12-31', taskD)).toBe(false);
      });
    });

    describe('Regra de Precedência com estimatedDate', () => {
      it('startDate + estimatedDate (sem endDate): não assume estimatedDate como endDate', () => {
        const task = { startDate: '2026-10-05', estimatedDate: '2026-10-10', endDate: null };
        expect(isAllocationOutsideTaskWindow('2026-10-02', task)).toBe(true);
        expect(isAllocationOutsideTaskWindow('2026-10-05', task)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-10-12', task)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-11-01', task)).toBe(false);
      });

      it('endDate + estimatedDate (sem startDate): não assume estimatedDate como startDate', () => {
        const task = { startDate: null, estimatedDate: '2026-10-10', endDate: '2026-10-15' };
        expect(isAllocationOutsideTaskWindow('2026-10-01', task)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-10-15', task)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-10-20', task)).toBe(true);
      });

      it('Apenas estimatedDate (sem startDate nem endDate): avalia igualdade estrita', () => {
        const task = { startDate: null, endDate: null, estimatedDate: '2026-10-10' };
        expect(isAllocationOutsideTaskWindow('2026-10-10', task)).toBe(false);
        expect(isAllocationOutsideTaskWindow('2026-10-09', task)).toBe(true);
        expect(isAllocationOutsideTaskWindow('2026-10-11', task)).toBe(true);
      });

      it('Suporta formato de propriedades em snake_case (start_date, end_date, estimated_date)', () => {
        const taskSnake = { start_date: '2026-10-05', end_date: null };
        expect(isAllocationOutsideTaskWindow('2026-10-02', taskSnake)).toBe(true);
        expect(isAllocationOutsideTaskWindow('2026-10-10', taskSnake)).toBe(false);
      });
    });
  });

  describe('2. Integração — Motor de Validação (validatePlanningAllocation)', () => {
    const baseUser = { id: 'u-1', name: 'Técnico', email: 'tech@example.com', deleted: false, approved: true };

    it('Task: start=2026-10-05, end=null | Allocation: 2026-10-07 (quarta-feira) => isValid=true, sem warning', async () => {
      const sb = createMockDb({
        users: [baseUser],
        tasks: [{ id: 't-start-only', task_title: 'Tarefa', start_date: '2026-10-05', end_date: null, deleted: false }],
      });

      const res = await validatePlanningAllocation(sb, {
        taskId: 't-start-only',
        resourceId: 'u-1',
        date: '2026-10-07',
        startTime: '09:00',
        endTime: '12:00',
        status: 'CONFIRMED',
      });

      expect(res.isValid).toBe(true);
      const windowWarning = res.warnings?.find((w) => w.code === 'OUTSIDE_TASK_TEMPORAL_WINDOW');
      expect(windowWarning).toBeUndefined();
    });

    it('Task: start=2026-10-05, end=null | Allocation: 2026-10-02 (sexta-feira) => isValid=true, warning EXISTE', async () => {
      const sb = createMockDb({
        users: [baseUser],
        tasks: [{ id: 't-start-only', task_title: 'Tarefa', start_date: '2026-10-05', end_date: null, deleted: false }],
      });

      const res = await validatePlanningAllocation(sb, {
        taskId: 't-start-only',
        resourceId: 'u-1',
        date: '2026-10-02',
        startTime: '09:00',
        endTime: '12:00',
        status: 'CONFIRMED',
      });

      expect(res.isValid).toBe(true);
      const windowWarning = res.warnings?.find((w) => w.code === 'OUTSIDE_TASK_TEMPORAL_WINDOW');
      expect(windowWarning).toBeDefined();
      expect(windowWarning?.message).toContain('fora da janela temporal');
    });

    it('Task: start=null, end=2026-10-15 | Allocation: 2026-10-07 (quarta-feira) => isValid=true, sem warning', async () => {
      const sb = createMockDb({
        users: [baseUser],
        tasks: [{ id: 't-end-only', task_title: 'Tarefa', start_date: null, end_date: '2026-10-15', deleted: false }],
      });

      const res = await validatePlanningAllocation(sb, {
        taskId: 't-end-only',
        resourceId: 'u-1',
        date: '2026-10-07',
        startTime: '09:00',
        endTime: '12:00',
        status: 'CONFIRMED',
      });

      expect(res.isValid).toBe(true);
      const windowWarning = res.warnings?.find((w) => w.code === 'OUTSIDE_TASK_TEMPORAL_WINDOW');
      expect(windowWarning).toBeUndefined();
    });

    it('Task: start=null, end=2026-10-15 | Allocation: 2026-10-20 (terça-feira) => isValid=true, warning EXISTE', async () => {
      const sb = createMockDb({
        users: [baseUser],
        tasks: [{ id: 't-end-only', task_title: 'Tarefa', start_date: null, end_date: '2026-10-15', deleted: false }],
      });

      const res = await validatePlanningAllocation(sb, {
        taskId: 't-end-only',
        resourceId: 'u-1',
        date: '2026-10-20',
        startTime: '09:00',
        endTime: '12:00',
        status: 'CONFIRMED',
      });

      expect(res.isValid).toBe(true);
      const windowWarning = res.warnings?.find((w) => w.code === 'OUTSIDE_TASK_TEMPORAL_WINDOW');
      expect(windowWarning).toBeDefined();
      expect(windowWarning?.message).toContain('fora da janela temporal');
    });
  });
});
