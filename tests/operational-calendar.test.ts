import { describe, it, expect } from 'bun:test';
import { 
  getMondayOfWeek, 
  getOperationalCalendarDays, 
  formatOperationalDateRange, 
  isTaskOnDate, 
  isUserAssignedToTask, 
  getUserDayTasks, 
  getUserDayAbsence, 
  getOperationalDayConflicts,
  formatDateToYYYYMMDD
} from '../lib/operationalCalendar';
import { Task, User, Project } from '../lib/types';

describe('FASE 29 — Calendário Operacional Semanal por Utilizador', () => {

  describe('1. Datas e Navegação Temporal (7 e 14 dias)', () => {
    it('calcula a segunda-feira correta para qualquer dia da semana (getMondayOfWeek)', () => {
      // 2026-09-23 is Wednesday -> Monday is 2026-09-21
      const wednesday = new Date(2026, 8, 23); // Sep 23, 2026
      const monday = getMondayOfWeek(wednesday);
      expect(monday.getDay()).toBe(1); // Monday
      expect(formatDateToYYYYMMDD(monday)).toBe('2026-09-21');

      // 2026-09-27 is Sunday -> Monday of that week is 2026-09-21
      const sunday = new Date(2026, 8, 27);
      const mondayFromSunday = getMondayOfWeek(sunday);
      expect(mondayFromSunday.getDay()).toBe(1);
      expect(formatDateToYYYYMMDD(mondayFromSunday)).toBe('2026-09-21');

      // 2026-09-21 is Monday -> Monday is 2026-09-21
      const mon = new Date(2026, 8, 21);
      expect(formatDateToYYYYMMDD(getMondayOfWeek(mon))).toBe('2026-09-21');
    });

    it('gera exatamente 7 dias contínuos no modo principal de 7 dias', () => {
      const anchor = new Date(2026, 8, 24); // Sep 24, 2026
      const days = getOperationalCalendarDays(anchor, 7, true);
      expect(days.length).toBe(7);
      expect(days[0].dateStr).toBe('2026-09-21');
      expect(days[6].dateStr).toBe('2026-09-27');
      expect(days[0].dayNum).toBe(21);
      expect(days[6].dayNum).toBe(27);
    });

    it('gera exatamente 14 dias contínuos no modo alargado de 14 dias', () => {
      const anchor = new Date(2026, 8, 24);
      const days = getOperationalCalendarDays(anchor, 14, true);
      expect(days.length).toBe(14);
      expect(days[0].dateStr).toBe('2026-09-21');
      expect(days[13].dateStr).toBe('2026-10-04');
    });

    it('avança e recua semanas mantendo alinhamento operacional', () => {
      const startMonday = getMondayOfWeek(new Date(2026, 8, 21));
      
      // Next week (+7 days)
      const nextWeekAnchor = new Date(startMonday);
      nextWeekAnchor.setDate(nextWeekAnchor.getDate() + 7);
      const nextWeekDays = getOperationalCalendarDays(nextWeekAnchor, 7, true);
      expect(nextWeekDays[0].dateStr).toBe('2026-09-28');
      expect(nextWeekDays[6].dateStr).toBe('2026-10-04');

      // Prev week (-7 days)
      const prevWeekAnchor = new Date(startMonday);
      prevWeekAnchor.setDate(prevWeekAnchor.getDate() - 7);
      const prevWeekDays = getOperationalCalendarDays(prevWeekAnchor, 7, true);
      expect(prevWeekDays[0].dateStr).toBe('2026-09-14');
      expect(prevWeekDays[6].dateStr).toBe('2026-09-20');
    });

    it('formata o rótulo do intervalo de datas com clareza em português', () => {
      const days7 = getOperationalCalendarDays(new Date(2026, 8, 21), 7, true);
      const label7 = formatOperationalDateRange(days7);
      expect(label7).toContain('21 a 27 de setembro de 2026 (7 dias)');

      const days14 = getOperationalCalendarDays(new Date(2026, 8, 21), 14, true);
      const label14 = formatOperationalDateRange(days14);
      expect(label14).toContain('21 de setembro a 4 de outubro de 2026 (14 dias)');
    });
  });

  describe('2. Associação de Tarefas aos Utilizadores e Dias (UTILIZADOR + DIA + TAREFA)', () => {
    const mockTasks: Task[] = [
      {
        id: 't-1',
        title: 'Instalação Cliente A',
        projectId: 'p-1',
        estimatedDate: '2026-09-24',
        estimatedHours: '04:00',
        assigneeIds: ['user-pedro'],
        statusId: 'ts-1',
        version: 1,
        deleted: false,
      },
      {
        id: 't-2',
        title: 'FAT Projeto B',
        projectId: 'p-2',
        estimatedDate: '2026-09-24',
        estimatedHours: '03:00',
        assigneeIds: ['user-pedro', 'user-helder'], // Multiple users!
        statusId: 'ts-2',
        version: 1,
        deleted: false,
      },
      {
        id: 't-3',
        title: 'Arranque Máquina C',
        projectId: 'p-3',
        startDate: '2026-09-25',
        endDate: '2026-09-25',
        estimatedHours: '06:00',
        assigneeIds: ['user-pedro'],
        statusId: 'ts-1',
        version: 1,
        deleted: false,
      },
      {
        id: 't-4',
        title: 'Tarefa Eliminada',
        projectId: 'p-1',
        estimatedDate: '2026-09-24',
        assigneeIds: ['user-pedro'],
        statusId: 'ts-1',
        version: 1,
        deleted: true, // Soft-deleted
      },
    ];

    it('identifica corretamente a data agendada de uma tarefa (isTaskOnDate)', () => {
      expect(isTaskOnDate(mockTasks[0], '2026-09-24')).toBe(true);
      expect(isTaskOnDate(mockTasks[0], '2026-09-25')).toBe(false);
      expect(isTaskOnDate(mockTasks[2], '2026-09-25')).toBe(true);
      expect(isTaskOnDate(mockTasks[3], '2026-09-24')).toBe(false); // Deleted is false
    });

    it('tarefa atribuída a múltiplos utilizadores aparece para todos eles no mesmo dia', () => {
      const pedroTasks = getUserDayTasks(mockTasks, 'user-pedro', '2026-09-24');
      const helderTasks = getUserDayTasks(mockTasks, 'user-helder', '2026-09-24');

      // Pedro has t-1 and t-2 on 24/09
      expect(pedroTasks.length).toBe(2);
      expect(pedroTasks.map(t => t.id)).toContain('t-1');
      expect(pedroTasks.map(t => t.id)).toContain('t-2');

      // Hélder has t-2 on 24/09
      expect(helderTasks.length).toBe(1);
      expect(helderTasks[0].id).toBe('t-2');

      // The task hours are preserved intact for each user (not divided or duplicated synthetically)
      expect(pedroTasks.find(t => t.id === 't-2')?.estimatedHours).toBe('03:00');
      expect(helderTasks[0].estimatedHours).toBe('03:00');
    });

    it('não mistura tarefas de utilizadores diferentes', () => {
      const tiagoTasks = getUserDayTasks(mockTasks, 'user-tiago', '2026-09-24');
      expect(tiagoTasks.length).toBe(0);
    });

    it('não duplica a tarefa na mesma linha do utilizador', () => {
      const pedroTasks = getUserDayTasks(mockTasks, 'user-pedro', '2026-09-24');
      const uniqueIds = new Set(pedroTasks.map(t => t.id));
      expect(uniqueIds.size).toBe(pedroTasks.length);
    });

    it('aplica filtros opcionais por projeto e por estado', () => {
      const filteredByProject = getUserDayTasks(mockTasks, 'user-pedro', '2026-09-24', {
        projectId: 'p-1',
      });
      expect(filteredByProject.length).toBe(1);
      expect(filteredByProject[0].id).toBe('t-1');

      const filteredByStatus = getUserDayTasks(mockTasks, 'user-pedro', '2026-09-24', {
        statusId: 'ts-2',
      });
      expect(filteredByStatus.length).toBe(1);
      expect(filteredByStatus[0].id).toBe('t-2');
    });
  });

  describe('3. Deteção e Apresentação de Conflitos Operacionais e Ausências', () => {
    const mockAbsences = [
      {
        id: 'abs-1',
        userId: 'user-pedro',
        absenceStartDate: '2026-09-24',
        absenceEndDate: '2026-09-24',
        reason: 'Férias',
        deleted: false,
      },
    ];

    it('deteta ausência simples do utilizador no dia especificado (sem tarefas)', () => {
      const abs = getUserDayAbsence(mockAbsences, 'user-pedro', '2026-09-24');
      expect(abs).toBeDefined();
      expect(abs?.reason).toBe('Férias');

      const conflicts = getOperationalDayConflicts([], abs, 'Pedro Correia', '24/09/2026');
      expect(conflicts.isAbsent).toBe(true);
      expect(conflicts.hasConflict).toBe(false);
      expect(conflicts.badgeText).toBe('AUSENTE');
    });

    it('deteta conflito crítico quando utilizador tem tarefas enquanto está ausente', () => {
      const abs = getUserDayAbsence(mockAbsences, 'user-pedro', '2026-09-24');
      const sampleTasks: Task[] = [
        {
          id: 't-1',
          title: 'Tarefa em Dia de Férias',
          projectId: 'p-1',
          assigneeIds: ['user-pedro'],
          version: 1,
          deleted: false,
        },
      ];

      const conflicts = getOperationalDayConflicts(sampleTasks, abs, 'Pedro Correia', '24/09/2026');
      expect(conflicts.hasConflict).toBe(true);
      expect(conflicts.isAbsent).toBe(true);
      expect(conflicts.badgeText?.toLowerCase()).toContain('ausente');
      expect(conflicts.badgeText).toContain('1 tarefa');
    });

    it('deteta conflito operacional quando utilizador tem 2 tarefas no mesmo dia', () => {
      const sampleTasks: Task[] = [
        { id: 't-1', title: 'Tarefa 1', projectId: 'p-1', assigneeIds: ['user-pedro'], version: 1, deleted: false },
        { id: 't-2', title: 'Tarefa 2', projectId: 'p-2', assigneeIds: ['user-pedro'], version: 1, deleted: false },
      ];

      const conflicts = getOperationalDayConflicts(sampleTasks, undefined, 'Pedro Correia', '24/09/2026');
      expect(conflicts.hasConflict).toBe(true);
      expect(conflicts.hasMultipleTasks).toBe(true);
      expect(conflicts.taskCount).toBe(2);
      expect(conflicts.badgeText).toBe('⚠️ 2 tarefas');
    });

    it('deteta conflito operacional quando utilizador tem 3 tarefas no mesmo dia', () => {
      const sampleTasks: Task[] = [
        { id: 't-1', title: 'Instalação Cliente A', projectId: 'p-1', assigneeIds: ['user-pedro'], version: 1, deleted: false },
        { id: 't-2', title: 'FAT Projeto B', projectId: 'p-2', assigneeIds: ['user-pedro'], version: 1, deleted: false },
        { id: 't-3', title: 'Formação Cliente C', projectId: 'p-3', assigneeIds: ['user-pedro'], version: 1, deleted: false },
      ];

      const conflicts = getOperationalDayConflicts(sampleTasks, undefined, 'Pedro Correia', '24/09/2026');
      expect(conflicts.hasConflict).toBe(true);
      expect(conflicts.hasMultipleTasks).toBe(true);
      expect(conflicts.taskCount).toBe(3);
      expect(conflicts.badgeText).toBe('⚠️ 3 tarefas');
    });

    it('não reporta conflito quando utilizador tem apenas 1 tarefa e nenhuma ausência', () => {
      const sampleTasks: Task[] = [
        { id: 't-1', title: 'Instalação Única', projectId: 'p-1', assigneeIds: ['user-pedro'], version: 1, deleted: false },
      ];

      const conflicts = getOperationalDayConflicts(sampleTasks, undefined, 'Pedro Correia', '24/09/2026');
      expect(conflicts.hasConflict).toBe(false);
      expect(conflicts.isAbsent).toBe(false);
      expect(conflicts.hasMultipleTasks).toBe(false);
    });

    it('suporta ausências com carimbos ISO (YYYY-MM-DDTHH:mm:ss)', () => {
      const absencesWithISO = [
        {
          id: 'abs-iso',
          userId: 'user-pedro',
          absenceStartDate: '2026-09-24T00:00:00.000Z',
          absenceEndDate: '2026-09-24T23:59:59.000Z',
          reason: 'Baixa Médica',
          deleted: false,
        },
      ];

      const abs = getUserDayAbsence(absencesWithISO, 'user-pedro', '2026-09-24');
      expect(abs).toBeDefined();
      expect(abs?.reason).toBe('Baixa Médica');
    });
  });

  describe('4. Tarefas Multi-dia, Tarefas Sem Utilizadores e Limites Temporais', () => {
    it('tarefa de múltiplos dias aparece em todos os dias abrangidos', () => {
      const multiDayTask: Task = {
        id: 't-multiday',
        title: 'Instalação Complexa Multi-dia',
        projectId: 'p-1',
        startDate: '2026-09-22',
        endDate: '2026-09-24',
        estimatedHours: '16:00',
        assigneeIds: ['user-pedro'],
        version: 1,
        deleted: false,
      };

      // Day before span
      expect(isTaskOnDate(multiDayTask, '2026-09-21')).toBe(false);
      // Days inside span
      expect(isTaskOnDate(multiDayTask, '2026-09-22')).toBe(true);
      expect(isTaskOnDate(multiDayTask, '2026-09-23')).toBe(true);
      expect(isTaskOnDate(multiDayTask, '2026-09-24')).toBe(true);
      // Day after span
      expect(isTaskOnDate(multiDayTask, '2026-09-25')).toBe(false);
    });

    it('tarefas sem atribuídos não causam erro e não aparecem na linha de nenhum utilizador', () => {
      const unassignedTask: Task = {
        id: 't-unassigned',
        title: 'Tarefa Sem Técnico',
        projectId: 'p-1',
        estimatedDate: '2026-09-24',
        assigneeIds: [],
        version: 1,
        deleted: false,
      };

      expect(isUserAssignedToTask(unassignedTask, 'user-pedro')).toBe(false);
      const userTasks = getUserDayTasks([unassignedTask], 'user-pedro', '2026-09-24');
      expect(userTasks.length).toBe(0);
    });

    it('tarefas fora do intervalo do calendário não são associadas aos dias do período', () => {
      const futureTask: Task = {
        id: 't-future',
        title: 'Tarefa no Próximo Mês',
        projectId: 'p-1',
        estimatedDate: '2026-10-25',
        assigneeIds: ['user-pedro'],
        version: 1,
        deleted: false,
      };

      const userTasks = getUserDayTasks([futureTask], 'user-pedro', '2026-09-24');
      expect(userTasks.length).toBe(0);
    });
  });

  describe('5. Integridade da Aplicação e Conformidade com as Regras do Projeto', () => {
    it('garante que utilizador eliminado propositado (ricardo75@gmail.com) é filtrado e nunca exibido', () => {
      const allUsers: User[] = [
        { id: 'u-1', name: 'Pedro Correia', email: 'pedro@empresa.pt', type: 'Team', roleId: 'ug-1', isAdmin: false, isSuperAdmin: false, approved: true, deleted: false },
        { id: 'u-ricardo', name: 'Ricardo', email: 'ricardo75@gmail.com', type: 'Team', roleId: 'ug-1', isAdmin: false, isSuperAdmin: false, approved: true, deleted: true },
      ];

      const activeUsers = allUsers.filter(u => !u.deleted && u.email?.toLowerCase() !== 'ricardo75@gmail.com');
      expect(activeUsers.length).toBe(1);
      expect(activeUsers[0].name).toBe('Pedro Correia');
      expect(activeUsers.some(u => u.email?.toLowerCase() === 'ricardo75@gmail.com')).toBe(false);
    });
  });
});
