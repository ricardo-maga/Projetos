import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluatePersonDay, type PlanningTask } from '../lib/planning/intelligence.ts';

const task = (id: string, date: string): PlanningTask => ({ id, title: id, projectId: null,
  estimatedDate: date, assigneeIds: ['u1'], version: 1 });
const base = { person: { id: 'u1', name: 'Técnico' }, date: '2026-11-02',
  tasks: [] as PlanningTask[], blocks: [], absences: [], schedules: [] };

test('sem horário validado a capacidade é indeterminada', () => {
  const result = evaluatePersonDay(base);
  assert.equal(result.capacityHalves, null);
  assert.equal(result.quality, 'incomplete');
  assert.equal(result.findings[0].code, 'UNKNOWN_SCHEDULE');
});

test('duas tarefas no mesmo dia são contexto, não bloqueio automático', () => {
  const result = evaluatePersonDay({ ...base, tasks: [task('a', base.date), task('b', base.date)],
    blocks: [{ taskId: 'a', userId: 'u1', date: base.date, half: 'am' },
      { taskId: 'b', userId: 'u1', date: base.date, half: 'pm' }],
    schedules: [{ userId: 'u1', weekday: 1, halves: ['am', 'pm'] }] });
  assert.equal(result.occupiedHalves, 2);
  assert.equal(result.capacityHalves, 2);
  assert.equal(result.findings.find(f => f.code === 'SAME_DAY_TASK')?.level, 'info');
  assert.equal(result.findings.some(f => f.level === 'blocking'), false);
});

test('tarefa antiga nunca é convertida em ocupação numérica por suposição', () => {
  const result = evaluatePersonDay({ ...base, tasks: [task('old', base.date)],
    schedules: [{ userId: 'u1', weekday: 1, halves: ['am', 'pm'] }] });
  assert.equal(result.occupiedHalves, 0);
  assert.equal(result.quality, 'incomplete');
  assert.equal(result.findings.find(f => f.code === 'LEGACY_TASK')?.level, 'undetermined');
});

test('ausência confirmada bloqueia e dias adjacentes são informativos', () => {
  const result = evaluatePersonDay({ ...base, tasks: [task('tomorrow', '2026-11-03')],
    absences: [{ userId: 'u1', start: base.date, end: base.date, fullDay: true }],
    schedules: [{ userId: 'u1', weekday: 1, halves: ['am', 'pm'] }] });
  assert.equal(result.capacityHalves, 0);
  assert.equal(result.findings.find(f => f.code === 'ABSENT')?.level, 'blocking');
  assert.deepEqual(result.adjacentTaskIds, ['tomorrow']);
});
