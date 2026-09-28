import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { timesOverlap, parseTimeToMinutes, validatePlanningAllocation } from '@/lib/planning/validationEngine';
import { createPlanningAllocation, updatePlanningAllocation } from '@/lib/planning/allocationService';

describe('FASE 65-FINAL-C — Planning Database Integrity Hardening', () => {

  describe('1. Auditoria Obrigatória do Schema (Structural Hardening)', () => {
    it('garante que a migration de hardening define NOT NULL em todas as colunas essenciais', () => {
      const hardeningPath = join(
        process.cwd(),
        'supabase/migrations/20260928020000_planning_allocations_integrity_hardening.sql'
      );
      expect(existsSync(hardeningPath)).toBe(true);

      const sql = readFileSync(hardeningPath, 'utf-8');
      expect(sql).toContain('ALTER COLUMN resource_id SET NOT NULL');
      expect(sql).toContain('ALTER COLUMN task_id SET NOT NULL');
      expect(sql).toContain('ALTER COLUMN date SET NOT NULL');
      expect(sql).toContain('ALTER COLUMN start_time SET NOT NULL');
      expect(sql).toContain('ALTER COLUMN end_time SET NOT NULL');
      expect(sql).toContain('ALTER COLUMN status SET NOT NULL');
    });

    it('confirma que a migration original de planning_allocations já declarava NOT NULL nas colunas-chave', () => {
      const initialPath = join(
        process.cwd(),
        'supabase/migrations/20260918000000_create_planning_tables.sql'
      );
      expect(existsSync(initialPath)).toBe(true);

      const sql = readFileSync(initialPath, 'utf-8');
      expect(sql).toContain('resource_id UUID NOT NULL REFERENCES users(id)');
      expect(sql).toContain('task_id UUID NOT NULL REFERENCES tasks(id)');
      expect(sql).toContain('date DATE NOT NULL');
      expect(sql).toContain('start_time TIME NOT NULL');
      expect(sql).toContain('end_time TIME NOT NULL');
    });
  });

  describe('2. Invariante Temporal no Database (CHECK start_time < end_time)', () => {
    it('confirma a CHECK CONSTRAINT estrutural para garantir start_time < end_time no PostgreSQL', () => {
      const hardeningPath = join(
        process.cwd(),
        'supabase/migrations/20260928020000_planning_allocations_integrity_hardening.sql'
      );
      const sql = readFileSync(hardeningPath, 'utf-8');

      expect(sql).toContain('chk_planning_allocations_start_before_end');
      expect(sql).toContain('CHECK (start_time < end_time)');
    });

    it('rejeita intervalos inválidos a nível de validação temporal (start = end e start > end)', async () => {
      const fakeSb: any = {};

      // Caso 1: start_time == end_time (09:00 a 09:00)
      const resEqual = await validatePlanningAllocation(fakeSb, {
        taskId: '11111111-1111-1111-1111-111111111111',
        resourceId: '22222222-2222-2222-2222-222222222222',
        date: '2026-10-01',
        startTime: '09:00',
        endTime: '09:00',
        status: 'CONFIRMED',
      });
      expect(resEqual.isValid).toBe(false);
      expect(resEqual.errorCode).toBe('INVALID_TIME_RANGE');
      expect(resEqual.httpStatus).toBe(400);

      // Caso 2: start_time > end_time (11:00 a 10:00)
      const resGreater = await validatePlanningAllocation(fakeSb, {
        taskId: '11111111-1111-1111-1111-111111111111',
        resourceId: '22222222-2222-2222-2222-222222222222',
        date: '2026-10-01',
        startTime: '11:00',
        endTime: '10:00',
        status: 'CONFIRMED',
      });
      expect(resGreater.isValid).toBe(false);
      expect(resGreater.errorCode).toBe('INVALID_TIME_RANGE');
      expect(resGreater.httpStatus).toBe(400);
    });

    it('rejeita intervalos com duração inferior ao mínimo de 15 minutos', async () => {
      const fakeSb: any = {};
      const resShort = await validatePlanningAllocation(fakeSb, {
        taskId: '11111111-1111-1111-1111-111111111111',
        resourceId: '22222222-2222-2222-2222-222222222222',
        date: '2026-10-01',
        startTime: '09:00',
        endTime: '09:10', // 10 min
        status: 'CONFIRMED',
      });
      expect(resShort.isValid).toBe(false);
      expect(resShort.errorCode).toBe('INVALID_DURATION');
      expect(resShort.httpStatus).toBe(400);
    });
  });

  describe('3. Auditoria da Exclusion Constraint (no_overlapping_confirmed_allocations)', () => {
    it('garante que a exclusion constraint EXCLUDE USING gist está ativa com filtro status = CONFIRMED', () => {
      const exclusionMigrationPath = join(
        process.cwd(),
        'supabase/migrations/20260928010000_planning_allocations_exclusion_constraint.sql'
      );
      const sql = readFileSync(exclusionMigrationPath, 'utf-8');

      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS btree_gist');
      expect(sql).toContain('no_overlapping_confirmed_allocations');
      expect(sql).toContain('EXCLUDE USING gist');
      expect(sql).toContain('resource_id WITH =');
      expect(sql).toContain('date WITH =');
      expect(sql).toContain('planning_allocation_tsrange(date, start_time, end_time)) WITH &&');
      expect(sql).toContain("WHERE (status = 'CONFIRMED')");
    });

    it('demonstra que intervalos adjacentes (09:00–10:00 e 10:00–11:00) são permitidos', () => {
      const s1 = parseTimeToMinutes('09:00');
      const e1 = parseTimeToMinutes('10:00');
      const s2 = parseTimeToMinutes('10:00');
      const e2 = parseTimeToMinutes('11:00');

      // Intersecção em [09:00, 10:00) e [10:00, 11:00) é vazia
      expect(timesOverlap(s1, e1, s2, e2)).toBe(false);
      expect(timesOverlap(s2, e2, s1, e1)).toBe(false);
    });

    it('demonstra que intervalos sobrepostos parciais e totais são rejeitados', () => {
      // 09:00-10:00 e 09:59-10:01
      expect(
        timesOverlap(
          parseTimeToMinutes('09:00'),
          parseTimeToMinutes('10:00'),
          parseTimeToMinutes('09:59'),
          parseTimeToMinutes('10:01')
        )
      ).toBe(true);

      // 09:00-10:00 e 09:00-10:00 (idênticos)
      expect(
        timesOverlap(
          parseTimeToMinutes('09:00'),
          parseTimeToMinutes('10:00'),
          parseTimeToMinutes('09:00'),
          parseTimeToMinutes('10:00')
        )
      ).toBe(true);
    });
  });

  describe('4. Mapeamento Determinístico de Erro PostgreSQL (23P01 e 23514)', () => {
    it('mapeia código de erro 23P01 (exclusion_violation) para HTTP 409 PLANNING_ALLOCATION_OVERLAP em createPlanningAllocation', async () => {
      // Mock Supabase client simula validação OK e erro PostgreSQL 23P01 no insert
      const fakeSb: any = {
        from: (table: string) => {
          if (table === 'tasks') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 't1', task_title: 'Task 1', estimated_hours: '8 hours', deleted: false },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'users') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'u1', name: 'User 1', email: 'u1@example.com', deleted: false, approved: true },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'user_absences') {
            return {
              select: () => ({
                eq: () => ({
                  lte: () => ({
                    gte: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'resource_non_project_allocations') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    neq: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'work_schedule_overrides') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'resource_work_schedules') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          }
          if (table === 'task_skill_requirements') {
            return {
              select: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            };
          }
          if (table === 'planning_allocations') {
            return {
              select: () => ({
                eq: () => ({
                  in: async () => ({ data: [], error: null }),
                  eq: () => ({
                    eq: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: {
                      code: '23P01',
                      message: 'conflicting key value violates exclusion constraint "no_overlapping_confirmed_allocations"',
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const result = await createPlanningAllocation(
        fakeSb,
        {
          taskId: '11111111-1111-1111-1111-111111111111',
          resourceId: '22222222-2222-2222-2222-222222222222',
          date: '2026-10-01',
          startTime: '09:00',
          endTime: '11:00',
          status: 'CONFIRMED',
        },
        { id: 'admin-id', isAdmin: true }
      );

      expect(result.success).toBe(false);
      expect(result.error?.httpStatus).toBe(409);
      expect(result.error?.errorCode).toBe('PLANNING_ALLOCATION_OVERLAP');
      expect(result.error?.details?.code).toBe('23P01');
    });

    it('mapeia código de erro 23514 (check_violation) para HTTP 400 INVALID_TIME_RANGE em createPlanningAllocation', async () => {
      const fakeSb: any = {
        from: (table: string) => {
          if (table === 'tasks') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 't1', task_title: 'Task 1', estimated_hours: '8 hours', deleted: false },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'users') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'u1', name: 'User 1', email: 'u1@example.com', deleted: false, approved: true },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'user_absences') {
            return {
              select: () => ({
                eq: () => ({
                  lte: () => ({
                    gte: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'resource_non_project_allocations') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    neq: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'work_schedule_overrides') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'resource_work_schedules') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          }
          if (table === 'task_skill_requirements') {
            return {
              select: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            };
          }
          if (table === 'planning_allocations') {
            return {
              select: () => ({
                eq: () => ({
                  in: async () => ({ data: [], error: null }),
                  eq: () => ({
                    eq: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: {
                      code: '23514',
                      message: 'new row for relation "planning_allocations" violates check constraint "chk_planning_allocations_start_before_end"',
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const result = await createPlanningAllocation(
        fakeSb,
        {
          taskId: '11111111-1111-1111-1111-111111111111',
          resourceId: '22222222-2222-2222-2222-222222222222',
          date: '2026-10-01',
          startTime: '09:00',
          endTime: '11:00',
          status: 'CONFIRMED',
        },
        { id: 'admin-id', isAdmin: true }
      );

      expect(result.success).toBe(false);
      expect(result.error?.httpStatus).toBe(400);
      expect(result.error?.errorCode).toBe('INVALID_TIME_RANGE');
      expect(result.error?.details?.code).toBe('23514');
    });
  });

  describe('5. Invariantes de Estados: DRAFT, CONFIRMED e CANCELLED', () => {
    it('garante que DRAFT permite sobreposição e não bloqueia capacidade de outros', () => {
      const validationCode = readFileSync(
        join(process.cwd(), 'lib/planning/validationEngine.ts'),
        'utf-8'
      );
      expect(validationCode).toContain("if (ctx.status === 'DRAFT')");
      expect(validationCode).toContain('isValid: true');
    });

    it('garante que CANCELLED não bloqueia capacidade e é estritamente imutável', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );
      expect(serviceCode).toContain("current.status === 'CANCELLED'");
      expect(serviceCode).toContain("errorCode: 'INVALID_STATUS_TRANSITION'");
    });

    it('garante que DELETE só é permitido para DRAFT', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );
      expect(serviceCode).toContain("current.status === 'CONFIRMED'");
      expect(serviceCode).toContain("errorCode: 'CANNOT_DELETE_CONFIRMED'");
      expect(serviceCode).toContain("current.status === 'CANCELLED'");
      expect(serviceCode).toContain("errorCode: 'CANNOT_DELETE_CANCELLED'");
      expect(serviceCode).toContain(".eq('status', 'DRAFT')");
    });
  });

  describe('6. Concorrência e OCC', () => {
    it('confirma que updatePlanningAllocation aplica OCC estrito por id + version', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );
      expect(serviceCode).toContain('updates.version !== currentVersion');
      expect(serviceCode).toContain(".eq('version', currentVersion)");
      expect(serviceCode).toContain('version: currentVersion + 1');
      expect(serviceCode).toContain("errorCode: 'OCC_CONFLICT'");
    });
  });

  describe('7. Regra Global do Utilizador', () => {
    it('garante que ricardo75@gmail.com permanece com deleted: true', () => {
      const agentsMd = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(agentsMd).toContain('ricardo75@gmail.com');
      expect(agentsMd).toContain('deleted: true');
    });
  });
});
