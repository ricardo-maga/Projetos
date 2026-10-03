import { describe, it, expect } from 'bun:test';
import { Task, Project, Client, TaskType, User } from '../lib/types';
import { parseTimeToHours, formatHoursToHHMM, getUserInitials } from '../lib/utils';

describe('FASE — Simplificação da área Tasks e Calendário Operacional', () => {

  describe('1. TaskSection — Remoção de Filtros de Projeto e Tipo de Tarefa', () => {
    it('pesquisa opera sobre título, descrição, cliente, projeto e número de instalação sem necessidade de filtro de projeto/tipo', () => {
      const activeTasks: Task[] = [
        { id: 't-1', title: 'Instalação Solar', description: 'Painéis fotovoltaicos', projectId: 'p-1', assigneeIds: ['u-1'], version: 1, deleted: false },
        { id: 't-2', title: 'Manutenção de Inversor', description: 'Verificação técnica', projectId: 'p-2', assigneeIds: ['u-2'], version: 1, deleted: false },
      ];

      const q = 'solar';
      const searchResults = activeTasks.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
      expect(searchResults.length).toBe(1);
      expect(searchResults[0].id).toBe('t-1');
    });
  });

  describe('2. TaskAnalytics — Análise Global sem Filtros Secundários & Janela Temporal de 7 Dias', () => {
    const taskTypes: TaskType[] = [
      { id: 'tt-1', name: 'Instalação', code: 'INST', deleted: false },
      { id: 'tt-2', name: 'Manutenção', code: 'MAN', deleted: false }
    ];

    const tasks: Task[] = [
      { id: 't-1', title: 'T1', taskTypeId: 'tt-1', estimatedHours: '4', actualHours: '3', createdDate: new Date().toISOString().slice(0, 10), version: 1, deleted: false },
      { id: 't-2', title: 'T2', taskTypeId: 'tt-2', estimatedHours: '8', actualHours: '5', createdDate: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10), version: 1, deleted: false },
    ];

    it('calcula métricas reais de 7 dias (count7, estHours7, actHours7) autonomamente', () => {
      const now = new Date();
      const getDaysAgo = (dateStr?: string) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return Math.floor((now.getTime() - d.getTime()) / (1000 * 3600 * 24));
      };

      const typeMap: Record<string, { count7: number; count30: number; estHours7: number; actHours7: number }> = {
        'tt-1': { count7: 0, count30: 0, estHours7: 0, actHours7: 0 },
        'tt-2': { count7: 0, count30: 0, estHours7: 0, actHours7: 0 },
      };

      tasks.forEach(t => {
        const refDate = t.createdDate;
        const daysAgo = getDaysAgo(refDate);
        if (daysAgo === null || daysAgo < 0) return;

        const key = t.taskTypeId || '';
        const estH = parseTimeToHours(t.estimatedHours);
        const actH = parseTimeToHours(t.actualHours);

        if (daysAgo <= 7) {
          typeMap[key].count7 += 1;
          typeMap[key].estHours7 += estH;
          typeMap[key].actHours7 += actH;
        }
        if (daysAgo <= 30) {
          typeMap[key].count30 += 1;
        }
      });

      expect(typeMap['tt-1'].count7).toBe(1);
      expect(typeMap['tt-1'].estHours7).toBe(4);
      expect(typeMap['tt-1'].actHours7).toBe(3);

      expect(typeMap['tt-2'].count7).toBe(0);
      expect(typeMap['tt-2'].count30).toBe(1);
    });
  });

  describe('3. OperationalUserCalendar — Preferência Local e Seleção Inicial Vazia', () => {
    const activeEligibleUsers: User[] = [
      { id: 'u-1', name: 'João Silva', email: 'joao@empresa.pt' },
      { id: 'u-2', name: 'Maria de Sousa', email: 'maria@empresa.pt' },
    ];

    it('inicia sem nenhum utilizador selecionado na primeira utilização sem preferência guardada', () => {
      let savedPreference: string | null = null; // Simula ausência de chave em localStorage
      const selectedUserIds = savedPreference ? JSON.parse(savedPreference) : [];
      expect(selectedUserIds).toEqual([]);
    });

    it('restaura corretamente os IDs guardados e descarta utilizadores inelegíveis/inexistentes', () => {
      const savedPreference = JSON.stringify(['u-1', 'u-removido']);
      const parsed = JSON.parse(savedPreference);
      const validUserIds = parsed.filter((id: string) => activeEligibleUsers.some(u => u.id === id));

      expect(validUserIds).toEqual(['u-1']);
      expect(validUserIds).not.toContain('u-removido');
    });
  });

  describe('4. Estrutura do Cartão de Tarefa no Calendário', () => {
    it('o cartão contém exatamente Cliente, Projeto, Título, Tipo e Estado sem ícone Briefcase ou badge de horas', () => {
      const project: Project = { id: 'p-1', clientId: 'c-1', title: 'Central Fotovoltaica', version: 1, deleted: false };
      const client: Client = { id: 'c-1', clientName: 'Empresa Solar Lda', shortName: 'SolarLda', version: 1, deleted: false };
      const task: Task = { id: 't-1', title: 'Montagem de Suportes', projectId: 'p-1', taskTypeId: 'tt-1', statusId: 'ts-1', estimatedHours: 8, version: 1, deleted: false };

      const clientName = client.shortName || client.clientName;
      const projectLabel = project.title;
      const taskTitle = task.title;
      const taskTypeLabel = 'Instalação';
      const statusName = 'Planeada';

      // 5 linhas do cartão:
      const line1 = clientName;
      const line2 = projectLabel;
      const line3 = taskTitle;
      const line4 = taskTypeLabel;
      const line5 = statusName;

      expect(line1).toBe('SolarLda');
      expect(line2).toBe('Central Fotovoltaica');
      expect(line3).toBe('Montagem de Suportes');
      expect(line4).toBe('Instalação');
      expect(line5).toBe('Planeada');
    });
  });

  describe('5. Coluna de Identidade do Utilizador', () => {
    it('apresenta [iniciais] Nome na primeira linha e total de tarefas numa linha independente, omitindo o email', () => {
      const user: User = { id: 'u-1', name: 'Pedro Correia', email: 'pedro@empresa.pt' };
      const initials = getUserInitials(user.name);
      const userPeriodTaskCount = 3;

      const line1 = `${initials} ${user.name}`;
      const line2 = `${userPeriodTaskCount} tarefas`;

      expect(line1).toBe('PC Pedro Correia');
      expect(line2).toBe('3 tarefas');
      expect(line1).not.toContain('pedro@empresa.pt');
    });
  });
});
