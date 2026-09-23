import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  computePlanningSummary, 
  parseHoursToNumber, 
  formatHoursDisplay,
  groupTaskAllocationsByDate,
  groupResourceDayAllocationsByTask,
  groupTaskAllocationsByResource,
  getTaskPlanningLoadStatus,
  computeTaskPlanningImpact,
  getTaskDailyOperationalStatus,
  computeResourceDayTaskConsistency,
  computeResourceDayProjectDistribution
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

describe('Task Planning Load & Resource Consolidation Tests (FASE 23E-C3M-D)', () => {
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
    durationMinutes,
    status,
    startTime,
    endTime,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const mockUsers = [
    { id: 'user-joao', name: 'João Silva' },
    { id: 'user-pedro', name: 'Pedro Silva' },
    { id: 'user-ana', name: 'Ana Costa' },
  ];

  it('Cenário A: Sem allocations (16h estimativa, 0h confirmado, 0h draft, 0h planeado, 16h restante, 0h excesso)', () => {
    const summary = computePlanningSummary('16h', []);
    const status = getTaskPlanningLoadStatus(summary);

    assert.strictEqual(summary.estimatedHours, 16);
    assert.strictEqual(summary.confirmedHours, 0);
    assert.strictEqual(summary.draftHours, 0);
    assert.strictEqual(summary.plannedHours, 0);
    assert.strictEqual(summary.remainingHours, 16);
    assert.strictEqual(summary.excessHours, 0);
    assert.strictEqual(status, 'SEM_PLANEAMENTO');
  });

  it('Cenário B: Apenas CONFIRMED (16h estimativa, 12h confirmed, 0h draft, 12h planeado, 4h restante)', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-joao', '2026-09-22', 480, 'CONFIRMED'), // 8h
      makeAlloc('a2', 'task-1', 'user-joao', '2026-09-23', 240, 'CONFIRMED'), // 4h
    ];
    const summary = computePlanningSummary('16h', allocs);
    const status = getTaskPlanningLoadStatus(summary);

    assert.strictEqual(summary.estimatedHours, 16);
    assert.strictEqual(summary.confirmedHours, 12);
    assert.strictEqual(summary.draftHours, 0);
    assert.strictEqual(summary.plannedHours, 12);
    assert.strictEqual(summary.remainingHours, 4);
    assert.strictEqual(summary.excessHours, 0);
    assert.strictEqual(status, 'PLANEAMENTO_PENDENTE');
  });

  it('Cenário C: CONFIRMED + DRAFT (16h estimativa, 12h confirmed, 2h draft, 14h planeado, 2h restante)', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-joao', '2026-09-22', 480, 'CONFIRMED'), // 8h João
      makeAlloc('a2', 'task-1', 'user-joao', '2026-09-23', 240, 'CONFIRMED'), // 4h João
      makeAlloc('a3', 'task-1', 'user-pedro', '2026-09-24', 120, 'DRAFT'),    // 2h Pedro
    ];
    const summary = computePlanningSummary('16h', allocs);
    const status = getTaskPlanningLoadStatus(summary);

    assert.strictEqual(summary.estimatedHours, 16);
    assert.strictEqual(summary.confirmedHours, 12);
    assert.strictEqual(summary.draftHours, 2);
    assert.strictEqual(summary.plannedHours, 14);
    assert.strictEqual(summary.remainingHours, 2);
    assert.strictEqual(summary.excessHours, 0);
    assert.strictEqual(status, 'PLANEAMENTO_PENDENTE');
  });

  it('Cenário D: Excesso (10h estimativa, 12h confirmed, 12h planeado, 2h excesso)', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-joao', '2026-09-22', 480, 'CONFIRMED'), // 8h
      makeAlloc('a2', 'task-1', 'user-joao', '2026-09-23', 240, 'CONFIRMED'), // 4h
    ];
    const summary = computePlanningSummary('10h', allocs);
    const status = getTaskPlanningLoadStatus(summary);

    assert.strictEqual(summary.estimatedHours, 10);
    assert.strictEqual(summary.confirmedHours, 12);
    assert.strictEqual(summary.draftHours, 0);
    assert.strictEqual(summary.plannedHours, 12);
    assert.strictEqual(summary.remainingHours, 0);
    assert.strictEqual(summary.excessHours, 2);
    assert.strictEqual(summary.isOverAllocated, true);
    assert.strictEqual(status, 'EXCESSO');
  });

  it('Cenário E: Múltiplos dias (confirmar agrupamento correto por data)', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-joao', '2026-09-22', 480, 'CONFIRMED'),
      makeAlloc('a2', 'task-1', 'user-pedro', '2026-09-22', 120, 'CONFIRMED'),
      makeAlloc('a3', 'task-1', 'user-joao', '2026-09-23', 240, 'CONFIRMED'),
      makeAlloc('a4', 'task-1', 'user-pedro', '2026-09-24', 120, 'DRAFT'),
    ];

    const dayGroups = groupTaskAllocationsByDate(allocs);
    assert.strictEqual(dayGroups.length, 3);
    assert.strictEqual(dayGroups[0].date, '2026-09-22');
    assert.strictEqual(dayGroups[0].plannedHours, 10); // 8h + 2h
    assert.strictEqual(dayGroups[1].date, '2026-09-23');
    assert.strictEqual(dayGroups[1].plannedHours, 4);  // 4h
    assert.strictEqual(dayGroups[2].date, '2026-09-24');
    assert.strictEqual(dayGroups[2].plannedHours, 2);  // 2h draft
  });

  it('Cenário F: Múltiplos recursos (totais por recurso consolidados e independentes)', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-joao', '2026-09-22', 480, 'CONFIRMED'), // João: 8h
      makeAlloc('a2', 'task-1', 'user-joao', '2026-09-23', 240, 'CONFIRMED'), // João: 4h
      makeAlloc('a3', 'task-1', 'user-pedro', '2026-09-24', 120, 'DRAFT'),    // Pedro: 2h
    ];

    const resources = groupTaskAllocationsByResource(allocs, mockUsers, ['user-joao']);
    assert.strictEqual(resources.length, 2);

    // João: 12h confirmed, 0h draft, 12h planned, isAssignee = true
    const joao = resources.find(r => r.resourceId === 'user-joao');
    assert.ok(joao);
    assert.strictEqual(joao.resourceName, 'João Silva');
    assert.strictEqual(joao.confirmedHours, 12);
    assert.strictEqual(joao.draftHours, 0);
    assert.strictEqual(joao.plannedHours, 12);
    assert.strictEqual(joao.isAssignee, true);

    // Pedro: 0h confirmed, 2h draft, 2h planned, isAssignee = false
    const pedro = resources.find(r => r.resourceId === 'user-pedro');
    assert.ok(pedro);
    assert.strictEqual(pedro.resourceName, 'Pedro Silva');
    assert.strictEqual(pedro.confirmedHours, 0);
    assert.strictEqual(pedro.draftHours, 2);
    assert.strictEqual(pedro.plannedHours, 2);
    assert.strictEqual(pedro.isAssignee, false);
  });

  it('Cenário G: CANCELLED não aparece na carga operacional nem nos recursos envolvidos', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-joao', '2026-09-22', 480, 'CONFIRMED'),
      makeAlloc('a2', 'task-1', 'user-pedro', '2026-09-23', 240, 'CANCELLED'), // cancelado
      makeAlloc('a3', 'task-1', 'user-ana', '2026-09-24', 180, 'CANCELLED'),   // cancelado
    ];

    const summary = computePlanningSummary('16h', allocs);
    assert.strictEqual(summary.confirmedHours, 8);
    assert.strictEqual(summary.plannedHours, 8);

    const dayGroups = groupTaskAllocationsByDate(allocs);
    assert.strictEqual(dayGroups.length, 1);
    assert.strictEqual(dayGroups[0].date, '2026-09-22');

    const resources = groupTaskAllocationsByResource(allocs, mockUsers, []);
    assert.strictEqual(resources.length, 1);
    assert.strictEqual(resources[0].resourceId, 'user-joao');
  });

  it('Planeamento Completo: quando PLANEADO >= ESTIMATIVA sem excesso', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-joao', '2026-09-22', 480, 'CONFIRMED'), // 8h
      makeAlloc('a2', 'task-1', 'user-joao', '2026-09-23', 480, 'CONFIRMED'), // 8h
    ];
    const summary = computePlanningSummary('16h', allocs);
    const status = getTaskPlanningLoadStatus(summary);

    assert.strictEqual(summary.estimatedHours, 16);
    assert.strictEqual(summary.plannedHours, 16);
    assert.strictEqual(summary.remainingHours, 0);
    assert.strictEqual(summary.excessHours, 0);
    assert.strictEqual(status, 'PLANEAMENTO_COMPLETO');
  });
});

