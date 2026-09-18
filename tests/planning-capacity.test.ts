import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  clipInterval,
  mergeIntervals,
  subtractIntervals,
  getDateRangeList,
  calculateWorkPeriodsForDate,
  calculateEffectiveMinutes,
  calculateFreePeriods,
  findAvailableSlotsForDuration,
  computeDayCapacity,
} from '../lib/planning/capacityService.ts';
import {
  queryCapacitySchema,
  queryAvailabilitySchema,
  queryResourceLoadSchema,
} from '../lib/validations/planningCapacity.ts';

describe('FASE 20 — Capacity & Availability Pure Logic Tests', () => {
  describe('1. Interval Geometry & Mathematics', () => {
    it('clipInterval correctly bounds overlapping intervals', () => {
      // Overlap
      assert.deepStrictEqual(clipInterval(480, 600, 500, 700), [500, 600]);
      // Contained
      assert.deepStrictEqual(clipInterval(520, 580, 480, 720), [520, 580]);
      // Disjoint before
      assert.strictEqual(clipInterval(300, 400, 480, 720), null);
      // Disjoint after
      assert.strictEqual(clipInterval(750, 850, 480, 720), null);
      // Touching boundary (no volume)
      assert.strictEqual(clipInterval(400, 480, 480, 720), null);
    });

    it('mergeIntervals collapses overlapping and adjacent intervals', () => {
      const intervals: Array<[number, number]> = [
        [600, 700],
        [480, 540],
        [520, 620],
        [800, 900],
      ];
      // 480-540 and 520-620 and 600-700 merge into 480-700
      const merged = mergeIntervals(intervals);
      assert.deepStrictEqual(merged, [
        [480, 700],
        [800, 900],
      ]);
    });

    it('subtractIntervals calculates remaining free segments inside a base window', () => {
      // Base window: 08:00 (480) to 12:00 (720)
      // Busy: 09:00-10:00 (540-600) and 10:30-11:30 (630-690)
      const free = subtractIntervals(480, 720, [
        [540, 600],
        [630, 690],
      ]);

      assert.deepStrictEqual(free, [
        [480, 540], // 08:00 - 09:00 (60 min)
        [600, 630], // 10:00 - 10:30 (30 min)
        [690, 720], // 11:30 - 12:00 (30 min)
      ]);
    });

    it('getDateRangeList generates continuous civil dates', () => {
      const dates = getDateRangeList('2026-09-18', '2026-09-21');
      assert.deepStrictEqual(dates, [
        '2026-09-18',
        '2026-09-19',
        '2026-09-20',
        '2026-09-21',
      ]);
    });
  });

  describe('2. Work Schedule Resolution', () => {
    const weeklyPeriods = [
      { day_of_week: 1, start_time: '08:00:00', end_time: '12:00:00' },
      { day_of_week: 1, start_time: '13:00:00', end_time: '17:00:00' },
      { day_of_week: 5, start_time: '08:00:00', end_time: '12:00:00' },
      { day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00' },
    ];

    it('resolves regular weekday schedule (08:00–12:00, 13:00–17:00)', () => {
      // 2026-09-18 is Friday (ISO day 5)
      const periods = calculateWorkPeriodsForDate('2026-09-18', weeklyPeriods);
      assert.strictEqual(periods.length, 2);
      assert.deepStrictEqual(periods[0], { start: '08:00', end: '12:00', minutes: 240 });
      assert.deepStrictEqual(periods[1], { start: '13:00', end: '17:00', minutes: 240 });
    });

    it('returns empty work periods for weekend when not configured', () => {
      // 2026-09-19 is Saturday (ISO day 6)
      const periods = calculateWorkPeriodsForDate('2026-09-19', weeklyPeriods);
      assert.deepStrictEqual(periods, []);
    });

    it('respects non-working day override (holiday / company shutdown)', () => {
      const override = {
        id: 'ov-1',
        resource_id: 'u-1',
        date: '2026-09-18',
        is_working_day: false,
      };
      const periods = calculateWorkPeriodsForDate('2026-09-18', weeklyPeriods, override);
      assert.deepStrictEqual(periods, []);
    });

    it('respects working day override with custom periods', () => {
      const override = {
        id: 'ov-2',
        resource_id: 'u-1',
        date: '2026-09-18',
        is_working_day: true,
        periods: [{ start_time: '09:00:00', end_time: '15:00:00' }],
      };
      const periods = calculateWorkPeriodsForDate('2026-09-18', weeklyPeriods, override);
      assert.strictEqual(periods.length, 1);
      assert.deepStrictEqual(periods[0], { start: '09:00', end: '15:00', minutes: 360 });
    });
  });

  describe('3. Effective Minutes Calculation (Absences & Non-Project)', () => {
    const workPeriods = [
      { start: '08:00', end: '12:00', minutes: 240 },
      { start: '13:00', end: '17:00', minutes: 240 },
    ];

    it('calculates absence within work hours (10:00 to 11:30 = 90 min)', () => {
      const effective = calculateEffectiveMinutes(600, 690, workPeriods);
      assert.strictEqual(effective, 90);
    });

    it('ignores absence outside work hours (06:00 to 07:30 = 0 min)', () => {
      const effective = calculateEffectiveMinutes(360, 450, workPeriods);
      assert.strictEqual(effective, 0);
    });

    it('excludes lunch pause when absence spans across it (10:00 to 15:00 = 240 min, not 300 min)', () => {
      // 10:00 (600) to 15:00 (900)
      // 10:00-12:00 (120) + 13:00-15:00 (120) = 240
      const effective = calculateEffectiveMinutes(600, 900, workPeriods);
      assert.strictEqual(effective, 240);
    });

    it('clips non-project work partially overlapping work hours (16:00 to 18:00 = 60 min)', () => {
      // 16:00 (960) to 18:00 (1080)
      // Shift ends at 17:00 (1020)
      const effective = calculateEffectiveMinutes(960, 1080, workPeriods);
      assert.strictEqual(effective, 60);
    });
  });

  describe('4. Comprehensive Capacity Computation (computeDayCapacity)', () => {
    const workPeriods = [
      { start: '08:00', end: '12:00', minutes: 240 },
      { start: '13:00', end: '17:00', minutes: 240 },
    ];

    it('computes regular day without events (480 min theoretical and available, 0% utilization)', () => {
      const cap = computeDayCapacity('res-1', 'Técnico Teste', '2026-09-18', workPeriods, [], [], []);

      assert.strictEqual(cap.theoreticalCapacityMinutes, 480);
      assert.strictEqual(cap.absenceMinutes, 0);
      assert.strictEqual(cap.nonProjectMinutes, 0);
      assert.strictEqual(cap.operationalCapacityMinutes, 480);
      assert.strictEqual(cap.confirmedAllocationMinutes, 0);
      assert.strictEqual(cap.availableMinutes, 480);
      assert.strictEqual(cap.overAllocatedMinutes, 0);
      assert.strictEqual(cap.utilizationPercent, 0);
      assert.strictEqual(cap.freePeriods.length, 2);
    });

    it('full day absence reduces operational and available capacity to zero', () => {
      const absence = [
        {
          id: 'abs-1',
          user_id: 'res-1',
          absence_start_date: '2026-09-18',
          absence_end_date: '2026-09-18',
          is_full_day: true,
        },
      ];

      const cap = computeDayCapacity('res-1', 'Técnico Teste', '2026-09-18', workPeriods, absence, [], []);

      assert.strictEqual(cap.theoreticalCapacityMinutes, 480);
      assert.strictEqual(cap.absenceMinutes, 480);
      assert.strictEqual(cap.operationalCapacityMinutes, 0);
      assert.strictEqual(cap.availableMinutes, 0);
      assert.strictEqual(cap.overAllocatedMinutes, 0);
      assert.strictEqual(cap.utilizationPercent, 0);
      assert.strictEqual(cap.freePeriods.length, 0);
    });

    it('DRAFT and CANCELLED allocations do not consume capacity; CONFIRMED consumes capacity', () => {
      const allocations = [
        {
          id: 'al-1',
          task_id: 't-1',
          resource_id: 'res-1',
          date: '2026-09-18',
          start_time: '08:00:00',
          end_time: '10:00:00',
          status: 'DRAFT', // 120 min DRAFT (does NOT consume)
        },
        {
          id: 'al-2',
          task_id: 't-2',
          resource_id: 'res-1',
          date: '2026-09-18',
          start_time: '10:00:00',
          end_time: '12:00:00',
          status: 'CANCELLED', // 120 min CANCELLED (does NOT consume)
        },
        {
          id: 'al-3',
          task_id: 't-3',
          resource_id: 'res-1',
          date: '2026-09-18',
          start_time: '13:00:00',
          end_time: '17:00:00',
          status: 'CONFIRMED', // 240 min CONFIRMED (consumes!)
        },
      ];

      const cap = computeDayCapacity('res-1', 'Técnico Teste', '2026-09-18', workPeriods, [], [], allocations);

      assert.strictEqual(cap.confirmedAllocationMinutes, 240);
      assert.strictEqual(cap.operationalCapacityMinutes, 480);
      assert.strictEqual(cap.availableMinutes, 240);
      assert.strictEqual(cap.overAllocatedMinutes, 0);
      assert.strictEqual(cap.utilizationPercent, 50);
    });

    it('detects over-allocation (>100% utilization) and reports availableMinutes = 0 with overAllocatedMinutes', () => {
      const allocations = [
        {
          id: 'al-1',
          task_id: 't-1',
          resource_id: 'res-1',
          date: '2026-09-18',
          start_time: '08:00:00',
          end_time: '12:00:00',
          status: 'CONFIRMED', // 240 min
        },
        {
          id: 'al-2',
          task_id: 't-2',
          resource_id: 'res-1',
          date: '2026-09-18',
          start_time: '13:00:00',
          end_time: '18:00:00',
          status: 'CONFIRMED', // 300 min
        },
      ];
      // Total confirmed = 540 min. Operational capacity = 480 min.
      const cap = computeDayCapacity('res-1', 'Técnico Teste', '2026-09-18', workPeriods, [], [], allocations);

      assert.strictEqual(cap.confirmedAllocationMinutes, 540);
      assert.strictEqual(cap.availableMinutes, 0);
      assert.strictEqual(cap.overAllocatedMinutes, 60);
      assert.strictEqual(cap.utilizationPercent, 112.5);
    });

    it('handles zero capacity without division by zero errors', () => {
      const cap = computeDayCapacity('res-1', 'Técnico Teste', '2026-09-18', [], [], [], []);

      assert.strictEqual(cap.theoreticalCapacityMinutes, 0);
      assert.strictEqual(cap.operationalCapacityMinutes, 0);
      assert.strictEqual(cap.availableMinutes, 0);
      assert.strictEqual(cap.overAllocatedMinutes, 0);
      assert.strictEqual(cap.utilizationPercent, 0);
    });
  });

  describe('5. Free Periods and Available Slots', () => {
    const workPeriods = [
      { start: '08:00', end: '12:00', minutes: 240 },
      { start: '13:00', end: '17:00', minutes: 240 },
    ];

    it('computes free periods around allocations, non-project work, and absences', () => {
      // Busy:
      // Allocation: 09:00 - 10:30 (540 - 630)
      // Absence: 10:30 - 11:30 (630 - 690)
      // Non-Project: 14:00 - 15:00 (840 - 900)
      const busy: Array<[number, number]> = [
        [540, 630],
        [630, 690],
        [840, 900],
      ];

      const free = calculateFreePeriods(workPeriods, busy);

      assert.deepStrictEqual(free, [
        { start: '08:00', end: '09:00', durationMinutes: 60 },
        { start: '11:30', end: '12:00', durationMinutes: 30 },
        { start: '13:00', end: '14:00', durationMinutes: 60 },
        { start: '15:00', end: '17:00', durationMinutes: 120 },
      ]);
    });

    it('never treats lunch pause (12:00–13:00) as availability', () => {
      const free = calculateFreePeriods(workPeriods, []);
      for (const fp of free) {
        assert.ok(
          fp.end <= '12:00' || fp.start >= '13:00',
          `Free period ${fp.start}-${fp.end} must not cross lunch`
        );
      }
    });

    it('findAvailableSlotsForDuration finds continuous windows satisfying duration', () => {
      const freePeriods = [
        { start: '08:00', end: '09:00', durationMinutes: 60 },
        { start: '10:00', end: '12:00', durationMinutes: 120 },
        { start: '13:00', end: '17:00', durationMinutes: 240 },
      ];

      const slots120 = findAvailableSlotsForDuration('2026-09-18', freePeriods, 120, 60);

      // 08:00-09:00 (60 min) should NOT qualify
      assert.ok(!slots120.some((s) => s.startTime === '08:00'));

      // 10:00-12:00 (120 min) qualifies
      assert.ok(slots120.some((s) => s.startTime === '10:00' && s.endTime === '12:00'));

      // 13:00-17:00 (240 min) with 60m step gives 13:00-15:00, 14:00-16:00, 15:00-17:00
      assert.ok(slots120.some((s) => s.startTime === '13:00' && s.endTime === '15:00'));
      assert.ok(slots120.some((s) => s.startTime === '14:00' && s.endTime === '16:00'));
      assert.ok(slots120.some((s) => s.startTime === '15:00' && s.endTime === '17:00'));
    });

    it('returns empty slots when no free period has sufficient duration', () => {
      const freePeriods = [
        { start: '08:00', end: '09:00', durationMinutes: 60 },
        { start: '11:00', end: '12:00', durationMinutes: 60 },
      ];

      const slots = findAvailableSlotsForDuration('2026-09-18', freePeriods, 120);
      assert.strictEqual(slots.length, 0);
    });
  });

  describe('6. Zod Query Validation Schemas', () => {
    it('validates capacity query with valid date range', () => {
      const valid = queryCapacitySchema.safeParse({
        date_from: '2026-09-18',
        date_to: '2026-09-25',
      });
      assert.ok(valid.success);
      if (valid.success) {
        assert.strictEqual(valid.data.dateFrom, '2026-09-18');
        assert.strictEqual(valid.data.dateTo, '2026-09-25');
      }
    });

    it('rejects capacity query when date_from > date_to', () => {
      const invalid = queryCapacitySchema.safeParse({
        date_from: '2026-09-25',
        date_to: '2026-09-18',
      });
      assert.strictEqual(invalid.success, false);
    });

    it('validates availability query requires resource_id and duration_minutes >= 15', () => {
      const missingResource = queryAvailabilitySchema.safeParse({
        date: '2026-09-18',
        duration_minutes: 60,
      });
      assert.strictEqual(missingResource.success, false);

      const invalidDuration = queryAvailabilitySchema.safeParse({
        resource_id: '550e8400-e29b-41d4-a716-446655440000',
        date: '2026-09-18',
        duration_minutes: 10,
      });
      assert.strictEqual(invalidDuration.success, false);

      const valid = queryAvailabilitySchema.safeParse({
        resource_id: '550e8400-e29b-41d4-a716-446655440000',
        date: '2026-09-18',
        duration_minutes: 15,
      });
      assert.ok(valid.success);
    });

    it('validates resource-load query with date parameters', () => {
      const valid = queryResourceLoadSchema.safeParse({
        date_from: '2026-09-01',
        date_to: '2026-09-30',
      });
      assert.ok(valid.success);
    });
  });
});
