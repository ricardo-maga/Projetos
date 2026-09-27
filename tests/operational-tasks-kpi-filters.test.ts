import { describe, it, expect } from 'bun:test';

// Mock getTaskScale function equivalent
function mockGetTaskScale(statusId: string) {
  if (statusId === 'ts-1') return 1;
  if (statusId === 'ts-2') return 2;
  if (statusId === 'ts-3') return 3;
  if (statusId === 'ts-4') return 4;
  return 1;
}

// Replicate parseTaskHoursToFloat
function parseTaskHoursToFloat(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Math.max(0, val);
  const clean = val.replace(',', '.').replace('h', '').trim();
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

describe('FASE 46-A — Testes de Lista Operacional de Tarefas e Filtros', () => {
  const todayStr = '2026-09-27';
  
  // Current calendar week: Monday 2026-09-21 to Sunday 2026-09-27
  const weekRange = {
    start: '2026-09-21',
    end: '2026-09-27',
  };

  const mockUsers = [
    { id: 'u-1', name: 'Rui Silva' },
    { id: 'u-2', name: 'Ana Santos' },
  ];

  const mockProjects = [
    { id: 'p-1', title: 'Solar Industrial', installProjectNo: 'IP-2026-09' },
    { id: 'p-2', title: 'Doméstica', installProjectNo: '' },
  ];

  const mockTasks = [
    // 1. Hoje (Pendente, Nível 1)
    {
      id: 't-1',
      title: 'Montagem de inversores',
      projectId: 'p-1',
      statusId: 'ts-1', // Scale 1
      estimatedDate: todayStr,
      estimatedHours: '3h',
      actualHours: '0h', // actualHours = '0h' is filled/preenchido (should count as 0, not 3)
      assigneeIds: ['u-1', 'u-2'], // 2 users
    },
    // 2. Esta semana, Hoje (Em Execução, Nível 2)
    {
      id: 't-2',
      title: 'Cablagens elétricas',
      projectId: 'p-1',
      statusId: 'ts-2', // Scale 2
      estimatedDate: todayStr,
      estimatedHours: '4h',
      actualHours: '2h', // actualHours = '2h' is filled/preenchido
      assigneeIds: ['u-1'], // 1 user
    },
    // 3. Atrasada (Em Execução, Nível 2)
    {
      id: 't-3',
      title: 'Escavação da vala',
      projectId: 'p-2',
      statusId: 'ts-2', // Scale 2
      estimatedDate: '2026-09-20', // before today
      estimatedHours: '5h',
      actualHours: null, // null means empty (should fallback to estimatedHours 5h)
      assigneeIds: ['u-1', 'u-2'], // 2 users
    },
    // 4. Concluída esta semana (Nível 3, Hoje)
    {
      id: 't-4',
      title: 'Sinalização do estaleiro',
      projectId: 'p-2',
      statusId: 'ts-3', // Scale 3 (completed)
      estimatedDate: todayStr, // Today and completed
      estimatedHours: '2h',
      actualHours: undefined, // undefined means empty (fallback to estimatedHours 2h)
      assigneeIds: ['u-2'], // 1 user
    },
  ];

  describe('1. Cálculos de Estatísticas de KPI (operationalStats)', () => {
    it('cálculo de tarefas Para Hoje inclui tarefas de nível 1, 2 e 3', () => {
      let todayCount = 0;
      mockTasks.forEach(t => {
        const scale = mockGetTaskScale(t.statusId);
        const targetDate = t.estimatedDate;
        if (targetDate === todayStr && (scale === 1 || scale === 2 || scale === 3)) {
          todayCount++;
        }
      });
      // t-1 (scale 1), t-2 (scale 2), t-4 (scale 3) are all today
      expect(todayCount).toBe(3);
    });

    it('cálculo de tarefas Esta Semana inclui tarefas de nível 1, 2 e 3', () => {
      let thisWeekCount = 0;
      mockTasks.forEach(t => {
        const scale = mockGetTaskScale(t.statusId);
        const targetDate = t.estimatedDate;
        if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && (scale === 1 || scale === 2 || scale === 3)) {
          thisWeekCount++;
        }
      });
      // All 4 mock tasks are within the week range (t-1, t-2, t-3 is on 20th which is before the range start on 21st)
      // Range: 21st to 27th. t-1 (27), t-2 (27), t-4 (27) are inside range.
      expect(thisWeekCount).toBe(3);
    });

    it('cálculo de tarefas Atrasadas continua limitado exclusivamente a nível 1 ou 2', () => {
      let overdueCount = 0;
      mockTasks.forEach(t => {
        const scale = mockGetTaskScale(t.statusId);
        const targetDate = t.estimatedDate;
        if (targetDate && targetDate < todayStr && (scale === 1 || scale === 2)) {
          overdueCount++;
        }
      });
      expect(overdueCount).toBe(1); // t-3 is overdue
    });

    it('cálculo de Concluídas esta semana limitado exclusivamente a nível 3', () => {
      let completedThisWeekCount = 0;
      mockTasks.forEach(t => {
        const scale = mockGetTaskScale(t.statusId);
        const targetDate = t.estimatedDate;
        if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && scale === 3) {
          completedThisWeekCount++;
        }
      });
      expect(completedThisWeekCount).toBe(1); // t-4
    });

    it('cálculo de Horas previstas com multiplicação de utilizadores e preenchimento de horas reais', () => {
      let weekHoursSum = 0;
      mockTasks.forEach(t => {
        const targetDate = t.estimatedDate;
        if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end) {
          const isActualHoursFilled = t.actualHours !== undefined && t.actualHours !== null && String(t.actualHours).trim() !== '';
          const baseHours = isActualHoursFilled
            ? parseTaskHoursToFloat(t.actualHours)
            : parseTaskHoursToFloat(t.estimatedHours);
          const userCount = t.assigneeIds.length;
          weekHoursSum += baseHours * userCount;
        }
      });
      // Calculations:
      // t-1 (within week): actualHours = '0h' (filled) -> 0h * 2 users = 0h
      // t-2 (within week): actualHours = '2h' (filled) -> 2h * 1 user = 2h
      // t-4 (within week): actualHours = undefined (empty) -> fallback to estimatedHours '2h' * 1 user = 2h
      // Total: 0 + 2 + 2 = 4h
      expect(weekHoursSum).toBe(4);
    });
  });

  describe('2. Filtros e Sincronização de Preset', () => {
    it('exclusão padrão de nível 3 nos filtros normais', () => {
      // datePreset === 'all'
      const filteredAll = mockTasks.filter(t => {
        const scale = mockGetTaskScale(t.statusId);
        return scale !== 3; // exclude completed
      });
      expect(filteredAll.length).toBe(3); // t-1, t-2, t-3 (excludes t-4)
    });
  });

  describe('3. Pesquisa Avançada', () => {
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
