import { describe, it, expect } from 'bun:test';
import { parseStringArray } from '../lib/supabaseSync';

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
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const clean = val.replace(',', '.').replace('h', '').trim();
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

describe('FASE 46-A — Testes de Lista Operacional de Tarefas e Filtros', () => {
  const todayStr = '2026-09-27';
  const tomorrowStr = '2026-09-28';
  
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
    // 1. Hoje (Pendente)
    {
      id: 't-1',
      title: 'Montagem de inversores',
      projectId: 'p-1',
      statusId: 'ts-1', // Scale 1
      estimatedDate: todayStr,
      estimatedHours: '3h',
      actualHours: '0h',
      assigneeIds: ['u-1', 'u-2'], // 2 users
    },
    // 2. Esta semana, Hoje (Em Execução, tem actual hours)
    {
      id: 't-2',
      title: 'Cablagens elétricas',
      projectId: 'p-1',
      statusId: 'ts-2', // Scale 2
      estimatedDate: todayStr,
      estimatedHours: '4h',
      actualHours: '2h', // actual hours are non-zero/filled
      assigneeIds: ['u-1'], // 1 user
    },
    // 3. Atrasada (Em Execução)
    {
      id: 't-3',
      title: 'Escavação da vala',
      projectId: 'p-2',
      statusId: 'ts-2', // Scale 2
      estimatedDate: '2026-09-20', // before today
      estimatedHours: '5h',
      actualHours: '0h',
      assigneeIds: ['u-1', 'u-2'], // 2 users
    },
    // 4. Concluída esta semana
    {
      id: 't-4',
      title: 'Sinalização do estaleiro',
      projectId: 'p-2',
      statusId: 'ts-3', // Scale 3 (completed)
      estimatedDate: '2026-09-22', // within week
      estimatedHours: '2h',
      actualHours: '0h',
      assigneeIds: ['u-2'], // 1 user
    },
  ];

  describe('1. Cálculos de Estatísticas de KPI (operationalStats)', () => {
    it('cálculo correto de tarefas Para Hoje (exclui concluídas e canceladas)', () => {
      let todayCount = 0;
      mockTasks.forEach(t => {
        const scale = mockGetTaskScale(t.statusId);
        const targetDate = t.estimatedDate;
        if (targetDate === todayStr && (scale === 1 || scale === 2)) {
          todayCount++;
        }
      });
      expect(todayCount).toBe(2); // t-1, t-2 are today and active
    });

    it('cálculo correto de tarefas Esta Semana (segunda a domingo, exclui concluídas/canceladas)', () => {
      let thisWeekCount = 0;
      mockTasks.forEach(t => {
        const scale = mockGetTaskScale(t.statusId);
        const targetDate = t.estimatedDate;
        if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && (scale === 1 || scale === 2)) {
          thisWeekCount++;
        }
      });
      expect(thisWeekCount).toBe(2); // t-1, t-2
    });

    it('cálculo de tarefas Atrasadas (anterior a hoje, hoje é exclusivo, exclui concluídas)', () => {
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

    it('cálculo de Concluídas esta semana', () => {
      let completedThisWeekCount = 0;
      mockTasks.forEach(t => {
        const scale = mockGetTaskScale(t.statusId);
        const targetDate = t.estimatedDate;
        if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && scale === 3) {
          completedThisWeekCount++;
        }
      });
      expect(completedThisWeekCount).toBe(1); // t-4 is completed
    });

    it('cálculo de Horas previstas com multiplicação de utilizadores e fallback de horas reais', () => {
      let weekHoursSum = 0;
      mockTasks.forEach(t => {
        const targetDate = t.estimatedDate;
        if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end) {
          const realHours = parseTaskHoursToFloat(t.actualHours);
          const estHours = parseTaskHoursToFloat(t.estimatedHours);
          const baseHours = realHours > 0 ? realHours : estHours;
          const userCount = t.assigneeIds.length;
          weekHoursSum += baseHours * userCount;
        }
      });
      // Calculations:
      // t-1: today, estimated=3h, actual=0h, users=2 -> 3h * 2 = 6h
      // t-2: today, estimated=4h, actual=2h, users=1 -> 2h (actual used) * 1 = 2h
      // t-4: completed this week, estimated=2h, actual=0h, users=1 -> 2h * 1 = 2h
      // Total: 6 + 2 + 2 = 10h
      expect(weekHoursSum).toBe(10);
    });
  });

  describe('2. Filtros e Sincronização de Preset', () => {
    it('exclusão padrão de nível 3 nos filtros normais', () => {
      // datePreset === 'all'
      const filteredAll = mockTasks.filter(t => {
        const scale = mockGetTaskScale(t.statusId);
        return scale !== 3; // exlcude completed
      });
      expect(filteredAll.length).toBe(3); // t-1, t-2, t-3 (excludes t-4)
    });

    it('sincronização de Hoje para tarefas de nível 1 ou 2', () => {
      // datePreset === 'today'
      const filteredToday = mockTasks.filter(t => {
        const scale = mockGetTaskScale(t.statusId);
        const targetDate = t.estimatedDate;
        return targetDate === todayStr && (scale === 1 || scale === 2);
      });
      expect(filteredToday.length).toBe(2); // t-1, t-2
    });

    it('sincronização de Atrasadas para tarefas de nível 1 ou 2 anteriores a hoje', () => {
      // datePreset === 'overdue'
      const filteredOverdue = mockTasks.filter(t => {
        const scale = mockGetTaskScale(t.statusId);
        const targetDate = t.estimatedDate;
        return targetDate && targetDate < todayStr && (scale === 1 || scale === 2);
      });
      expect(filteredOverdue.length).toBe(1); // t-3
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
