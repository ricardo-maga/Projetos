import { describe, it, expect } from 'bun:test';
import { parseStringArray } from '../lib/supabaseSync';

describe('FASE 45-B.1 — Testes de Normalização de Projects e Config no Global Sync', () => {
  describe('1. Normalização de parseStringArray e documents', () => {
    it('suporta string delimitada por vírgula', () => {
      const res = parseStringArray('doc1.pdf, doc2.pdf,  doc3.pdf ');
      expect(res).toEqual(['doc1.pdf', 'doc2.pdf', 'doc3.pdf']);
    });

    it('suporta string[] diretamente', () => {
      const res = parseStringArray(['doc1.pdf', 'doc2.pdf']);
      expect(res).toEqual(['doc1.pdf', 'doc2.pdf']);
    });

    it('suporta null sem lançar exceção', () => {
      const res = parseStringArray(null);
      expect(res).toEqual([]);
    });

    it('suporta undefined sem lançar exceção', () => {
      const res = parseStringArray(undefined);
      expect(res).toEqual([]);
    });
  });

  describe('2. Normalização de Category IDs (categoryIds, category_ids, categoryId, category_id)', () => {
    it('suporta categoryIds, category_ids, categoryId e category_id em simultâneo sem duplicados', () => {
      const obj = {
        categoryIds: ['cat-1', 'cat-2'],
        category_ids: 'cat-2, cat-3',
        categoryId: 'cat-4',
        category_id: 'cat-5',
      };

      const catIdsFromCol = Array.from(new Set([
        ...parseStringArray(obj.categoryIds),
        ...parseStringArray(obj.category_ids),
        ...(obj.categoryId ? [String(obj.categoryId)] : []),
        ...(obj.category_id ? [String(obj.category_id)] : []),
      ]));

      expect(catIdsFromCol).toEqual(['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5']);
    });
  });

  describe('3. Normalização de Teams (teamsInvolvedIds, teams_involved_ids, teams_ids)', () => {
    it('suporta teamsInvolvedIds (array/string) e teams_involved_ids', () => {
      const obj1 = { teamsInvolvedIds: ['team-1', 'team-2'] };
      const teams1 = parseStringArray(obj1.teamsInvolvedIds);
      expect(teams1).toEqual(['team-1', 'team-2']);

      const obj2 = { teams_involved_ids: 'team-3, team-4' };
      const teams2 = parseStringArray(obj2.teams_involved_ids);
      expect(teams2).toEqual(['team-3', 'team-4']);
    });
  });

  describe('4. Normalização de Partners (partnersIds, partners_ids)', () => {
    it('suporta partnersIds (array/string) e partners_ids', () => {
      const obj1 = { partnersIds: ['part-1'] };
      const partners1 = parseStringArray(obj1.partnersIds);
      expect(partners1).toEqual(['part-1']);

      const obj2 = { partners_ids: 'part-2, part-3' };
      const partners2 = parseStringArray(obj2.partners_ids);
      expect(partners2).toEqual(['part-2', 'part-3']);
    });
  });

  describe('5. Normalização de Group IDs', () => {
    it('suporta string, string[], null e undefined para Group IDs', () => {
      expect(parseStringArray('g-1, g-2')).toEqual(['g-1', 'g-2']);
      expect(parseStringArray(['g-1', 'g-2'])).toEqual(['g-1', 'g-2']);
      expect(parseStringArray(null)).toEqual([]);
      expect(parseStringArray(undefined)).toEqual([]);
    });
  });

  describe('6. Normalização de version (Server Authoritative)', () => {
    function normalizeVersion(pVersion: any): number | null | undefined {
      let versionVal: number | null | undefined = pVersion;
      if (typeof pVersion === 'string' && pVersion.trim() !== '' && !isNaN(Number(pVersion))) {
        versionVal = Number(pVersion);
      } else if (typeof pVersion === 'number') {
        versionVal = pVersion;
      }
      return versionVal;
    }

    it('mantém versão numérica exatamente como devolvida pelo servidor', () => {
      expect(normalizeVersion(5)).toBe(5);
    });

    it('converte versão em string numérica de forma determinística', () => {
      expect(normalizeVersion('5')).toBe(5);
    });

    it('NÃO transforma undefined em 1', () => {
      expect(normalizeVersion(undefined)).toBeUndefined();
      expect(normalizeVersion(undefined)).not.toBe(1);
    });

    it('NÃO transforma null em 1', () => {
      expect(normalizeVersion(null)).toBeNull();
      expect(normalizeVersion(null)).not.toBe(1);
    });
  });
});