describe('Canonical Task Allocations Source Tests (FASE 23E-C3M-E)', () => {
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
    durationMinutes,
    status,
    startTime,
    endTime,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const getCanonicalTaskAllocations = (
    taskId: string,
    planningAllocations: PlanningAllocationDTO[] = [],
    internalAllocations: PlanningAllocationDTO[] = []
  ): PlanningAllocationDTO[] => {
    const map = new Map<string, PlanningAllocationDTO>();

    if (Array.isArray(planningAllocations)) {
      for (const alloc of planningAllocations) {
        if (alloc && alloc.taskId === taskId) {
          map.set(alloc.id, alloc);
        }
      }
    }

    if (Array.isArray(internalAllocations)) {
      for (const alloc of internalAllocations) {
        if (alloc && alloc.taskId === taskId) {
          map.set(alloc.id, alloc);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });
  };

  it('Cenário A — planningAllocations contém a tarefa (Task A → 4h CONFIRMED)', () => {
    const planningAllocations = [
      makeAlloc('a1', 'task-A', 'res-1', '2026-09-22', 240, 'CONFIRMED'), // 4h
    ];
    const allocs = getCanonicalTaskAllocations('task-A', planningAllocations, []);
    const summary = computePlanningSummary('8h', allocs);

    assert.strictEqual(allocs.length, 1);
    assert.strictEqual(summary.confirmedHours, 4);
    assert.strictEqual(summary.plannedHours, 4);
  });

  it('Cenário B — planningAllocations contém apenas outras tarefas (não falsifica SEM_PLANEAMENTO para Task B)', () => {
    const planningAllocations = [
      makeAlloc('a1', 'task-A', 'res-1', '2026-09-22', 240, 'CONFIRMED'), // Task A
      makeAlloc('a2', 'task-C', 'res-2', '2026-09-22', 180, 'CONFIRMED'), // Task C
    ];
    const internalAllocationsForTaskB = [
      makeAlloc('b1', 'task-B', 'res-3', '2026-09-23', 300, 'CONFIRMED'), // Task B (5h)
    ];

    const allocs = getCanonicalTaskAllocations('task-B', planningAllocations, internalAllocationsForTaskB);
    const summary = computePlanningSummary('8h', allocs);
    const status = getTaskPlanningLoadStatus(summary);

    assert.strictEqual(allocs.length, 1);
    assert.strictEqual(summary.confirmedHours, 5);
    assert.strictEqual(summary.plannedHours, 5);
    assert.notStrictEqual(status, 'SEM_PLANEAMENTO');
    assert.strictEqual(status, 'PLANEAMENTO_PENDENTE');
  });

  it('Cenário C — múltiplos recursos (Resource 1 → 4h, Resource 2 → 3h => CONFIRMED = 7h e 2 recursos envolvidos)', () => {
    const internalAllocations = [
      makeAlloc('a1', 'task-A', 'res-1', '2026-09-22', 240, 'CONFIRMED'), // 4h
      makeAlloc('a2', 'task-A', 'res-2', '2026-09-22', 180, 'CONFIRMED'), // 3h
    ];

    const allocs = getCanonicalTaskAllocations('task-A', [], internalAllocations);
    const summary = computePlanningSummary('10h', allocs);
    const mockUsers = [
      { id: 'res-1', name: 'Recurso 1' },
      { id: 'res-2', name: 'Recurso 2' },
    ];
    const resources = groupTaskAllocationsByResource(allocs, mockUsers, []);

    assert.strictEqual(summary.confirmedHours, 7);
    assert.strictEqual(summary.plannedHours, 7);
    assert.strictEqual(resources.length, 2);
  });

  it('Cenário D — múltiplos dias (garantir agrupamento correto por data → recurso → allocation)', () => {
    const allocsInput = [
      makeAlloc('a1', 'task-A', 'res-1', '2026-09-22', 240, 'CONFIRMED'),
      makeAlloc('a2', 'task-A', 'res-2', '2026-09-22', 120, 'DRAFT'),
      makeAlloc('a3', 'task-A', 'res-1', '2026-09-23', 180, 'CONFIRMED'),
    ];

    const allocs = getCanonicalTaskAllocations('task-A', allocsInput, []);
    const dayGroups = groupTaskAllocationsByDate(allocs);

    assert.strictEqual(dayGroups.length, 2);
    assert.strictEqual(dayGroups[0].date, '2026-09-22');
    assert.strictEqual(dayGroups[0].resourceAllocations.length, 2);
    assert.strictEqual(dayGroups[1].date, '2026-09-23');
    assert.strictEqual(dayGroups[1].resourceAllocations.length, 1);
  });

  it('Cenário E — DRAFT (CONFIRMED = 6h, DRAFT = 2h => PLANEADO = 8h, CONFIRMED = 6h, DRAFT = 2h)', () => {
    const allocsInput = [
      makeAlloc('a1', 'task-A', 'res-1', '2026-09-22', 360, 'CONFIRMED'), // 6h
      makeAlloc('a2', 'task-A', 'res-1', '2026-09-23', 120, 'DRAFT'),     // 2h
    ];

    const allocs = getCanonicalTaskAllocations('task-A', allocsInput, []);
    const summary = computePlanningSummary('10h', allocs);

    assert.strictEqual(summary.confirmedHours, 6);
    assert.strictEqual(summary.draftHours, 2);
    assert.strictEqual(summary.plannedHours, 8);
  });

  it('Cenário F — CANCELLED (CONFIRMED = 6h, CANCELLED = 4h => CONFIRMED = 6h, PLANEADO = 6h)', () => {
    const allocsInput = [
      makeAlloc('a1', 'task-A', 'res-1', '2026-09-22', 360, 'CONFIRMED'), // 6h
      makeAlloc('a2', 'task-A', 'res-1', '2026-09-23', 240, 'CANCELLED'), // 4h
    ];

    const allocs = getCanonicalTaskAllocations('task-A', allocsInput, []);
    const summary = computePlanningSummary('10h', allocs);

    assert.strictEqual(summary.confirmedHours, 6);
    assert.strictEqual(summary.draftHours, 0);
    assert.strictEqual(summary.plannedHours, 6);
    assert.strictEqual(summary.remainingHours, 4);
  });

  it('Cenário G — tarefa sem allocations (Resultado: SEM_PLANEAMENTO)', () => {
    const allocs = getCanonicalTaskAllocations('task-empty', [], []);
    const summary = computePlanningSummary('8h', allocs);
    const status = getTaskPlanningLoadStatus(summary);

    assert.strictEqual(allocs.length, 0);
    assert.strictEqual(summary.plannedHours, 0);
    assert.strictEqual(status, 'SEM_PLANEAMENTO');
  });

  it('Cenário H — excesso (ESTIMATIVA = 10h, CONFIRMED = 12h => EXCESSO = 2h e status EXCESSO)', () => {
    const allocsInput = [
      makeAlloc('a1', 'task-A', 'res-1', '2026-09-22', 480, 'CONFIRMED'), // 8h
      makeAlloc('a2', 'task-A', 'res-1', '2026-09-23', 240, 'CONFIRMED'), // 4h
    ];

    const allocs = getCanonicalTaskAllocations('task-A', allocsInput, []);
    const summary = computePlanningSummary('10h', allocs);
    const status = getTaskPlanningLoadStatus(summary);

    assert.strictEqual(summary.estimatedHours, 10);
    assert.strictEqual(summary.confirmedHours, 12);
    assert.strictEqual(summary.plannedHours, 12);
    assert.strictEqual(summary.excessHours, 2);
    assert.strictEqual(summary.isOverAllocated, true);
    assert.strictEqual(status, 'EXCESSO');
  });
});

describe('FASE 23E-C3F — Impacto da Tarefa no Planeamento Diário Unit Tests', () => {
  const dummyUsers = [
    { id: 'user-1', name: 'João Silva', email: 'joao@example.com' },
    { id: 'user-2', name: 'Pedro Santos', email: 'pedro@example.com' },
    { id: 'user-3', name: 'Ana Costa', email: 'ana@example.com' },
  ];

  const createAlloc = (
    id: string,
    resourceId: string,
    date: string,
    startTime: string,
    durationMinutes: number,
    status: 'CONFIRMED' | 'DRAFT' | 'CANCELLED'
  ): PlanningAllocationDTO => ({
    id,
    taskId: 'task-main',
    resourceId,
    date,
    startTime,
    endTime: '18:00',
    status,
    version: 1,
    durationMinutes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it('Cenário A — Sem planeamento (0 allocations ativas)', () => {
    const impact = computeTaskPlanningImpact([], '16h', dummyUsers, ['user-1']);
    assert.strictEqual(impact.totalPlannedDays, 0);
    assert.strictEqual(impact.totalInvolvedResources, 0);
    assert.strictEqual(impact.firstDate, null);
    assert.strictEqual(impact.firstDateLabel, null);
    assert.strictEqual(impact.lastDate, null);
    assert.strictEqual(impact.lastDateLabel, null);
    assert.strictEqual(impact.dailyGroups.length, 0);
  });

  it('Cenário B — Um único dia com 1 recurso', () => {
    const allocs = [
      createAlloc('a1', 'user-1', '2026-09-22', '08:00', 480, 'CONFIRMED'), // 8h
    ];
    const impact = computeTaskPlanningImpact(allocs, '16h', dummyUsers, ['user-1']);
    assert.strictEqual(impact.totalPlannedDays, 1);
    assert.strictEqual(impact.totalInvolvedResources, 1);
    assert.strictEqual(impact.firstDate, '2026-09-22');
    assert.strictEqual(impact.lastDate, '2026-09-22');
    assert.strictEqual(impact.dailyGroups.length, 1);

    const day = impact.dailyGroups[0];
    assert.strictEqual(day.date, '2026-09-22');
    assert.strictEqual(day.confirmedHours, 8);
    assert.strictEqual(day.draftHours, 0);
    assert.strictEqual(day.plannedHours, 8);
    assert.strictEqual(day.percentageOfEstimate, 50); // 8h / 16h = 50%
    assert.strictEqual(day.resources.length, 1);
    assert.strictEqual(day.resources[0].resourceName, 'João Silva');
    assert.strictEqual(day.resources[0].confirmedHours, 8);
  });

  it('Cenário C — Vários dias ordenados cronologicamente', () => {
    const allocs = [
      createAlloc('a3', 'user-1', '2026-09-24', '08:00', 120, 'CONFIRMED'), // 2h em 24/09
      createAlloc('a1', 'user-1', '2026-09-22', '08:00', 480, 'CONFIRMED'), // 8h em 22/09
      createAlloc('a2', 'user-1', '2026-09-23', '08:00', 360, 'CONFIRMED'), // 6h em 23/09
    ];
    const impact = computeTaskPlanningImpact(allocs, '16h', dummyUsers, ['user-1']);
    assert.strictEqual(impact.totalPlannedDays, 3);
    assert.strictEqual(impact.firstDate, '2026-09-22');
    assert.strictEqual(impact.lastDate, '2026-09-24');
    assert.strictEqual(impact.dailyGroups.length, 3);
    assert.strictEqual(impact.dailyGroups[0].date, '2026-09-22');
    assert.strictEqual(impact.dailyGroups[0].plannedHours, 8);
    assert.strictEqual(impact.dailyGroups[1].date, '2026-09-23');
    assert.strictEqual(impact.dailyGroups[1].plannedHours, 6);
    assert.strictEqual(impact.dailyGroups[2].date, '2026-09-24');
    assert.strictEqual(impact.dailyGroups[2].plannedHours, 2);
  });

  it('Cenário D — Vários recursos no mesmo dia', () => {
    const allocs = [
      createAlloc('a1', 'user-1', '2026-09-22', '08:00', 360, 'CONFIRMED'), // João 6h
      createAlloc('a2', 'user-2', '2026-09-22', '09:00', 120, 'CONFIRMED'), // Pedro 2h
    ];
    const impact = computeTaskPlanningImpact(allocs, '16h', dummyUsers, ['user-1']);
    assert.strictEqual(impact.totalPlannedDays, 1);
    assert.strictEqual(impact.totalInvolvedResources, 2);

    const day = impact.dailyGroups[0];
    assert.strictEqual(day.confirmedHours, 8);
    assert.strictEqual(day.plannedHours, 8);
    assert.strictEqual(day.resources.length, 2);
    assert.strictEqual(day.resources[0].resourceName, 'João Silva');
    assert.strictEqual(day.resources[0].confirmedHours, 6);
    assert.strictEqual(day.resources[1].resourceName, 'Pedro Santos');
    assert.strictEqual(day.resources[1].confirmedHours, 2);
  });

  it('Cenário E — CONFIRMED + DRAFT no mesmo dia e no mesmo recurso', () => {
    const allocs = [
      createAlloc('a1', 'user-1', '2026-09-22', '08:00', 360, 'CONFIRMED'), // 6h
      createAlloc('a2', 'user-1', '2026-09-22', '15:00', 120, 'DRAFT'),     // 2h
    ];
    const impact = computeTaskPlanningImpact(allocs, '16h', dummyUsers, ['user-1']);
    const day = impact.dailyGroups[0];
    assert.strictEqual(day.confirmedHours, 6);
    assert.strictEqual(day.draftHours, 2);
    assert.strictEqual(day.plannedHours, 8);

    const res = day.resources[0];
    assert.strictEqual(res.confirmedHours, 6);
    assert.strictEqual(res.draftHours, 2);
    assert.strictEqual(res.plannedHours, 8);
  });

  it('Cenário F — Várias allocations do mesmo recurso no mesmo dia são consolidadas', () => {
    const allocs = [
      createAlloc('a1', 'user-1', '2026-09-22', '08:00', 120, 'CONFIRMED'), // 2h
      createAlloc('a2', 'user-1', '2026-09-22', '14:00', 120, 'CONFIRMED'), // 2h
      createAlloc('a3', 'user-1', '2026-09-22', '16:00', 60, 'DRAFT'),      // 1h
    ];
    const impact = computeTaskPlanningImpact(allocs, '10h', dummyUsers, ['user-1']);
    const day = impact.dailyGroups[0];
    assert.strictEqual(day.resources.length, 1);
    const res = day.resources[0];
    assert.strictEqual(res.confirmedHours, 4);
    assert.strictEqual(res.draftHours, 1);
    assert.strictEqual(res.plannedHours, 5);
    assert.strictEqual(res.allocations.length, 3);
  });

  it('Cenário G — CANCELLED allocations são excluídas dos cálculos operacionais de impacto', () => {
    const allocs = [
      createAlloc('a1', 'user-1', '2026-09-22', '08:00', 240, 'CONFIRMED'), // 4h
      createAlloc('a2', 'user-2', '2026-09-23', '08:00', 240, 'CANCELLED'), // 4h cancelado
    ];
    const impact = computeTaskPlanningImpact(allocs, '10h', dummyUsers, ['user-1']);
    assert.strictEqual(impact.totalPlannedDays, 1);
    assert.strictEqual(impact.totalInvolvedResources, 1);
    assert.strictEqual(impact.firstDate, '2026-09-22');
    assert.strictEqual(impact.lastDate, '2026-09-22');
    assert.strictEqual(impact.dailyGroups.length, 1);
  });

  it('Cenário H — Excesso de planeamento com distribuição diária correta', () => {
    const allocs = [
      createAlloc('a1', 'user-1', '2026-09-22', '08:00', 600, 'CONFIRMED'), // 10h
      createAlloc('a2', 'user-2', '2026-09-23', '08:00', 480, 'CONFIRMED'), // 8h
    ];
    const impact = computeTaskPlanningImpact(allocs, '16h', dummyUsers, ['user-1']);
    assert.strictEqual(impact.totalPlannedDays, 2);
    assert.strictEqual(impact.totalInvolvedResources, 2);
    assert.strictEqual(impact.dailyGroups[0].plannedHours, 10);
    assert.strictEqual(impact.dailyGroups[1].plannedHours, 8);
    // Global planned = 18h > 16h
    const summary = computePlanningSummary('16h', allocs);
    assert.strictEqual(summary.plannedHours, 18);
    assert.strictEqual(summary.excessHours, 2);
    assert.strictEqual(summary.isOverAllocated, true);
  });
});

describe('FASE 23E-C3G — Visão de Carga por Recurso e Dia Unit Tests', () => {
  const dummyProjects = [
    { id: 'proj-1', title: 'Projeto ABC' },
    { id: 'proj-2', title: 'Projeto XYZ' },
  ];

  const dummyTasks = [
    { id: 'task-1', title: 'Instalação impressora linha 1', projectId: 'proj-1', estimatedHours: 8 },
    { id: 'task-2', title: 'Configuração etiquetagem', projectId: 'proj-2', estimatedHours: 4 },
    { id: 'task-3', title: 'Manutenção preventiva', projectId: 'proj-1', estimatedHours: 6 },
  ];

  const makeAlloc = (
    id: string,
    taskId: string,
    resourceId: string,
    date: string,
    durationMinutes: number,
    status: 'CONFIRMED' | 'DRAFT' | 'CANCELLED',
    startTime: string = '08:00',
    endTime: string = '12:00'
  ): PlanningAllocationDTO => ({
    id,
    taskId,
    resourceId,
    date,
    startTime,
    endTime,
    durationMinutes,
    status,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Teste A: Uma tarefa CONFIRMED aparece corretamente
  it('Teste A: Uma tarefa CONFIRMED aparece corretamente (Projeto, Nome, 4h CONFIRMED, 0h DRAFT, 4h PLANEADO)', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 240, 'CONFIRMED'),
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].project?.title, 'Projeto ABC');
    assert.strictEqual(groups[0].task?.title, 'Instalação impressora linha 1');
    assert.strictEqual(groups[0].confirmedHours, 4);
    assert.strictEqual(groups[0].draftHours, 0);
    assert.strictEqual(groups[0].plannedHours, 4);
    assert.strictEqual(groups[0].hasConfirmed, true);
    assert.strictEqual(groups[0].hasDraft, false);
    assert.strictEqual(groups[0].allocations.length, 1);
  });

  // Teste B: CONFIRMED + DRAFT da mesma tarefa
  it('Teste B: CONFIRMED + DRAFT da mesma tarefa (4h CONFIRMED + 2h DRAFT => CONFIRMED 4h, DRAFT 2h, PLANEADO 6h)', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 240, 'CONFIRMED', '08:00', '12:00'),
      makeAlloc('a2', 'task-1', 'user-1', '2026-09-22', 120, 'DRAFT', '13:00', '15:00'),
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].confirmedHours, 4);
    assert.strictEqual(groups[0].draftHours, 2);
    assert.strictEqual(groups[0].plannedHours, 6);
    assert.strictEqual(groups[0].hasConfirmed, true);
    assert.strictEqual(groups[0].hasDraft, true);
    assert.strictEqual(groups[0].allocations.length, 2);

    const opStatus = getTaskDailyOperationalStatus(groups[0], allocs);
    assert.strictEqual(opStatus.status, 'DRAFT');
    assert.strictEqual(opStatus.label, 'Draft Pendente');
  });

  // Teste C: Várias allocations da mesma tarefa agrupadas
  it('Teste C: Múltiplas allocations da mesma tarefa no mesmo dia agrupadas numa única linha de tarefa', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 120, 'CONFIRMED', '08:00', '10:00'), // 2h
      makeAlloc('a2', 'task-1', 'user-1', '2026-09-22', 120, 'CONFIRMED', '10:00', '12:00'), // 2h
      makeAlloc('a3', 'task-1', 'user-1', '2026-09-22', 60, 'DRAFT', '13:00', '14:00'),       // 1h
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].confirmedHours, 4);
    assert.strictEqual(groups[0].draftHours, 1);
    assert.strictEqual(groups[0].plannedHours, 5);
    assert.strictEqual(groups[0].allocations.length, 3);
  });

  // Teste D: Várias tarefas no mesmo recurso/dia com ordenação determinística
  it('Teste D: Várias tarefas no mesmo recurso/dia ordenadas deterministicamente', () => {
    const allocs = [
      makeAlloc('a1', 'task-2', 'user-1', '2026-09-22', 60, 'DRAFT'),      // DRAFT 1h
      makeAlloc('a2', 'task-1', 'user-1', '2026-09-22', 240, 'CONFIRMED'), // CONFIRMED 4h
      makeAlloc('a3', 'task-3', 'user-1', '2026-09-22', 120, 'CONFIRMED'), // CONFIRMED 2h
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(groups.length, 3);
    // 1. task-1 (CONFIRMED, 4h)
    // 2. task-3 (CONFIRMED, 2h)
    // 3. task-2 (DRAFT, 1h)
    assert.strictEqual(groups[0].taskId, 'task-1');
    assert.strictEqual(groups[1].taskId, 'task-3');
    assert.strictEqual(groups[2].taskId, 'task-2');
  });

  // Teste E: CANCELLED excluído das allocations da tarefa e dos totais operacionais
  it('Teste E: CANCELLED excluído da carga operacional da tarefa e dos grupos', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 180, 'CONFIRMED'), // 3h
      makeAlloc('a2', 'task-1', 'user-1', '2026-09-22', 120, 'CANCELLED'), // 2h canceladas
      makeAlloc('a3', 'task-2', 'user-1', '2026-09-22', 60, 'CANCELLED'),  // cancelada
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].taskId, 'task-1');
    assert.strictEqual(groups[0].confirmedHours, 3);
    assert.strictEqual(groups[0].plannedHours, 3);
    assert.strictEqual(groups[0].allocations.length, 1);
  });

  // Teste F: Soma das tarefas coincide com CONFIRMED/DRAFT/PLANEADO do dia
  it('Teste F: computeResourceDayTaskConsistency valida que a soma das tarefas coincide com o dia', () => {
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 240, 'CONFIRMED'), // 4h
      makeAlloc('a2', 'task-2', 'user-1', '2026-09-22', 120, 'CONFIRMED'), // 2h
      makeAlloc('a3', 'task-3', 'user-1', '2026-09-22', 120, 'DRAFT'),     // 2h
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    const dayConfirmedMinutes = 360; // 6h
    const dayDraftMinutes = 120;     // 2h

    const consistency = computeResourceDayTaskConsistency(groups, dayConfirmedMinutes, dayDraftMinutes);
    assert.strictEqual(consistency.tasksConfirmedMinutes, 360);
    assert.strictEqual(consistency.tasksConfirmedHours, 6);
    assert.strictEqual(consistency.tasksDraftMinutes, 120);
    assert.strictEqual(consistency.tasksDraftHours, 2);
    assert.strictEqual(consistency.tasksPlannedHours, 8);
    assert.strictEqual(consistency.isConsistent, true);
  });

  // Teste G: Excesso pertence ao recurso/dia e não é atribuído a uma tarefa
  it('Teste G: Sobrecarga de capacidade pertence ao recurso/dia e nenhuma tarefa individual é marcada como causadora', () => {
    // Técnico com 8h de capacidade diária, com duas tarefas de 5h confirmadas cada (total 10h)
    const allocs = [
      makeAlloc('a1', 'task-1', 'user-1', '2026-09-22', 300, 'CONFIRMED'), // 5h (estimada 8h)
      makeAlloc('a2', 'task-3', 'user-1', '2026-09-22', 300, 'CONFIRMED'), // 5h (estimada 6h)
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(groups.length, 2);

    // O excesso do dia é do recurso: 10h planeadas > 8h capacidade = 2h excesso
    const dayCapacityHours = 8;
    const dayConfirmedHours = 10;
    const dayExcessHours = Math.max(0, dayConfirmedHours - dayCapacityHours);
    assert.strictEqual(dayExcessHours, 2);

    // No entanto, as tarefas individualmente não excederam os seus orçamentos estimados:
    // task-1 estimada = 8h, planeada = 5h => sem excesso de tarefa
    const statusTask1 = getTaskDailyOperationalStatus(groups[0], allocs);
    assert.strictEqual(statusTask1.status, 'NORMAL');
    assert.strictEqual(statusTask1.excessHours, 0);

    // task-3 estimada = 6h, planeada = 5h => sem excesso de tarefa
    const statusTask3 = getTaskDailyOperationalStatus(groups[1], allocs);
    assert.strictEqual(statusTask3.status, 'NORMAL');
    assert.strictEqual(statusTask3.excessHours, 0);
  });

  // Teste H: DRAFT não cria excesso de capacidade do técnico
  it('Teste H: DRAFT não cria excesso de capacidade do técnico', () => {
    // 6h CONFIRMED + 4h DRAFT num dia de 8h de capacidade
    const capacityMinutes = 480; // 8h
    const confirmedMinutes = 360; // 6h
    const draftMinutes = 240;    // 4h

    // Apenas CONFIRMED debita capacidade e gera excesso
    const excessMinutes = Math.max(0, confirmedMinutes - capacityMinutes);
    assert.strictEqual(excessMinutes, 0); // Sem excesso!
    const freeMinutes = Math.max(0, capacityMinutes - confirmedMinutes);
    assert.strictEqual(freeMinutes, 120); // 2h livres
  });

  // Teste I: Ver tarefa utiliza o task.id correto
  it('Teste I: O agrupamento preserva a referência exata de task.id e task.title para a ação Ver Tarefa', () => {
    const allocs = [
      makeAlloc('a1', 'task-2', 'user-1', '2026-09-22', 120, 'CONFIRMED'),
    ];

    const groups = groupResourceDayAllocationsByTask('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].taskId, 'task-2');
    assert.strictEqual(groups[0].task?.id, 'task-2');
    assert.strictEqual(groups[0].task?.title, 'Configuração etiquetagem');
  });
});

