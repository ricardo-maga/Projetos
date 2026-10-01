import { describe, it, expect } from 'bun:test';
import { translateToCanonicalRoleIds, normalizeUUIDString } from '@/lib/utils';

// Helper mock matchId equivalent
const matchId = (idA: string | null | undefined, idB: string | null | undefined) => {
  if (!idA || !idB) return false;
  if (idA === idB) return true;
  return idA.replace(/[-]/g, '').toLowerCase() === idB.replace(/[-]/g, '').toLowerCase();
};

describe('FASE 75-B — Consolidação RBAC de elegibilidade de utilizadores', () => {

  describe('1. Mapping Legacy to Canonical', () => {
    it('deve traduzir legacy Project Manager para canonical PROJECT_MANAGER', () => {
      const result = translateToCanonicalRoleIds(['00000000-0000-0000-0000-000000000002']);
      expect(result).toEqual(['10000000-0000-0000-0000-000000000003']);
    });

    it('deve traduzir legacy Technician para canonical TECHNICIAN', () => {
      const result = translateToCanonicalRoleIds(['00000000-0000-0000-0000-000000000003']);
      expect(result).toEqual(['10000000-0000-0000-0000-000000000004']);
    });

    it('deve traduzir legacy Commercial para canonical COMMERCIAL', () => {
      const result = translateToCanonicalRoleIds(['52616954-8b59-4459-a00b-963f1b29a91c']);
      expect(result).toEqual(['10000000-0000-0000-0000-000000000005']);
    });

    it('deve manter IDs canónicos inalterados', () => {
      const canonicals = [
        '10000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000005'
      ];
      const result = translateToCanonicalRoleIds(canonicals);
      expect(result).toEqual(canonicals);
    });

    it('deve ignorar IDs desconhecidos (não devem produzir roles)', () => {
      const unknownId = 'abcdefff-0000-0000-0000-000000009999';
      const result = translateToCanonicalRoleIds([unknownId, '00000000-0000-0000-0000-000000000002']);
      expect(result).toEqual(['10000000-0000-0000-0000-000000000003']);
    });

    it('deve ignorar valores vazios, null, undefined', () => {
      const result = translateToCanonicalRoleIds([null, undefined, '', '   ', '00000000-0000-0000-0000-000000000002']);
      expect(result).toEqual(['10000000-0000-0000-0000-000000000003']);
    });

    it('deve eliminar duplicados', () => {
      const result = translateToCanonicalRoleIds([
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000003'
      ]);
      expect(result).toEqual(['10000000-0000-0000-0000-000000000003']);
    });
  });

  describe('2. User Eligibility Filtering & Fallback Removal', () => {
    // Simulated mock users array
    const users = [
      { id: 'u-1', name: 'João Silva PM', roleId: '10000000-0000-0000-0000-000000000003', deleted: false },
      { id: 'u-2', name: 'Maria Santos Tech', roleId: '10000000-0000-0000-0000-000000000004', deleted: false },
      { id: 'u-3', name: 'Pedro Costa Sales', roleId: '10000000-0000-0000-0000-000000000005', deleted: false },
      { id: 'u-4', name: 'Utilizador Eliminado PM', roleId: '10000000-0000-0000-0000-000000000003', deleted: true },
    ];

    it('deve filtrar Project Leader apresentando apenas PROJECT_MANAGER ativos', () => {
      const projGroupIds = ['00000000-0000-0000-0000-000000000002']; // legacy ID
      const canonicalRoleIds = translateToCanonicalRoleIds(projGroupIds);
      
      const filteredUsers = canonicalRoleIds.length > 0
        ? users.filter(u => canonicalRoleIds.some(cid => matchId(cid, u.roleId)) && !u.deleted)
        : [];

      expect(filteredUsers.map(u => u.id)).toEqual(['u-1']);
    });

    it('deve filtrar Técnico responsável apresentando apenas TECHNICIAN ativos', () => {
      const fieldGroupIds = ['00000000-0000-0000-0000-000000000003']; // legacy ID
      const canonicalRoleIds = translateToCanonicalRoleIds(fieldGroupIds);
      
      const filteredUsers = canonicalRoleIds.length > 0
        ? users.filter(u => canonicalRoleIds.some(cid => matchId(cid, u.roleId)) && !u.deleted)
        : [];

      expect(filteredUsers.map(u => u.id)).toEqual(['u-2']);
    });

    it('deve filtrar Gestor de vendas apresentando apenas COMMERCIAL ativos', () => {
      const salesGroupIds = ['52616954-8b59-4459-a00b-963f1b29a91c']; // legacy ID
      const canonicalRoleIds = translateToCanonicalRoleIds(salesGroupIds);
      
      const filteredUsers = canonicalRoleIds.length > 0
        ? users.filter(u => canonicalRoleIds.some(cid => matchId(cid, u.roleId)) && !u.deleted)
        : [];

      expect(filteredUsers.map(u => u.id)).toEqual(['u-3']);
    });

    it('remover fallback: se nenhum utilizador é elegível, a lista deve ficar vazia (e não apresentar todos os ativos)', () => {
      const invalidGroupIds = ['abcdefff-0000-0000-0000-000000009999']; // unknown ID
      const canonicalRoleIds = translateToCanonicalRoleIds(invalidGroupIds);
      
      const filteredUsers = canonicalRoleIds.length > 0
        ? users.filter(u => canonicalRoleIds.some(cid => matchId(cid, u.roleId)) && !u.deleted)
        : [];

      // Sem fallback permissivo, a lista deve estar vazia
      expect(filteredUsers.length).toBe(0);
    });
  });

  describe('3. Assigned User Value Preservation', () => {
    const users = [
      { id: 'u-active-pm', name: 'João Ativo PM', roleId: '10000000-0000-0000-0000-000000000003', deleted: false },
      { id: 'u-deleted-pm', name: 'António Antigo PM', roleId: '10000000-0000-0000-0000-000000000003', deleted: true },
    ];

    it('deve preservar o utilizador atualmente atribuído na lista de opções mesmo que esteja eliminado ou fora da configuração', () => {
      const projGroupIds = ['00000000-0000-0000-0000-000000000002']; // PMs
      const canonicalRoleIds = translateToCanonicalRoleIds(projGroupIds);
      
      // Filtro inicial rigoroso (apenas PMs ativos)
      let filteredUsers = canonicalRoleIds.length > 0
        ? users.filter(u => canonicalRoleIds.some(cid => matchId(cid, u.roleId)) && !u.deleted)
        : [];

      expect(filteredUsers.map(u => u.id)).toEqual(['u-active-pm']);

      // Se o utilizador atual é o António (que está eliminado, logo não elegível)
      const formProjManager = 'u-deleted-pm';
      
      if (formProjManager && !filteredUsers.some(u => matchId(u.id, formProjManager))) {
        const currentMgr = users.find(u => matchId(u.id, formProjManager));
        if (currentMgr) {
          filteredUsers.push(currentMgr);
        }
      }

      // Agora António (eliminado) deve estar presente na lista de opções para preservação
      expect(filteredUsers.map(u => u.id)).toContain('u-deleted-pm');
      expect(filteredUsers.length).toBe(2);
    });
  });

  describe('4. Partial Project Updates Schema (Zod Defaults Bug Fix)', () => {
    const { updateProjectSchema } = require('@/lib/validations/project');

    it('deve permitir atualizações parciais sem preencher campos ausentes com valores por defeito', () => {
      // Quando apenas o statusId é atualizado, o resto dos campos ausentes devem permanecer undefined
      const partialInput = {
        statusId: 'new-status-id',
        version: 5,
      };

      const parseResult = updateProjectSchema.safeParse(partialInput);
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const parsedData = parseResult.data;
        expect(parsedData.statusId).toBe('new-status-id');
        expect(parsedData.version).toBe(5);

        // Campos críticos ausentes NÃO devem ser preenchidos com string vazia ou outros defaults
        expect(parsedData.title).toBeUndefined();
        expect(parsedData.clientId).toBeUndefined();
        expect(parsedData.description).toBeUndefined();
        expect(parsedData.budgetValue).toBeUndefined();
        expect(parsedData.categoryIds).toBeUndefined();
        expect(parsedData.teamsInvolvedIds).toBeUndefined();
      }
    });
  });

  describe('5. Project Update Data Loss Protection Tests (Phase 76-B)', () => {
    // Current complete mock project state representing current database row
    const currentProject = {
      id: 'p-12345678-0000-0000-0000-000000000001',
      title: 'Projeto Principal',
      clientId: 'c-11111111-0000-0000-0000-000000000001',
      statusId: 'status-old',
      priorityId: 'prio-1111-0000-0000-0000-000000000001',
      riskId: 'risk-2222-0000-0000-0000-000000000001',
      projectManagerId: 'pm-3333-0000-0000-0000-000000000001',
      fieldManagerId: 'fm-4444-0000-0000-0000-000000000001',
      salesRepId: 'sales-5555-0000-0000-0000-000000000001',
      categoryIds: ['cat-1', 'cat-2'],
      teamsInvolvedIds: ['team-1', 'team-2'],
      partnersIds: ['partner-1'],
      budgetValue: 15000,
      version: 1,
    };

    // Simulated API route parse & clean helper
    const processApiPatch = (body: any) => {
      const { updateProjectSchema } = require('@/lib/validations/project');
      const parseResult = updateProjectSchema.safeParse(body);
      if (!parseResult.success) {
        throw new Error('Validation failed');
      }
      const updates = parseResult.data;

      // Logic identical to route.ts: mapping with possible undefined values
      const effectiveTeams = updates.teamsInvolvedIds !== undefined
        ? updates.teamsInvolvedIds
        : (updates.teamIds !== undefined ? updates.teamIds : undefined);

      const effectivePartners = updates.partnersIds !== undefined
        ? updates.partnersIds
        : (updates.partnerIds !== undefined ? updates.partnerIds : undefined);

      const effectiveCategories = updates.categoryIds !== undefined
        ? updates.categoryIds
        : (updates.categoryId ? [updates.categoryId] : undefined);

      const updateInput = {
        ...updates,
        statusId: updates.statusId !== undefined ? updates.statusId : undefined,
        categoryId: updates.categoryId !== undefined ? updates.categoryId : undefined,
        categoryIds: effectiveCategories,
        teamsInvolvedIds: effectiveTeams,
        partnersIds: effectivePartners,
        priorityId: updates.priorityId !== undefined ? updates.priorityId : undefined,
        riskId: updates.riskId !== undefined ? updates.riskId : undefined,
      };

      // Strip undefined fields (Bug B fix in route.ts)
      Object.keys(updateInput).forEach((key) => {
        if ((updateInput as any)[key] === undefined) {
          delete (updateInput as any)[key];
        }
      });

      return updateInput;
    };

    // Simulated Service merge helper (with double-defense sanitize)
    const mergeServiceUpdate = (current: any, input: any) => {
      // Sanitize input to eliminate any undefined fields (Bug B fix in projectService.ts)
      const sanitizedInput = { ...input };
      Object.keys(sanitizedInput).forEach((key) => {
        if (sanitizedInput[key] === undefined) {
          delete sanitizedInput[key];
        }
      });

      const merged = {
        ...current,
        ...sanitizedInput,
        categoryIds: sanitizedInput.categoryIds !== undefined ? sanitizedInput.categoryIds : current.categoryIds,
        teamsInvolvedIds: sanitizedInput.teamsInvolvedIds !== undefined ? sanitizedInput.teamsInvolvedIds : current.teamsInvolvedIds,
        partnersIds: sanitizedInput.partnersIds !== undefined ? sanitizedInput.partnersIds : current.partnersIds,
      };

      return merged;
    };

    it('Teste 1 — Status: PATCH alterando apenas statusId deve preservar todos os outros dados e relações', () => {
      const patchBody = { statusId: 'status-new', version: 1 };
      const apiInput = processApiPatch(patchBody);

      // Verify "priorityId" and "riskId" are completely absent, satisfying !("field" in updateInput)
      expect('statusId' in apiInput).toBe(true);
      expect('priorityId' in apiInput).toBe(false);
      expect('riskId' in apiInput).toBe(false);

      const mergedResult = mergeServiceUpdate(currentProject, apiInput);

      expect(mergedResult.statusId).toBe('status-new');
      // All other fields must be preserved exactly
      expect(mergedResult.title).toBe(currentProject.title);
      expect(mergedResult.clientId).toBe(currentProject.clientId);
      expect(mergedResult.priorityId).toBe(currentProject.priorityId);
      expect(mergedResult.riskId).toBe(currentProject.riskId);
      expect(mergedResult.categoryIds).toEqual(currentProject.categoryIds);
      expect(mergedResult.teamsInvolvedIds).toEqual(currentProject.teamsInvolvedIds);
      expect(mergedResult.partnersIds).toEqual(currentProject.partnersIds);
    });

    it('Teste 2 — Priority: PATCH alterando apenas priorityId deve preservar risco e outros dados', () => {
      const patchBody = { priorityId: 'prio-new-uuid', version: 1 };
      const apiInput = processApiPatch(patchBody);

      expect('priorityId' in apiInput).toBe(true);
      expect('riskId' in apiInput).toBe(false);

      const mergedResult = mergeServiceUpdate(currentProject, apiInput);

      expect(mergedResult.priorityId).toBe('prio-new-uuid');
      expect(mergedResult.riskId).toBe(currentProject.riskId); // Preserved
      expect(mergedResult.statusId).toBe(currentProject.statusId); // Preserved
    });

    it('Teste 3 — Risk: PATCH alterando apenas riskId deve preservar prioridade e outros dados', () => {
      const patchBody = { riskId: 'risk-new-uuid', version: 1 };
      const apiInput = processApiPatch(patchBody);

      expect('riskId' in apiInput).toBe(true);
      expect('priorityId' in apiInput).toBe(false);

      const mergedResult = mergeServiceUpdate(currentProject, apiInput);

      expect(mergedResult.riskId).toBe('risk-new-uuid');
      expect(mergedResult.priorityId).toBe(currentProject.priorityId); // Preserved
      expect(mergedResult.statusId).toBe(currentProject.statusId); // Preserved
    });

    it('Teste 4 — Cliente: PATCH alterando apenas clientId deve preservar todas as restantes relações', () => {
      const patchBody = { clientId: 'c-new-uuid', version: 1 };
      const apiInput = processApiPatch(patchBody);

      const mergedResult = mergeServiceUpdate(currentProject, apiInput);

      expect(mergedResult.clientId).toBe('c-new-uuid');
      expect(mergedResult.priorityId).toBe(currentProject.priorityId);
      expect(mergedResult.riskId).toBe(currentProject.riskId);
      expect(mergedResult.categoryIds).toEqual(currentProject.categoryIds);
    });

    it('Teste 5 — Explicit null: se o contrato permitir null, deve limpar a relação explicitamente', () => {
      // Algumas relações nullable podem aceitar null explícito (ex: projectManagerId)
      const patchBody = { projectManagerId: null, version: 1 };
      const apiInput = processApiPatch(patchBody);

      expect('projectManagerId' in apiInput).toBe(true);
      expect(apiInput.projectManagerId).toBeNull();

      const mergedResult = mergeServiceUpdate(currentProject, apiInput);
      expect(mergedResult.projectManagerId).toBeNull();
      expect(mergedResult.fieldManagerId).toBe(currentProject.fieldManagerId); // Preserved
    });

    it('Teste 6 — Explicit empty array: PATCH com categoryIds vazio deve remover as categorias', () => {
      const patchBody = { categoryIds: [], version: 1 };
      const apiInput = processApiPatch(patchBody);

      expect('categoryIds' in apiInput).toBe(true);
      expect(apiInput.categoryIds).toEqual([]);

      const mergedResult = mergeServiceUpdate(currentProject, apiInput);
      expect(mergedResult.categoryIds).toEqual([]);
      expect(mergedResult.teamsInvolvedIds).toEqual(currentProject.teamsInvolvedIds); // Preserved
    });

    it('Teste 7 — PATCH vazio: deve respeitar a versão e não alterar nenhum dado', () => {
      const patchBody = { version: 1 };
      const apiInput = processApiPatch(patchBody);

      const mergedResult = mergeServiceUpdate(currentProject, apiInput);
      expect(mergedResult).toEqual(currentProject);
    });

    it('Teste 8 — Save sem alterações: deve preservar todos os dados e relações', () => {
      // Simula o envio de todos os dados do formulário idênticos aos atuais
      const patchBody = {
        title: currentProject.title,
        clientId: currentProject.clientId,
        statusId: currentProject.statusId,
        priorityId: currentProject.priorityId,
        riskId: currentProject.riskId,
        categoryIds: currentProject.categoryIds,
        teamsInvolvedIds: currentProject.teamsInvolvedIds,
        partnersIds: currentProject.partnersIds,
        version: 1,
      };
      const apiInput = processApiPatch(patchBody);
      const mergedResult = mergeServiceUpdate(currentProject, apiInput);
      expect(mergedResult).toEqual(currentProject);
    });
  });
});

