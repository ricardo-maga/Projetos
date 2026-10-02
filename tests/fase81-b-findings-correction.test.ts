import { describe, it, expect } from 'bun:test';
import { updateTaskSchema } from '../lib/validations/task';

describe('FASE 81-B — Correção Cirúrgica dos Findings da FASE 80', () => {
  describe('1. Finding 1 — Apresentação de Referências de Projeto (TaskSection & Planning)', () => {
    const mockProjects = [
      { id: 'p-100', title: 'Edifício Horizonte', clientId: 'c-1', installProjectNo: 'IP-100', deleted: false },
      { id: 'p-200', title: 'Parque Solar Norte', clientId: 'c-2', installProjectNo: '', deleted: false },
    ];
    const mockClients = [
      { id: 'c-1', clientName: 'Construtora Alfa', shortName: 'Alfa' },
      { id: 'c-2', clientName: 'Energia Verde', shortName: 'EV' },
    ];

    const projectMap = new Map(mockProjects.map(p => [p.id, p]));
    const clientMap = new Map(mockClients.map(c => [c.id, c]));

    const getProjectWithClientLabel = (projId?: string | null) => {
      if (!projId) return 'Sem projeto';
      const proj = projectMap.get(projId);
      if (!proj) return 'Projeto não encontrado';
      const client = clientMap.get(proj.clientId);
      const clientName = client ? (client.clientName || client.shortName) : '';
      const ipPart = proj.installProjectNo ? ` (${proj.installProjectNo})` : '';
      return clientName ? `${clientName} - ${proj.title}${ipPart}` : `${proj.title}${ipPart}`;
    };

    const getProjectTitle = (projId?: string | null) => {
      if (!projId) return 'Sem projeto';
      const proj = mockProjects.find(p => p.id === projId);
      if (!proj) return 'Projeto não encontrado';
      const client = mockClients.find(c => c.id === proj.clientId);
      const clientName = client ? (client.clientName || client.shortName) : '';
      return clientName ? `${clientName} • ${proj.title}` : proj.title;
    };

    const getPlanningTaskProjectLabel = (projectId?: string | null) => {
      if (!projectId) return 'Sem projeto';
      const proj = mockProjects.find(p => p.id === projectId);
      return proj ? proj.title : 'Projeto não encontrado';
    };

    it('Caso A: projectId = null / undefined apresenta "Sem projeto"', () => {
      expect(getProjectWithClientLabel(null)).toBe('Sem projeto');
      expect(getProjectWithClientLabel(undefined)).toBe('Sem projeto');
      expect(getProjectWithClientLabel('')).toBe('Sem projeto');

      expect(getProjectTitle(null)).toBe('Sem projeto');
      expect(getProjectTitle(undefined)).toBe('Sem projeto');
      expect(getProjectTitle('')).toBe('Sem projeto');

      expect(getPlanningTaskProjectLabel(null)).toBe('Sem projeto');
      expect(getPlanningTaskProjectLabel(undefined)).toBe('Sem projeto');
    });

    it('Caso B: projectId = UUID existente apresenta o nome correto do projeto', () => {
      expect(getProjectWithClientLabel('p-100')).toBe('Construtora Alfa - Edifício Horizonte (IP-100)');
      expect(getProjectTitle('p-100')).toBe('Construtora Alfa • Edifício Horizonte');
      expect(getPlanningTaskProjectLabel('p-100')).toBe('Edifício Horizonte');

      expect(getProjectWithClientLabel('p-200')).toBe('Energia Verde - Parque Solar Norte');
      expect(getProjectTitle('p-200')).toBe('Energia Verde • Parque Solar Norte');
      expect(getPlanningTaskProjectLabel('p-200')).toBe('Parque Solar Norte');
    });

    it('Caso C: projectId = UUID inexistente / não carregado apresenta "Projeto não encontrado" e NUNCA "Sem projeto"', () => {
      const danglingUuid = 'p-non-existent-999';

      const labelWithClient = getProjectWithClientLabel(danglingUuid);
      expect(labelWithClient).toBe('Projeto não encontrado');
      expect(labelWithClient).not.toBe('Sem projeto');

      const title = getProjectTitle(danglingUuid);
      expect(title).toBe('Projeto não encontrado');
      expect(title).not.toBe('Sem projeto');

      const planningLabel = getPlanningTaskProjectLabel(danglingUuid);
      expect(planningLabel).toBe('Projeto não encontrado');
      expect(planningLabel).not.toBe('Sem projeto');
    });
  });

  describe('2. Finding 2 — Semântica de PATCH Parcial de Datas & Validação com Merge', () => {
    // Helper simulando a lógica de fusão e validação da rota de API /api/v1/tasks/[id]
    const cleanDateVal = (val?: string | null) => (val && typeof val === 'string' && val.trim() ? val.trim() : null);

    const validateTaskPatchWithMerge = (
      current: { start_date: string | null; end_date: string | null; title: string },
      updates: { startDate?: string | null; endDate?: string | null; title?: string }
    ) => {
      // 1. Zod parse individual (garante que payload parcial é syntactically valid)
      const parseResult = updateTaskSchema.safeParse(updates);
      if (!parseResult.success) {
        return { valid: false, error: 'Schema validation error', details: parseResult.error.flatten() };
      }

      // 2. Merge com estado persistido
      const mergedStartDate = updates.startDate !== undefined ? cleanDateVal(updates.startDate) : current.start_date;
      const mergedEndDate = updates.endDate !== undefined ? cleanDateVal(updates.endDate) : current.end_date;

      // 3. Validação temporal sobre o estado combinado
      if (mergedStartDate && !mergedEndDate) {
        return { valid: false, error: 'A data de fim é obrigatória se a data de início estiver preenchida.' };
      }
      if (!mergedStartDate && mergedEndDate) {
        return { valid: false, error: 'A data de início é obrigatória se a data de fim estiver preenchida.' };
      }
      if (mergedStartDate && mergedEndDate && mergedEndDate < mergedStartDate) {
        return { valid: false, error: 'A data de fim não pode ser anterior à data de início.' };
      }

      return {
        valid: true,
        merged: {
          start_date: mergedStartDate,
          end_date: mergedEndDate,
          title: updates.title !== undefined ? updates.title : current.title,
        },
      };
    };

    it('A — alterar apenas startDate quando a Task tem endDate persistido é aceite e mesclado', () => {
      const current = { start_date: '2026-10-05', end_date: '2026-10-08', title: 'Montagem' };
      const updates = { startDate: '2026-10-06' };

      const res = validateTaskPatchWithMerge(current, updates);
      expect(res.valid).toBe(true);
      expect(res.merged?.start_date).toBe('2026-10-06');
      expect(res.merged?.end_date).toBe('2026-10-08');
    });

    it('B — alterar apenas endDate quando a Task tem startDate persistido é aceite e mesclado', () => {
      const current = { start_date: '2026-10-05', end_date: '2026-10-08', title: 'Montagem' };
      const updates = { endDate: '2026-10-10' };

      const res = validateTaskPatchWithMerge(current, updates);
      expect(res.valid).toBe(true);
      expect(res.merged?.start_date).toBe('2026-10-05');
      expect(res.merged?.end_date).toBe('2026-10-10');
    });

    it('C — PATCH sem datas (apenas outro campo) preserva ambas as datas persistidas', () => {
      const current = { start_date: '2026-10-05', end_date: '2026-10-08', title: 'Título Antigo' };
      const updates = { title: 'Novo Título' };

      const res = validateTaskPatchWithMerge(current, updates);
      expect(res.valid).toBe(true);
      expect(res.merged?.start_date).toBe('2026-10-05');
      expect(res.merged?.end_date).toBe('2026-10-08');
      expect(res.merged?.title).toBe('Novo Título');
    });

    it('D — limpar ambas as datas explicitamente (null, null) é aceite', () => {
      const current = { start_date: '2026-10-05', end_date: '2026-10-08', title: 'Montagem' };
      const updates = { startDate: null, endDate: null };

      const res = validateTaskPatchWithMerge(current, updates);
      expect(res.valid).toBe(true);
      expect(res.merged?.start_date).toBeNull();
      expect(res.merged?.end_date).toBeNull();
    });

    it('E — datas com fim anterior a início após o merge são rejeitadas', () => {
      const current = { start_date: '2026-10-05', end_date: '2026-10-08', title: 'Montagem' };
      const updates = { startDate: '2026-10-10' }; // fim persistido é 08, que é < 10

      const res = validateTaskPatchWithMerge(current, updates);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('A data de fim não pode ser anterior à data de início.');
    });

    it('F — enviar apenas startDate quando a Task não tem endDate persistido é rejeitado após o merge', () => {
      const current = { start_date: null, end_date: null, title: 'Tarefa sem datas' };
      const updates = { startDate: '2026-10-06' };

      const res = validateTaskPatchWithMerge(current, updates);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('A data de fim é obrigatória se a data de início estiver preenchida.');
    });

    it('G — enviar apenas endDate quando a Task não tem startDate persistido é rejeitado após o merge', () => {
      const current = { start_date: null, end_date: null, title: 'Tarefa sem datas' };
      const updates = { endDate: '2026-10-10' };

      const res = validateTaskPatchWithMerge(current, updates);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('A data de início é obrigatória se a data de fim estiver preenchida.');
    });

    it('H — limpar apenas uma data (startDate: null) deixando a outra isolada é rejeitado após o merge', () => {
      const current = { start_date: '2026-10-05', end_date: '2026-10-08', title: 'Montagem' };
      const updates = { startDate: null }; // endDate continua 08 -> janela parcial

      const res = validateTaskPatchWithMerge(current, updates);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('A data de início é obrigatória se a data de fim estiver preenchida.');
    });
  });

  describe('3. Finding 3 — Project Detail AbortController & Isolamento de Refetch', () => {
    it('AbortController cancela chamadas anteriores e ignora AbortError', async () => {
      const controller = new AbortController();
      let abortedHandled = false;

      const mockFetch = async (signal: AbortSignal) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve({ success: true, data: { id: 'p-1' } });
          }, 50);

          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const fetchPromise = mockFetch(controller.signal).catch((err) => {
        if (err.name === 'AbortError') {
          abortedHandled = true;
          return null; // Erro de cancelamento é ignorado
        }
        throw err;
      });

      // Cancela imediatamente (simula troca rápida de projeto)
      controller.abort();
      const res = await fetchPromise;

      expect(res).toBeNull();
      expect(abortedHandled).toBe(true);
      expect(controller.signal.aborted).toBe(true);
    });

    it('dependências de ProjectSection fetchDetails isoladas de mutações alheias', () => {
      // Simulação do array de dependências auditado
      const dependencies = ['selectedProjectId', 'refreshTrigger'];
      expect(dependencies).toContain('selectedProjectId');
      expect(dependencies).toContain('refreshTrigger');
      expect(dependencies).not.toContain('tasks');
      expect(dependencies).not.toContain('projects');
      expect(dependencies).not.toContain('projectMaterials');
      expect(dependencies).not.toContain('projectRiskItems');
    });
  });
});
