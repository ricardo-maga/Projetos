import { describe, it, expect } from 'bun:test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(url, key);

describe('FASE 78 — Auditoria e Hardening da Integridade Física Projects → Tasks → Planning', () => {

  describe('1. Verificação de Restrições e Foreign Keys Reais', () => {
    it('Tasks possui FK tasks_project_id_fkey apontando para projects.id', async () => {
      const nonExistentProjId = '00000000-0000-0000-0000-000000009999';
      const { error } = await sb.from('tasks').insert({
        id: crypto.randomUUID(),
        project_id: nonExistentProjId,
        task_title: 'FK probe test task',
        deleted: false,
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23503');
      expect(error?.message).toContain('tasks_project_id_fkey');
    });

    it('Planning Allocations possui FK planning_allocations_task_id_fkey com RESTRICT/NO ACTION na BD', async () => {
      // 1. Get an active user to satisfy FK for planning
      const { data: users } = await sb.from('users').select('id').eq('deleted', false).limit(1);
      const testUserId = users?.[0]?.id;
      expect(testUserId).toBeDefined();

      const dummyTaskId = crypto.randomUUID();
      const dummyAllocId = crypto.randomUUID();

      // Create test task
      await sb.from('tasks').insert({
        id: dummyTaskId,
        project_id: null,
        task_title: 'Test Task with Allocation',
        deleted: false,
      });

      // Create test allocation
      await sb.from('planning_allocations').insert({
        id: dummyAllocId,
        task_id: dummyTaskId,
        resource_id: testUserId,
        date: '2026-10-20',
        start_time: '10:00:00',
        end_time: '12:00:00',
        status: 'CONFIRMED',
      });

      // CENÁRIO B: Tentativa de DELETE físico direto de Task com allocations ativas
      const { error: deleteError } = await sb.from('tasks').delete().eq('id', dummyTaskId);
      
      expect(deleteError).not.toBeNull();
      expect(deleteError?.code).toBe('23503');
      expect(deleteError?.message).toContain('planning_allocations_task_id_fkey');

      // Cleanup
      await sb.from('planning_allocations').delete().eq('id', dummyAllocId);
      await sb.from('tasks').delete().eq('id', dummyTaskId);
    });
  });

  describe('2. Auditoria de Comportamento CASCADE: Project → Tasks', () => {
    it('Evidência empírica: na BD viva, tasks_project_id_fkey tem ON DELETE RESTRICT ativo e bloqueia DELETE físico', async () => {
      const dummyProjId = crypto.randomUUID();
      const dummyTaskId = crypto.randomUUID();

      // Inserir projeto dummy
      await sb.from('projects').insert({
        id: dummyProjId,
        project_title: 'Cascade Probe Project',
        deleted: false,
      });

      // Inserir tarefa associada ao projeto dummy
      await sb.from('tasks').insert({
        id: dummyTaskId,
        project_id: dummyProjId,
        task_title: 'Cascade Probe Task',
        deleted: false,
      });

      // CENÁRIO A: DELETE físico direto na tabela projects via SQL é rejeitado com foreign_key_violation (23503)
      const { error: delProjError } = await sb.from('projects').delete().eq('id', dummyProjId);
      expect(delProjError).not.toBeNull();
      expect(delProjError?.code).toBe('23503');
      expect(delProjError?.message).toContain('tasks_project_id_fkey');

      // Cleanup
      await sb.from('tasks').delete().eq('id', dummyTaskId);
      await sb.from('projects').delete().eq('id', dummyProjId);
    });

    it('A camada aplicacional (projectService.deleteProject) protege e BLOQUEIA eliminação de projeto com tarefas ativas', async () => {
      const { deleteProject } = await import('@/lib/projects/projectService');
      const dummyProjId = crypto.randomUUID();
      const dummyTaskId = crypto.randomUUID();

      // Inserir projeto e tarefa dummy
      await sb.from('projects').insert({
        id: dummyProjId,
        project_title: 'Protected Project',
        deleted: false,
      });

      await sb.from('tasks').insert({
        id: dummyTaskId,
        project_id: dummyProjId,
        task_title: 'Active Child Task',
        deleted: false,
      });

      // Tentar eliminar via serviço da aplicação
      let thrownError: any = null;
      try {
        await deleteProject(sb, dummyProjId);
      } catch (err: any) {
        thrownError = err;
      }

      // Aplicação bloqueia a eliminação com código 'dependency'
      expect(thrownError).not.toBeNull();
      expect(thrownError?.code).toBe('dependency');
      expect(thrownError?.message).toContain('1 tarefa(s) ativa(s)');

      // Cleanup
      await sb.from('tasks').delete().eq('id', dummyTaskId);
      await sb.from('projects').delete().eq('id', dummyProjId);
    });
  });

  describe('3. Auditoria de Integridade de Planning e Soft-Delete', () => {
    it('CENÁRIO C & D: DELETE de Project sem Tasks e DELETE de Task sem allocations', async () => {
      const dummyProjId = crypto.randomUUID();
      const dummyTaskId = crypto.randomUUID();

      // Projeto sem tarefas pode ser fisicamente eliminado na BD
      await sb.from('projects').insert({ id: dummyProjId, project_title: 'Empty Project', deleted: false });
      const { error: delP } = await sb.from('projects').delete().eq('id', dummyProjId);
      expect(delP).toBeNull();

      // Tarefa sem allocations pode ser fisicamente eliminada na BD
      await sb.from('tasks').insert({ id: dummyTaskId, project_title: null, task_title: 'Empty Task', deleted: false });
      const { error: delT } = await sb.from('tasks').delete().eq('id', dummyTaskId);
      expect(delT).toBeNull();
    });

    it('Regra Global de Utilizador: ricardo75@gmail.com permanece com deleted: true', async () => {
      const { data: user } = await sb.from('users').select('email, deleted').ilike('email', 'ricardo75@gmail.com').maybeSingle();
      if (user) {
        expect(user.deleted).toBe(true);
      }
    });
  });
});
