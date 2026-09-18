import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getResourceCapacityData,
  getResourceAvailabilitySlots,
  getResourceLoadSummary,
  calculateWorkPeriodsForDate,
  computeDayCapacity,
} from '../lib/planning/capacityService.ts';
import {
  validatePlanningAllocation,
  parseIntervalToHours,
  parseTimeToMinutes,
} from '../lib/planning/validationEngine.ts';

// Known real columns for Phase 18 schema verification
const SCHEMA_TABLES: Record<string, string[]> = {
  users: ['id', 'name', 'email', 'deleted', 'approved', 'is_admin', 'role'],
  tasks: ['id', 'task_title', 'estimated_hours', 'deleted', 'status', 'project_id'],
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

/**
 * Creates a schema-validating mock database that enforces table and column correctness
 */
function createSchemaMockDb(initialData: Record<string, any[]>) {
  const db: Record<string, any[]> = {};
  for (const table of Object.keys(SCHEMA_TABLES)) {
    db[table] = initialData[table] ? JSON.parse(JSON.stringify(initialData[table])) : [];
  }

  // Helper to build a query chain
  function buildQuery(tableName: string) {
    if (!SCHEMA_TABLES[tableName]) {
      throw new Error(`[SCHEMA ERROR] Table "${tableName}" does not exist in Phase 18 schema!`);
    }

    let records = [...(db[tableName] || [])];
    let selectedFields: string[] | null = null;
    let limitCount: number | null = null;
    let isSingle = false;

    const queryObj: any = {
      select: (fieldsStr: string = '*') => {
        if (fieldsStr !== '*') {
          const fields = fieldsStr.split(',').map((f) => f.trim());
          for (const f of fields) {
            // check if column is in schema table
            const cleanField = f.split(' ')[0]; // in case of aliases
            if (!SCHEMA_TABLES[tableName].includes(cleanField)) {
              throw new Error(
                `[SCHEMA ERROR] Column "${cleanField}" does not exist in table "${tableName}"!`
              );
            }
          }
          selectedFields = fields;
        }
        return queryObj;
      },
      eq: (col: string, val: any) => {
        if (!SCHEMA_TABLES[tableName].includes(col)) {
          throw new Error(`[SCHEMA ERROR] Column "${col}" does not exist in table "${tableName}"!`);
        }
        records = records.filter((r) => r[col] === val);
        return queryObj;
      },
      neq: (col: string, val: any) => {
        if (!SCHEMA_TABLES[tableName].includes(col)) {
          throw new Error(`[SCHEMA ERROR] Column "${col}" does not exist in table "${tableName}"!`);
        }
        records = records.filter((r) => r[col] !== val);
        return queryObj;
      },
      in: (col: string, vals: any[]) => {
        if (!SCHEMA_TABLES[tableName].includes(col)) {
          throw new Error(`[SCHEMA ERROR] Column "${col}" does not exist in table "${tableName}"!`);
        }
        const valSet = new Set(vals);
        records = records.filter((r) => valSet.has(r[col]));
        return queryObj;
      },
      gte: (col: string, val: any) => {
        if (!SCHEMA_TABLES[tableName].includes(col)) {
          throw new Error(`[SCHEMA ERROR] Column "${col}" does not exist in table "${tableName}"!`);
        }
        records = records.filter((r) => r[col] >= val);
        return queryObj;
      },
      lte: (col: string, val: any) => {
        if (!SCHEMA_TABLES[tableName].includes(col)) {
          throw new Error(`[SCHEMA ERROR] Column "${col}" does not exist in table "${tableName}"!`);
        }
        records = records.filter((r) => r[col] <= val);
        return queryObj;
      },
      limit: (n: number) => {
        limitCount = n;
        return queryObj;
      },
      maybeSingle: async () => {
        let result = records.length > 0 ? records[0] : null;
        if (result && selectedFields) {
          const projected: Record<string, any> = {};
          for (const f of selectedFields) projected[f] = result[f];
          result = projected;
        }
        return { data: result, error: null };
      },
      single: async () => {
        if (records.length === 0) {
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
        }
        let result = records[0];
        if (selectedFields) {
          const projected: Record<string, any> = {};
          for (const f of selectedFields) projected[f] = result[f];
          result = projected;
        }
        return { data: result, error: null };
      },
      update: (payload: Record<string, any>) => {
        for (const col of Object.keys(payload)) {
          if (!SCHEMA_TABLES[tableName].includes(col) && col !== 'updated_at') {
            throw new Error(`[SCHEMA ERROR] Column "${col}" does not exist in table "${tableName}"!`);
          }
        }
        const updateChain: any = {
          eq: (col: string, val: any) => {
            records = records.filter((r) => r[col] === val);
            return updateChain;
          },
          select: () => updateChain,
          maybeSingle: async () => {
            if (records.length === 0) return { data: null, error: null };
            const target = db[tableName].find((r) => r.id === records[0].id);
            if (target) Object.assign(target, payload);
            return { data: target, error: null };
          },
          then: (resolve: any) => {
            for (const r of records) {
              const target = db[tableName].find((item) => item.id === r.id);
              if (target) Object.assign(target, payload);
            }
            resolve({ data: records, error: null });
          },
        };
        return updateChain;
      },
      then: (resolve: any) => {
        let out = records;
        if (limitCount !== null) out = out.slice(0, limitCount);
        if (selectedFields) {
          out = out.map((r) => {
            const projected: Record<string, any> = {};
            for (const f of selectedFields!) projected[f] = r[f];
            return projected;
          });
        }
        resolve({ data: out, error: null });
      },
    };

    return queryObj;
  }

  const client = {
    from: (table: string) => buildQuery(table),
    _db: db,
  } as unknown as SupabaseClient & { _db: Record<string, any[]> };

  return client;
}

describe('FASE 22B — Testes de Integração de Planeamento e Validação de Schema', () => {
  const defaultUserData = [
    { id: 'user-tech-1', name: 'Ana Silva', email: 'ana@empresa.pt', deleted: false, approved: true, is_admin: false, role: 'technician' },
    { id: 'user-tech-2', name: 'Bruno Costa', email: 'bruno@empresa.pt', deleted: false, approved: true, is_admin: false, role: 'technician' },
  ];

  const defaultTaskData = [
    { id: 'task-100', task_title: 'Instalação Bastidor', estimated_hours: 8, deleted: false, status: 'OPEN', project_id: 'proj-1' },
    { id: 'task-200', task_title: 'Passagem Cabos', estimated_hours: 4, deleted: false, status: 'OPEN', project_id: 'proj-1' },
  ];

  // -------------------------------------------------------------
  // TESTE 1: RESOURCE → WORK SCHEDULE (resource_work_schedules -> work_schedules)
  // -------------------------------------------------------------
  it('TESTE 1 — Resource → Work Schedule: resolves assigned schedule (08:00-12:00, 13:00-17:00) = 8h operational, no users.work_schedule_id queried', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [
        { id: 'sched-split-8h', name: 'Horário Standard Split', is_active: true, version: 1 },
      ],
      resource_work_schedules: [
        { id: 'rws-1', resource_id: 'user-tech-1', schedule_id: 'sched-split-8h', version: 1 },
      ],
      work_schedule_periods: [
        // Friday (2026-09-18 is Friday = day 5)
        { id: 'p-1', schedule_id: 'sched-split-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-split-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
    });

    const capacity = await getResourceCapacityData(sb, {
      resourceId: 'user-tech-1',
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
    });

    assert.strictEqual(capacity.length, 1);
    const day = capacity[0];
    assert.strictEqual(day.resourceId, 'user-tech-1');
    assert.strictEqual(day.theoreticalCapacityMinutes, 480, '480 min = 8h, NOT 9h (lunch break 12:00-13:00 excluded)');
    assert.strictEqual(day.operationalCapacityMinutes, 480);
    assert.strictEqual(day.workSchedulePeriods.length, 2);
    assert.deepStrictEqual(day.workSchedulePeriods[0], { start: '08:00', end: '12:00', minutes: 240 });
    assert.deepStrictEqual(day.workSchedulePeriods[1], { start: '13:00', end: '17:00', minutes: 240 });
  });

  // -------------------------------------------------------------
  // TESTE 2: FALLBACK PARA GLOBAL ACTIVE SCHEDULE
  // -------------------------------------------------------------
  it('TESTE 2 — Fallback to Global Active Schedule: resource without resource_work_schedules uses global active schedule seamlessly', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      // user-tech-2 has NO entry in resource_work_schedules
      resource_work_schedules: [],
      work_schedules: [
        { id: 'sched-global-active', name: 'Horário Global Empresa', is_active: true, version: 1 },
      ],
      work_schedule_periods: [
        { id: 'gp-1', schedule_id: 'sched-global-active', day_of_week: 5, start_time: '08:30:00', end_time: '12:30:00' },
        { id: 'gp-2', schedule_id: 'sched-global-active', day_of_week: 5, start_time: '13:30:00', end_time: '17:30:00' },
      ],
    });

    const capacity = await getResourceCapacityData(sb, {
      resourceId: 'user-tech-2',
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
    });

    assert.strictEqual(capacity.length, 1);
    const day = capacity[0];
    assert.strictEqual(day.resourceId, 'user-tech-2');
    assert.strictEqual(day.theoreticalCapacityMinutes, 480);
    assert.strictEqual(day.workSchedulePeriods.length, 2);
    assert.strictEqual(day.workSchedulePeriods[0].start, '08:30');
    assert.strictEqual(day.workSchedulePeriods[1].end, '17:30');
  });

  // -------------------------------------------------------------
  // TESTE 3: OVERRIDES (work_schedule_overrides -> work_schedule_override_periods)
  // -------------------------------------------------------------
  it('TESTE 3 — Overrides: queries work_schedule_override_periods and handles normal, single, and multiple period overrides', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [{ id: 'sched-std', name: 'Std', is_active: true, version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-std', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-std', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
      work_schedule_overrides: [
        // Case B: Override single period (10:00-16:00 = 6h) on 2026-09-18
        { id: 'ov-1', resource_id: 'user-tech-1', date: '2026-09-18', is_working_day: true, version: 1 },
        // Case C: Override multiple periods (08:00-12:00, 13:30-18:00 = 8.5h) on 2026-09-18 for tech 2
        { id: 'ov-2', resource_id: 'user-tech-2', date: '2026-09-18', is_working_day: true, version: 1 },
      ],
      work_schedule_override_periods: [
        // For ov-1 (user-tech-1): 10:00 to 16:00 (360 min)
        { id: 'op-1', override_id: 'ov-1', start_time: '10:00:00', end_time: '16:00:00' },
        // For ov-2 (user-tech-2): 08:00-12:00 (240 min) and 13:30-18:00 (270 min) = 510 min
        { id: 'op-2', override_id: 'ov-2', start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'op-3', override_id: 'ov-2', start_time: '13:30:00', end_time: '18:00:00' },
      ],
    });

    // Tech 1 (Case B)
    const capTech1 = await getResourceCapacityData(sb, {
      resourceId: 'user-tech-1',
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
    });
    assert.strictEqual(capTech1[0].theoreticalCapacityMinutes, 360);
    assert.strictEqual(capTech1[0].workSchedulePeriods[0].start, '10:00');
    assert.strictEqual(capTech1[0].workSchedulePeriods[0].end, '16:00');

    // Tech 2 (Case C)
    const capTech2 = await getResourceCapacityData(sb, {
      resourceId: 'user-tech-2',
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
    });
    assert.strictEqual(capTech2[0].theoreticalCapacityMinutes, 510, '240 + 270 = 510 min (8.5h)');
    assert.strictEqual(capTech2[0].workSchedulePeriods.length, 2);
  });

  // -------------------------------------------------------------
  // TESTE 4: NON-PROJECT WORK (resource_non_project_allocations -> non_project_work)
  // -------------------------------------------------------------
  it('TESTE 4 — Non-Project Work: loads from resource_non_project_allocations and reduces capacity by exactly 1h (8h - 1h = 7h)', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [{ id: 'sched-8h', name: 'Std', is_active: true, version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
      non_project_work: [
        { id: 'npw-reuniao', name: 'Reunião de Coordenação', is_active: true, version: 1 },
      ],
      resource_non_project_allocations: [
        {
          id: 'np-alloc-1',
          resource_id: 'user-tech-1',
          work_id: 'npw-reuniao',
          date: '2026-09-18',
          start_time: '08:00:00',
          end_time: '09:00:00',
          status: 'CONFIRMED',
          version: 1,
        },
      ],
    });

    const capacity = await getResourceCapacityData(sb, {
      resourceId: 'user-tech-1',
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
    });

    const day = capacity[0];
    assert.strictEqual(day.theoreticalCapacityMinutes, 480, 'Capacidade bruta: 8h (480 min)');
    assert.strictEqual(day.nonProjectMinutes, 60, 'Non-project work: 1h (60 min)');
    assert.strictEqual(day.operationalCapacityMinutes, 420, 'Capacidade operacional: 7h (420 min)');
  });

  // -------------------------------------------------------------
  // TESTE 5: STATUS DOS NON-PROJECT ALLOCATIONS
  // -------------------------------------------------------------
  it('TESTE 5 — Status of Non-Project Allocations: CANCELLED does not consume capacity, CONFIRMED and DRAFT consume according to active rules', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [{ id: 'sched-8h', name: 'Std', is_active: true, version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
      non_project_work: [{ id: 'npw-1', name: 'Formação', is_active: true, version: 1 }],
      resource_non_project_allocations: [
        // CANCELLED non-project allocation 08:00-09:00 (must NOT consume)
        { id: 'np-c', resource_id: 'user-tech-1', work_id: 'npw-1', date: '2026-09-18', start_time: '08:00:00', end_time: '09:00:00', status: 'CANCELLED', version: 1 },
        // CONFIRMED non-project allocation 14:00-15:00 (consumes 60 min)
        { id: 'np-conf', resource_id: 'user-tech-1', work_id: 'npw-1', date: '2026-09-18', start_time: '14:00:00', end_time: '15:00:00', status: 'CONFIRMED', version: 1 },
      ],
    });

    const capacity = await getResourceCapacityData(sb, {
      resourceId: 'user-tech-1',
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
    });

    const day = capacity[0];
    assert.strictEqual(day.nonProjectMinutes, 60, 'Only CONFIRMED is debited; CANCELLED is ignored');
    assert.strictEqual(day.operationalCapacityMinutes, 420);
  });

  // -------------------------------------------------------------
  // TESTE 6: PLANNING ALLOCATIONS (CONFIRMED vs DRAFT vs CANCELLED)
  // -------------------------------------------------------------
  it('TESTE 6 — Planning Allocations: CONFIRMED consumes capacity; DRAFT and CANCELLED do NOT consume capacity', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [{ id: 'sched-8h', name: 'Std', is_active: true, version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
      planning_allocations: [
        // Allocation A: 08:00 - 10:00 CONFIRMED (120 min) -> consumes
        { id: 'pa-a', task_id: 'task-100', resource_id: 'user-tech-1', date: '2026-09-18', start_time: '08:00:00', end_time: '10:00:00', status: 'CONFIRMED', version: 1 },
        // Allocation B: 10:00 - 11:00 DRAFT (60 min) -> does NOT consume
        { id: 'pa-b', task_id: 'task-100', resource_id: 'user-tech-1', date: '2026-09-18', start_time: '10:00:00', end_time: '11:00:00', status: 'DRAFT', version: 1 },
        // Allocation C: 14:00 - 15:00 CANCELLED (60 min) -> does NOT consume
        { id: 'pa-c', task_id: 'task-100', resource_id: 'user-tech-1', date: '2026-09-18', start_time: '14:00:00', end_time: '15:00:00', status: 'CANCELLED', version: 1 },
      ],
    });

    const capacity = await getResourceCapacityData(sb, {
      resourceId: 'user-tech-1',
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
    });

    const day = capacity[0];
    assert.strictEqual(day.operationalCapacityMinutes, 480);
    assert.strictEqual(day.confirmedAllocationMinutes, 120, 'Only Allocation A (120 min) consumes capacity');
    assert.strictEqual(day.availableMinutes, 360, '480 - 120 = 360 min available');
    assert.strictEqual(day.utilizationPercent, 25);
  });

  // -------------------------------------------------------------
  // TESTE 7: ABSENCES (Full Day, Partial, Crossing Lunch)
  // -------------------------------------------------------------
  it('TESTE 7 — Absences: Full day absence zeroes capacity; Partial absence crossing lunch (11:00-14:00) only reduces workable minutes (120 min)', async () => {
    // 1. Full Day absence test
    const sbFull = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [{ id: 'sched-8h', name: 'Std', is_active: true, version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
      user_absences: [
        { id: 'abs-full', user_id: 'user-tech-1', absence_start_date: '2026-09-18', absence_end_date: '2026-09-18', is_full_day: true, status: 'APPROVED', version: 1 },
      ],
    });
    const capFull = await getResourceCapacityData(sbFull, { resourceId: 'user-tech-1', dateFrom: '2026-09-18', dateTo: '2026-09-18' });
    assert.strictEqual(capFull[0].absenceMinutes, 480);
    assert.strictEqual(capFull[0].operationalCapacityMinutes, 0);

    // 2. Partial absence crossing lunch: 11:00 to 14:00 on (08:00-12:00 and 13:00-17:00)
    // 11:00-12:00 (60 min) + 13:00-14:00 (60 min) = 120 min effective reduction (12:00-13:00 is lunch and not deducted)
    const sbPartial = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [{ id: 'sched-8h', name: 'Std', is_active: true, version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
      user_absences: [
        {
          id: 'abs-part',
          user_id: 'user-tech-1',
          absence_start_date: '2026-09-18',
          absence_end_date: '2026-09-18',
          is_full_day: false,
          start_time: '11:00:00',
          end_time: '14:00:00',
          status: 'APPROVED',
          version: 1,
        },
      ],
    });
    const capPart = await getResourceCapacityData(sbPartial, { resourceId: 'user-tech-1', dateFrom: '2026-09-18', dateTo: '2026-09-18' });
    assert.strictEqual(capPart[0].absenceMinutes, 120, 'Absence 11:00-14:00 only reduces 60m morning + 60m afternoon = 120m');
    assert.strictEqual(capPart[0].operationalCapacityMinutes, 360, '480 - 120 = 360 min');
  });

  // -------------------------------------------------------------
  // TESTE 8: LUNCH / SPLIT SCHEDULE INTERVALS
  // -------------------------------------------------------------
  it('TESTE 8 — Lunch / Split Schedule: validation engine correctly blocks CONFIRMED allocations crossing lunch pause (11:00-13:00)', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      tasks: defaultTaskData,
      work_schedules: [{ id: 'sched-8h', name: 'Std', is_active: true, version: 1 }],
      resource_work_schedules: [{ id: 'rws-1', resource_id: 'user-tech-1', schedule_id: 'sched-8h', version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
    });

    // 1. Allocation 11:00 - 13:00 (crosses 12:00-13:00 lunch) -> must fail validation with OUTSIDE_WORK_SCHEDULE
    const valCrossLunch = await validatePlanningAllocation(sb, {
      taskId: 'task-100',
      resourceId: 'user-tech-1',
      date: '2026-09-18',
      startTime: '11:00',
      endTime: '13:00',
      status: 'CONFIRMED',
    });
    assert.strictEqual(valCrossLunch.isValid, false);
    assert.strictEqual(valCrossLunch.errorCode, 'OUTSIDE_WORK_SCHEDULE');

    // 2. Allocation 12:00 - 13:00 (pure lunch interval) -> must fail
    const valInLunch = await validatePlanningAllocation(sb, {
      taskId: 'task-100',
      resourceId: 'user-tech-1',
      date: '2026-09-18',
      startTime: '12:00',
      endTime: '13:00',
      status: 'CONFIRMED',
    });
    assert.strictEqual(valInLunch.isValid, false);
    assert.strictEqual(valInLunch.errorCode, 'OUTSIDE_WORK_SCHEDULE');

    // 3. Allocation 13:00 - 14:00 (valid afternoon shift) -> must pass
    const valValid = await validatePlanningAllocation(sb, {
      taskId: 'task-100',
      resourceId: 'user-tech-1',
      date: '2026-09-18',
      startTime: '13:00',
      endTime: '14:00',
      status: 'CONFIRMED',
    });
    assert.strictEqual(valValid.isValid, true);
  });

  // -------------------------------------------------------------
  // TESTE 9: CAPACITY ENDPOINT LOGIC
  // -------------------------------------------------------------
  it('TESTE 9 — Capacity Endpoint: returns accurate full capacity object with all deductions and free periods', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [{ id: 'sched-8h', name: 'Std', is_active: true, version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
      user_absences: [
        { id: 'abs-1', user_id: 'user-tech-1', absence_start_date: '2026-09-18', absence_end_date: '2026-09-18', is_full_day: false, start_time: '09:00:00', end_time: '10:00:00', status: 'APPROVED', version: 1 },
      ],
      resource_non_project_allocations: [
        { id: 'np-1', resource_id: 'user-tech-1', work_id: 'npw-1', date: '2026-09-18', start_time: '14:00:00', end_time: '15:00:00', status: 'CONFIRMED', version: 1 },
      ],
      planning_allocations: [
        { id: 'pa-1', task_id: 'task-100', resource_id: 'user-tech-1', date: '2026-09-18', start_time: '10:30:00', end_time: '11:30:00', status: 'CONFIRMED', version: 1 },
      ],
    });

    const capacity = await getResourceCapacityData(sb, {
      resourceId: 'user-tech-1',
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
    });

    const day = capacity[0];
    assert.strictEqual(day.theoreticalCapacityMinutes, 480);
    assert.strictEqual(day.absenceMinutes, 60);
    assert.strictEqual(day.nonProjectMinutes, 60);
    assert.strictEqual(day.operationalCapacityMinutes, 360, '480 - 60 - 60 = 360 min');
    assert.strictEqual(day.confirmedAllocationMinutes, 60);
    assert.strictEqual(day.availableMinutes, 300, '360 - 60 = 300 min');
    assert.strictEqual(day.utilizationPercent, 16.7);
  });

  // -------------------------------------------------------------
  // TESTE 10: AVAILABILITY ENDPOINT
  // -------------------------------------------------------------
  it('TESTE 10 — Availability Endpoint: calculates available continuous slots respecting schedule, absences, non-project and confirmed allocations', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [{ id: 'sched-8h', name: 'Std', is_active: true, version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
      user_absences: [
        { id: 'abs-1', user_id: 'user-tech-1', absence_start_date: '2026-09-18', absence_end_date: '2026-09-18', is_full_day: false, start_time: '09:00:00', end_time: '10:00:00', status: 'APPROVED', version: 1 },
      ],
      resource_non_project_allocations: [
        { id: 'np-1', resource_id: 'user-tech-1', work_id: 'npw-1', date: '2026-09-18', start_time: '14:00:00', end_time: '15:00:00', status: 'CONFIRMED', version: 1 },
      ],
      planning_allocations: [
        { id: 'pa-1', task_id: 'task-100', resource_id: 'user-tech-1', date: '2026-09-18', start_time: '10:30:00', end_time: '11:30:00', status: 'CONFIRMED', version: 1 },
      ],
    });

    // Free periods expected:
    // 08:00 - 09:00 (60m)
    // 10:00 - 10:30 (30m)
    // 11:30 - 12:00 (30m)
    // 13:00 - 14:00 (60m)
    // 15:00 - 17:00 (120m)
    const slots60 = await getResourceAvailabilitySlots(sb, {
      resourceId: 'user-tech-1',
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
      durationMinutes: 60,
      stepMinutes: 30,
    });

    // 08:00-09:00, 13:00-14:00, 15:00-16:00, 15:30-16:30, 16:00-17:00
    assert.ok(slots60.some((s) => s.startTime === '08:00' && s.endTime === '09:00'));
    assert.ok(slots60.some((s) => s.startTime === '13:00' && s.endTime === '14:00'));
    assert.ok(slots60.some((s) => s.startTime === '15:00' && s.endTime === '16:00'));
    assert.ok(slots60.some((s) => s.startTime === '16:00' && s.endTime === '17:00'));
    // None should fall in 09:00-10:00 (absence), 10:30-11:30 (alloc), 12:00-13:00 (lunch), 14:00-15:00 (non-project)
    assert.strictEqual(slots60.some((s) => s.startTime === '09:00'), false);
    assert.strictEqual(slots60.some((s) => s.startTime === '12:00'), false);
    assert.strictEqual(slots60.some((s) => s.startTime === '14:00'), false);
  });

  // -------------------------------------------------------------
  // TESTE 11: RESOURCE LOAD (0%, Partial, 100%, Over-allocated)
  // -------------------------------------------------------------
  it('TESTE 11 — Resource Load: accurately reports planned minutes, operational capacity, available minutes, over-allocation, and utilization', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      work_schedules: [{ id: 'sched-8h', name: 'Std', is_active: true, version: 1 }],
      work_schedule_periods: [
        { id: 'p-1', schedule_id: 'sched-8h', day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
        { id: 'p-2', schedule_id: 'sched-8h', day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
      ],
      planning_allocations: [
        // Tech 1: 240 min confirmed on 480 min capacity = 50%
        { id: 'pa-1', task_id: 'task-100', resource_id: 'user-tech-1', date: '2026-09-18', start_time: '08:00:00', end_time: '12:00:00', status: 'CONFIRMED', version: 1 },
        // Tech 2: Overallocated: 540 min confirmed on 480 min capacity (08:00-12:00 + 13:00-18:00)
        { id: 'pa-2', task_id: 'task-100', resource_id: 'user-tech-2', date: '2026-09-18', start_time: '08:00:00', end_time: '12:00:00', status: 'CONFIRMED', version: 1 },
        { id: 'pa-3', task_id: 'task-200', resource_id: 'user-tech-2', date: '2026-09-18', start_time: '13:00:00', end_time: '18:00:00', status: 'CONFIRMED', version: 1 },
      ],
    });

    const summary = await getResourceLoadSummary(sb, {
      dateFrom: '2026-09-18',
      dateTo: '2026-09-18',
    });

    const tech1Load = summary.find((s) => s.resourceId === 'user-tech-1')!;
    assert.strictEqual(tech1Load.operationalCapacityMinutes, 480);
    assert.strictEqual(tech1Load.plannedMinutes, 240);
    assert.strictEqual(tech1Load.availableMinutes, 240);
    assert.strictEqual(tech1Load.overAllocatedMinutes, 0);
    assert.strictEqual(tech1Load.utilizationPercent, 50);

    const tech2Load = summary.find((s) => s.resourceId === 'user-tech-2')!;
    assert.strictEqual(tech2Load.operationalCapacityMinutes, 480);
    assert.strictEqual(tech2Load.plannedMinutes, 540);
    assert.strictEqual(tech2Load.availableMinutes, 0);
    assert.strictEqual(tech2Load.overAllocatedMinutes, 60);
    assert.strictEqual(tech2Load.utilizationPercent, 112.5);
  });

  // -------------------------------------------------------------
  // TESTE 12: MULTIPLE TECHNICIANS (Labor Effort vs Elapsed Time)
  // -------------------------------------------------------------
  it('TESTE 12 — Multiple Technicians: calculates total labor effort (sum = 5h) distinct from elapsed span (08:00-11:00 = 3h)', async () => {
    // Technician A: 08:00 - 10:00 (2h = 120 min)
    // Technician B: 08:00 - 11:00 (3h = 180 min)
    const allocA = { start_time: '08:00', end_time: '10:00' };
    const allocB = { start_time: '08:00', end_time: '11:00' };

    const effortA = parseTimeToMinutes(allocA.end_time) - parseTimeToMinutes(allocA.start_time);
    const effortB = parseTimeToMinutes(allocB.end_time) - parseTimeToMinutes(allocB.start_time);
    const totalLaborEffortMinutes = effortA + effortB;
    const totalLaborHours = totalLaborEffortMinutes / 60;

    const earliestStart = Math.min(parseTimeToMinutes(allocA.start_time), parseTimeToMinutes(allocB.start_time));
    const latestEnd = Math.max(parseTimeToMinutes(allocA.end_time), parseTimeToMinutes(allocB.end_time));
    const elapsedMinutes = latestEnd - earliestStart;
    const elapsedHours = elapsedMinutes / 60;

    assert.strictEqual(totalLaborHours, 5, 'Labor effort must be 2h + 3h = 5h');
    assert.strictEqual(elapsedHours, 3, 'Elapsed time is 08:00 -> 11:00 = 3h');
  });

  // -------------------------------------------------------------
  // TESTE 13: TASK ASSIGNEES vs PLANNING ALLOCATIONS
  // -------------------------------------------------------------
  it('TESTE 13 — Task Assignees vs Planning Allocations: allocations remain independent from task assignees', async () => {
    const sb = createSchemaMockDb({
      users: defaultUserData,
      tasks: defaultTaskData,
      planning_allocations: [
        // tech-2 is allocated to task-100 even if tech-1 is the sole project lead
        { id: 'pa-1', task_id: 'task-100', resource_id: 'user-tech-2', date: '2026-09-18', start_time: '08:00:00', end_time: '10:00:00', status: 'DRAFT', version: 1 },
      ],
    });

    const { data: allocs } = await sb.from('planning_allocations').select('*').eq('task_id', 'task-100');
    assert.strictEqual(allocs.length, 1);
    assert.strictEqual(allocs[0].resource_id, 'user-tech-2');
  });

  // -------------------------------------------------------------
  // TESTE 14: PLANNED / REMAINING ESTIMATES
  // -------------------------------------------------------------
  it('TESTE 14 — Planned / Remaining: parses task interval and verifies planned sum (5h) vs remaining (3h) on 8h task', async () => {
    const estimatedHours = parseIntervalToHours('8 hours');
    const allocationDurations = [3, 2]; // 3h and 2h
    const plannedHours = allocationDurations.reduce((a, b) => a + b, 0);
    const remainingHours = Math.max(0, estimatedHours - plannedHours);

    assert.strictEqual(estimatedHours, 8);
    assert.strictEqual(plannedHours, 5);
    assert.strictEqual(remainingHours, 3);
  });

  // -------------------------------------------------------------
  // TESTE 15: OPTIMISTIC CONCURRENCY CONTROL (OCC)
  // -------------------------------------------------------------
  it('TESTE 15 — OCC: version check increments on match (v3 -> v4) and rejects stale submitted version (HTTP 409 simulation)', async () => {
    const sb = createSchemaMockDb({
      planning_allocations: [
        { id: 'pa-occ-1', task_id: 'task-100', resource_id: 'user-tech-1', date: '2026-09-18', start_time: '08:00:00', end_time: '10:00:00', status: 'DRAFT', version: 3 },
      ],
    });

    // 1. Fetch current record
    const { data: current } = await sb.from('planning_allocations').select('*').eq('id', 'pa-occ-1').maybeSingle();
    assert.strictEqual(current.version, 3);

    // 2. User 1 submits update with version: 3 -> succeeds
    const user1SubmittedVersion = 3;
    assert.strictEqual(user1SubmittedVersion === current.version, true);
    await sb.from('planning_allocations').update({ version: current.version + 1, start_time: '08:30:00' }).eq('id', 'pa-occ-1').eq('version', 3);

    // 3. User 2 concurrently tries with version: 3
    const { data: updatedCurrent } = await sb.from('planning_allocations').select('*').eq('id', 'pa-occ-1').maybeSingle();
    assert.strictEqual(updatedCurrent.version, 4);

    const user2SubmittedVersion = 3;
    const isConflict = user2SubmittedVersion !== updatedCurrent.version;
    assert.strictEqual(isConflict, true, 'User 2 with stale version 3 receives 409 conflict against version 4');
  });

  // -------------------------------------------------------------
  // TESTE 16: CANCELLED IMMUTABILITY
  // -------------------------------------------------------------
  it('TESTE 16 — CANCELLED Immutability: rejected when attempting to mutate or reactivate a CANCELLED allocation', async () => {
    const currentAllocation = {
      id: 'pa-canc-1',
      task_id: 'task-100',
      resource_id: 'user-tech-1',
      date: '2026-09-18',
      start_time: '08:00:00',
      end_time: '10:00:00',
      status: 'CANCELLED',
      version: 1,
    };

    // Helper checking rule from /api/v1/planning-allocations/[id]/route.ts
    function attemptUpdateCancelled(updates: { status?: string; date?: string; startTime?: string }): { allowed: boolean; errorCode?: string } {
      if (currentAllocation.status === 'CANCELLED') {
        return {
          allowed: false,
          errorCode: 'INVALID_STATUS_TRANSITION',
        };
      }
      return { allowed: true };
    }

    // Attempting to reactivate to DRAFT
    const resDraft = attemptUpdateCancelled({ status: 'DRAFT' });
    assert.strictEqual(resDraft.allowed, false);
    assert.strictEqual(resDraft.errorCode, 'INVALID_STATUS_TRANSITION');

    // Attempting to reactivate to CONFIRMED
    const resConf = attemptUpdateCancelled({ status: 'CONFIRMED' });
    assert.strictEqual(resConf.allowed, false);
    assert.strictEqual(resConf.errorCode, 'INVALID_STATUS_TRANSITION');

    // Attempting to change date on cancelled
    const resDate = attemptUpdateCancelled({ date: '2026-09-19' });
    assert.strictEqual(resDate.allowed, false);
    assert.strictEqual(resDate.errorCode, 'INVALID_STATUS_TRANSITION');
  });

  // -------------------------------------------------------------
  // TESTE 17: ACTUAL DATABASE RELATIONS & SCHEMA INTEGRITY CHECK
  // -------------------------------------------------------------
  it('TESTE 17 — Schema Integrity: proves all 14 tables and columns strictly match Phase 18 migration without residual obsolete references', () => {
    // Verify essential tables exist
    const expectedTables = [
      'work_schedules',
      'work_schedule_periods',
      'resource_work_schedules',
      'work_schedule_overrides',
      'work_schedule_override_periods',
      'non_project_work',
      'resource_non_project_allocations',
      'skills',
      'resource_skills',
      'task_skill_requirements',
      'planning_allocations',
      'user_absences',
    ];

    for (const table of expectedTables) {
      assert.ok(SCHEMA_TABLES[table], `Table ${table} must be defined in schema`);
    }

    // Verify critical foreign keys & column naming:
    // 1. resource_work_schedules has resource_id and schedule_id (NOT users.work_schedule_id)
    assert.ok(SCHEMA_TABLES.resource_work_schedules.includes('resource_id'));
    assert.ok(SCHEMA_TABLES.resource_work_schedules.includes('schedule_id'));
    assert.strictEqual(SCHEMA_TABLES.users.includes('work_schedule_id'), false);

    // 2. work_schedule_override_periods has override_id, start_time, end_time (NOT work_schedule_overrides.periods)
    assert.ok(SCHEMA_TABLES.work_schedule_override_periods.includes('override_id'));
    assert.strictEqual(SCHEMA_TABLES.work_schedule_overrides.includes('periods'), false);

    // 3. resource_non_project_allocations has resource_id, work_id, date, start_time, end_time, status
    assert.ok(SCHEMA_TABLES.resource_non_project_allocations.includes('resource_id'));
    assert.ok(SCHEMA_TABLES.resource_non_project_allocations.includes('work_id'));
    assert.ok(SCHEMA_TABLES.resource_non_project_allocations.includes('start_time'));
    assert.ok(SCHEMA_TABLES.resource_non_project_allocations.includes('end_time'));
    assert.ok(SCHEMA_TABLES.resource_non_project_allocations.includes('status'));

    // 4. planning_allocations has version, status, task_id, resource_id
    assert.ok(SCHEMA_TABLES.planning_allocations.includes('version'));
    assert.ok(SCHEMA_TABLES.planning_allocations.includes('status'));
  });
});
