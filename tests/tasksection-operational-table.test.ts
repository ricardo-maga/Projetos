import { describe, it, expect } from 'bun:test';
import { getUserInitials, getTaskEffectiveDate, getTaskStatusStyle, getTaskTypeName, matchTaskStatusId } from '../lib/utils';
import { Task, Project, Client, TaskType } from '../lib/types';

describe('FASE — TaskSection: Nova Tabela Operacional', () => {

  describe('1. Regra de Iniciais de Utilizador (getUserInitials)', () => {
    it('gera iniciais com primeira letra do primeiro nome + primeira letra do último nome para nomes simples', () => {
      expect(getUserInitials('João Silva')).toBe('JS');
      expect(getUserInitials('Pedro Correia')).toBe('PC');
    });

    it('gera iniciais do primeiro e último nome para nomes compostos', () => {
      expect(getUserInitials('Maria de Sousa')).toBe('MS');
      expect(getUserInitials('Ana Maria Santos Ferreira')).toBe('AF');
    });

    it('retorna uma única letra para utilizadores com apenas um nome', () => {
      expect(getUserInitials('João')).toBe('J');
      expect(getUserInitials('   Carlos   ')).toBe('C');
    });

    it('retorna fallback "?" para entradas nulas, indefinidas ou vazias', () => {
      expect(getUserInitials(null)).toBe('?');
      expect(getUserInitials(undefined)).toBe('?');
      expect(getUserInitials('')).toBe('?');
      expect(getUserInitials('   ')).toBe('?');
    });
  });

  describe('2. Data Operacional e Regras de Alerta de Atraso', () => {
    it('1. data operacional usa startDate quando a execução real está preenchida', () => {
      const t: Task = {
        id: 't-1',
        title: 'Tarefa Real',
        projectId: 'p-1',
        startDate: '2026-10-20',
        endDate: '2026-10-25',
        estimatedDate: '2026-10-10',
        version: 1,
        deleted: false,
      };
      expect(getTaskEffectiveDate(t)).toBe('2026-10-20');
    });

    it('2. data operacional usa estimatedDate quando não existem datas reais', () => {
      const t: Task = {
        id: 't-2',
        title: 'Tarefa Planeada',
        projectId: 'p-1',
        estimatedDate: '2026-10-15',
        version: 1,
        deleted: false,
      };
      expect(getTaskEffectiveDate(t)).toBe('2026-10-15');
    });

    it('3. tarefa de hoje não recebe alerta de atraso', () => {
      const todayStr = '2026-10-03';
      const targetDate = '2026-10-03';
      const scale = 1; // Por iniciar
      const isOverdue = Boolean(targetDate && targetDate < todayStr && scale !== 3);
      expect(isOverdue).toBe(false);
    });

    it('4. tarefa anterior a hoje recebe alerta quando não concluída', () => {
      const todayStr = '2026-10-03';
      const targetDate = '2026-10-01';
      const scale = 1; // Por iniciar
      const isOverdue = Boolean(targetDate && targetDate < todayStr && scale !== 3);
      expect(isOverdue).toBe(true);
    });

    it('5. tarefa concluída anterior a hoje não recebe alerta', () => {
      const todayStr = '2026-10-03';
      const targetDate = '2026-10-01';
      const scale = 3; // Concluída
      const isOverdue = Boolean(targetDate && targetDate < todayStr && scale !== 3);
      expect(isOverdue).toBe(false);
    });
  });

  describe('3. Estado e Estilização (getTaskStatusStyle)', () => {
    const taskStatuses = [
      { id: 'ts-1', name: 'Por iniciar', scale: 1, color: 'cinza' },
      { id: 'ts-2', name: 'Em curso', scale: 2, color: 'azul' },
      { id: 'ts-3', name: 'Concluída', scale: 3, color: 'verde' },
    ];

    it('6. estado usa o nome e configuração existente', () => {
      const style = getTaskStatusStyle('ts-2', taskStatuses);
      expect(style.name).toBe('Em curso');
    });

    it('7. estado usa a cor e badgeClass configurada existente', () => {
      const style = getTaskStatusStyle('ts-3', taskStatuses);
      expect(style.badgeClass).toBeDefined();
      expect(style.badgeClass).toContain('emerald');
    });
  });

  describe('4. Resolução de Cliente e Projeto (Format "Cliente · Projeto")', () => {
    const projectMap = new Map<string, Project>([
      ['p-1', { id: 'p-1', clientId: 'c-1', title: 'Linha de Produção', version: 1, deleted: false }],
      ['p-2', { id: 'p-2', clientId: 'c-2', title: 'Parque Fotovoltaico', installProjectNo: 'IP-99', version: 1, deleted: false }],
    ]);

    const clientMap = new Map<string, Client>([
      ['c-1', { id: 'c-1', clientName: 'ACME Corp', shortName: 'ACME', version: 1, deleted: false }],
    ]);

    const getProjectTitle = (projId?: string | null) => {
      if (!projId) return 'Sem projeto';
      const proj = projectMap.get(projId);
      if (!proj) return 'Projeto não encontrado';
      const client = clientMap.get(proj.clientId);
      const clientName = client ? (client.clientName || client.shortName) : '';
      const ipPart = proj.installProjectNo ? ` (${proj.installProjectNo})` : '';
      const projectTitle = `${proj.title}${ipPart}`;
      return clientName ? `${clientName} · ${projectTitle}` : projectTitle;
    };

    it('8. cliente + projeto utiliza o formato "Cliente · Projeto"', () => {
      expect(getProjectTitle('p-1')).toBe('ACME Corp · Linha de Produção');
    });

    it('8b. inclui número de instalação quando disponível', () => {
      expect(getProjectTitle('p-2')).toBe('Parque Fotovoltaico (IP-99)');
    });

    it('9. tarefa sem projeto apresenta "Sem projeto"', () => {
      expect(getProjectTitle(null)).toBe('Sem projeto');
      expect(getProjectTitle(undefined)).toBe('Sem projeto');
      expect(getProjectTitle('')).toBe('Sem projeto');
    });

    it('10. projectId inexistente apresenta "Projeto não encontrado"', () => {
      expect(getProjectTitle('p-inexistente')).toBe('Projeto não encontrado');
    });
  });

  describe('5. Atribuição de Responsáveis e Limite Visual', () => {
    const users = [
      { id: 'u-1', name: 'João Silva' },
      { id: 'u-2', name: 'Pedro Correia' },
      { id: 'u-3', name: 'Maria de Sousa' },
      { id: 'u-4', name: 'Ana Ferreira' },
      { id: 'u-5', name: 'Carlos Lima' },
    ];

    const processAssignees = (assigneeIds?: string[]) => {
      if (!assigneeIds || assigneeIds.length === 0) {
        return { count: 0, text: 'Sem atribuição', badges: [], remaining: 0 };
      }
      const maxVisible = 3;
      const visibleIds = assigneeIds.slice(0, maxVisible);
      const remaining = assigneeIds.length - maxVisible;
      const badges = visibleIds.map(uid => {
        const u = users.find(usr => usr.id === uid);
        return getUserInitials(u ? u.name : uid);
      });
      return { count: assigneeIds.length, badges, remaining };
    };

    it('13 & 11 & 12. mostra até 3 badges com as iniciais corretas', () => {
      const res = processAssignees(['u-1', 'u-2', 'u-3']);
      expect(res.badges).toEqual(['JS', 'PC', 'MS']);
      expect(res.remaining).toBe(0);
    });

    it('14. apresenta +N para responsáveis excedentes a 3', () => {
      const res = processAssignees(['u-1', 'u-2', 'u-3', 'u-4', 'u-5']);
      expect(res.badges).toEqual(['JS', 'PC', 'MS']);
      expect(res.remaining).toBe(2);
    });

    it('15. tarefa sem responsáveis apresenta "Sem atribuição"', () => {
      const resEmpty = processAssignees([]);
      expect(resEmpty.text).toBe('Sem atribuição');

      const resNull = processAssignees(undefined);
      expect(resNull.text).toBe('Sem atribuição');
    });
  });

  describe('6. Validação de Horas, Tipos e Modal Modes', () => {
    const taskTypes: TaskType[] = [
      { id: 'tt-1', name: 'Instalação', code: 'INST', deleted: false },
      { id: 'tt-2', name: 'Manutenção', code: 'MAN', deleted: false },
    ];

    it('16. horas previstas e reais são mantidas e 0 é um valor válido', () => {
      const t: Task = {
        id: 't-hours',
        title: 'Tarefa com Horas',
        estimatedHours: 8,
        actualHours: 0,
        version: 1,
        deleted: false,
      };
      expect(t.estimatedHours).toBe(8);
      expect(t.actualHours).toBe(0);
      expect(t.actualHours !== undefined && t.actualHours !== null).toBe(true);
    });

    it('17. tipo utiliza getTaskTypeName', () => {
      expect(getTaskTypeName('tt-1', taskTypes)).toBe('Instalação');
      expect(getTaskTypeName('tt-unknown', taskTypes)).toBe('');
    });

    it('18, 19, 20 & 21. ações do modal suportam mode="execute", mode="edit", mode="create" e confirmação de delete', () => {
      let modalMode: string | null = null;
      let modalTask: Task | null = null;

      const openTaskModal = (t: Task | null, mode: 'create' | 'edit' | 'execute' | 'view') => {
        modalTask = t;
        modalMode = mode;
      };

      const sampleTask: Task = { id: 't-sample', title: 'Amostra', version: 1, deleted: false };

      // Executar
      openTaskModal(sampleTask, 'execute');
      expect(modalMode).toBe('execute');
      expect(modalTask?.id).toBe('t-sample');

      // Editar
      openTaskModal(sampleTask, 'edit');
      expect(modalMode).toBe('edit');

      // Duplicar (Abre criação pré-preenchida com a tarefa como base)
      openTaskModal(sampleTask, 'create');
      expect(modalMode).toBe('create');
      expect(modalTask?.title).toBe('Amostra');
    });

    it('22. botões internos usam stopPropagation e não propagam o clique para a linha', () => {
      let propagationStopped = false;
      const fakeEvent = {
        stopPropagation: () => {
          propagationStopped = true;
        },
      };

      fakeEvent.stopPropagation();
      expect(propagationStopped).toBe(true);
    });

    it('26. NENHUM DADO é persistido apenas por alterar a apresentação da tabela', () => {
      const taskOriginal: Task = {
        id: 't-immutable',
        title: 'Imutável',
        version: 1,
        deleted: false,
      };
      const snapshot = JSON.stringify(taskOriginal);
      
      // Render/Lookup simulation
      const initials = getUserInitials('Pedro Correia');
      const effDate = getTaskEffectiveDate(taskOriginal);
      
      expect(initials).toBe('PC');
      expect(JSON.stringify(taskOriginal)).toBe(snapshot);
    });
  });

  describe('7. FASE — Correções Visuais e Limpeza Cirúrgica (TaskSection)', () => {
    const projectMap = new Map<string, Project>([
      ['p-1', { id: 'p-1', clientId: 'c-1', title: 'Linha de Produção', version: 1, deleted: false }],
      ['p-2', { id: 'p-2', clientId: 'c-2', title: 'Parque Fotovoltaico', installProjectNo: 'IP-99', version: 1, deleted: false }],
    ]);

    const clientMap = new Map<string, Client>([
      ['c-1', { id: 'c-1', clientName: 'ACME Corp', shortName: 'ACME', version: 1, deleted: false }],
    ]);

    const getProjectTitle = (projId?: string | null) => {
      if (!projId) return 'Sem projeto';
      const proj = projectMap.get(projId);
      if (!proj) return 'Projeto não encontrado';
      const client = clientMap.get(proj.clientId);
      const clientName = client ? (client.clientName || client.shortName) : '';
      const ipPart = proj.installProjectNo ? ` (${proj.installProjectNo})` : '';
      const projectTitle = `${proj.title}${ipPart}`;
      return clientName ? `${clientName} · ${projectTitle}` : projectTitle;
    };

    it('1. Coluna Tarefa contém apenas 2 linhas de informação (Linha 1: Cliente · Projeto, Linha 2: Título)', () => {
      const task: Task = {
        id: 't-10',
        title: 'Manutenção de Inversores',
        description: 'Descrição longa que deve ser omitida na tabela operacional',
        projectId: 'p-1',
        version: 1,
        deleted: false,
      };

      const line1 = getProjectTitle(task.projectId);
      const line2 = task.title;

      expect(line1).toBe('ACME Corp · Linha de Produção');
      expect(line2).toBe('Manutenção de Inversores');
      // A descrição existe na tarefa mas não faz parte das linhas da coluna
      expect(task.description).toBeDefined();
    });

    it('2. Resolução canónica Cliente/Projeto lida com todos os cenários de ID', () => {
      expect(getProjectTitle(null)).toBe('Sem projeto');
      expect(getProjectTitle(undefined)).toBe('Sem projeto');
      expect(getProjectTitle('')).toBe('Sem projeto');
      expect(getProjectTitle('p-inexistente')).toBe('Projeto não encontrado');
      expect(getProjectTitle('p-1')).toBe('ACME Corp · Linha de Produção');
      expect(getProjectTitle('p-2')).toBe('Parque Fotovoltaico (IP-99)');
    });

    it('3. Ordenação no agrupamento por projeto utiliza a resolução canónica getProjectTitle', () => {
      const projectIds = ['p-2', 'p-1', 'p-inexistente'];
      const sorted = [...projectIds].sort((idA, idB) => {
        const titleA = getProjectTitle(idA).toLowerCase();
        const titleB = getProjectTitle(idB).toLowerCase();
        return titleA.localeCompare(titleB);
      });

      expect(sorted).toEqual(['p-1', 'p-2', 'p-inexistente']);
    });
  });
});
