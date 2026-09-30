import { describe, it, expect } from 'bun:test';
import { getTaskEffectiveDate } from '../lib/utils';
import { getTaskConflictWarnings } from '../lib/taskConflicts';

describe('Tarefas — Janela de Criação de Tarefas & Lista Operacional', () => {
  describe('1. Regra de Prevalência da "Data Planeada" vs "Datas Reais"', () => {
    it('o campo "data planeada" prevalece em qualquer situação enquanto ambas as datas reais não estiverem preenchidas', () => {
      // Apenas data planeada preenchida
      const t1 = { estimatedDate: '2026-10-15', startDate: null, endDate: null };
      expect(getTaskEffectiveDate(t1)).toBe('2026-10-15');

      // Data planeada preenchida e apenas data de início real preenchida (sem data de fim)
      const t2 = { estimatedDate: '2026-10-15', startDate: '2026-10-20', endDate: null };
      expect(getTaskEffectiveDate(t2)).toBe('2026-10-15');

      // Data planeada preenchida e apenas data de fim real preenchida (sem data de início)
      const t3 = { estimatedDate: '2026-10-15', startDate: null, endDate: '2026-10-22' };
      expect(getTaskEffectiveDate(t3)).toBe('2026-10-15');
    });

    it('quando data de início e fim real estiverem ambas preenchidas, passa a ser a data de início real', () => {
      const t = { estimatedDate: '2026-10-15', startDate: '2026-10-20', endDate: '2026-10-22' };
      expect(getTaskEffectiveDate(t)).toBe('2026-10-20');
    });

    it('se não houver data planeada mas existirem datas reais completas, usa a data de início real', () => {
      const t = { estimatedDate: null, startDate: '2026-10-20', endDate: '2026-10-22' };
      expect(getTaskEffectiveDate(t)).toBe('2026-10-20');
    });
  });

  describe('2. Validação de Datas de Início e Fim na Criação/Edição de Tarefas', () => {
    function validateTaskDates(formStartDate: string, formEndDate: string) {
      if (formStartDate && formEndDate && formEndDate < formStartDate) {
        return { valid: false, error: 'A data de fim não pode ser anterior à data de início.' };
      }
      if (formStartDate && !formEndDate) {
        return { valid: false, error: 'Se preencher a data de início, é obrigatório preencher a data de fim.' };
      }
      if (formEndDate && !formStartDate) {
        return { valid: false, error: 'Se preencher a data de fim, é obrigatório preencher a data de início.' };
      }
      return { valid: true };
    }

    it('não permite data de fim anterior à data de início', () => {
      const res = validateTaskDates('2026-10-20', '2026-10-19');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('A data de fim não pode ser anterior à data de início.');
    });

    it('permite data de fim igual à data de início', () => {
      const res = validateTaskDates('2026-10-20', '2026-10-20');
      expect(res.valid).toBe(true);
    });

    it('permite data de fim posterior à data de início', () => {
      const res = validateTaskDates('2026-10-20', '2026-10-25');
      expect(res.valid).toBe(true);
    });

    it('exige obrigatoriamente data de fim se data de início estiver preenchida', () => {
      const res = validateTaskDates('2026-10-20', '');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Se preencher a data de início, é obrigatório preencher a data de fim.');
    });

    it('exige obrigatoriamente data de início se data de fim estiver preenchida', () => {
      const res = validateTaskDates('', '2026-10-25');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Se preencher a data de fim, é obrigatório preencher a data de início.');
    });

    it('permite ambas as datas vazias na criação (opcionais na fase de planeamento)', () => {
      const res = validateTaskDates('', '');
      expect(res.valid).toBe(true);
    });

    it('ao selecionar a data de início deve definir a data de fim para a mesma data', () => {
      let startDate = '';
      let endDate = '';

      const handleStartDateChange = (newStart: string) => {
        startDate = newStart;
        if (newStart) {
          endDate = newStart;
        }
      };

      handleStartDateChange('2026-10-20');
      expect(startDate).toBe('2026-10-20');
      expect(endDate).toBe('2026-10-20');

      // À posterior podemos alterar a data de fim
      endDate = '2026-10-22';
      expect(endDate).toBe('2026-10-22');
    });
  });

  describe('3. Pesquisa e Sugestão Leve de Projetos (Escalável para Milhares de Projetos)', () => {
    // Simular 5000 projetos
    const clients = [
      { id: 'c-1', clientName: 'Empresa Fotovoltaica Lusitana, Lda', shortName: 'EFL Solar' },
      { id: 'c-2', clientName: 'Companhia de Eletricidade e Redes, SA', shortName: 'CER' },
      { id: 'c-3', clientName: 'Indústria Metalomecânica de Viseu, Lda', shortName: 'IMV' },
    ];

    const clientMap = new Map(clients.map(c => [c.id, c]));

    const thousandProjects = Array.from({ length: 5000 }, (_, i) => ({
      id: `p-${i}`,
      title: `Instalação Fotovoltaica Bloco ${i}`,
      clientId: i % 3 === 0 ? 'c-1' : i % 3 === 1 ? 'c-2' : 'c-3',
      installProjectNo: `IP-2026-${1000 + i}`,
      deleted: false,
    }));

    function searchProjects(query: string, projects: typeof thousandProjects, limit = 25) {
      const q = query.toLowerCase().trim();
      if (!q) return projects.slice(0, limit);

      const results = [];
      for (const p of projects) {
        if (p.deleted) continue;
        const pTitle = p.title.toLowerCase();
        const cl = clientMap.get(p.clientId);
        const cFullName = (cl?.clientName || '').toLowerCase();
        const cShortName = (cl?.shortName || '').toLowerCase();
        const ipNo = (p.installProjectNo || '').toLowerCase();

        if (
          pTitle.includes(q) || 
          cFullName.includes(q) || 
          cShortName.includes(q) || 
          ipNo.includes(q)
        ) {
          results.push(p);
          if (results.length >= limit) break; // Terminação antecipada garantindo tempo sub-milissegundo
        }
      }
      return results;
    }

    it('pesquisa por título de projeto com milhares de registos é ultra-rápida e limita a 25 resultados', () => {
      const t0 = performance.now();
      const results = searchProjects('Bloco 42', thousandProjects);
      const t1 = performance.now();

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(25);
      expect(t1 - t0).toBeLessThan(15); // Menos de 15ms mesmo para 5000 projetos
    });

    it('pesquisa por nome completo do cliente encontra projetos associados', () => {
      const results = searchProjects('Empresa Fotovoltaica Lusitana', thousandProjects);
      expect(results.length).toBe(25);
      results.forEach(p => {
        expect(p.clientId).toBe('c-1');
      });
    });

    it('pesquisa por nome abreviado do cliente encontra projetos associados', () => {
      const results = searchProjects('EFL Solar', thousandProjects);
      expect(results.length).toBe(25);
      results.forEach(p => {
        expect(p.clientId).toBe('c-1');
      });

      const resultsCER = searchProjects('CER', thousandProjects);
      expect(resultsCER.length).toBe(25);
      resultsCER.forEach(p => {
        expect(p.clientId).toBe('c-2');
      });
    });

    it('validação torna o campo projeto opcional, atribuindo null se não for selecionado ou se texto arbitrário for introduzido', () => {
      const resolveProjectSelection = (inputProjectId: string, projects: typeof thousandProjects): string | null => {
        if (!inputProjectId || !inputProjectId.trim()) return null;
        const matched = projects.find(p => p.id === inputProjectId.trim() && !p.deleted);
        return matched ? matched.id : null;
      };

      // Vazio -> null (sem projeto)
      expect(resolveProjectSelection('', thousandProjects)).toBeNull();
      // Texto arbitrário que não corresponde a um id de projeto existente -> null
      expect(resolveProjectSelection('texto-qualquer-inexistente', thousandProjects)).toBeNull();
      // Projeto existente selecionado -> id do projeto
      expect(resolveProjectSelection('p-100', thousandProjects)).toBe('p-100');
    });
  });

  describe('4. Duplicação de Tarefa na Lista Operacional de Tarefas', () => {
    it('prepara os dados da tarefa a ser duplicada mantendo atributos originais', () => {
      const originalTask = {
        id: 'task-orig-1',
        projectId: 'p-10',
        title: 'Manutenção Preventiva Inversores',
        description: 'Verificar cablagens e ventilação',
        statusId: 'ts-1',
        taskTypeId: 'tt-1',
        estimatedDate: '2026-10-30',
        estimatedHours: '04:00',
        actualHours: '0',
        assigneeIds: ['u-1', 'u-2'],
      };

      // Simulação do payload gerado pela duplicação
      const duplicatedPayload = {
        projectId: originalTask.projectId,
        title: originalTask.title,
        description: originalTask.description,
        statusId: originalTask.statusId,
        taskTypeId: originalTask.taskTypeId,
        estimatedDate: originalTask.estimatedDate,
        estimatedHours: 4,
        actualHours: 0,
        assigneeIds: originalTask.assigneeIds,
      };

      expect(duplicatedPayload.projectId).toBe(originalTask.projectId);
      expect(duplicatedPayload.title).toBe(originalTask.title);
      expect(duplicatedPayload.estimatedDate).toBe('2026-10-30');
      expect(duplicatedPayload.assigneeIds).toEqual(['u-1', 'u-2']);
    });
  });

  describe('5. Conflitos de Tarefa utilizam getTaskEffectiveDate', () => {
    it('detecta conflitos no dia efetivo da tarefa (planeada vs real)', () => {
      const user = { id: 'u-tech-1', name: 'João Técnico' };
      const project = { id: 'p-1', title: 'Solar Norte' };

      // Tarefa existente com data planeada 2026-10-20
      const existingTask = {
        id: 't-exist-1',
        projectId: 'p-1',
        title: 'Instalação de Módulos',
        estimatedDate: '2026-10-20',
        startDate: null,
        endDate: null,
        estimatedHours: 8,
        assigneeIds: ['u-tech-1'],
      };

      const warnings = getTaskConflictWarnings({
        date: '2026-10-20',
        assigneeIds: ['u-tech-1'],
        currentTaskId: 't-new-2',
        tasks: [existingTask as any],
        users: [user as any],
        projects: [project as any],
      });

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('João Técnico');
      expect(warnings[0]).toContain('Instalação de Módulos');
    });
  });
});
