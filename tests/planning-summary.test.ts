import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  computePlanningSummary, 
  parseHoursToNumber, 
  formatHoursDisplay,
  groupTaskAllocationsByDate,
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

describe('Task Daily Workload & Planning Scenarios A-F (FASE 23E-C3M-B)', () => {
  const makeAlloc = (
    id: string,
    date: string,
    durationMinutes: number,
    status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED',
    resourceId = 'res-1',
    startTime = '08:00',
    endTime = '12:00'
  ): PlanningAllocationDTO => ({
    id,
    taskId: 'task-inst-1',
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

  it('Cenário A: Tarefa simples sem allocations', () => {
    // Estimativa: 16h
    // Total planeado: 0h, Falta planear: 16h, Excesso: 0h
    const summary = computePlanningSummary('16:00', []);
    const dailyGroups = groupTaskAllocationsByDate([]);

    assert.strictEqual(summary.estimatedHours, 16);
    assert.strictEqual(summary.confirmedHours, 0);
    assert.strictEqual(summary.draftHours, 0);
    assert.strictEqual(summary.plannedHours, 0);
    assert.strictEqual(summary.remainingHours, 16);
    assert.strictEqual(summary.excessHours, 0);
    assert.strictEqual(summary.isOverAllocated, false);
    assert.strictEqual(dailyGroups.length, 0);
  });

  it('Cenário B: Tarefa com DRAFT', () => {
    // Estimativa: 8h
    // 22 Set: 4h DRAFT
    // Total planeado: 4h, Falta planear: 4h, Excesso: 0h
    const allocs = [
      makeAlloc('b1', '2026-09-22', 240, 'DRAFT', 'res-1', '08:00', '12:00'),
    ];

    const summary = computePlanningSummary('08:00', allocs);
    const dailyGroups = groupTaskAllocationsByDate(allocs);

    assert.strictEqual(summary.estimatedHours, 8);
    assert.strictEqual(summary.confirmedHours, 0);
    assert.strictEqual(summary.draftHours, 4);
    assert.strictEqual(summary.plannedHours, 4);
    assert.strictEqual(summary.remainingHours, 4);
    assert.strictEqual(summary.excessHours, 0);

    assert.strictEqual(dailyGroups.length, 1);
    assert.strictEqual(dailyGroups[0].date, '2026-09-22');
    assert.strictEqual(dailyGroups[0].confirmedHours, 0);
    assert.strictEqual(dailyGroups[0].draftHours, 4);
    assert.strictEqual(dailyGroups[0].plannedHours, 4);
  });

  it('Cenário C: Tarefa com CONFIRMED', () => {
    // Estimativa: 16h
    // 22 Set: 8h CONFIRMED
    // 23 Set: 6h CONFIRMED
    // Total planeado: 14h, Falta planear: 2h, Excesso: 0h
    const allocs = [
      makeAlloc('c1', '2026-09-22', 480, 'CONFIRMED', 'res-1', '08:00', '17:00'),
      makeAlloc('c2', '2026-09-23', 360, 'CONFIRMED', 'res-1', '08:00', '15:00'),
    ];

    const summary = computePlanningSummary(16, allocs);
    const dailyGroups = groupTaskAllocationsByDate(allocs);

    assert.strictEqual(summary.estimatedHours, 16);
    assert.strictEqual(summary.confirmedHours, 14);
    assert.strictEqual(summary.draftHours, 0);
    assert.strictEqual(summary.plannedHours, 14);
    assert.strictEqual(summary.remainingHours, 2);
    assert.strictEqual(summary.excessHours, 0);

    assert.strictEqual(dailyGroups.length, 2);
    assert.strictEqual(dailyGroups[0].date, '2026-09-22');
    assert.strictEqual(dailyGroups[0].confirmedHours, 8);
    assert.strictEqual(dailyGroups[1].date, '2026-09-23');
    assert.strictEqual(dailyGroups[1].confirmedHours, 6);
  });

  it('Cenário D: Cenário Misto CONFIRMED + DRAFT', () => {
    // Estimativa: 16h
    // 22 Set: 8h CONFIRMED
    // 23 Set: 6h CONFIRMED
    // 24 Set: 2h DRAFT
    // Total planeado: 16h, Falta planear: 0h, Excesso: 0h
    const allocs = [
      makeAlloc('d1', '2026-09-22', 480, 'CONFIRMED', 'res-1', '08:00', '17:00'),
      makeAlloc('d2', '2026-09-23', 360, 'CONFIRMED', 'res-1', '08:00', '15:00'),
      makeAlloc('d3', '2026-09-24', 120, 'DRAFT', 'res-2', '08:00', '10:00'),
    ];

    const summary = computePlanningSummary('16h', allocs);
    const dailyGroups = groupTaskAllocationsByDate(allocs);

    assert.strictEqual(summary.estimatedHours, 16);
    assert.strictEqual(summary.confirmedHours, 14);
    assert.strictEqual(summary.draftHours, 2);
    assert.strictEqual(summary.plannedHours, 16);
    assert.strictEqual(summary.remainingHours, 0);
    assert.strictEqual(summary.excessHours, 0);

    assert.strictEqual(dailyGroups.length, 3);
    assert.strictEqual(dailyGroups[0].date, '2026-09-22');
    assert.strictEqual(dailyGroups[0].plannedHours, 8);
    assert.strictEqual(dailyGroups[1].date, '2026-09-23');
    assert.strictEqual(dailyGroups[1].plannedHours, 6);
    assert.strictEqual(dailyGroups[2].date, '2026-09-24');
    assert.strictEqual(dailyGroups[2].draftHours, 2);
    assert.strictEqual(dailyGroups[2].plannedHours, 2);
  });

  it('Cenário E: Sobrealocação / Excesso', () => {
    // Estimativa: 10h
    // 22 Set: 8h CONFIRMED
    // 23 Set: 4h CONFIRMED
    // Total planeado: 12h, Falta planear: 0h, Excesso: 2h
    const allocs = [
      makeAlloc('e1', '2026-09-22', 480, 'CONFIRMED', 'res-1', '08:00', '17:00'),
      makeAlloc('e2', '2026-09-23', 240, 'CONFIRMED', 'res-1', '08:00', '12:00'),
    ];

    const summary = computePlanningSummary('10:00', allocs);
    const dailyGroups = groupTaskAllocationsByDate(allocs);

    assert.strictEqual(summary.estimatedHours, 10);
    assert.strictEqual(summary.confirmedHours, 12);
    assert.strictEqual(summary.draftHours, 0);
    assert.strictEqual(summary.plannedHours, 12);
    assert.strictEqual(summary.remainingHours, 0);
    assert.strictEqual(summary.excessHours, 2);
    assert.strictEqual(summary.isOverAllocated, true);

    assert.strictEqual(dailyGroups.length, 2);
  });

  it('Cenário F: Alocação CANCELLED excluída', () => {
    // Estimativa: 16h
    // 22 Set: 8h CONFIRMED
    // 23 Set: 6h CANCELLED
    // Total planeado: 8h, Falta planear: 8h, Excesso: 0h
    const allocs = [
      makeAlloc('f1', '2026-09-22', 480, 'CONFIRMED', 'res-1', '08:00', '17:00'),
      makeAlloc('f2', '2026-09-23', 360, 'CANCELLED', 'res-1', '08:00', '15:00'),
    ];

    const summary = computePlanningSummary(16, allocs);
    const dailyGroups = groupTaskAllocationsByDate(allocs);

    assert.strictEqual(summary.estimatedHours, 16);
    assert.strictEqual(summary.confirmedHours, 8);
    assert.strictEqual(summary.draftHours, 0);
    assert.strictEqual(summary.plannedHours, 8);
    assert.strictEqual(summary.remainingHours, 8);
    assert.strictEqual(summary.excessHours, 0);

    // Only active allocations appear in groupTaskAllocationsByDate
    assert.strictEqual(dailyGroups.length, 1);
    assert.strictEqual(dailyGroups[0].date, '2026-09-22');
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
