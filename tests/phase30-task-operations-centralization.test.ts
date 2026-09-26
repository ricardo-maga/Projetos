import { describe, it, expect } from 'bun:test';
import {
  apiGetTask,
  apiCreateTask,
  apiUpdateTask,
  apiDeleteTask,
  validateTaskExecutionTimes,
  parseTaskHoursToFloat,
  parseTaskHours,
  checkTaskConflicts,
  getTaskConflictWarnings,
  TaskCreateInput,
  TaskUpdateInput
} from '../lib/taskOperations';
import { Task, User, Project } from '../types';

describe('FASE 30 — Centralização da Operação de Tarefas', () => {
  describe('1. Parsing e Normalização de Horas (parseTaskHoursToFloat / parseTaskHours)', () => {
    it('deve converter corretamente strings de horas decimais e inteiras', () => {
      expect(parseTaskHoursToFloat('4.5')).toBe(4.5);
      expect(parseTaskHoursToFloat('8')).toBe(8);
      expect(parseTaskHoursToFloat(6.25)).toBe(6.25);
    });

    it('deve converter formato de relógio HH:MM para float', () => {
      expect(parseTaskHoursToFloat('08:30')).toBe(8.5);
      expect(parseTaskHoursToFloat('01:15')).toBe(1.25);
      expect(parseTaskHoursToFloat('00:45')).toBe(0.75);
    });

    it('deve tratar valores nulos, vazios ou inválidos devolvendo 0', () => {
      expect(parseTaskHoursToFloat('')).toBe(0);
      expect(parseTaskHoursToFloat(undefined)).toBe(0);
      expect(parseTaskHoursToFloat(null)).toBe(0);
      expect(parseTaskHoursToFloat('invalid')).toBe(0);
    });

    it('o alias parseTaskHours deve funcionar de forma idêntica', () => {
      expect(parseTaskHours('04:30')).toBe(4.5);
      expect(parseTaskHours('3')).toBe(3);
    });
  });

  describe('2. Validação de Tempos de Execução (validateTaskExecutionTimes)', () => {
    it('deve validar datas coerentes sem erros', () => {
      const result = validateTaskExecutionTimes({
        startDate: '2026-05-10',
        startTime: '09:00',
        endDate: '2026-05-10',
        endTime: '17:00'
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('deve rejeitar quando a data de fim é anterior à data de início', () => {
      const result = validateTaskExecutionTimes({
        startDate: '2026-05-10',
        startTime: '09:00',
        endDate: '2026-05-09',
        endTime: '17:00'
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('anterior');
    });

    it('deve rejeitar quando a hora de fim é anterior à hora de início no mesmo dia', () => {
      const result = validateTaskExecutionTimes({
        startDate: '2026-05-10',
        startTime: '16:00',
        endDate: '2026-05-10',
        endTime: '09:00'
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('posterior');
    });
  });

  describe('3. Verificação de Conflitos e Avisos de Alocação', () => {
    const existingTasks: Task[] = [
      {
        id: 'task-1',
        title: 'Instalação Elétrica',
        description: 'Fase 1',
        projectId: 'proj-1',
        statusId: 'status-pending',
        estimatedDate: '2026-06-15',
        estimatedHours: 6,
        actualHours: 0,
        assigneeIds: ['user-10'],
        assignedTo: 'user-10',
        version: 1,
        createdDate: '2026-01-01',
        deleted: false
      }
    ];

    const users: User[] = [
      {
        id: 'user-10',
        name: 'Carlos Eletricista',
        email: 'carlos@empresa.pt',
        roleId: 'role-tec',
        type: 'user',
        isAdmin: false,
        isSuperAdmin: false,
        approved: true,
        deleted: false,
        createdDate: '2026-01-01'
      }
    ];

    const projects: Project[] = [
      {
        id: 'proj-1',
        title: 'Obra Central',
        clientId: 'client-1',
        categoryId: 'cat-1',
        statusId: 'status-act',
        priorityId: 'prio-high',
        riskId: 'risk-low',
        estimatedHours: 100,
        actualHours: 10,
        hourlyRate: 50,
        budgetValue: 5000,
        deleted: false,
        version: 1,
        createdDate: '2026-01-01'
      }
    ];

    it('deve detetar conflito quando utilizador já tem 6h alocadas no dia e nova tarefa adiciona mais 4h (ultrapassa 8h)', () => {
      const conflict = checkTaskConflicts(
        {
          date: '2026-06-15',
          hours: 4,
          assigneeIds: ['user-10']
        },
        existingTasks
      );
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.warnings.length).toBeGreaterThan(0);
      expect(conflict.warnings[0]).toContain('ultrapassa 8h');
    });

    it('não deve detetar conflito se o total de horas do utilizador no dia não ultrapassar 8h', () => {
      const conflict = checkTaskConflicts(
        {
          date: '2026-06-15',
          hours: 2,
          assigneeIds: ['user-10']
        },
        existingTasks
      );
      expect(conflict.hasConflict).toBe(false);
      expect(conflict.warnings.length).toBe(0);
    });

    it('deve ignorar a própria tarefa ao verificar conflitos durante edição', () => {
      const conflict = checkTaskConflicts(
        {
          taskId: 'task-1',
          date: '2026-06-15',
          hours: 7,
          assigneeIds: ['user-10']
        },
        existingTasks
      );
      expect(conflict.hasConflict).toBe(false);
    });

    it('getTaskConflictWarnings deve gerar mensagens formatadas legíveis', () => {
      const warnings = getTaskConflictWarnings({
        date: '2026-06-15',
        assigneeIds: ['user-10'],
        tasks: existingTasks,
        users,
        projects,
      });
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Carlos Eletricista');
      expect(warnings[0]).toContain('Instalação Elétrica');
      expect(warnings[0]).toContain('Obra Central');
    });
  });

  describe('4. FASE 30-A: Concorrência Otimista (OCC 409) — Sem Retry Automático', () => {
    it('deve devolver 409 e terminar imediatamente sem efetuar nova chamada GET ou PATCH adicional', async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      
      try {
        globalThis.fetch = (async (input: any, init?: any) => {
          callCount++;
          return {
            ok: false,
            status: 409,
            json: async () => ({
              success: false,
              message: 'Conflito de versão (versão desfasada).',
              error: { code: 'CONFLICT' }
            })
          } as any;
        }) as any;

        const result = await apiUpdateTask('task-123', {
          version: 2,
          title: 'Título Novo'
        });

        // Verificações estritas:
        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
        expect(result.isConflict).toBe(true);
        expect(result.error).toContain('Conflito');
        // Exatamente 1 chamada HTTP: sem GET intermediário e sem segundo PATCH
        expect(callCount).toBe(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('5. FASE 30-A: Normalização Server-Authoritative — Não Inventar Dados', () => {
    it('deve refletir fielmente a resposta do servidor sem criar createdDate sintético com new Date() quando createdAt está ausente', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              success: true,
              data: {
                id: 'task-999',
                projectId: 'proj-1',
                title: 'Tarefa Servidor',
                statusId: 'ts-1',
                estimatedHours: 5,
                actualHours: 0,
                assignedUserIds: ['u-1'],
                version: 1,
                // createdAt omitido intencionalmente
              }
            })
          } as any;
        }) as any;

        const result = await apiCreateTask({
          projectId: 'proj-1',
          title: 'Tarefa Servidor',
          estimatedHours: 5,
          assigneeIds: ['u-1']
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        // Não pode inventar uma data de hoje via new Date().toISOString()
        expect(result.data?.createdDate).toBe('');
        // Dados refletem a autoridade do servidor
        expect(result.data?.id).toBe('task-999');
        expect(result.data?.version).toBe(1);
        expect(result.data?.estimatedHours).toBe('5');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('apiUpdateTask não deve calcular versão artificial (updates.version + 1) e deve usar a versão autoritativa do servidor', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {
                id: 'task-999',
                projectId: 'proj-1',
                title: 'Tarefa Atualizada',
                statusId: 'ts-1',
                estimatedHours: 8,
                actualHours: 3,
                assignedUserIds: ['u-1', 'u-2'],
                version: 7,
                createdAt: '2026-03-01T10:00:00Z',
              }
            })
          } as any;
        }) as any;

        const result = await apiUpdateTask('task-999', {
          version: 2,
          title: 'Tarefa Atualizada'
        });

        expect(result.success).toBe(true);
        // A versão deve ser 7 (a que o servidor devolveu), não 3 (versão enviada + 1)
        expect(result.data?.version).toBe(7);
        expect(result.data?.createdDate).toBe('2026-03-01T10:00:00Z');
        expect(result.data?.assigneeIds).toEqual(['u-1', 'u-2']);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('não deve criar artificialmente version = 1 quando a API não devolve version', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {
                id: 'task-no-version',
                projectId: 'proj-1',
                title: 'Tarefa Sem Versão',
                statusId: 'ts-1',
                // version omitida intencionalmente
              }
            })
          } as any;
        }) as any;

        const result = await apiGetTask('task-no-version');

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        // Não deve inventar version = 1 se o servidor não forneceu version
        expect(result.data?.version).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
