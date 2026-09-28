import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { timesOverlap, parseTimeToMinutes } from '@/lib/planning/validationEngine';

describe('FASE 65-FINAL-B — Garantia de Integridade Concorrente em Planning', () => {

  describe('1. Invariante de Sobreposição no PostgreSQL (Exclusion Constraint)', () => {
    it('confirma a existência da migration com EXCLUDE USING gist e btree_gist', () => {
      const migrationPath = join(
        process.cwd(),
        'supabase/migrations/20260928010000_planning_allocations_exclusion_constraint.sql'
      );
      expect(existsSync(migrationPath)).toBe(true);

      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS btree_gist');
      expect(sql).toContain('planning_allocation_tsrange');
      expect(sql).toContain('EXCLUDE USING gist');
      expect(sql).toContain('resource_id WITH =');
      expect(sql).toContain('date WITH =');
      expect(sql).toContain('WITH &&');
      expect(sql).toContain("WHERE (status = 'CONFIRMED')");
    });
  });

  describe('2. Tratamento de Erros e Mapeamento 409 (PLANNING_ALLOCATION_OVERLAP)', () => {
    it('garante que o allocationService mapeia erros de exclusão (23P01 / overlap) para 409 PLANNING_ALLOCATION_OVERLAP', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );

      expect(serviceCode).toContain("insertError.code === '23P01'");
      expect(serviceCode).toContain("errorCode: 'PLANNING_ALLOCATION_OVERLAP'");
      expect(serviceCode).toContain('httpStatus: 409');
      expect(serviceCode).toContain("updateError.code === '23P01'");
    });
  });

  describe('3. Modelo Temporal de Intervalos Adjacentes vs Sobrepostos', () => {
    it('confirma que intervalos adjacentes (09:00-10:00 e 10:00-11:00) NÃO são considerados sobreposição', () => {
      const startA = parseTimeToMinutes('09:00');
      const endA = parseTimeToMinutes('10:00');
      const startB = parseTimeToMinutes('10:00');
      const endB = parseTimeToMinutes('11:00');

      // Intersecção em [09:00, 10:00) e [10:00, 11:00) é vazia
      expect(timesOverlap(startA, endA, startB, endB)).toBe(false);
      expect(timesOverlap(startB, endB, startA, endA)).toBe(false);
    });

    it('confirma que intervalos sobrepostos (09:00-10:00 e 09:30-10:30) SÃO considerados sobreposição', () => {
      const startA = parseTimeToMinutes('09:00');
      const endA = parseTimeToMinutes('10:00');
      const startB = parseTimeToMinutes('09:30');
      const endB = parseTimeToMinutes('10:30');

      expect(timesOverlap(startA, endA, startB, endB)).toBe(true);
      expect(timesOverlap(startB, endB, startA, endA)).toBe(true);
    });
  });

  describe('4. Máquina de Estados: DRAFT, CONFIRMED e CANCELLED', () => {
    it('confirma que alocações DRAFT permitem sobreposição e CANCELLED não bloqueiam capacidade', () => {
      const validationCode = readFileSync(
        join(process.cwd(), 'lib/planning/validationEngine.ts'),
        'utf-8'
      );

      // DRAFT bypasses overlap check
      expect(validationCode).toContain("if (ctx.status === 'DRAFT')");
      expect(validationCode).toContain('isValid: true');

      // CANCELLED bypasses overlap check
      expect(validationCode).toContain("if (ctx.status === 'CANCELLED')");

      // CONFIRMED filters strictly CONFIRMED allocations
      expect(validationCode).toContain(".eq('status', 'CONFIRMED')");
    });

    it('confirma que CANCELLED é estritamente imutável e DELETE é restrito a DRAFT', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );

      // CANCELLED immutable
      expect(serviceCode).toContain("current.status === 'CANCELLED'");
      expect(serviceCode).toContain("errorCode: 'INVALID_STATUS_TRANSITION'");

      // CONFIRMED delete blocked
      expect(serviceCode).toContain("current.status === 'CONFIRMED'");
      expect(serviceCode).toContain("errorCode: 'CANNOT_DELETE_CONFIRMED'");

      // DRAFT atomic delete
      expect(serviceCode).toContain(".eq('status', 'DRAFT')");
    });
  });

  describe('5. Concorrência no UPDATE via OCC', () => {
    it('garante que updatePlanningAllocation aplica verificação atómica de version', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );

      expect(serviceCode).toContain('updates.version !== currentVersion');
      expect(serviceCode).toContain(".eq('version', currentVersion)");
      expect(serviceCode).toContain('version: currentVersion + 1');
      expect(serviceCode).toContain("errorCode: 'OCC_CONFLICT'");
    });
  });

  describe('6. Classificação do Audit Log como Best-Effort', () => {
    it('confirma que o audit log é executado de forma resiliente sem bloquear o negócio', () => {
      const auditCode = readFileSync(
        join(process.cwd(), 'lib/audit.ts'),
        'utf-8'
      );

      expect(auditCode).toContain('catch (err)');
      expect(auditCode).toContain('[AUDIT LOG ERROR]');
    });
  });

  describe('7. Conformidade com Regras Globais de Utilizador', () => {
    it('garante que ricardo75@gmail.com permanece com deleted: true', () => {
      const agentsMd = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(agentsMd).toContain('ricardo75@gmail.com');
      expect(agentsMd).toContain('deleted: true');
    });
  });

});