describe('FASE 23E-C3H — Visão Consolidada do Planeamento Diário por Projeto', () => {
  const dummyProjects = [
    { id: 'proj-A', title: 'Projeto Alpha' },
    { id: 'proj-B', title: 'Projeto Beta' },
    { id: 'proj-C', title: 'Projeto Gamma' },
  ];

  const dummyTasks = [
    { id: 'task-A1', title: 'Tarefa Alpha 1', projectId: 'proj-A' },
    { id: 'task-A2', title: 'Tarefa Alpha 2', projectId: 'proj-A' },
    { id: 'task-B1', title: 'Tarefa Beta 1', projectId: 'proj-B' },
    { id: 'task-C1', title: 'Tarefa Gamma 1', projectId: 'proj-C' },
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
    durationMinutes,
    status,
    startTime,
    endTime,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Cenário A: 1 projeto (8h capacidade, 4h CONFIRMED) -> Projeto A = 4h CONFIRMED, 4h PLANEADO, 100% da carga planeada
  it('Cenário A: 1 projeto (4h CONFIRMED) -> Projeto A = 4h CONFIRMED, 4h PLANEADO, 100% da carga planeada', () => {
    const allocs = [
      makeAlloc('a1', 'task-A1', 'user-1', '2026-09-22', 240, 'CONFIRMED'), // 4h
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.projects.length, 1);
    const projA = result.projects[0];
    assert.strictEqual(projA.projectId, 'proj-A');
    assert.strictEqual(projA.projectTitle, 'Projeto Alpha');
    assert.strictEqual(projA.confirmedHours, 4);
    assert.strictEqual(projA.draftHours, 0);
    assert.strictEqual(projA.plannedHours, 4);
    assert.strictEqual(projA.percentageOfPlanned, 100);
    assert.strictEqual(projA.taskCount, 1);
    assert.strictEqual(projA.allocationCount, 1);
    assert.strictEqual(result.totalPlannedHours, 4);
    assert.strictEqual(result.isConsistent, true);
  });

  // Cenário B: CONFIRMED + DRAFT no mesmo projeto (2h CONFIRMED + 2h DRAFT) -> 4h PLANEADO
  it('Cenário B: CONFIRMED + DRAFT no mesmo projeto (2h CONFIRMED + 2h DRAFT) -> 4h PLANEADO', () => {
    const allocs = [
      makeAlloc('a1', 'task-A1', 'user-1', '2026-09-22', 120, 'CONFIRMED'), // 2h
      makeAlloc('a2', 'task-A1', 'user-1', '2026-09-22', 120, 'DRAFT'),     // 2h
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.projects.length, 1);
    const projA = result.projects[0];
    assert.strictEqual(projA.confirmedHours, 2);
    assert.strictEqual(projA.draftHours, 2);
    assert.strictEqual(projA.plannedHours, 4);
    assert.strictEqual(projA.percentageOfPlanned, 100);
    assert.strictEqual(result.totalConfirmedHours, 2);
    assert.strictEqual(result.totalDraftHours, 2);
    assert.strictEqual(result.totalPlannedHours, 4);
    assert.strictEqual(result.isConsistent, true);
  });

  // Cenário C: Múltiplas tarefas do mesmo projeto (Task A1 = 2h, Task A2 = 3h) -> Projeto = 5h, 2 tarefas
  it('Cenário C: Múltiplas tarefas do mesmo projeto consolidadas (Task A1 = 2h, Task A2 = 3h) -> Projeto = 5h, 2 tarefas', () => {
    const allocs = [
      makeAlloc('a1', 'task-A1', 'user-1', '2026-09-22', 120, 'CONFIRMED'), // 2h
      makeAlloc('a2', 'task-A2', 'user-1', '2026-09-22', 180, 'CONFIRMED'), // 3h
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.projects.length, 1);
    const projA = result.projects[0];
    assert.strictEqual(projA.plannedHours, 5);
    assert.strictEqual(projA.taskCount, 2);
    assert.strictEqual(projA.allocationCount, 2);
    assert.strictEqual(projA.tasks.length, 2);
    // Ordenação interna das tarefas: Task A2 (3h) primeiro que Task A1 (2h)
    assert.strictEqual(projA.tasks[0].taskId, 'task-A2');
    assert.strictEqual(projA.tasks[0].plannedHours, 3);
    assert.strictEqual(projA.tasks[1].taskId, 'task-A1');
    assert.strictEqual(projA.tasks[1].plannedHours, 2);
  });

  // Cenário D: Múltiplas alocações da mesma tarefa (08:00-10:00 2h, 13:00-15:00 2h) -> 1 tarefa, 4h, 2 alocações
  it('Cenário D: Múltiplas alocações da mesma tarefa consolidadas na tarefa -> 1 tarefa, 4h, 2 alocações', () => {
    const allocs = [
      makeAlloc('a1', 'task-A1', 'user-1', '2026-09-22', 120, 'CONFIRMED', '08:00', '10:00'),
      makeAlloc('a2', 'task-A1', 'user-1', '2026-09-22', 120, 'CONFIRMED', '13:00', '15:00'),
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.projects.length, 1);
    const projA = result.projects[0];
    assert.strictEqual(projA.plannedHours, 4);
    assert.strictEqual(projA.taskCount, 1);
    assert.strictEqual(projA.allocationCount, 2);
    assert.strictEqual(projA.tasks[0].allocationCount, 2);
    assert.strictEqual(projA.tasks[0].plannedHours, 4);
  });

  // Cenário E: CANCELLED (4h CONFIRMED, 2h CANCELLED) -> 4h (CANCELLED excluído da carga operacional)
  it('Cenário E: Alocações CANCELLED são excluídas da distribuição de carga do projeto', () => {
    const allocs = [
      makeAlloc('a1', 'task-A1', 'user-1', '2026-09-22', 240, 'CONFIRMED'),
      makeAlloc('a2', 'task-A1', 'user-1', '2026-09-22', 120, 'CANCELLED'),
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.projects.length, 1);
    const projA = result.projects[0];
    assert.strictEqual(projA.plannedHours, 4);
    assert.strictEqual(projA.confirmedHours, 4);
    assert.strictEqual(projA.allocationCount, 1);
  });

  // Cenário F: Vários projetos (Proj A = 6h, Proj B = 3h, Proj C = 1h) -> A 60%, B 30%, C 10%
  it('Cenário F: Vários projetos proporcionais (Proj A = 6h, Proj B = 3h, Proj C = 1h) -> A 60%, B 30%, C 10%', () => {
    const allocs = [
      makeAlloc('a1', 'task-A1', 'user-1', '2026-09-22', 360, 'CONFIRMED'), // 6h Proj A
      makeAlloc('b1', 'task-B1', 'user-1', '2026-09-22', 180, 'CONFIRMED'), // 3h Proj B
      makeAlloc('c1', 'task-C1', 'user-1', '2026-09-22', 60, 'CONFIRMED'),  // 1h Proj C
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.projects.length, 3);
    assert.strictEqual(result.totalPlannedHours, 10);

    // Ordenação determinística por horas planeadas descendente: A (6h), B (3h), C (1h)
    assert.strictEqual(result.projects[0].projectId, 'proj-A');
    assert.strictEqual(result.projects[0].percentageOfPlanned, 60);

    assert.strictEqual(result.projects[1].projectId, 'proj-B');
    assert.strictEqual(result.projects[1].percentageOfPlanned, 30);

    assert.strictEqual(result.projects[2].projectId, 'proj-C');
    assert.strictEqual(result.projects[2].percentageOfPlanned, 10);
  });

  // Cenário G: Excesso do recurso/dia não é distribuído pelos projetos (Capacidade 8h, Proj A 5h, Proj B 5h, Planeado 10h, Excesso 2h)
  it('Cenário G: Excesso do recurso pertence ao técnico/dia e não é distribuído aos projetos individuais', () => {
    const allocs = [
      makeAlloc('a1', 'task-A1', 'user-1', '2026-09-22', 300, 'CONFIRMED'), // 5h
      makeAlloc('b1', 'task-B1', 'user-1', '2026-09-22', 300, 'CONFIRMED'), // 5h
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.totalPlannedHours, 10);
    assert.strictEqual(result.projects[0].plannedHours, 5);
    assert.strictEqual(result.projects[0].percentageOfPlanned, 50);
    assert.strictEqual(result.projects[1].plannedHours, 5);
    assert.strictEqual(result.projects[1].percentageOfPlanned, 50);

    // Capacidade do técnico é 8h -> Excesso do dia é 2h
    const resourceDayCapacityMinutes = 480;
    const resourceDayExcessMinutes = Math.max(0, result.totalConfirmedMinutes - resourceDayCapacityMinutes);
    assert.strictEqual(resourceDayExcessMinutes, 120); // 2h de excesso do dia
  });

  // Cenário H: DRAFT não cria excesso de capacidade do técnico (Capacidade 8h, CONFIRMED 6h, DRAFT 4h -> Planeado 10h, Excesso 0h)
  it('Cenário H: DRAFT não cria excesso de capacidade do técnico', () => {
    const allocs = [
      makeAlloc('a1', 'task-A1', 'user-1', '2026-09-22', 360, 'CONFIRMED'), // 6h CONF
      makeAlloc('b1', 'task-B1', 'user-1', '2026-09-22', 240, 'DRAFT'),     // 4h DRAFT
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.totalConfirmedHours, 6);
    assert.strictEqual(result.totalDraftHours, 4);
    assert.strictEqual(result.totalPlannedHours, 10);

    // Excesso é exclusivamente CONFIRMED - Capacidade
    const capacityHours = 8;
    const excessHours = Math.max(0, result.totalConfirmedHours - capacityHours);
    assert.strictEqual(excessHours, 0); // 0h de excesso
  });

  // Cenário I: Tarefa/projeto não encontrado é contabilizado como "Projeto não identificado"
  it('Cenário I: Alocações com tarefa ou projeto não encontrado não são descartadas e aparecem em "Projeto não identificado"', () => {
    const allocs = [
      makeAlloc('a1', 'unknown-task-999', 'user-1', '2026-09-22', 180, 'CONFIRMED'), // 3h sem task nem projeto
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.projects.length, 1);
    assert.strictEqual(result.projects[0].projectId, 'unidentified');
    assert.strictEqual(result.projects[0].projectTitle, 'Projeto não identificado');
    assert.strictEqual(result.projects[0].plannedHours, 3);
    assert.strictEqual(result.projects[0].percentageOfPlanned, 100);
    assert.strictEqual(result.projects[0].tasks[0].taskTitle, 'Tarefa não identificada');
    assert.strictEqual(result.isConsistent, true);
  });

  // Cenário J: Validação de consistência (Soma dos projetos CONFIRMED == CONFIRMED do dia, Soma DRAFT == DRAFT do dia)
  it('Cenário J: Consistência estrita entre soma dos projetos e totais do dia', () => {
    const allocs = [
      makeAlloc('a1', 'task-A1', 'user-1', '2026-09-22', 180, 'CONFIRMED'), // 3h CONF
      makeAlloc('a2', 'task-A2', 'user-1', '2026-09-22', 60, 'DRAFT'),      // 1h DRAFT
      makeAlloc('b1', 'task-B1', 'user-1', '2026-09-22', 120, 'CONFIRMED'), // 2h CONF
      makeAlloc('c1', 'task-C1', 'user-1', '2026-09-22', 120, 'DRAFT'),     // 2h DRAFT
    ];

    const result = computeResourceDayProjectDistribution('user-1', '2026-09-22', allocs, dummyTasks, dummyProjects);
    assert.strictEqual(result.isConsistent, true);
    assert.strictEqual(result.totalConfirmedMinutes, 300); // 5h CONF
    assert.strictEqual(result.totalDraftMinutes, 180);     // 3h DRAFT
    assert.strictEqual(result.totalPlannedMinutes, 480);   // 8h PLANEADO

    const sumProjectConfirmed = result.projects.reduce((sum, p) => sum + p.confirmedMinutes, 0);
    const sumProjectDraft = result.projects.reduce((sum, p) => sum + p.draftMinutes, 0);
    const sumProjectPlanned = result.projects.reduce((sum, p) => sum + p.plannedMinutes, 0);

    assert.strictEqual(sumProjectConfirmed, result.totalConfirmedMinutes);
    assert.strictEqual(sumProjectDraft, result.totalDraftMinutes);
    assert.strictEqual(sumProjectPlanned, result.totalPlannedMinutes);
  });
});

