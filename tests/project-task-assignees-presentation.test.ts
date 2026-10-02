import { describe, it, expect } from 'bun:test';
import { normalizeTaskFromApiResponse } from '../lib/taskOperations';
import { Task } from '../lib/types';

describe('Project View — Tarefas & Atribuição de Utilizadores', () => {
  describe('1. Normalização de Tarefas da API para Apresentação em Projeto Individual', () => {
    it('mapeia assignedUserIds retornado pelo endpoint /api/v1/tasks para assigneeIds do modelo Task', () => {
      const serverDto = {
        id: 't-123',
        projectId: 'p-456',
        title: 'Montagem de Equipamento',
        description: 'Descrição de teste',
        statusId: 'ts-1',
        taskTypeId: 'tt-1',
        estimatedHours: 8,
        actualHours: 0,
        assignedUserIds: ['u-user-1', 'u-user-2'],
        version: 2,
        deleted: false,
      };

      const task: Task = normalizeTaskFromApiResponse(serverDto);
      expect(task.id).toBe('t-123');
      expect(task.projectId).toBe('p-456');
      expect(task.assigneeIds).toEqual(['u-user-1', 'u-user-2']);
      expect(Array.isArray(task.assigneeIds)).toBe(true);
      expect(task.assigneeIds.length).toBe(2);
    });

    it('mantém assigneeIds caso a resposta já traga o formato direto', () => {
      const serverDto = {
        id: 't-789',
        projectId: 'p-456',
        title: 'Verificação Elétrica',
        statusId: 'ts-1',
        assigneeIds: ['u-user-3'],
        version: 1,
        deleted: false,
      };

      const task: Task = normalizeTaskFromApiResponse(serverDto);
      expect(task.assigneeIds).toEqual(['u-user-3']);
    });

    it('retorna array vazio quando a tarefa não possui responsáveis atribuídos', () => {
      const serverDto = {
        id: 't-999',
        projectId: 'p-456',
        title: 'Tarefa Sem Atribuição',
        statusId: 'ts-1',
        assignedUserIds: [],
        version: 1,
        deleted: false,
      };

      const task: Task = normalizeTaskFromApiResponse(serverDto);
      expect(task.assigneeIds).toEqual([]);
    });
  });

  describe('2. Resolução de Utilizadores e Apresentação no Cartão da Tarefa', () => {
    const mockUsers = [
      { id: 'u-1', name: 'Ana Silva', email: 'ana@example.com', deleted: false },
      { id: 'u-2', name: 'Carlos Ramos', email: 'carlos@example.com', deleted: false },
    ];

    const getUserName = (id: string) => mockUsers.find(u => u.id === id)?.name || 'Equipa';

    it('resolve nomes de utilizadores a partir de assigneeIds para apresentação no cartão', () => {
      const task = normalizeTaskFromApiResponse({
        id: 't-1',
        projectId: 'p-1',
        title: 'Instalação Solar',
        statusId: 'ts-1',
        assignedUserIds: ['u-1', 'u-2'],
      });

      const userNames = task.assigneeIds.map(uid => getUserName(uid));
      expect(userNames).toEqual(['Ana Silva', 'Carlos Ramos']);
    });

    it('apresenta fallback apropriado quando utilizador não tem responsável associado', () => {
      const task = normalizeTaskFromApiResponse({
        id: 't-2',
        projectId: 'p-1',
        title: 'Instalação Sem Equipa',
        statusId: 'ts-1',
        assignedUserIds: [],
      });

      const hasAssignees = task.assigneeIds && task.assigneeIds.length > 0;
      expect(hasAssignees).toBe(false);
    });
  });

  describe('3. Preservação de Atribuição no Modal e Re-gravação', () => {
    it('extrai corretamente utilizadores mesmo se o objeto tiver apenas assignedUserIds', () => {
      const getEffectiveAssignees = (t: any): string[] => {
        if (!t) return [];
        if (Array.isArray(t.assigneeIds) && t.assigneeIds.length > 0) return t.assigneeIds;
        if (Array.isArray(t.assignedUserIds) && t.assignedUserIds.length > 0) return t.assignedUserIds;
        return Array.isArray(t.assigneeIds) ? t.assigneeIds : [];
      };

      const rawTaskFromApi = {
        id: 't-api',
        title: 'API Task',
        assignedUserIds: ['u-1'],
      };

      expect(getEffectiveAssignees(rawTaskFromApi)).toEqual(['u-1']);

      const normalizedTask = {
        id: 't-norm',
        title: 'Norm Task',
        assigneeIds: ['u-2'],
      };

      expect(getEffectiveAssignees(normalizedTask)).toEqual(['u-2']);
    });
  });
});
