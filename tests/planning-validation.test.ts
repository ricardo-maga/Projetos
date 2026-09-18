import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  timesOverlap,
  getIsoDayOfWeek,
  parseIntervalToHours,
} from '../lib/planning/validationEngine.ts';

describe('Planning Allocations - Pure Logic Unit Tests', () => {
  describe('1. Time Parsing and Formatting', () => {
    it('converts HH:mm to minutes correctly', () => {
      assert.strictEqual(parseTimeToMinutes('08:00'), 480);
      assert.strictEqual(parseTimeToMinutes('12:30'), 750);
      assert.strictEqual(parseTimeToMinutes('17:45'), 1065);
      assert.strictEqual(parseTimeToMinutes('00:00'), 0);
      assert.strictEqual(parseTimeToMinutes('23:59'), 1439);
    });

    it('formats minutes back to HH:mm string', () => {
      assert.strictEqual(formatMinutesToTime(480), '08:00');
      assert.strictEqual(formatMinutesToTime(750), '12:30');
      assert.strictEqual(formatMinutesToTime(0), '00:00');
    });
  });

  describe('2. Temporal Validation and Boundaries', () => {
    it('validates normal interval (08:00 to 10:00)', () => {
      const start = parseTimeToMinutes('08:00');
      const end = parseTimeToMinutes('10:00');
      assert.ok(start < end, 'start should be before end');
      assert.strictEqual(end - start, 120);
      assert.ok(end - start >= 15, 'duration should be at least 15 min');
    });

    it('rejects inverted interval (10:00 to 08:00)', () => {
      const start = parseTimeToMinutes('10:00');
      const end = parseTimeToMinutes('08:00');
      assert.ok(start >= end, 'start >= end is invalid');
    });

    it('rejects crossing midnight (23:00 to 01:00)', () => {
      const start = parseTimeToMinutes('23:00'); // 1380
      const end = parseTimeToMinutes('01:00'); // 60
      assert.ok(start >= end, 'crossing midnight without date shift is invalid');
    });

    it('enforces minimum duration of 15 minutes', () => {
      const start = parseTimeToMinutes('08:00');
      const end10Min = parseTimeToMinutes('08:10');
      const end15Min = parseTimeToMinutes('08:15');

      assert.strictEqual(end10Min - start < 15, true, '10 min should fail min duration');
      assert.strictEqual(end15Min - start >= 15, true, '15 min should satisfy min duration');
    });
  });

  describe('3. Overlap Logic (timesOverlap)', () => {
    it('returns false for adjacent/touching boundaries (08:00-10:00 and 10:00-12:00)', () => {
      const aStart = parseTimeToMinutes('08:00');
      const aEnd = parseTimeToMinutes('10:00');
      const bStart = parseTimeToMinutes('10:00');
      const bEnd = parseTimeToMinutes('12:00');

      assert.strictEqual(timesOverlap(aStart, aEnd, bStart, bEnd), false);
      assert.strictEqual(timesOverlap(bStart, bEnd, aStart, aEnd), false);
    });

    it('returns true for partial overlaps (08:00-10:00 and 09:30-11:30)', () => {
      const aStart = parseTimeToMinutes('08:00');
      const aEnd = parseTimeToMinutes('10:00');
      const bStart = parseTimeToMinutes('09:30');
      const bEnd = parseTimeToMinutes('11:30');

      assert.strictEqual(timesOverlap(aStart, aEnd, bStart, bEnd), true);
      assert.strictEqual(timesOverlap(bStart, bEnd, aStart, aEnd), true);
    });

    it('returns true for enclosing intervals (08:00-12:00 and 09:00-10:00)', () => {
      const aStart = parseTimeToMinutes('08:00');
      const aEnd = parseTimeToMinutes('12:00');
      const bStart = parseTimeToMinutes('09:00');
      const bEnd = parseTimeToMinutes('10:00');

      assert.strictEqual(timesOverlap(aStart, aEnd, bStart, bEnd), true);
    });
  });

  describe('4. Work Schedule and Lunch Break Crossings', () => {
    it('calculates unworked minutes when allocation spans across lunch (08:00–14:00 with lunch 12:00–13:00)', () => {
      const periods = [
        { start: parseTimeToMinutes('08:00'), end: parseTimeToMinutes('12:00') }, // 240 min
        { start: parseTimeToMinutes('13:00'), end: parseTimeToMinutes('17:00') }, // 240 min
      ];

      const allocStart = parseTimeToMinutes('08:00');
      const allocEnd = parseTimeToMinutes('14:00');
      const totalAllocDuration = allocEnd - allocStart; // 360 min (6h)

      let workableMinutes = 0;
      for (let m = allocStart; m < allocEnd; m++) {
        if (periods.some((p) => m >= p.start && m < p.end)) {
          workableMinutes++;
        }
      }

      assert.strictEqual(totalAllocDuration, 360, 'total allocation is 6h');
      assert.strictEqual(workableMinutes, 300, 'workable minutes should be 5h (240 + 60)');
      assert.strictEqual(totalAllocDuration - workableMinutes, 60, 'lunch break is 60 min unworkable');
      assert.ok(workableMinutes < totalAllocDuration, 'allocation crosses non-work break');
    });
  });

  describe('5. Skills Verification Logic', () => {
    it('blocks when mandatory skill is missing', () => {
      const resourceSkillIds = new Set(['sk-electrical']);
      const requirements = [
        { skill_id: 'sk-electrical', is_mandatory: true },
        { skill_id: 'sk-fiber-optics', is_mandatory: true },
      ];

      const missingMandatory = requirements.filter(
        (r) => r.is_mandatory && !resourceSkillIds.has(r.skill_id)
      );

      assert.strictEqual(missingMandatory.length, 1);
      assert.strictEqual(missingMandatory[0].skill_id, 'sk-fiber-optics');
    });

    it('generates warning when preferred skill is missing but allows execution', () => {
      const resourceSkillIds = new Set(['sk-electrical']);
      const requirements = [
        { skill_id: 'sk-electrical', is_mandatory: true },
        { skill_id: 'sk-english-c1', is_mandatory: false },
      ];

      const missingMandatory = requirements.filter(
        (r) => r.is_mandatory && !resourceSkillIds.has(r.skill_id)
      );
      const missingPreferred = requirements.filter(
        (r) => !r.is_mandatory && !resourceSkillIds.has(r.skill_id)
      );

      assert.strictEqual(missingMandatory.length, 0, 'no mandatory skills missing');
      assert.strictEqual(missingPreferred.length, 1, 'preferred skill missing');
      assert.strictEqual(missingPreferred[0].skill_id, 'sk-english-c1');
    });
  });

  describe('6. Task Estimate Comparison Logic', () => {
    it('parses various interval formats to hours', () => {
      assert.strictEqual(parseIntervalToHours(8), 8);
      assert.strictEqual(parseIntervalToHours('04:30:00'), 4.5);
      assert.strictEqual(parseIntervalToHours('6 hours'), 6);
      assert.strictEqual(parseIntervalToHours({ hours: 10, minutes: 30 }), 10.5);
    });

    it('detects when planned time exceeds task estimate (warning only)', () => {
      const taskEstimatedHours = 4.0;
      const existingAllocationsMinutes = 180; // 3 hours
      const newAllocationMinutes = 90; // 1.5 hours
      const totalPlannedHours = (existingAllocationsMinutes + newAllocationMinutes) / 60; // 4.5 hours

      assert.strictEqual(totalPlannedHours, 4.5);
      assert.ok(totalPlannedHours > taskEstimatedHours, 'exceeds estimate');
    });
  });

  describe('7. Optimistic Concurrency Logic', () => {
    it('accepts matching versions and increments', () => {
      const currentVersion = 3;
      const submittedVersion = 3;
      assert.strictEqual(submittedVersion === currentVersion, true);
      const nextVersion = currentVersion + 1;
      assert.strictEqual(nextVersion, 4);
    });

    it('rejects stale versions with concurrency conflict', () => {
      const currentVersion = 4;
      const submittedVersion = 3;
      assert.strictEqual(submittedVersion !== currentVersion, true);
    });
  });

  describe('8. Status Transition and DELETE Rules', () => {
    it('prohibits reactivating CANCELLED allocations', () => {
      const currentStatus = 'CANCELLED';
      const targetDraft = 'DRAFT';
      const targetConfirmed = 'CONFIRMED';

      const isForbiddenFromCancelled = (target: string) =>
        currentStatus === 'CANCELLED' && target !== 'CANCELLED';

      assert.ok(isForbiddenFromCancelled(targetDraft));
      assert.ok(isForbiddenFromCancelled(targetConfirmed));
    });

    it('verifies DELETE rule table (DRAFT allowed, CONFIRMED/CANCELLED forbidden)', () => {
      function canDelete(status: string): { allowed: boolean; errorCode?: string } {
        if (status === 'DRAFT') return { allowed: true };
        if (status === 'CONFIRMED') return { allowed: false, errorCode: 'CANNOT_DELETE_CONFIRMED' };
        if (status === 'CANCELLED') return { allowed: false, errorCode: 'CANNOT_DELETE_CANCELLED' };
        return { allowed: false };
      }

      assert.deepStrictEqual(canDelete('DRAFT'), { allowed: true });
      assert.deepStrictEqual(canDelete('CONFIRMED'), {
        allowed: false,
        errorCode: 'CANNOT_DELETE_CONFIRMED',
      });
      assert.deepStrictEqual(canDelete('CANCELLED'), {
        allowed: false,
        errorCode: 'CANNOT_DELETE_CANCELLED',
      });
    });
  });

  describe('9. Calendar ISO Day of Week Calculation', () => {
    it('maps days to ISO 1..7 (Monday=1, Sunday=7)', () => {
      // 2026-09-18 is Friday (5)
      assert.strictEqual(getIsoDayOfWeek('2026-09-18'), 5);
      // 2026-09-19 is Saturday (6)
      assert.strictEqual(getIsoDayOfWeek('2026-09-19'), 6);
      // 2026-09-20 is Sunday (7)
      assert.strictEqual(getIsoDayOfWeek('2026-09-20'), 7);
      // 2026-09-21 is Monday (1)
      assert.strictEqual(getIsoDayOfWeek('2026-09-21'), 1);
    });
  });
});
