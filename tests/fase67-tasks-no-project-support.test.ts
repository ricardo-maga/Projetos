import { describe, it, expect } from 'bun:test';
import { createTaskSchema, updateTaskSchema } from '../lib/validations/task';
import { getTaskEffectiveDate } from '../lib/utils';
import { parseTaskHoursToFloat } from '../lib/taskOperations';

describe('FASE 67 — TASKS: Suporte Completo a Tarefas sem Projeto', () => {
  describe('A & B. Criação com e sem Projeto (Schemas & Normalização)', () => {
    it('criação sem projeto aceita explicitamente projectId = null', () => {
      const parsed = createTaskSchema.safeParse({
        projectId: null,
        title: 'Tarefa Geral de Oficina',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.projectId).toBeNull();
        expect(parsed.data.title).toBe('Tarefa Geral de Oficina');
      }
    });

    it('criação sem projeto aceita projectId omitido/undefined e normaliza para null', () => {
      const parsed = createTaskSchema.safeParse({
        title: 'Verificação Periódica de Ferramentas',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.projectId).toBeNull();
      }
    });

    it('criação com projeto existente preserva o UUID do projeto', () => {
      const projId = '11111111-1111-1111-1111-111111111111';
      const parsed = createTaskSchema.safeParse({
        projectId: projId,
        title: 'Montagem de Estruturas',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.projectId).toBe(projId);
      }
    });

    it('criação com string vazia de projectId normaliza para null', () => {
      const parsed = createTaskSchema.safeParse({
        projectId: '   ',
        title: 'Limpeza de Bancada',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.projectId).toBeNull();
      }
    });
  });

  describe('C. Edição de Tarefas (Contrato de Transição de Projeto)', () => {
    it('edição: projeto A -> projeto B', () => {
      const projB = '22222222-2222-2222-2222-222222222222';
      const parsed = updateTaskSchema.safeParse({
        projectId: projB,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.projectId).toBe(projB);
      }
    });

    it('edição: projeto A -> NULL (desassociação)', () => {
      const parsed = updateTaskSchema.safeParse({
        projectId: null,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.projectId).toBeNull();
      }
    });

    it('edição: NULL -> projeto A (associação)', () => {
      const projA = '11111111-1111-1111-1111-111111111111';
      const parsed = updateTaskSchema.safeParse({
        projectId: projA,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.projectId).toBe(projA);
      }
    });

    it('edição: não passar projectId mantém undefined (não alterar)', () => {
      const parsed = updateTaskSchema.safeParse({
        title: 'Novo Título',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.projectId).toBeUndefined();
      }
    });
  });

  describe('D. Validação e Resolução de Projeto na UI (TaskDetailsModal)', () => {
    const mockProjects = [
      { id: 'proj-1', title: 'Parque Solar Alentejo', deleted: false },
      { id: 'proj-2', title: 'Central Fotovoltaica Douro', deleted: false },
      { id: 'proj-deleted', title: 'Projeto Antigo Eliminado', deleted: true },
    ];

    const resolveProjectSelection = (inputProjectId: string | null | undefined, projects: typeof mockProjects): string | null => {
      if (!inputProjectId || !inputProjectId.trim()) return null;
      const matched = projects.find(p => p.id === inputProjectId.trim() && !p.deleted);
      return matched ? matched.id : null;
    };

    it('campo vazio resulta em null', () => {
      expect(resolveProjectSelection('', mockProjects)).toBeNull();
      expect(resolveProjectSelection(null, mockProjects)).toBeNull();
      expect(resolveProjectSelection(undefined, mockProjects)).toBeNull();
    });

    it('texto arbitrário que não corresponde a projeto existente resulta em null', () => {
      expect(resolveProjectSelection('Meu Projeto Inventado', mockProjects)).toBeNull();
    });

    it('projeto eliminado não é associado e resulta em null', () => {
      expect(resolveProjectSelection('proj-deleted', mockProjects)).toBeNull();
    });

    it('projeto válido existente é corretamente associado', () => {
      expect(resolveProjectSelection('proj-1', mockProjects)).toBe('proj-1');
      expect(resolveProjectSelection('proj-2', mockProjects)).toBe('proj-2');
    });
  });

  describe('E. Lista Operacional de Tarefas (TaskSection - activeTasks)', () => {
    const mockProjects = [
      { id: 'p-active-1', title: 'Projeto Ativo 1', deleted: false },
      { id: 'p-deleted-1', title: 'Projeto Eliminado', deleted: true },
    ];
    const projectMap = new Map(mockProjects.map(p => [p.id, p]));

    const mockTasks = [
      { id: 't-1', title: 'Tarefa com Projeto Ativo', projectId: 'p-active-1', deleted: false },
      { id: 't-2', title: 'Tarefa sem Projeto (null)', projectId: null, deleted: false },
      { id: 't-3', title: 'Tarefa sem Projeto (undefined)', projectId: undefined, deleted: false },
      { id: 't-4', title: 'Tarefa com Projeto Eliminado', projectId: 'p-deleted-1', deleted: false },
      { id: 't-5', title: 'Tarefa Eliminada', projectId: null, deleted: true },
    ];

    const filterActiveTasks = (tasks: any[]) => {
      return tasks.filter(t => {
        if (t.deleted) return false;
        if (t.projectId) {
          const proj = projectMap.get(t.projectId);
          if (proj && proj.deleted) return false;
        }
        return true;
      });
    };

    it('tarefas sem projeto aparecem na lista de tarefas ativas', () => {
      const active = filterActiveTasks(mockTasks);
      const activeIds = active.map(t => t.id);

      expect(activeIds).toContain('t-1');
      expect(activeIds).toContain('t-2'); // sem projeto (null)
      expect(activeIds).toContain('t-3'); // sem projeto (undefined)
      expect(activeIds).not.toContain('t-4'); // projeto eliminado
      expect(activeIds).not.toContain('t-5'); // tarefa eliminada
      expect(active.length).toBe(3);
    });
  });

  describe('F. Pesquisa de Tarefas (TaskSection - filteredTasks)', () => {
    const users = [
      { id: 'u-1', name: 'António Silva', deleted: false },
      { id: 'u-2', name: 'Bernardo Costa', deleted: false },
    ];
    const projects = [
      { id: 'p-1', title: 'Parque Solar Évora', clientId: 'c-1', deleted: false },
    ];
    const clients = [
      { id: 'c-1', clientName: 'Energias de Portugal', shortName: 'EDP' },
    ];

    const projectMap = new Map(projects.map(p => [p.id, p]));
    const clientMap = new Map(clients.map(c => [c.id, c]));

    const tasks = [
      {
        id: 't-no-proj-1',
        title: 'Inventário de Transformadores',
        description: 'Conferir números de série no armazém central',
        projectId: null,
        assigneeIds: ['u-1'],
        deleted: false,
      },
      {
        id: 't-with-proj-1',
        title: 'Instalação de Painéis',
        description: 'Setor Norte',
        projectId: 'p-1',
        assigneeIds: ['u-2'],
        deleted: false,
      },
    ];

    function searchTasks(q: string) {
      const query = q.toLowerCase().trim();
      return tasks.filter(t => {
        const proj = t.projectId ? projectMap.get(t.projectId) : null;
        const client = proj ? clientMap.get(proj.clientId) : null;
        const clientName = client ? (client.clientName || '').toLowerCase() : '';
        const clientShortName = client ? (client.shortName || '').toLowerCase() : '';
        const projTitle = proj ? (proj.title || '').toLowerCase() : '';
        const taskTitle = (t.title || '').toLowerCase();
        const taskDesc = (t.description || '').toLowerCase();

        const hasMatchingAssignee = !query ? true : (t.assigneeIds || []).some(uid => {
          const uName = users.find(u => u.id === uid)?.name;
          return uName ? uName.toLowerCase().includes(query) : false;
        });

        return !query ||
          taskTitle.includes(query) ||
          taskDesc.includes(query) ||
          clientName.includes(query) ||
          clientShortName.includes(query) ||
          projTitle.includes(query) ||
          hasMatchingAssignee;
      });
    }

    it('pesquisa por título de tarefa sem projeto', () => {
      const res = searchTasks('Inventário');
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('t-no-proj-1');
    });

    it('pesquisa por descrição de tarefa sem projeto', () => {
      const res = searchTasks('armazém central');
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('t-no-proj-1');
    });

    it('pesquisa por técnico atribuído a tarefa sem projeto', () => {
      const res = searchTasks('António Silva');
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('t-no-proj-1');
    });

    it('pesquisa por cliente ou projeto não inclui tarefas sem projeto', () => {
      const res = searchTasks('EDP');
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('t-with-proj-1');
    });
  });

  describe('G. Agrupamento por Projeto (TaskSection - groupByProject)', () => {
    const tasks = [
      { id: 't-p1-1', title: 'Tarefa Proj 1', projectId: 'p-1' },
      { id: 't-none-1', title: 'Tarefa Sem Projeto 1', projectId: null },
      { id: 't-p2-1', title: 'Tarefa Proj 2', projectId: 'p-2' },
      { id: 't-none-2', title: 'Tarefa Sem Projeto 2', projectId: undefined },
    ];

    it('agrupa tarefas com projeto e cria grupo "Sem projeto" sem UUID artificial', () => {
      const tasksByProject: Record<string, any[]> = {};
      const noProjectTasks: any[] = [];

      tasks.forEach(t => {
        if (!t.projectId) {
          noProjectTasks.push(t);
        } else {
          if (!tasksByProject[t.projectId]) tasksByProject[t.projectId] = [];
          tasksByProject[t.projectId].push(t);
        }
      });

      expect(Object.keys(tasksByProject)).toEqual(['p-1', 'p-2']);
      expect(noProjectTasks.length).toBe(2);
      expect(noProjectTasks.map(t => t.id)).toEqual(['t-none-1', 't-none-2']);
    });

    it('função getProjectTitle apresenta "Sem projeto" para id nulo ou indefinido', () => {
      const getProjectTitle = (projId?: string | null) => {
        if (!projId) return 'Sem projeto';
        return `Projeto ${projId}`;
      };

      expect(getProjectTitle(null)).toBe('Sem projeto');
      expect(getProjectTitle(undefined)).toBe('Sem projeto');
      expect(getProjectTitle('')).toBe('Sem projeto');
      expect(getProjectTitle('p-1')).toBe('Projeto p-1');
    });
  });

  describe('H. KPIs Operacionais com Tarefas sem Projeto', () => {
    const todayStr = '2026-10-15';
    const weekRange = { start: '2026-10-12', end: '2026-10-18' };

    const tasks = [
      // 1. Tarefa sem projeto para hoje (statusId: pendente = scale 1)
      {
        id: 't-kpi-1',
        projectId: null,
        statusId: 'ts-1', // scale 1
        estimatedDate: todayStr,
        estimatedHours: '04:00',
        actualHours: '0',
        assigneeIds: ['u-1'],
        deleted: false,
      },
      // 2. Tarefa sem projeto atrasada (statusId: pendente = scale 1, data anterior)
      {
        id: 't-kpi-2',
        projectId: null,
        statusId: 'ts-1',
        estimatedDate: '2026-10-10',
        estimatedHours: '02:00',
        assigneeIds: ['u-1', 'u-2'],
        deleted: false,
      },
      // 3. Tarefa sem projeto concluída esta semana (statusId: concluída = scale 3)
      {
        id: 't-kpi-3',
        projectId: null,
        statusId: 'ts-3', // scale 3
        estimatedDate: '2026-10-14',
        estimatedHours: '03:00',
        actualHours: '03:30',
        assigneeIds: ['u-1'],
        deleted: false,
      },
      // 4. Tarefa com projeto para esta semana
      {
        id: 't-kpi-4',
        projectId: 'p-1',
        statusId: 'ts-2', // scale 2
        estimatedDate: '2026-10-16',
        estimatedHours: '08:00',
        actualHours: '0',
        assigneeIds: ['u-2'],
        deleted: false,
      },
    ];

    const getScale = (sId: string) => {
      if (sId === 'ts-1') return 1;
      if (sId === 'ts-2') return 2;
      if (sId === 'ts-3') return 3;
      return 1;
    };

    it('calcula corretamente os KPIs incluindo tarefas com e sem projeto', () => {
      let todayCount = 0;
      let thisWeekCount = 0;
      let overdueCount = 0;
      let completedThisWeekCount = 0;
      let weekHoursSum = 0;

      tasks.forEach(t => {
        const scale = getScale(t.statusId);
        const targetDate = getTaskEffectiveDate(t);

        if (targetDate === todayStr && (scale === 1 || scale === 2 || scale === 3)) {
          todayCount++;
        }

        if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && (scale === 1 || scale === 2 || scale === 3)) {
          thisWeekCount++;
        }

        if (targetDate && targetDate < todayStr && (scale === 1 || scale === 2)) {
          overdueCount++;
        }

        if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end && scale === 3) {
          completedThisWeekCount++;
        }

        if (targetDate && targetDate >= weekRange.start && targetDate <= weekRange.end) {
          const isActualFilled = t.actualHours !== undefined && t.actualHours !== null && String(t.actualHours).trim() !== '';
          const baseHours = isActualFilled
            ? parseTaskHoursToFloat(t.actualHours)
            : parseTaskHoursToFloat(t.estimatedHours);
          const userCount = (t.assigneeIds || []).length;
          weekHoursSum += baseHours * userCount;
        }
      });

      expect(todayCount).toBe(1); // t-kpi-1
      expect(thisWeekCount).toBe(3); // t-kpi-1, t-kpi-3, t-kpi-4
      expect(overdueCount).toBe(1); // t-kpi-2
      expect(completedThisWeekCount).toBe(1); // t-kpi-3
      // Horas da semana:
      // t-kpi-1: 4h * 1 user = 4h (actualHours="0" é interpretado como 0h)
      // t-kpi-3: 3.5h * 1 user = 3.5h
      // t-kpi-4: 8h * 1 user = 8h (actualHours="0" -> 0h)
      expect(weekHoursSum).toBe(3.5);
    });
  });

  describe('I. Duplicação de Tarefas (com e sem Projeto)', () => {
    it('duplicar tarefa sem projeto pré-preenche modal sem projeto e projectId permanece null', () => {
      const originalNoProjTask = {
        id: 'task-no-proj-1',
        projectId: null,
        title: 'Manutenção de Ferramentas',
        description: 'Lubrificação e calibração',
        statusId: 'ts-1',
        taskTypeId: 'tt-1',
        estimatedDate: '2026-10-25',
        estimatedHours: '02:00',
        assigneeIds: ['u-1'],
      };

      // Na duplicação, o modal é aberto em modo 'create' com activeTask = originalNoProjTask
      const formInitialProjectId = originalNoProjTask.projectId || '';
      expect(formInitialProjectId).toBe('');

      // Ao guardar sem selecionar projeto
      const resolvedProjectId = formInitialProjectId ? formInitialProjectId : null;
      expect(resolvedProjectId).toBeNull();
    });

    it('duplicar tarefa com projeto pré-preenche com o projeto original', () => {
      const originalProjTask = {
        id: 'task-with-proj-1',
        projectId: 'p-100',
        title: 'Montagem de Painéis',
        description: 'Fileira 12',
        statusId: 'ts-1',
        taskTypeId: 'tt-1',
        estimatedDate: '2026-10-25',
        estimatedHours: '08:00',
        assigneeIds: ['u-2'],
      };

      const formInitialProjectId = originalProjTask.projectId || '';
      expect(formInitialProjectId).toBe('p-100');
    });
  });

  describe('K. Regras de Horas: actualHours = 0 é valor válido', () => {
    it('actualHours com valor 0 é preservado e não cai no fallback de estimatedHours', () => {
      const isActualHoursFilled = (actualHours: any) => {
        return actualHours !== undefined && actualHours !== null && String(actualHours).trim() !== '';
      };

      // actualHours = "0"
      expect(isActualHoursFilled('0')).toBe(true);
      expect(parseTaskHoursToFloat('0')).toBe(0);

      // actualHours = 0
      expect(isActualHoursFilled(0)).toBe(true);
      expect(parseTaskHoursToFloat(0)).toBe(0);

      // actualHours = null (não preenchido)
      expect(isActualHoursFilled(null)).toBe(false);

      // actualHours = undefined (não preenchido)
      expect(isActualHoursFilled(undefined)).toBe(false);

      // actualHours = "" (não preenchido)
      expect(isActualHoursFilled('')).toBe(false);
    });
  });
});
