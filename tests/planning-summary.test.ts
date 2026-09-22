import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  computePlanningSummary, 
  parseHoursToNumber, 
  formatHoursDisplay,
  groupTaskAllocationsByDate
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
    assert.strictEqual(summary.confirmedHours, 3);
    assert.strictEqual(summary.draftHours, 2);
    assert.strictEqual(summary.capacityConsumedHours, 3);
    assert.strictEqual(summary.remainingHours, 3);
    assert.strictEqual(summary.excessHours, 0);
  });

  describe('FASE 23E-C3M-B: Cenários A-F de Carga Diária das Tarefas', () => {
    it('Cenário A: Tarefa sem qualquer planeamento', () => {
      // Estimativa: 8h, Alocações: 0
      const summary = computePlanningSummary('8h', []);
      assert.strictEqual(summary.estimatedHours, 8);
      assert.strictEqual(summary.confirmedHours, 0);
      assert.strictEqual(summary.draftHours, 0);
      assert.strictEqual(summary.plannedHours, 0);
      assert.strictEqual(summary.remainingHours, 8);
      assert.strictEqual(summary.excessHours, 0);
      assert.strictEqual(summary.isOverAllocated, false);
    });

    it('Cenário B: Tarefa parcialmente planeada (apenas CONFIRMED)', () => {
      // Estimativa: 16h, 1 dia CONFIRMED 6h
      const a1 = { ...makeAllocation('a-1', 360, 'CONFIRMED'), date: '2026-09-22' };
      const summary = computePlanningSummary('16h', [a1]);
      assert.strictEqual(summary.estimatedHours, 16);
      assert.strictEqual(summary.confirmedHours, 6);
      assert.strictEqual(summary.draftHours, 0);
      assert.strictEqual(summary.plannedHours, 6);
      assert.strictEqual(summary.remainingHours, 10);
      assert.strictEqual(summary.excessHours, 0);
      assert.strictEqual(summary.isOverAllocated, false);
    });

    it('Cenário C: Tarefa com CONFIRMED + DRAFT', () => {
      // Estimativa: 16h, 1 dia CONFIRMED 8h + 1 dia DRAFT 4h
      const a1 = { ...makeAllocation('a-1', 480, 'CONFIRMED'), date: '2026-09-22' };
      const a2 = { ...makeAllocation('a-2', 240, 'DRAFT'), date: '2026-09-23' };
      const summary = computePlanningSummary('16h', [a1, a2]);
      assert.strictEqual(summary.estimatedHours, 16);
      assert.strictEqual(summary.confirmedHours, 8);
      assert.strictEqual(summary.draftHours, 4);
      assert.strictEqual(summary.plannedHours, 12);
      assert.strictEqual(summary.remainingHours, 4);
      assert.strictEqual(summary.excessHours, 0);
      assert.strictEqual(summary.isOverAllocated, false);
    });

    it('Cenário D: Tarefa totalmente planeada', () => {
      // Estimativa: 16h, 2 dias CONFIRMED 8h = 16h
      const a1 = { ...makeAllocation('a-1', 480, 'CONFIRMED'), date: '2026-09-22' };
      const a2 = { ...makeAllocation('a-2', 480, 'CONFIRMED'), date: '2026-09-23' };
      const summary = computePlanningSummary('16h', [a1, a2]);
      assert.strictEqual(summary.estimatedHours, 16);
      assert.strictEqual(summary.confirmedHours, 16);
      assert.strictEqual(summary.draftHours, 0);
      assert.strictEqual(summary.plannedHours, 16);
      assert.strictEqual(summary.remainingHours, 0);
      assert.strictEqual(summary.excessHours, 0);
      assert.strictEqual(summary.isOverAllocated, false);
    });

    it('Cenário E: Tarefa com excesso de planeamento', () => {
      // Estimativa: 10h, Planeado 14h (8h CONFIRMED + 6h DRAFT)
      const a1 = { ...makeAllocation('a-1', 480, 'CONFIRMED'), date: '2026-09-22' };
      const a2 = { ...makeAllocation('a-2', 360, 'DRAFT'), date: '2026-09-23' };
      const summary = computePlanningSummary('10h', [a1, a2]);
      assert.strictEqual(summary.estimatedHours, 10);
      assert.strictEqual(summary.confirmedHours, 8);
      assert.strictEqual(summary.draftHours, 6);
      assert.strictEqual(summary.plannedHours, 14);
      assert.strictEqual(summary.remainingHours, 0);
      assert.strictEqual(summary.excessHours, 4);
      assert.strictEqual(summary.isOverAllocated, true);
    });

    it('Cenário F: Tarefa distribuída por múltiplos dias e recursos', () => {
      // Exemplo da especificação:
      // 22 Set: 8h CONFIRMED (Técnico A)
      // 23 Set: 6h CONFIRMED (Técnico B)
      // 24 Set: 2h DRAFT (Técnico A)
      // Total: 16h, Estimativa: 16h
      const a1 = { ...makeAllocation('a-1', 480, 'CONFIRMED'), resourceId: 'res-A', date: '2026-09-22', startTime: '08:00', endTime: '16:00' };
      const a2 = { ...makeAllocation('a-2', 360, 'CONFIRMED'), resourceId: 'res-B', date: '2026-09-23', startTime: '09:00', endTime: '15:00' };
      const a3 = { ...makeAllocation('a-3', 120, 'DRAFT'), resourceId: 'res-A', date: '2026-09-24', startTime: '08:00', endTime: '10:00' };
      
      const summary = computePlanningSummary('16h', [a1, a2, a3]);
      assert.strictEqual(summary.estimatedHours, 16);
      assert.strictEqual(summary.confirmedHours, 14);
      assert.strictEqual(summary.draftHours, 2);
      assert.strictEqual(summary.plannedHours, 16);
      assert.strictEqual(summary.remainingHours, 0);
      assert.strictEqual(summary.excessHours, 0);
      assert.strictEqual(summary.isOverAllocated, false);

      const dailyGroups = groupTaskAllocationsByDate([a1, a2, a3]);
      assert.strictEqual(dailyGroups.length, 3);
      assert.strictEqual(dailyGroups[0].date, '2026-09-22');
      assert.strictEqual(dailyGroups[0].plannedHours, 8);
      assert.strictEqual(dailyGroups[0].confirmedHours, 8);
      assert.strictEqual(dailyGroups[0].resourceAllocations[0].resourceId, 'res-A');

      assert.strictEqual(dailyGroups[1].date, '2026-09-23');
      assert.strictEqual(dailyGroups[1].plannedHours, 6);
      assert.strictEqual(dailyGroups[1].confirmedHours, 6);
      assert.strictEqual(dailyGroups[1].resourceAllocations[0].resourceId, 'res-B');

      assert.strictEqual(dailyGroups[2].date, '2026-09-24');
      assert.strictEqual(dailyGroups[2].plannedHours, 2);
      assert.strictEqual(dailyGroups[2].draftHours, 2);
      assert.strictEqual(dailyGroups[2].resourceAllocations[0].resourceId, 'res-A');
    });
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
