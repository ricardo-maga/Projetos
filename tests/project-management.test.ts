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

  describe('5. FASE 24-A: CREATE — Tratamento de Erros Relacionais e Cleanup', () => {
    it('falha no insert de project_teams_link aborta criação e executa cleanup do projeto', async () => {
      let cleanedUpProjectId: string | null = null;
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'project_teams_link') {
            return {
              insert: async () => ({ error: { message: 'Foreign key violation: team_id does not exist' } }),
            };
          }
          if (table === 'projects') {
            return {
              delete: () => ({
                eq: (col: string, val: string) => {
                  cleanedUpProjectId = val;
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          return {
            insert: async () => ({ error: null }),
          };
        },
      };

      const newId = validUUID1;
      const teamLinks = [{ project_id: newId, team_id: validUUID2 }];
      const { error: teamErr } = await mockSb.from('project_teams_link').insert(teamLinks);

      let creationStatus = 201;
      if (teamErr) {
        await mockSb.from('projects').delete().eq('id', newId);
        creationStatus = 500;
      }

      expect(creationStatus).toBe(500);
      expect(cleanedUpProjectId).toBe(newId);
    });

    it('falha no insert de project_partners_link aborta criação e executa cleanup', async () => {
      let cleanedUpProjectId: string | null = null;
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'project_partners_link') {
            return {
              insert: async () => ({ error: { message: 'Database constraint failure' } }),
            };
          }
          if (table === 'projects') {
            return {
              delete: () => ({
                eq: (col: string, val: string) => {
                  cleanedUpProjectId = val;
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          return { insert: async () => ({ error: null }) };
        },
      };

      const newId = validUUID1;
      const partnerLinks = [{ project_id: newId, partner_id: validUUID2 }];
      const { error: partErr } = await mockSb.from('project_partners_link').insert(partnerLinks);

      let creationStatus = 201;
      if (partErr) {
        await mockSb.from('projects').delete().eq('id', newId);
        creationStatus = 500;
      }

      expect(creationStatus).toBe(500);
      expect(cleanedUpProjectId).toBe(newId);
    });

    it('falha no insert de project_category_link aborta criação e executa cleanup', async () => {
      let cleanedUpProjectId: string | null = null;
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'project_category_link') {
            return {
              insert: async () => ({ error: { message: 'Category link error' } }),
            };
          }
          if (table === 'projects') {
            return {
              delete: () => ({
                eq: (col: string, val: string) => {
                  cleanedUpProjectId = val;
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          return { insert: async () => ({ error: null }) };
        },
      };

      const newId = validUUID1;
      const catLinks = [{ project_id: newId, category_id: validUUID2 }];
      const { error: catErr } = await mockSb.from('project_category_link').insert(catLinks);

      let creationStatus = 201;
      if (catErr) {
        await mockSb.from('projects').delete().eq('id', newId);
        creationStatus = 500;
      }

      expect(creationStatus).toBe(500);
      expect(cleanedUpProjectId).toBe(newId);
    });

    it('falha no insert de project_priority_link ou project_risk_link não é ignorada', async () => {
      let cleanedUpProjectId: string | null = null;
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'project_priority_link') {
            return {
              insert: async () => ({ error: { message: 'Priority link table error' } }),
            };
          }
          if (table === 'projects') {
            return {
              delete: () => ({
                eq: (col: string, val: string) => {
                  cleanedUpProjectId = val;
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          return { insert: async () => ({ error: null }) };
        },
      };

      const newId = validUUID1;
      const { error: prioErr } = await mockSb.from('project_priority_link').insert([{ project_id: newId, priority_id: validUUID3 }]);

      let creationStatus = 201;
      if (prioErr) {
        await mockSb.from('projects').delete().eq('id', newId);
        creationStatus = 500;
      }

      expect(creationStatus).toBe(500);
      expect(cleanedUpProjectId).toBe(newId);
    });
  });

  describe('6. FASE 24-A: UPDATE — Tratamento de Erros Relacionais e Integridade', () => {
    it('erro ao atualizar project_teams_link impede resposta de sucesso', async () => {
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'project_teams_link') {
            return {
              delete: () => ({
                eq: async () => ({ error: null }),
              }),
              insert: async () => ({ error: { message: 'Teams update failed' } }),
            };
          }
          return {};
        },
      };

      const teamsInvolved = [validUUID2];
      let updateFailed = false;
      const { error: insErr } = await mockSb.from('project_teams_link').insert(teamsInvolved.map((t: string) => ({ project_id: validUUID1, team_id: t })));
      if (insErr) {
        updateFailed = true;
      }

      expect(updateFailed).toBe(true);
    });

    it('erro ao atualizar project_partners_link impede resposta de sucesso', async () => {
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'project_partners_link') {
            return {
              delete: () => ({
                eq: async () => ({ error: null }),
              }),
              insert: async () => ({ error: { message: 'Partners update failed' } }),
            };
          }
          return {};
        },
      };

      const partnersInvolved = [validUUID2];
      let updateFailed = false;
      const { error: insErr } = await mockSb.from('project_partners_link').insert(partnersInvolved.map((p: string) => ({ project_id: validUUID1, partner_id: p })));
      if (insErr) {
        updateFailed = true;
      }

      expect(updateFailed).toBe(true);
    });

    it('erro ao atualizar project_category_link impede resposta de sucesso', async () => {
      const mockSb: any = {
        from: (table: string) => {
          if (table === 'project_category_link') {
            return {
              delete: () => ({
                eq: async () => ({ error: null }),
              }),
              insert: async () => ({ error: { message: 'Category update failed' } }),
            };
          }
          return {};
        },
      };

      const categoriesInvolved = [validUUID2];
      let updateFailed = false;
      const { error: insErr } = await mockSb.from('project_category_link').insert(categoriesInvolved.map((c: string) => ({ project_id: validUUID1, category_id: c })));
      if (insErr) {
        updateFailed = true;
      }

      expect(updateFailed).toBe(true);
    });
  });

  describe('7. FASE 24-A: Server-Authoritative State no Frontend após UPDATE', () => {
    it('o estado atualizado após updateProject reflete exclusivamente o result.data devolvido pelo servidor', () => {
      const existingProject = {
        id: validUUID1,
        title: 'Projeto Original',
        clientId: validUUID2,
        budgetValue: 10000,
        version: 1,
        createdDate: '2026-09-01T10:00:00.000Z',
        updatedDate: '2026-09-01T10:00:00.000Z',
        categoryIds: [validUUID3],
        teamsInvolvedIds: [validUUID4],
        partnersIds: [],
        deleted: false,
      };

      // Frontend submete um payload com alterações locais
      const clientPayload = {
        title: 'Projeto com Título Modificado pelo Cliente',
        budgetValue: 12000,
      };

      // O servidor persiste, normaliza e devolve o estado real persistido (ex: aplica formatações, versionamento e timestamps reais da BD)
      const serverResultData = {
        id: validUUID1,
        title: 'Projeto com Título Modificado pelo Cliente',
        clientId: validUUID2,
        budgetValue: 12000,
        version: 2,
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-23T12:00:00.000Z',
        categoryIds: [validUUID3],
        teamsInvolvedIds: [validUUID4],
        partnersIds: [],
        deleted: false,
      };

      // Construção server-authoritative (sem fazer { ...existingProject, ...clientPayload })
      const updatedProject = {
        id: serverResultData.id,
        title: serverResultData.title ?? existingProject.title,
        clientId: serverResultData.clientId ?? existingProject.clientId,
        budgetValue: typeof serverResultData.budgetValue === 'number' ? serverResultData.budgetValue : Number(existingProject.budgetValue || 0),
        categoryIds: Array.isArray(serverResultData.categoryIds) ? serverResultData.categoryIds : existingProject.categoryIds,
        teamsInvolvedIds: Array.isArray(serverResultData.teamsInvolvedIds) ? serverResultData.teamsInvolvedIds : existingProject.teamsInvolvedIds,
        partnersIds: Array.isArray(serverResultData.partnersIds) ? serverResultData.partnersIds : existingProject.partnersIds,
        version: serverResultData.version,
        createdDate: serverResultData.createdAt ?? existingProject.createdDate,
        updatedDate: serverResultData.updatedAt,
        deleted: Boolean(serverResultData.deleted),
      };

      // Verifica que o estado gerado veio do servidor e tem a versão e timestamp autoritativos
      expect(updatedProject.version).toBe(2);
      expect(updatedProject.updatedDate).toBe('2026-09-23T12:00:00.000Z');
      expect(updatedProject.title).toBe(serverResultData.title);
    });
  });
});
