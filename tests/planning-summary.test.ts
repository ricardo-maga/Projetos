import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  computePlanningSummary, 
  parseHoursToNumber, 
  formatHoursDisplay,
  groupResourceDayAllocationsByTask 
} from '../lib/planning/summary.ts';
import { PlanningAllocationDTO } from '../lib/planning/types.ts';

describe('Planning Summary & Calculations Unit Tests (FASE 23C)', () => {
  const makeAllocation = (id: string, durationMinutes: number, status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED'): PlanningAllocationDTO => ({
    id,
    taskId: 'task-1',
    resourceId: 'res-1',
    date: '2026-09-21',
    startTime: '08:00',
    endTime: '10:00',
    status,
    version: 1,
    durationMinutes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it('Teste 1: Task sem allocations (Estimated = 8h)', () => {
    const summary = computePlanningSummary('08:00', []);
    assert.strictEqual(summary.estimatedHours, 8);
    assert.strictEqual(summary.plannedHours, 0);
    assert.strictEqual(summary.capacityConsumedHours, 0);
    assert.strictEqual(summary.remainingHours, 8);
    assert.strictEqual(summary.excessHours, 0);
    assert.strictEqual(summary.isOverAllocated, false);
  });

  it('Teste 2: Criar DRAFT (2h) com Estimated = 8h', () => {
    const allocDraft = makeAllocation('a-1', 120, 'DRAFT');
    const summary = computePlanningSummary('8', [allocDraft]);

    // Planned aumenta (2h), Capacity Consumed não aumenta (0h), Remaining = 6h
    assert.strictEqual(summary.estimatedHours, 8);
    assert.strictEqual(summary.plannedHours, 2);
    assert.strictEqual(summary.capacityConsumedHours, 0);
    assert.strictEqual(summary.remainingHours, 6);
    assert.strictEqual(summary.excessHours, 0);
    assert.strictEqual(summary.isOverAllocated, false);
  });

  it('Teste 3: Criar CONFIRMED (3h) com DRAFT (2h) e Estimated = 8h', () => {
    const allocDraft = makeAllocation('a-1', 120, 'DRAFT');
    const allocConfirmed = makeAllocation('a-2', 180, 'CONFIRMED');
    const summary = computePlanningSummary('08:00', [allocDraft, allocConfirmed]);

    // Planned = 5h (2h + 3h), Capacity Consumed = 3h, Remaining = 3h
    assert.strictEqual(summary.estimatedHours, 8);
    assert.strictEqual(summary.plannedHours, 5);
    assert.strictEqual(summary.capacityConsumedHours, 3);
    assert.strictEqual(summary.remainingHours, 3);
    assert.strictEqual(summary.excessHours, 0);
    assert.strictEqual(summary.isOverAllocated, false);
  });

  it('Teste 4: Excess of Planning (Estimated = 8h, DRAFT = 2h, CONFIRMED = 7h)', () => {
    const allocDraft = makeAllocation('a-1', 120, 'DRAFT');
    const allocConfirmed = makeAllocation('a-2', 420, 'CONFIRMED');
    const summary = computePlanningSummary(8, [allocDraft, allocConfirmed]);

    // Planned = 9h, Capacity Consumed = 7h, Remaining = 0h, Excess = 1h
    assert.strictEqual(summary.estimatedHours, 8);
    assert.strictEqual(summary.plannedHours, 9);
    assert.strictEqual(summary.capacityConsumedHours, 7);
    assert.strictEqual(summary.remainingHours, 0);
    assert.strictEqual(summary.excessHours, 1);
    assert.strictEqual(summary.isOverAllocated, true);
  });

  it('Teste 5: Cancelar CONFIRMED (não deve contar para Planned nem Capacity Consumed)', () => {
    const allocDraft = makeAllocation('a-1', 120, 'DRAFT');
    const allocConfirmed = makeAllocation('a-2', 180, 'CONFIRMED');
    const allocCancelled = makeAllocation('a-3', 240, 'CANCELLED');
    const summary = computePlanningSummary('8h', [allocDraft, allocConfirmed, allocCancelled]);

    // Planned deve somar apenas DRAFT + CONFIRMED = 2h + 3h = 5h
    // Capacity Consumed apenas CONFIRMED = 3h
    assert.strictEqual(summary.plannedHours, 5);
    assert.strictEqual(summary.capacityConsumedHours, 3);
    assert.strictEqual(summary.remainingHours, 3);
    assert.strictEqual(summary.excessHours, 0);
  });

  it('Formatação amigável de horas', () => {
    assert.strictEqual(formatHoursDisplay(8), '8h');
    assert.strictEqual(formatHoursDisplay(1.5), '1h 30m');
    assert.strictEqual(formatHoursDisplay(0.5), '30m');
    assert.strictEqual(formatHoursDisplay(0), '0h');
  });

  it('Parsing de formatos variados de horas', () => {
    assert.strictEqual(parseHoursToNumber('08:00'), 8);
    assert.strictEqual(parseHoursToNumber('08:30'), 8.5);
    assert.strictEqual(parseHoursToNumber('10'), 10);
    assert.strictEqual(parseHoursToNumber('7.5h'), 7.5);
    assert.strictEqual(parseHoursToNumber('4,5'), 4.5);
    assert.strictEqual(parseHoursToNumber(null), 0);
    assert.strictEqual(parseHoursToNumber(undefined), 0);
  });
});

describe('Resource Day Detail Task Grouping Unit Tests (FASE 23E-C3M-C)', () => {
  const mockTasks = [
    { id: 'task-1', title: 'Instalação impressora linha 1', projectId: 'proj-1', assigneeIds: ['user-1'] },
    { id: 'task-2', title: 'Configuração etiquetagem', projectId: 'proj-2', assigneeIds: ['user-2'] },
    { id: 'task-3', title: 'Testes de cablagem', projectId: 'proj-1', assigneeIds: ['user-1', 'user-2'] },
  ];

  const mockProjects = [
    { id: 'proj-1', title: 'Projeto ABC' },
    { id: 'proj-2', title: 'Projeto XYZ' },
  ];

  const makeAlloc = (
    id: string,
    taskId: string,
    resourceId: string,
    date: string,
    durationMinutes: number,
    status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED',
    startTime = '08:00',
    endTime = '12:00'
  ): PlanningAllocationDTO => ({
    id,
    taskId,
    resourceId,
    date,
    startTime,
    endTime,
    status,
    version: 1,
    durationMinutes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it('Critério A: Uma tarefa com 4h CONFIRMED aparece uma única vez (CONFIRMED 4h, PLANEADO 4h)', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 240, 'CONFIRMED', '08:00', '12:00'),
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, mockTasks, mockProjects);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].taskId, 'task-1');
    assert.strictEqual(groups[0].task?.title, 'Instalação impressora linha 1');
    assert.strictEqual(groups[0].project?.title, 'Projeto ABC');
    assert.strictEqual(groups[0].confirmedHours, 4);
    assert.strictEqual(groups[0].draftHours, 0);
    assert.strictEqual(groups[0].plannedHours, 4);
    assert.strictEqual(groups[0].hasConfirmed, true);
    assert.strictEqual(groups[0].hasDraft, false);
  });

  it('Critério B: CONFIRMED + DRAFT (4h CONFIRMED + 2h DRAFT mostra CONFIRMED 4h, DRAFT 2h, PLANEADO 6h)', () => {
    const allocs = [
      makeAlloc('a1', 'task-2', 'user-1', '2026-09-22', 240, 'CONFIRMED', '08:00', '12:00'),
      makeAlloc('a2', 'task-2', 'user-1', '2026-09-22', 120, 'DRAFT', '14:00', '16:00'),
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, mockTasks, mockProjects);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].taskId, 'task-2');
    assert.strictEqual(groups[0].confirmedHours, 4);
    assert.strictEqual(groups[0].draftHours, 2);
    assert.strictEqual(groups[0].plannedHours, 6);
    assert.strictEqual(groups[0].hasConfirmed, true);
    assert.strictEqual(groups[0].hasDraft, true);
    assert.strictEqual(groups[0].allocations.length, 2);
  });

  it('Critério C: Múltiplas allocations da mesma tarefa no mesmo dia são agrupadas numa única tarefa', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 120, 'CONFIRMED', '08:00', '10:00'),
      makeAlloc('a2', 'task-1', 'user-1', '2026-09-22', 120, 'CONFIRMED', '14:00', '16:00'),
      makeAlloc('a3', 'task-1', 'user-1', '2026-09-22', 60, 'DRAFT', '16:00', '17:00'),
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, mockTasks, mockProjects);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].confirmedHours, 4);
    assert.strictEqual(groups[0].draftHours, 1);
    assert.strictEqual(groups[0].plannedHours, 5);
    assert.strictEqual(groups[0].allocations.length, 3);
  });

  it('Critério D: Várias tarefas aparecem separadamente', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 240, 'CONFIRMED', '08:00', '12:00'),
      makeAlloc('a2', 'task-2', 'user-1', '2026-09-22', 180, 'CONFIRMED', '13:00', '16:00'),
      makeAlloc('a3', 'task-3', 'user-1', '2026-09-22', 60, 'DRAFT', '16:00', '17:00'),
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, mockTasks, mockProjects);
    assert.strictEqual(groups.length, 3);
    const taskIds = groups.map(g => g.taskId);
    assert.deepStrictEqual(taskIds, ['task-1', 'task-2', 'task-3']);
  });

  it('Critério E: CANCELLED não entra nos totais nem no agrupamento operacional', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 240, 'CONFIRMED', '08:00', '12:00'),
      makeAlloc('a2', 'task-1', 'user-1', '2026-09-22', 120, 'CANCELLED', '13:00', '15:00'),
      makeAlloc('a3', 'task-2', 'user-1', '2026-09-22', 180, 'CANCELLED', '15:00', '18:00'),
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, mockTasks, mockProjects);
    // task-2 only has CANCELLED so it does not appear in active operational groups
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].taskId, 'task-1');
    assert.strictEqual(groups[0].confirmedHours, 4);
    assert.strictEqual(groups[0].plannedHours, 4);
    assert.strictEqual(groups[0].allocations.length, 1);
  });

  it('Critério G: Mostra apenas allocations do recurso e dia selecionados', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 240, 'CONFIRMED'),
      makeAlloc('a2', 'task-1', 'user-2', '2026-09-22', 120, 'CONFIRMED'), // outro utilizador
      makeAlloc('a3', 'task-1', 'user-1', '2026-09-23', 180, 'CONFIRMED'), // outro dia
    ];

    const groupsUser1Day22 = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, mockTasks, mockProjects);
    assert.strictEqual(groupsUser1Day22.length, 1);
    assert.strictEqual(groupsUser1Day22[0].confirmedHours, 4);

    const groupsUser2Day22 = groupResourceDayAllocationsByTask('user-2', '2026-09-22', allocs, mockTasks, mockProjects);
    assert.strictEqual(groupsUser2Day22.length, 1);
    assert.strictEqual(groupsUser2Day22[0].confirmedHours, 2);
  });

  it('Ordenação: Tarefas com CONFIRMED vêm antes de tarefas apenas com DRAFT', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 120, 'DRAFT'),
      makeAlloc('a2', 'task-2', 'user-1', '2026-09-22', 180, 'CONFIRMED'),
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, mockTasks, mockProjects);
    assert.strictEqual(groups[0].taskId, 'task-2'); // CONFIRMED first
    assert.strictEqual(groups[1].taskId, 'task-1'); // DRAFT next
  });
});
