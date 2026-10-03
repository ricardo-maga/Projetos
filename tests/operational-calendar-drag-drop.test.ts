import { describe, it, expect } from 'bun:test';
import { computeTaskDropUpdates } from '../lib/operationalCalendar';
import { Task } from '../lib/types';

describe('Calendário Operacional de Tarefas — Drag & Drop (Alteração Rápida de Dia e Utilizadores)', () => {
  const baseTask: Task = {
    id: 'task-100',
    projectId: 'proj-1',
    title: 'Instalação de Inversor',
    statusId: 'ts-1',
    assigneeIds: ['user-1'],
    estimatedDate: '2026-10-05',
    description: 'Instalação e configuração',
    estimatedHours: '04:00',
    actualHours: '00:00',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    notes: '',
    deleted: false,
    createdDate: '2026-10-01',
  };

  describe('1. Substituição de Utilizador (Single e Multi-Assignees)', () => {
    it('Caso 1: Tarefa com 1 utilizador associado altera para novo utilizador', () => {
      const task: Task = {
        ...baseTask,
        assigneeIds: ['user-1'],
      };

      const result = computeTaskDropUpdates(task, 'user-1', 'user-2', '2026-10-05');
      expect(result.hasChanges).toBe(true);
      expect(result.updates.assigneeIds).toEqual(['user-2']);
      expect(result.updates.estimatedDate).toBeUndefined(); // Data não mudou
    });

    it('Caso 2: Tarefa com múltiplos utilizadores substitui o utilizador de origem pelo novo, mantendo os restantes', () => {
      const task: Task = {
        ...baseTask,
        assigneeIds: ['user-1', 'user-2', 'user-3'],
      };

      // Arrastar a tarefa a partir da linha do user-2 para a linha do user-4
      const result = computeTaskDropUpdates(task, 'user-2', 'user-4', '2026-10-05');
      expect(result.hasChanges).toBe(true);
      expect(result.updates.assigneeIds).toEqual(['user-1', 'user-4', 'user-3']);
    });

    it('Caso 3: Tarefa com múltiplos utilizadores arrastada para utilizador que já pertencia à lista (deduplicação)', () => {
      const task: Task = {
        ...baseTask,
        assigneeIds: ['user-1', 'user-2', 'user-3'],
      };

      // Arrastar da linha do user-3 para a linha do user-1
      const result = computeTaskDropUpdates(task, 'user-3', 'user-1', '2026-10-05');
      expect(result.hasChanges).toBe(true);
      expect(result.updates.assigneeIds).toEqual(['user-1', 'user-2']);
    });

    it('Caso 4: Tarefa sem utilizadores associados ganha o utilizador de destino', () => {
      const task: Task = {
        ...baseTask,
        assigneeIds: [],
      };

      const result = computeTaskDropUpdates(task, '', 'user-5', '2026-10-05');
      expect(result.hasChanges).toBe(true);
      expect(result.updates.assigneeIds).toEqual(['user-5']);
    });
  });

  describe('2. Alteração Rápida de Dia', () => {
    it('Caso 5: Alteração apenas do dia dentro da mesma linha de utilizador', () => {
      const task: Task = {
        ...baseTask,
        assigneeIds: ['user-1', 'user-2'],
        estimatedDate: '2026-10-05',
      };

      // Arrastar do dia 2026-10-05 para 2026-10-08 na linha do user-1
      const result = computeTaskDropUpdates(task, 'user-1', 'user-1', '2026-10-08');
      expect(result.hasChanges).toBe(true);
      expect(result.updates.estimatedDate).toBe('2026-10-08');
      expect(result.updates.assigneeIds).toBeUndefined(); // Utilizadores mantêm-se intactos
    });

    it('Caso 6: Alteração de dia em tarefa com startDate e endDate preenchidas atualiza ambas as datas', () => {
      const task: Task = {
        ...baseTask,
        assigneeIds: ['user-1'],
        estimatedDate: '2026-10-05',
        startDate: '2026-10-05',
        endDate: '2026-10-05',
      };

      const result = computeTaskDropUpdates(task, 'user-1', 'user-1', '2026-10-09');
      expect(result.hasChanges).toBe(true);
      expect(result.updates.estimatedDate).toBe('2026-10-09');
      expect(result.updates.startDate).toBe('2026-10-09');
      expect(result.updates.endDate).toBe('2026-10-09');
    });
  });

  describe('3. Alteração Simultânea de Dia e Utilizador', () => {
    it('Caso 7: Arrastar entre dias diferentes E utilizadores diferentes substitui utilizador e atualiza data', () => {
      const task: Task = {
        ...baseTask,
        assigneeIds: ['user-A', 'user-B'],
        estimatedDate: '2026-10-05',
      };

      // Arrastar do user-A em 2026-10-05 para user-C em 2026-10-07
      const result = computeTaskDropUpdates(task, 'user-A', 'user-C', '2026-10-07');
      expect(result.hasChanges).toBe(true);
      expect(result.updates.assigneeIds).toEqual(['user-C', 'user-B']);
      expect(result.updates.estimatedDate).toBe('2026-10-07');
    });
  });

  describe('4. No-Op (Mesmo Dia e Mesmo Utilizador)', () => {
    it('Caso 8: Largar na mesma célula (mesmo dia e mesmo utilizador) não produz alterações', () => {
      const task: Task = {
        ...baseTask,
        assigneeIds: ['user-1', 'user-2'],
        estimatedDate: '2026-10-05',
      };

      const result = computeTaskDropUpdates(task, 'user-1', 'user-1', '2026-10-05');
      expect(result.hasChanges).toBe(false);
      expect(Object.keys(result.updates)).toHaveLength(0);
    });
  });
});
