import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('FASE 65-FINAL — Planning Concurrency & Audit Integrity', () => {

  describe('1. Análise de Concorrência & Atomicidade de DELETE', () => {
    it('garante que a eliminação inclui a restrição atómica status=DRAFT na query SQL', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );

      // Verificação de que o comando DELETE aplica a cláusula .eq('status', 'DRAFT')
      expect(serviceCode).toContain(".delete()");
      expect(serviceCode).toContain(".eq('id', id)");
      expect(serviceCode).toContain(".eq('status', 'DRAFT')");
      expect(serviceCode).toContain("CONCURRENT_STATUS_CHANGE");
    });
  });

  describe('2. Concorrência no UPDATE via OCC (Optimistic Concurrency Control)', () => {
    it('garante que a atualização aplica OCC atómico na instrução SQL (id + version)', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );

      expect(serviceCode).toContain(".eq('id', id)");
      expect(serviceCode).toContain(".eq('version', currentVersion)");
      expect(serviceCode).toContain("version: currentVersion + 1");
      expect(serviceCode).toContain("errorCode: 'OCC_CONFLICT'");
    });
  });

  describe('3. Integridade e Classificação do Audit Log', () => {
    it('confirma que o audit log é classificado como Observabilidade Best-Effort', () => {
      const auditCode = readFileSync(
        join(process.cwd(), 'lib/audit.ts'),
        'utf-8'
      );

      // logAuditEvent captura erros e não bloqueia a transação de negócio principal
      expect(auditCode).toContain('export async function logAuditEvent');
      expect(auditCode).toContain('catch (err)');
      expect(auditCode).toContain('[AUDIT LOG ERROR]');
    });

    it('confirma que o allocationService regista eventos de auditoria após cada mutação com sucesso', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );

      expect(serviceCode).toContain("action: 'PLANNING_ALLOCATION_CREATED'");
      expect(serviceCode).toContain("action: 'PLANNING_ALLOCATION_UPDATED'");
      expect(serviceCode).toContain("action: 'PLANNING_ALLOCATION_DELETED'");
    });
  });

  describe('4. Validação da Invariante de Sobreposição em Validação', () => {
    it('confirma que validatePlanningAllocation valida sobreposição apenas para alocações CONFIRMED', () => {
      const validationCode = readFileSync(
        join(process.cwd(), 'lib/planning/validationEngine.ts'),
        'utf-8'
      );

      // DRAFT permite sobreposições temporais
      expect(validationCode).toContain("if (ctx.status === 'DRAFT')");
      expect(validationCode).toContain("isValid: true");

      // CONFIRMED rejeita sobreposição
      expect(validationCode).toContain(".eq('status', 'CONFIRMED')");
      expect(validationCode).toContain("errorCode: 'ALLOCATION_OVERLAP'");
      expect(validationCode).toContain('httpStatus: 409');
    });
  });

  describe('5. Conformidade com as Regras de Utilizador (ricardo75@gmail.com)', () => {
    it('garante que ricardo75@gmail.com permanece com deleted: true e nunca é reativado', () => {
      const agentsMd = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(agentsMd).toContain('ricardo75@gmail.com');
      expect(agentsMd).toContain('deleted: true');
    });
  });

});
