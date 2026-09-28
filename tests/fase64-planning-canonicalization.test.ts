import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('FASE 64 — Auditoria e Canonicalização do Domínio Planning', () => {

  describe('1. Fonte de Verdade Persistente e Esquema PostgreSQL', () => {
    it('confirma a existência das tabelas de planeamento e colunas de controlo no esquema de migração', () => {
      const sql = readFileSync(
        join(process.cwd(), 'supabase/migrations/20260918000000_create_planning_tables.sql'),
        'utf-8'
      );

      expect(sql).toContain('CREATE TABLE planning_allocations');
      expect(sql).toContain('CREATE TABLE work_schedules');
      expect(sql).toContain('CREATE TABLE work_schedule_periods');
      expect(sql).toContain('CREATE TABLE resource_work_schedules');
      expect(sql).toContain('CREATE TABLE work_schedule_overrides');
      expect(sql).toContain('CREATE TABLE work_schedule_override_periods');
      expect(sql).toContain('CREATE TABLE non_project_work');
      expect(sql).toContain('CREATE TABLE resource_non_project_allocations');
      expect(sql).toContain('CREATE TABLE skills');
      expect(sql).toContain('CREATE TABLE resource_skills');
      expect(sql).toContain('CREATE TABLE task_skill_requirements');

      // Check versioning column for OCC
      expect(sql).toContain('version INTEGER DEFAULT 1');
      // Check RLS policies
      expect(sql).toContain('ALTER TABLE public.planning_allocations ENABLE ROW LEVEL SECURITY');
    });
  });

  describe('2. Isolamento em Relação ao Sync Legacy', () => {
    it('garante que o supabaseSync.ts não executa escritas no domínio Planning', () => {
      const syncCode = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');

      expect(syncCode).not.toContain('.from(\'planning_allocations\').upsert');
      expect(syncCode).not.toContain('.from(\'planning_allocations\').insert');
      expect(syncCode).not.toContain('.from(\'work_schedules\')');
      expect(syncCode).not.toContain('.from(\'non_project_work\')');
    });
  });

  describe('3. Rotas de API REST Dedicadas e Verificação de Permissões', () => {
    it('confirma a presença de verificação de permissões calendar_read e calendar_write nas rotas REST de planeamento', () => {
      const allocationsRoute = readFileSync(
        join(process.cwd(), 'app/api/v1/planning-allocations/route.ts'),
        'utf-8'
      );
      const allocationIdRoute = readFileSync(
        join(process.cwd(), 'app/api/v1/planning-allocations/[id]/route.ts'),
        'utf-8'
      );
      const capacityRoute = readFileSync(
        join(process.cwd(), 'app/api/v1/planning/capacity/route.ts'),
        'utf-8'
      );
      const availabilityRoute = readFileSync(
        join(process.cwd(), 'app/api/v1/planning/availability/route.ts'),
        'utf-8'
      );

      expect(allocationsRoute).toContain("requirePermission(req, 'calendar_read')");
      expect(allocationsRoute).toContain("requirePermission(req, 'calendar_write')");

      expect(allocationIdRoute).toContain("requirePermission(req, 'calendar_read')");
      expect(allocationIdRoute).toContain("requirePermission(req, 'calendar_write')");

      expect(capacityRoute).toContain("requirePermission(req, 'calendar_read')");
      expect(availabilityRoute).toContain("requirePermission(req, 'calendar_read')");
    });
  });

  describe('4. Regras de Negócio, OCC e Imutabilidade no Domínio Planning', () => {
    it('valida no código das APIs as regras de imutabilidade de CANCELLED e restrições de DELETE', () => {
      const allocationIdRoute = readFileSync(
        join(process.cwd(), 'app/api/v1/planning-allocations/[id]/route.ts'),
        'utf-8'
      );

      // Mutating CANCELLED blocked
      expect(allocationIdRoute).toContain("current.status === 'CANCELLED'");
      expect(allocationIdRoute).toContain('INVALID_STATUS_TRANSITION');

      // Optimistic concurrency control (version match and increment)
      expect(allocationIdRoute).toContain('updates.version !== currentVersion');
      expect(allocationIdRoute).toContain('currentVersion + 1');

      // DELETE restrictions: CONFIRMED and CANCELLED forbidden, DRAFT allowed
      expect(allocationIdRoute).toContain('CANNOT_DELETE_CONFIRMED');
      expect(allocationIdRoute).toContain('CANNOT_DELETE_CANCELLED');
    });
  });

  describe('5. Regras Globais de Segurança de Utilizador', () => {
    it('garante que o utilizador ricardo75@gmail.com é mantido permanentemente como eliminado', () => {
      const agentsMd = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(agentsMd).toContain('ricardo75@gmail.com');
      expect(agentsMd).toContain('deleted: true');
    });
  });

});
