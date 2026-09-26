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
});
