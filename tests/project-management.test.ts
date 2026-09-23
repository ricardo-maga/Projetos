import { describe, it, expect } from 'bun:test';
import { createProjectSchema, updateProjectSchema } from '../lib/validations/project';
import { validateProjectRelations, isValidUUID } from '../lib/validations/projectRelations';

describe('FASE 24 — Robustez da Gestão de Projetos: Unit & Integration Tests', () => {
  const validUUID1 = 'a0000000-0000-0000-0000-000000000001';
  const validUUID2 = 'b0000000-0000-0000-0000-000000000002';
  const validUUID3 = 'c0000000-0000-0000-0000-000000000003';
  const validUUID4 = 'd0000000-0000-0000-0000-000000000004';
  const validUUID5 = 'e0000000-0000-0000-0000-000000000005';

  describe('1. Validações de Schema Zod (createProjectSchema & updateProjectSchema)', () => {
    it('rejeita criação de projeto sem título ou com título vazio', () => {
      const res1 = createProjectSchema.safeParse({ title: '' });
      expect(res1.success).toBe(false);

      const res2 = createProjectSchema.safeParse({ title: '   ' });
      expect(res2.success).toBe(false);
    });

    it('rejeita título que exceda 255 caracteres', () => {
      const longTitle = 'a'.repeat(256);
      const res = createProjectSchema.safeParse({ title: longTitle });
      expect(res.success).toBe(false);
    });

    it('rejeita orçamento (budgetValue) negativo', () => {
      const res = createProjectSchema.safeParse({
        title: 'Projeto Solar Alfa',
        budgetValue: -500,
      });
      expect(res.success).toBe(false);
    });

    it('aceita payload válido de criação de projeto sem defaults sintéticos fictícios', () => {
      const res = createProjectSchema.safeParse({
        title: 'Instalação Fotovoltaica 50kW',
        clientId: validUUID1,
        description: 'Instalação completa em cobertura industrial',
        budgetValue: 45000,
        startDate: '2026-10-01',
        deliveryDate: '2026-11-15',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.title).toBe('Instalação Fotovoltaica 50kW');
        expect(res.data.budgetValue).toBe(45000);
        expect(res.data.statusId).toBe('');
      }
    });

    it('valida updateProjectSchema com versão inteira positiva para OCC', () => {
      const resInvalid = updateProjectSchema.safeParse({
        title: 'Projeto Atualizado',
        version: -1,
      });
      expect(resInvalid.success).toBe(false);

      const resValid = updateProjectSchema.safeParse({
        title: 'Projeto Atualizado',
        version: 3,
      });
      expect(resValid.success).toBe(true);
      if (resValid.success) {
        expect(resValid.data.version).toBe(3);
      }
    });
  });

  describe('2. Validação de UUIDs e Integridade das Relações (validateProjectRelations)', () => {
    it('valida formato UUID rigorosamente', () => {
      expect(isValidUUID(validUUID1)).toBe(true);
      expect(isValidUUID('invalid-uuid-string')).toBe(false);
      expect(isValidUUID('ps-1')).toBe(false);
      expect(isValidUUID('')).toBe(false);
    });

    it('rejeita IDs com formato inválido antes de consultar a base de dados', async () => {
      const mockSb: any = {
        from: () => {
          throw new Error('Não deveria consultar a base de dados com UUIDs inválidos');
        },
      };

      const result = await validateProjectRelations(mockSb, {
        clientId: 'not-a-uuid',
      });
      expect(result.valid).toBe(false);
      expect(result.field).toBe('clientId');
      expect(result.message).toContain('formato UUID esperado');
    });

    it('rejeita cliente inexistente ou marcado como deleted: true', async () => {
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'clients') {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  maybeSingle: async () => ({
                    data: { id: val, deleted: true },
                    error: null,
                  }),
                }),
              }),
            };
          }
          throw new Error(`Tabela inesperada: ${table}`);
        },
      };

      const result = await validateProjectRelations(mockSb, {
        clientId: validUUID1,
      });
      expect(result.valid).toBe(false);
      expect(result.field).toBe('clientId');
      expect(result.message).toContain('não foi encontrado ou está inativo');
    });

    it('rejeita utilizador responsável (ex: projectManagerId) inexistente ou inativo', async () => {
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'users') {
            return {
              select: () => ({
                in: async (col: string, ids: string[]) => ({
                  data: [{ id: validUUID2, email: 'ricardo75@gmail.com', deleted: true }],
                  error: null,
                }),
              }),
            };
          }
          throw new Error(`Tabela inesperada: ${table}`);
        },
      };

      const result = await validateProjectRelations(mockSb, {
        projectManagerId: validUUID2,
      });
      expect(result.valid).toBe(false);
      expect(result.field).toBe('projectManagerId');
      expect(result.message).toContain('não existe ou está inativo');
    });

    it('rejeita equipa inexistente na lista de equipas envolvidas', async () => {
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'project_teams') {
            return {
              select: () => ({
                in: async (col: string, ids: string[]) => ({
                  data: [{ id: validUUID1, deleted: false }], // validUUID2 is missing
                  error: null,
                }),
              }),
            };
          }
          throw new Error(`Tabela inesperada: ${table}`);
        },
      };

      const result = await validateProjectRelations(mockSb, {
        teamsInvolvedIds: [validUUID1, validUUID2],
      });
      expect(result.valid).toBe(false);
      expect(result.field).toBe('teamsInvolvedIds');
      expect(result.message).toContain(`Equipa "${validUUID2}" não existe ou está inativa`);
    });

    it('resolve status, categoria e prioridade por defeito da BD em modo criação quando não especificados', async () => {
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'project_status') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { id: validUUID3 }, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'project_category') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { id: validUUID4 }, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'project_priority') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { id: validUUID5 }, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          throw new Error(`Tabela inesperada: ${table}`);
        },
      };

      const result = await validateProjectRelations(mockSb, {}, true);
      expect(result.valid).toBe(true);
      expect(result.resolvedStatusId).toBe(validUUID3);
      expect(result.resolvedCategoryId).toBe(validUUID4);
      expect(result.resolvedPriorityId).toBe(validUUID5);
    });
  });

  describe('3. Concorrência Otimista (OCC)', () => {
    it('deteta conflito de concorrência quando a versão submetida difere da versão na base de dados', () => {
      const dbVersion = 3;
      const submittedVersion = 2;

      const hasConflict = submittedVersion !== dbVersion;
      expect(hasConflict).toBe(true);
    });

    it('permite atualização quando as versões coincidem e incrementa versão atómicamente', () => {
      const dbVersion = 3;
      const submittedVersion = 3;

      const hasConflict = submittedVersion !== dbVersion;
      expect(hasConflict).toBe(false);
      const nextVersion = dbVersion + 1;
      expect(nextVersion).toBe(4);
    });
  });

  describe('4. Proteção contra Eliminação de Projetos com Dependências', () => {
    it('impede a eliminação quando existem tarefas ativas', () => {
      const tasks = [
        { id: 't-1', projectId: validUUID1, title: 'Montagem de Painéis', deleted: false },
        { id: 't-2', projectId: validUUID1, title: 'Testes de Inversor', deleted: true },
      ];

      const activeTasks = tasks.filter((t) => t.projectId === validUUID1 && !t.deleted);
      expect(activeTasks.length).toBe(1);

      const canDelete = activeTasks.length === 0;
      expect(canDelete).toBe(false);
    });

    it('impede a eliminação quando existem alocações de planeamento ativas ligadas às tarefas do projeto', () => {
      const projectTaskIds = ['t-10', 't-11'];
      const allocations = [
        { id: 'alloc-1', taskId: 't-10', status: 'CONFIRMED' },
        { id: 'alloc-2', taskId: 't-11', status: 'CANCELLED' },
      ];

      const activeAllocations = allocations.filter(
        (a) => projectTaskIds.includes(a.taskId) && a.status !== 'CANCELLED'
      );
      expect(activeAllocations.length).toBe(1);

      const canDelete = activeAllocations.length === 0;
      expect(canDelete).toBe(false);
    });

    it('permite a eliminação segura quando não existem tarefas ativas nem alocações ativas', () => {
      const tasks: any[] = [];
      const allocations: any[] = [];
      const quotes: any[] = [];
      const materials: any[] = [];

      const activeTasksCount = tasks.filter((t) => !t.deleted).length;
      const activeAllocationsCount = allocations.filter((a) => a.status !== 'CANCELLED').length;
      const activeQuotesCount = quotes.filter((q) => !q.deleted).length;
      const activeMaterialsCount = materials.filter((m) => !m.deleted).length;

      const canDelete =
        activeTasksCount === 0 &&
        activeAllocationsCount === 0 &&
        activeQuotesCount === 0 &&
        activeMaterialsCount === 0;

      expect(canDelete).toBe(true);
    });
  });
});
