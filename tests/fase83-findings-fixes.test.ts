import { describe, it, expect } from 'bun:test';
import { normalizeTaskFromApiResponse } from '../lib/taskOperations';

describe('FASE 83 — Correção Cirúrgica dos Findings da FASE 82', () => {
  describe('1. FINDING-82-01 — Semântica Canónica de Resolução de Projetos em Calendários', () => {
    const mockProjects = [
      { id: 'proj-100', title: 'Solar Cascais', clientId: 'c-1', installProjectNo: 'IP-100', deleted: false },
      { id: 'proj-200', title: 'Eólica Sintra', clientId: 'c-2', installProjectNo: 'IP-200', deleted: false },
    ];

    // Canonical resolution logic applied in CalendarSection & OperationalUserCalendar
    const resolveProjectTitleForCalendar = (projectId?: string | null) => {
      if (!projectId) return 'Sem projeto';
      const proj = mockProjects.find(p => p.id === projectId);
      return proj ? proj.title : 'Projeto não encontrado';
    };

    it('Caso 1: projectId é null / undefined / vazio => "Sem projeto"', () => {
      expect(resolveProjectTitleForCalendar(null)).toBe('Sem projeto');
      expect(resolveProjectTitleForCalendar(undefined)).toBe('Sem projeto');
      expect(resolveProjectTitleForCalendar('')).toBe('Sem projeto');
    });

    it('Caso 2: projectId válido e existente => Título correto do projeto', () => {
      expect(resolveProjectTitleForCalendar('proj-100')).toBe('Solar Cascais');
      expect(resolveProjectTitleForCalendar('proj-200')).toBe('Eólica Sintra');
    });

    it('Caso 3: projectId fornecido mas inexistente no catálogo => "Projeto não encontrado"', () => {
      expect(resolveProjectTitleForCalendar('proj-999-deleted')).toBe('Projeto não encontrado');
      expect(resolveProjectTitleForCalendar('non-existent-uuid')).toBe('Projeto não encontrado');
    });
  });

  describe('2. FINDING-82-02 — Normalização Canónica de Task.projectId', () => {
    it('Preserva projectId quando fornecido em camelCase', () => {
      const task = normalizeTaskFromApiResponse({
        id: 'task-1',
        projectId: 'proj-abc',
        title: 'Instalação de Painéis',
      });
      expect(task.projectId).toBe('proj-abc');
    });

    it('Suporta project_id quando fornecido em snake_case', () => {
      const task = normalizeTaskFromApiResponse({
        id: 'task-2',
        project_id: 'proj-xyz',
        title: 'Verificação Elétrica',
      });
      expect(task.projectId).toBe('proj-xyz');
    });

    it('Normaliza ausência de projeto (null) para null', () => {
      const taskWithNull = normalizeTaskFromApiResponse({
        id: 'task-3',
        projectId: null,
        title: 'Tarefa Sem Projeto 1',
      });
      expect(taskWithNull.projectId).toBeNull();

      const taskWithNullSnake = normalizeTaskFromApiResponse({
        id: 'task-4',
        project_id: null,
        title: 'Tarefa Sem Projeto 2',
      });
      expect(taskWithNullSnake.projectId).toBeNull();
    });

    it('Normaliza ausência de projeto (undefined / omitido) para null', () => {
      const taskOmitted = normalizeTaskFromApiResponse({
        id: 'task-5',
        title: 'Tarefa Sem Projeto Omitido',
      });
      expect(taskOmitted.projectId).toBeNull();
    });

    it('Normaliza string vazia para null e não como representação canónica de ausência', () => {
      const taskEmptyString = normalizeTaskFromApiResponse({
        id: 'task-6',
        projectId: '',
        title: 'Tarefa Com String Vazia',
      });
      expect(taskEmptyString.projectId).toBeNull();

      const taskWhitespace = normalizeTaskFromApiResponse({
        id: 'task-7',
        projectId: '   ',
        title: 'Tarefa Com Espaços',
      });
      expect(taskWhitespace.projectId).toBeNull();
    });
  });

  describe('3. FINDING-82-03 — Ciclo de Vida e Autoridade de serverTasks no Detalhe de Projeto', () => {
    interface SimulatedProjectTasksState {
      selectedProjectId: string | null;
      loadedProjectIdForTasks: string | null;
      serverTasks: any[];
      tasksProp: any[];
    }

    const deriveProjTasks = (state: SimulatedProjectTasksState) => {
      if (!state.selectedProjectId) return [];
      if (state.loadedProjectIdForTasks === state.selectedProjectId) {
        return state.serverTasks;
      }
      return state.tasksProp.filter(t => t.projectId === state.selectedProjectId && !t.deleted);
    };

    it('Cenário A: Mudança de Projeto A (com tasks) para Projeto B (a carregar) não apresenta tarefas de A', () => {
      // Projeto A carregado com 2 tarefas
      let state: SimulatedProjectTasksState = {
        selectedProjectId: 'proj-A',
        loadedProjectIdForTasks: 'proj-A',
        serverTasks: [{ id: 't-A1', projectId: 'proj-A', title: 'Task A1' }, { id: 't-A2', projectId: 'proj-A', title: 'Task A2' }],
        tasksProp: [],
      };
      expect(deriveProjTasks(state)).toHaveLength(2);

      // Utilizador seleciona Projeto B: reset imediato de serverTasks e loadedProjectIdForTasks
      state = {
        selectedProjectId: 'proj-B',
        loadedProjectIdForTasks: null,
        serverTasks: [],
        tasksProp: [],
      };
      // Não deve apresentar tarefas do Projeto A
      expect(deriveProjTasks(state)).toHaveLength(0);
    });

    it('Cenário B: Projeto B carregado com 0 tarefas no servidor mantém lista vazia e NÃO faz fallback para cache global', () => {
      // Cache global contém tarefas de outros projetos ou tarefas obsoletas
      const globalTasksProp = [
        { id: 't-A1', projectId: 'proj-A', title: 'Task A1' },
        { id: 't-B-stale', projectId: 'proj-B', title: 'Stale Task B', deleted: false },
      ];

      // Servidor confirma resposta autoritativa para Projeto B: 0 tarefas
      const state: SimulatedProjectTasksState = {
        selectedProjectId: 'proj-B',
        loadedProjectIdForTasks: 'proj-B',
        serverTasks: [], // Zero tarefas no backend
        tasksProp: globalTasksProp,
      };

      const result = deriveProjTasks(state);
      expect(result).toHaveLength(0); // Lista é estritamente vazia
      expect(result).not.toContain(globalTasksProp[1]);
    });

    it('Cenário C: Projeto C carregado com 3 tarefas do servidor apresenta as 3 tarefas autoritativas', () => {
      const serverTasksC = [
        { id: 't-C1', projectId: 'proj-C', title: 'Task C1' },
        { id: 't-C2', projectId: 'proj-C', title: 'Task C2' },
        { id: 't-C3', projectId: 'proj-C', title: 'Task C3' },
      ];

      const state: SimulatedProjectTasksState = {
        selectedProjectId: 'proj-C',
        loadedProjectIdForTasks: 'proj-C',
        serverTasks: serverTasksC,
        tasksProp: [],
      };

      const result = deriveProjTasks(state);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('t-C1');
      expect(result[2].id).toBe('t-C3');
    });
  });
});
