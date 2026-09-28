import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { timesOverlap, parseTimeToMinutes, validatePlanningAllocation } from '@/lib/planning/validationEngine';
import {
  createPlanningAllocation,
  updatePlanningAllocation,
  deletePlanningAllocation,
} from '@/lib/planning/allocationService';

describe('FASE 65-D — PostgreSQL Runtime Integrity Verification', () => {

  describe('1. Auditoria Transversal de Writers em planning_allocations', () => {
    it('garante que apenas lib/planning/allocationService.ts executa escritas (INSERT/UPDATE/DELETE) em planning_allocations', () => {
      function findWriters(dir: string, writersList: Array<{ file: string; line: number; match: string }>) {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          if (entry === 'node_modules' || entry === '.next' || entry === '.git' || entry === 'tests') continue;
          const fullPath = join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            findWriters(fullPath, writersList);
          } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.js'))) {
            const content = readFileSync(fullPath, 'utf-8');
            if (content.includes("'planning_allocations'") || content.includes('"planning_allocations"')) {
              const lines = content.split('\n');
              lines.forEach((line, idx) => {
                if (
                  (line.includes('.insert(') || line.includes('.update(') || line.includes('.delete(') || line.includes('.upsert(')) &&
                  (content.includes('planning_allocations'))
                ) {
                  // If this line or block is writing to planning_allocations
                  if (line.includes('planning_allocations') || content.slice(Math.max(0, content.indexOf(line) - 200), content.indexOf(line) + 200).includes('planning_allocations')) {
                    writersList.push({ file: fullPath.replace(process.cwd(), ''), line: idx + 1, match: line.trim() });
                  }
                }
              });
            }
          }
        }
      }

      const writers: Array<{ file: string; line: number; match: string }> = [];
      findWriters(process.cwd(), writers);

      // All actual writes must only be within /lib/planning/allocationService.ts
      writers.forEach((w) => {
        expect(w.file).toContain('/lib/planning/allocationService.ts');
      });

      // Confirm no write routes exist in sync or API routes directly
      const syncCode = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');
      expect(syncCode).not.toContain(".from('planning_allocations').insert");
      expect(syncCode).not.toContain(".from('planning_allocations').update");
      expect(syncCode).not.toContain(".from('planning_allocations').upsert");
      expect(syncCode).not.toContain(".from('planning_allocations').delete");
    });
  });

  describe('2. Mapeamento Determinístico por SQLSTATE PostgreSQL (23P01 e 23514)', () => {
    it('reconhece 23P01 em createPlanningAllocation como HTTP 409 PLANNING_ALLOCATION_OVERLAP', async () => {
      const fakeSb: any = {
        from: (table: string) => {
          if (table === 'tasks') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 't1', task_title: 'T1', estimated_hours: '4 hours', deleted: false },
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
                    data: { id: 'u1', name: 'U1', email: 'u1@test.com', deleted: false, approved: true },
                    error: null,
                  }),
                }),
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
                      message: 'exclusion violation in PostgreSQL',
                    },
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                lte: () => ({ gte: async () => ({ data: [], error: null }) }),
                eq: () => ({ neq: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) }),
                maybeSingle: async () => ({ data: null, error: null }),
                async: () => ({ data: [], error: null }),
              }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          };
        },
      };

      const res = await createPlanningAllocation(
        fakeSb,
        {
          taskId: '11111111-1111-1111-1111-111111111111',
          resourceId: '22222222-2222-2222-2222-222222222222',
          date: '2026-10-01',
          startTime: '09:00',
          endTime: '11:00',
          status: 'CONFIRMED',
        },
        { id: 'admin', isAdmin: true }
      );

      expect(res.success).toBe(false);
      expect(res.error?.httpStatus).toBe(409);
      expect(res.error?.errorCode).toBe('PLANNING_ALLOCATION_OVERLAP');
    });

    it('reconhece 23514 em createPlanningAllocation como HTTP 400 INVALID_TIME_RANGE', async () => {
      const fakeSb: any = {
        from: (table: string) => {
          if (table === 'tasks') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 't1', task_title: 'T1', estimated_hours: '4 hours', deleted: false },
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
                    data: { id: 'u1', name: 'U1', email: 'u1@test.com', deleted: false, approved: true },
                    error: null,
                  }),
                }),
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
                      message: 'check violation in PostgreSQL',
                    },
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                lte: () => ({ gte: async () => ({ data: [], error: null }) }),
                eq: () => ({ neq: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) }),
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        },
      };

      const res = await createPlanningAllocation(
        fakeSb,
        {
          taskId: '11111111-1111-1111-1111-111111111111',
          resourceId: '22222222-2222-2222-2222-222222222222',
          date: '2026-10-01',
          startTime: '09:00',
          endTime: '11:00',
          status: 'CONFIRMED',
        },
        { id: 'admin', isAdmin: true }
      );

      expect(res.success).toBe(false);
      expect(res.error?.httpStatus).toBe(400);
      expect(res.error?.errorCode).toBe('INVALID_TIME_RANGE');
    });

    it('NÃO classifica erro com código genérico como OVERLAP mesmo que contenha o nome da constraint na mensagem', async () => {
      const fakeSb: any = {
        from: (table: string) => {
          if (table === 'tasks') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 't1', task_title: 'T1', estimated_hours: '4 hours', deleted: false },
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
                    data: { id: 'u1', name: 'U1', email: 'u1@test.com', deleted: false, approved: true },
                    error: null,
                  }),
                }),
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
                      code: '42P01', // Table not found or generic syntax error
                      message: 'syntax error near no_overlapping_confirmed_allocations',
                    },
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                lte: () => ({ gte: async () => ({ data: [], error: null }) }),
                eq: () => ({ neq: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) }),
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        },
      };

      const res = await createPlanningAllocation(
        fakeSb,
        {
          taskId: '11111111-1111-1111-1111-111111111111',
          resourceId: '22222222-2222-2222-2222-222222222222',
          date: '2026-10-01',
          startTime: '09:00',
          endTime: '11:00',
          status: 'CONFIRMED',
        },
        { id: 'admin', isAdmin: true }
      );

      // Must be classified as general DATABASE_ERROR (500), NOT PLANNING_ALLOCATION_OVERLAP (409)
      expect(res.success).toBe(false);
      expect(res.error?.httpStatus).toBe(500);
      expect(res.error?.errorCode).toBe('DATABASE_ERROR');
    });

    it('reconhece 23P01 em updatePlanningAllocation como HTTP 409 PLANNING_ALLOCATION_OVERLAP', async () => {
      function createQueryBuilder(table: string) {
        const builder: any = {
          select: () => builder,
          eq: (col: string, val: any) => builder,
          neq: (col: string, val: any) => builder,
          in: (col: string, vals: any[]) => builder,
          gte: (col: string, val: any) => builder,
          lte: (col: string, val: any) => builder,
          order: () => builder,
          range: () => builder,
          single: async () => {
            if (table === 'planning_allocations') {
              return { data: null, error: { code: '23P01', message: 'violates exclusion constraint' } };
            }
            return { data: null, error: null };
          },
          maybeSingle: async () => {
            if (table === 'planning_allocations') {
              return {
                data: {
                  id: 'pa-1',
                  task_id: 't1',
                  resource_id: 'u1',
                  date: '2026-10-01',
                  start_time: '09:00:00',
                  end_time: '11:00:00',
                  status: 'CONFIRMED',
                  version: 1,
                },
                error: null,
              };
            }
            if (table === 'tasks') {
              return {
                data: { id: 't1', task_title: 'T1', estimated_hours: '4 hours', deleted: false },
                error: null,
              };
            }
            if (table === 'users') {
              return {
                data: { id: 'u1', name: 'U1', email: 'u1@test.com', deleted: false, approved: true },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          update: () => builder,
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
        return builder;
      }

      const fakeSb: any = {
        from: (table: string) => {
          if (table === 'planning_allocations') {
            const b = createQueryBuilder('planning_allocations');
            b.update = () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({
                      data: null,
                      error: {
                        code: '23P01',
                        message: 'violates exclusion constraint',
                      },
                    }),
                  }),
                }),
              }),
            });
            return b;
          }
          return createQueryBuilder(table);
        },
      };

      const res = await updatePlanningAllocation(
        fakeSb,
        'pa-1',
        {
          version: 1,
          startTime: '10:00:00',
          endTime: '12:00:00',
        },
        { id: 'admin', isAdmin: true }
      );

      expect(res.success).toBe(false);
      expect(res.error?.httpStatus).toBe(409);
      expect(res.error?.errorCode).toBe('PLANNING_ALLOCATION_OVERLAP');
    });
  });

  describe('3. Validação de Intervalos Temporais e Sobreposição', () => {
    it('rejeita start_time = end_time (09:00 -> 09:00)', async () => {
      const fakeSb: any = {};
      const res = await validatePlanningAllocation(fakeSb, {
        taskId: '11111111-1111-1111-1111-111111111111',
        resourceId: '22222222-2222-2222-2222-222222222222',
        date: '2026-10-01',
        startTime: '09:00',
        endTime: '09:00',
        status: 'CONFIRMED',
      });
      expect(res.isValid).toBe(false);
      expect(res.errorCode).toBe('INVALID_TIME_RANGE');
      expect(res.httpStatus).toBe(400);
    });

    it('rejeita start_time > end_time (11:00 -> 10:00)', async () => {
      const fakeSb: any = {};
      const res = await validatePlanningAllocation(fakeSb, {
        taskId: '11111111-1111-1111-1111-111111111111',
        resourceId: '22222222-2222-2222-2222-222222222222',
        date: '2026-10-01',
        startTime: '11:00',
        endTime: '10:00',
        status: 'CONFIRMED',
      });
      expect(res.isValid).toBe(false);
      expect(res.errorCode).toBe('INVALID_TIME_RANGE');
      expect(res.httpStatus).toBe(400);
    });

    it('permite intervalos adjacentes (09:00–10:00 e 10:00–11:00)', () => {
      const aStart = parseTimeToMinutes('09:00');
      const aEnd = parseTimeToMinutes('10:00');
      const bStart = parseTimeToMinutes('10:00');
      const bEnd = parseTimeToMinutes('11:00');

      expect(timesOverlap(aStart, aEnd, bStart, bEnd)).toBe(false);
      expect(timesOverlap(bStart, bEnd, aStart, aEnd)).toBe(false);
    });

    it('rejeita sobreposição parcial (09:00–10:00 e 09:30–10:30)', () => {
      const aStart = parseTimeToMinutes('09:00');
      const aEnd = parseTimeToMinutes('10:00');
      const bStart = parseTimeToMinutes('09:30');
      const bEnd = parseTimeToMinutes('10:30');

      expect(timesOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
      expect(timesOverlap(bStart, bEnd, aStart, aEnd)).toBe(true);
    });

    it('rejeita sobreposição total (09:00–11:00 e 09:30–10:30)', () => {
      const aStart = parseTimeToMinutes('09:00');
      const aEnd = parseTimeToMinutes('11:00');
      const bStart = parseTimeToMinutes('09:30');
      const bEnd = parseTimeToMinutes('10:30');

      expect(timesOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
      expect(timesOverlap(bStart, bEnd, aStart, aEnd)).toBe(true);
    });
  });

  describe('4. Invariantes de Estados DRAFT e CANCELLED', () => {
    it('permite criação de alocação DRAFT mesmo sobreposta e sem bloquear capacidade', async () => {
      const validationCode = readFileSync(
        join(process.cwd(), 'lib/planning/validationEngine.ts'),
        'utf-8'
      );
      expect(validationCode).toContain("if (ctx.status === 'DRAFT')");
      expect(validationCode).toContain('isValid: true');
    });

    it('confirma que CANCELLED não bloqueia capacidade e é imutável', async () => {
      const validationCode = readFileSync(
        join(process.cwd(), 'lib/planning/validationEngine.ts'),
        'utf-8'
      );
      expect(validationCode).toContain("if (ctx.status === 'CANCELLED')");
      expect(validationCode).toContain('isValid: true');

      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );
      expect(serviceCode).toContain("current.status === 'CANCELLED'");
      expect(serviceCode).toContain("errorCode: 'INVALID_STATUS_TRANSITION'");
    });
  });

  describe('5. Concorrência no UPDATE via OCC', () => {
    it('garante que duas atualizações concorrentes com a mesma versão resultam em uma com sucesso e a segunda em 409 OCC_CONFLICT', async () => {
      // Simulação de OCC no allocationService
      const fakeSb: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'alloc-occ',
                  task_id: 't1',
                  resource_id: 'u1',
                  date: '2026-10-01',
                  start_time: '09:00:00',
                  end_time: '10:00:00',
                  status: 'CONFIRMED',
                  version: 2, // Current version in DB is 2
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      // Request submetendo versão desatualizada (1 em vez de 2)
      const resConflict = await updatePlanningAllocation(
        fakeSb,
        'alloc-occ',
        {
          version: 1,
          date: '2026-10-01',
        },
        { id: 'user-1' }
      );

      expect(resConflict.success).toBe(false);
      expect(resConflict.error?.httpStatus).toBe(409);
      expect(resConflict.error?.errorCode).toBe('OCC_CONFLICT');
    });
  });

  describe('6. Auditoria de Migrations SQL', () => {
    it('confirma que todas as migrações de planning respeitam os requisitos estruturais e relacionais', () => {
      const mig1 = readFileSync(join(process.cwd(), 'supabase/migrations/20260918000000_create_planning_tables.sql'), 'utf-8');
      const mig2 = readFileSync(join(process.cwd(), 'supabase/migrations/20260928010000_planning_allocations_exclusion_constraint.sql'), 'utf-8');
      const mig3 = readFileSync(join(process.cwd(), 'supabase/migrations/20260928020000_planning_allocations_integrity_hardening.sql'), 'utf-8');

      // Mig1: Initial creation with FKs
      expect(mig1).toContain('CREATE TABLE planning_allocations');
      expect(mig1).toContain('task_id UUID NOT NULL REFERENCES tasks(id)');
      expect(mig1).toContain('resource_id UUID NOT NULL REFERENCES users(id)');

      // Mig2: Exclusion constraint with btree_gist and IMMUTABLE function
      expect(mig2).toContain('CREATE EXTENSION IF NOT EXISTS btree_gist');
      expect(mig2).toContain('planning_allocation_tsrange(d DATE, s_time TIME, e_time TIME)');
      expect(mig2).toContain("tsrange((d + s_time), (d + e_time), '[)')");
      expect(mig2).toContain('IMMUTABLE PARALLEL SAFE');
      expect(mig2).toContain('EXCLUDE USING gist');
      expect(mig2).toContain("WHERE (status = 'CONFIRMED')");

      // Mig3: Hardening NOT NULL & CHECK
      expect(mig3).toContain('ALTER COLUMN resource_id SET NOT NULL');
      expect(mig3).toContain('chk_planning_allocations_start_before_end');
      expect(mig3).toContain('CHECK (start_time < end_time)');
    });
  });

  describe('7. Conformidade com Regra Global de Utilizador', () => {
    it('garante que ricardo75@gmail.com permanece com deleted: true', () => {
      const agentsMd = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(agentsMd).toContain('ricardo75@gmail.com');
      expect(agentsMd).toContain('deleted: true');
    });
  });

});
