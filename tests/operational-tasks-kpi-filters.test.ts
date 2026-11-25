import { describe, it, expect } from 'bun:test';
import {
  getOperationalTaskScale,
  getTaskFilterDates,
  matchesTaskDateFilter,
  type TaskDateFilter,
} from '../domains/tasks/modules/taskDateFilters';

describe('Filtros rápidos da lista de tarefas', () => {
  const dates = getTaskFilterDates(new Date(2026, 10, 25, 0, 15));
  const tasks = [
    { id: 'today', scale: 1, estimatedDate: '2026-11-25', startDate: '2026-11-24', endDate: '2026-11-24' },
    { id: 'tomorrow', scale: 2, estimatedDate: '2026-11-26', startDate: '2026-11-25' },
    { id: 'no-date', scale: 2, estimatedDate: '  ', startDate: '2026-11-25' },
    { id: 'monday', scale: 1, estimatedDate: '2026-11-23' },
    { id: 'completed-on-sunday', scale: 3, estimatedDate: '2026-11-29' },
    { id: 'completed-today', scale: 3, estimatedDate: '2026-11-25' },
    { id: 'recent-effective-date', scale: 3, estimatedDate: '2026-11-10', startDate: '2026-11-19', endDate: '2026-11-24' },
    { id: 'recent-planned-date', scale: 3, estimatedDate: '2026-11-19', startDate: '2026-11-18', endDate: '2026-11-19' },
    { id: 'older-completion', scale: 3, estimatedDate: '2026-11-18' },
    { id: 'undated-completion', scale: 3, estimatedDate: '' },
    { id: 'suspended', scale: 4, estimatedDate: '2026-11-23' },
    { id: 'unknown', scale: undefined, estimatedDate: '2026-11-25' },
    { id: 'old-plan', scale: 1, estimatedDate: '2026-11-22', startDate: '2026-11-25' },
  ];

  const expected: Record<TaskDateFilter, string[]> = {
    all: ['today', 'tomorrow', 'no-date', 'monday', 'old-plan'],
    no_date: ['no-date'],
    today: ['today'],
    tomorrow: ['tomorrow'],
    this_week: ['today', 'tomorrow', 'monday', 'completed-on-sunday', 'completed-today'],
    overdue: ['monday', 'old-plan'],
    completed_this_week: ['completed-today', 'recent-effective-date', 'recent-planned-date'],
    completed: ['completed-on-sunday', 'completed-today', 'recent-effective-date', 'recent-planned-date', 'older-completion', 'undated-completion'],
  };

  for (const filter of Object.keys(expected) as TaskDateFilter[]) {
    it(`aplica o filtro ${filter}`, () => {
      const taskIds = tasks.filter(task => matchesTaskDateFilter(task, task.scale, filter, dates)).map(task => task.id);
      expect(taskIds).toEqual(expected[filter]);
    });
  }

  it('calcula dias civis incluindo a transição de ano e a semana anterior no domingo', () => {
    expect(getTaskFilterDates(new Date(2027, 0, 3, 23, 55))).toEqual({
      today: '2027-01-03',
      tomorrow: '2027-01-04',
      weekStart: '2026-12-28',
      weekEnd: '2027-01-03',
      recentStart: '2026-12-28',
    });
  });

  it('usa níveis configurados e reconhece os estados legados', () => {
    const legacySuspended = '99999999-9999-9999-9999-999999999904';
    expect(getOperationalTaskScale(legacySuspended, [{ id: 'ts-4', scale: 2 }])).toBe(2);
    expect(getOperationalTaskScale(legacySuspended, [])).toBe(4);
    expect(getOperationalTaskScale('unknown', [])).toBeUndefined();
  });
});

describe('Pesquisa da lista de tarefas', () => {
  const mockUsers = [
    { id: 'u-1', name: 'Rui Silva' },
    { id: 'u-2', name: 'Ana Santos' },
  ];

  const mockProjects = [
    { id: 'p-1', title: 'Solar Industrial', installProjectNo: 'IP-2026-09' },
    { id: 'p-2', title: 'Doméstica', installProjectNo: '' },
  ];

  const mockTasks = [
    { id: 't-1', projectId: 'p-1', assigneeIds: ['u-1', 'u-2'] },
    { id: 't-2', projectId: 'p-1', assigneeIds: ['u-1'] },
    { id: 't-3', projectId: 'p-2', assigneeIds: ['u-1', 'u-2'] },
    { id: 't-4', projectId: 'p-2', assigneeIds: ['u-2'] },
  ];

  describe('Pesquisa avançada', () => {
    it('procura com sucesso por Nº de IP do projeto', () => {
      const q = 'ip-2026-09';
      const results = mockTasks.filter(t => {
        const proj = mockProjects.find(p => p.id === t.projectId);
        const projIp = proj?.installProjectNo ? proj.installProjectNo.toLowerCase() : '';
        return projIp.includes(q);
      });
      expect(results.length).toBe(2); // t-1, t-2 are linked to p-1 which has IP-2026-09
    });

    it('procura com sucesso por nome do técnico atribuído', () => {
      const q = 'ana santos';
      const results = mockTasks.filter(t => {
        const hasMatchingAssignee = t.assigneeIds.some(uid => {
          const uName = mockUsers.find(u => u.id === uid)?.name;
          return uName ? uName.toLowerCase().includes(q) : false;
        });
        return hasMatchingAssignee;
      });
      expect(results.length).toBe(3); // t-1, t-3, t-4 have u-2 (Ana Santos) assigned
    });
  });
});
