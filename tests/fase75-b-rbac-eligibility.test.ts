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
});
