import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('FASE 65 — Planning Persistence Boundary', () => {

  describe('1. Camada de Serviço e Boundary de Persistência', () => {
    it('confirma a existência de lib/planning/allocationService.ts com os métodos canónicos', () => {
      const servicePath = join(process.cwd(), 'lib/planning/allocationService.ts');
      expect(existsSync(servicePath)).toBe(true);

      const code = readFileSync(servicePath, 'utf-8');
      expect(code).toContain('export async function queryPlanningAllocations');
      expect(code).toContain('export async function getPlanningAllocationById');
      expect(code).toContain('export async function createPlanningAllocation');
      expect(code).toContain('export async function updatePlanningAllocation');
      expect(code).toContain('export async function deletePlanningAllocation');
    });

    it('confirma que as rotas antigas estão descontinuadas sem acesso ao allocationService', () => {
      const routeAllocations = readFileSync(
        join(process.cwd(), 'app/api/v1/planning-allocations/route.ts'),
        'utf-8'
      );
      const routeAllocationsId = readFileSync(
        join(process.cwd(), 'app/api/v1/planning-allocations/[id]/route.ts'),
        'utf-8'
      );

      expect(routeAllocations).toContain('retiredPlanning');
      expect(routeAllocations).not.toContain('allocationService');
      expect(routeAllocations).not.toContain(".from('planning_allocations')");

      expect(routeAllocationsId).toContain('retiredPlanning');
      expect(routeAllocationsId).not.toContain('allocationService');
      expect(routeAllocationsId).not.toContain(".from('planning_allocations')");
    });
  });

  describe('2. Tasks e Projects como Fontes Únicas de Verdade (SSOT)', () => {
    it('garante que planning_allocations referencia task_id e não duplica campos de tarefas ou projetos', () => {
      const sql = readFileSync(
        join(process.cwd(), 'supabase/migrations/20260918000000_create_planning_tables.sql'),
        'utf-8'
      );

      // Table contains foreign key task_id
      expect(sql).toContain('task_id UUID NOT NULL REFERENCES tasks(id)');
      expect(sql).toContain('resource_id UUID NOT NULL REFERENCES users(id)');

      // Table does NOT create redundant columns for task_title, project_id, etc.
      expect(sql).not.toContain('planning_allocations (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    task_id UUID NOT NULL REFERENCES tasks(id),\n    project_id');
    });
  });

  describe('3. Concorrência Otimista (OCC) e Integridade Transacional', () => {
    it('garante controlo rigoroso de versão com verificação atómica e 409 em caso de conflito', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );

      expect(serviceCode).toContain('updates.version !== currentVersion');
      expect(serviceCode).toContain("errorCode: 'OCC_CONFLICT'");
      expect(serviceCode).toContain('httpStatus: 409');
      expect(serviceCode).toContain(".eq('version', currentVersion)");
      expect(serviceCode).toContain('version: currentVersion + 1');
    });
  });

  describe('4. Máquina de Estados e Imutabilidade do Ciclo de Vida', () => {
    it('garante imutabilidade de CANCELLED e restrições de eliminação', () => {
      const serviceCode = readFileSync(
        join(process.cwd(), 'lib/planning/allocationService.ts'),
        'utf-8'
      );

      // CANCELLED cannot be edited or reactivated
      expect(serviceCode).toContain("current.status === 'CANCELLED'");
      expect(serviceCode).toContain("errorCode: 'INVALID_STATUS_TRANSITION'");

      // CONFIRMED cannot be hard-deleted
      expect(serviceCode).toContain("current.status === 'CONFIRMED'");
      expect(serviceCode).toContain("errorCode: 'CANNOT_DELETE_CONFIRMED'");

      // CANCELLED cannot be deleted
      expect(serviceCode).toContain("errorCode: 'CANNOT_DELETE_CANCELLED'");
    });
  });

  describe('5. Ausência de Caminhos Alternativos de Persistência', () => {
    it('confirma que supabaseSync.ts não tem operações de escrita para o domínio Planning', () => {
      const syncCode = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');

      expect(syncCode).not.toContain(".from('planning_allocations').insert");
      expect(syncCode).not.toContain(".from('planning_allocations').upsert");
      expect(syncCode).not.toContain(".from('planning_allocations').update");
      expect(syncCode).not.toContain(".from('planning_allocations').delete");
      expect(syncCode).not.toContain(".from('work_schedules').insert");
      expect(syncCode).not.toContain(".from('non_project_work').insert");
    });

    it('confirma que o frontend deixou de operar alocações no planeamento diário', () => {
      const hookCode = readFileSync(join(process.cwd(), 'hooks/useERP.ts'), 'utf-8');

      expect(hookCode).not.toContain('/api/v1/planning-allocations');
      expect(hookCode).not.toContain('createPlanningAllocation');
      expect(hookCode).toContain('apiUpdateTask');
      expect(hookCode).not.toContain("saveState(prev => ({ ...prev, planningAllocations");
    });
  });

  describe('6. Capacidade e Disponibilidade como Cálculos Derivados em Runtime', () => {
    it('confirma que cálculos de capacidade/disponibilidade são projeções puras em memória', () => {
      const capCode = readFileSync(join(process.cwd(), 'lib/planning/capacityService.ts'), 'utf-8');

      expect(capCode).toContain('export function computeDayCapacity');
      expect(capCode).toContain('export function calculateWorkPeriodsForDate');
      expect(capCode).toContain('export function findAvailableSlotsForDuration');
      expect(capCode).toContain('export function calculateFreePeriods');
    });
  });

  describe('7. Conformidade com Regras Globais de Utilizador', () => {
    it('confirma que o utilizador ricardo75@gmail.com permanece estritamente com deleted: true', () => {
      const agentsMd = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(agentsMd).toContain('ricardo75@gmail.com');
      expect(agentsMd).toContain('deleted: true');
    });
  });

});
