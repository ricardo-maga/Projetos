import { describe, it, expect } from 'bun:test';
import {
  isAllocationOutsideTaskWindow,
  computeResourceDayProjectDistribution,
  computeProjectPlanningImpact,
} from '@/lib/planning/summary';
import type { PlanningAllocationDTO } from '@/lib/planning/types';

describe('FASE 71 — PLANNING UX: "SEM PROJETO" + AVISO DE JANELA TEMPORAL', () => {
  describe('1. PARTE 1 — Filtro e Semântica "Sem projeto"', () => {
    it('computeResourceDayProjectDistribution classifica tarefa com project_id NULL como "no_project" / "Sem projeto"', () => {
      const taskNoProj = { id: 'task-no-proj-1', title: 'Tarefa Geral', projectId: null };
      const alloc: PlanningAllocationDTO = {
        id: 'alloc-1',
        taskId: 'task-no-proj-1',
        resourceId: 'user-1',
        date: '2026-10-01',
        startTime: '09:00',
        endTime: '12:00',
        durationMinutes: 180,
        status: 'CONFIRMED',
        version: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const result = computeResourceDayProjectDistribution(
        'user-1',
        '2026-10-01',
        [alloc],
        [taskNoProj],
        []
      );

      expect(result.projects.length).toBe(1);
      expect(result.projects[0].projectId).toBe('no_project');
      expect(result.projects[0].projectTitle).toBe('Sem projeto');
      expect(result.projects[0].confirmedHours).toBe(3);
    });

    it('computeResourceDayProjectDistribution classifica alocação órfã sem tarefa encontrada como "unidentified" / "Projeto não identificado"', () => {
      const allocOrphan: PlanningAllocationDTO = {
        id: 'alloc-orphan',
        taskId: 'non-existent-task',
        resourceId: 'user-1',
        date: '2026-10-01',
        startTime: '09:00',
        endTime: '11:00',
        durationMinutes: 120,
        status: 'CONFIRMED',
        version: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const result = computeResourceDayProjectDistribution(
        'user-1',
        '2026-10-01',
        [allocOrphan],
        [],
        []
      );

      expect(result.projects.length).toBe(1);
      expect(result.projects[0].projectId).toBe('unidentified');
      expect(result.projects[0].projectTitle).toBe('Projeto não identificado');
    });

    it('computeProjectPlanningImpact resolve o título "Sem projeto" para projectId "no_project"', () => {
      const taskNoProj = { id: 'task-no-proj-1', title: 'Tarefa Avulsa', projectId: null };
      const alloc: PlanningAllocationDTO = {
        id: 'alloc-2',
        taskId: 'task-no-proj-1',
        resourceId: 'user-1',
        date: '2026-10-01',
        startTime: '14:00',
        endTime: '18:00',
        durationMinutes: 240,
        status: 'CONFIRMED',
        version: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const impact = computeProjectPlanningImpact(
        'no_project',
        [alloc],
        [taskNoProj],
        []
      );

      expect(impact.projectTitle).toBe('Sem projeto');
      expect(impact.totalConfirmedHours).toBe(4);
    });
  });

  describe('2. PARTE 2 — Aviso de Janela Temporal da Task', () => {
    it('isAllocationOutsideTaskWindow devolve true se a data de alocação for anterior à startDate da tarefa', () => {
      const task = {
        id: 't-1',
        startDate: '2026-10-05',
        endDate: '2026-10-15',
      };
      expect(isAllocationOutsideTaskWindow('2026-10-02', task)).toBe(true);
    });

    it('isAllocationOutsideTaskWindow devolve true se a data de alocação for posterior à endDate da tarefa', () => {
      const task = {
        id: 't-1',
        startDate: '2026-10-05',
        endDate: '2026-10-15',
      };
      expect(isAllocationOutsideTaskWindow('2026-10-18', task)).toBe(true);
    });

    it('isAllocationOutsideTaskWindow devolve false se a data de alocação estiver dentro do intervalo [startDate, endDate]', () => {
      const task = {
        id: 't-1',
        startDate: '2026-10-05',
        endDate: '2026-10-15',
      };
      expect(isAllocationOutsideTaskWindow('2026-10-05', task)).toBe(false);
      expect(isAllocationOutsideTaskWindow('2026-10-10', task)).toBe(false);
      expect(isAllocationOutsideTaskWindow('2026-10-15', task)).toBe(false);
    });

    it('isAllocationOutsideTaskWindow considera estimatedDate quando startDate/endDate não existem', () => {
      const task = {
        id: 't-2',
        estimatedDate: '2026-10-10',
      };
      expect(isAllocationOutsideTaskWindow('2026-10-10', task)).toBe(false);
      expect(isAllocationOutsideTaskWindow('2026-10-09', task)).toBe(true);
      expect(isAllocationOutsideTaskWindow('2026-10-11', task)).toBe(true);
    });

    it('isAllocationOutsideTaskWindow suporta propriedades em formato snake_case (start_date, end_date)', () => {
      const taskSnake = {
        id: 't-3',
        start_date: '2026-10-01',
        end_date: '2026-10-10',
      };
      expect(isAllocationOutsideTaskWindow('2026-09-30', taskSnake)).toBe(true);
      expect(isAllocationOutsideTaskWindow('2026-10-05', taskSnake)).toBe(false);
      expect(isAllocationOutsideTaskWindow('2026-10-12', taskSnake)).toBe(true);
    });

    it('isAllocationOutsideTaskWindow devolve false se a tarefa não possuir qualquer data configurada', () => {
      const taskNoDates = { id: 't-4' };
      expect(isAllocationOutsideTaskWindow('2026-10-10', taskNoDates)).toBe(false);
      expect(isAllocationOutsideTaskWindow('2026-10-10', null)).toBe(false);
    });
  });
});
