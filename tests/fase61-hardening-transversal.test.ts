import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('FASE 61 — Hardening Transversal Pós-Contenção do Supabase Sync', () => {

  describe('1. Eliminação da Supressão Silenciosa de Erros em saveActiveStateToSupabase', () => {
    it('propaga erros de persistência em project_materials e não devolve sucesso falso', () => {
      const content = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');
      const saveFn = content.substring(
        content.indexOf('export async function saveActiveStateToSupabase'),
        content.indexOf('export const SUPABASE_SETUP_SQL')
      );

      // Garante que resPM.error é verificado e retorna { success: false }
      expect(saveFn).toContain('const resPM = await supabase.from(\'project_materials\').upsert(pmUpserts);');
      expect(saveFn).toContain('if (resPM.error)');
      expect(saveFn).toContain('return { success: false, message: `Erro ao gravar materiais de projeto:');
    });

    it('propaga erros de persistência em project_risk_items e não devolve sucesso falso', () => {
      const content = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');
      const saveFn = content.substring(
        content.indexOf('export async function saveActiveStateToSupabase'),
        content.indexOf('export const SUPABASE_SETUP_SQL')
      );

      expect(saveFn).toContain('const resPRI = await supabase.from(\'project_risk_items\').upsert(priUpserts);');
      expect(saveFn).toContain('if (resPRI.error)');
      expect(saveFn).toContain('return { success: false, message: `Erro ao gravar itens de risco:');
    });

    it('propaga erros de persistência em ticket_statuses, notifications, automation_rules e tickets', () => {
      const content = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');
      const saveFn = content.substring(
        content.indexOf('export async function saveActiveStateToSupabase'),
        content.indexOf('export const SUPABASE_SETUP_SQL')
      );

      expect(saveFn).toContain('const resTS = await supabase.from(\'ticket_statuses\').upsert(mappedTS);');
      expect(saveFn).toContain('if (resTS.error)');
      expect(saveFn).toContain('return { success: false, message: `Erro ao gravar estados de tickets:');

      expect(saveFn).toContain('const resNotif = await supabase.from(\'notifications\').upsert(mappedNotifs);');
      expect(saveFn).toContain('if (resNotif.error)');
      expect(saveFn).toContain('return { success: false, message: `Erro ao gravar notificações:');

      expect(saveFn).toContain('const resRules = await supabase.from(\'automation_rules\').upsert(mappedRules);');
      expect(saveFn).toContain('if (resRules.error)');
      expect(saveFn).toContain('return { success: false, message: `Erro ao gravar regras de automação:');

      expect(saveFn).toContain('const resTickets = await supabase.from(\'tickets\').upsert(mappedTickets);');
      expect(saveFn).toContain('if (resTickets.error)');
      expect(saveFn).toContain('return { success: false, message: `Erro ao gravar tickets:');
    });
  });

  describe('2. Proteção e Salvaguarda contra Deletes Implícitos Massivos', () => {
    it('garante que deleção em massa só é tentada com verificação explícita de array não-vazio e sem queries destrutivas cegas', () => {
      const content = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');
      const saveFn = content.substring(
        content.indexOf('export async function saveActiveStateToSupabase'),
        content.indexOf('export const SUPABASE_SETUP_SQL')
      );

      // Não deve conter a expressão destrutiva cega '.delete().neq(...)'
      expect(saveFn).not.toContain('delete().neq(\'id\', \'00000000-0000-0000-0000-000000000000\')');

      // Deve exigir Array.isArray(...) e length > 0 antes de acionar deleções
      expect(saveFn).toContain('if (Array.isArray(state.comments) && state.comments.length > 0)');
      expect(saveFn).toContain('if (Array.isArray(state.userAbsences) && state.userAbsences.length > 0)');
      expect(saveFn).toContain('if (Array.isArray(state.specialDays) && state.specialDays.length > 0)');
      expect(saveFn).toContain('if (Array.isArray(state.defaultTasks) && state.defaultTasks.length > 0)');
    });
  });

  describe('3. Validação Transversal em Endpoints de API', () => {
    it('o endpoint /api/supabase/sync valida a autenticação e autorização explicitamente antes do processamento', () => {
      const routeContent = readFileSync(join(process.cwd(), 'app/api/supabase/sync/route.ts'), 'utf-8');
      expect(routeContent).toContain('const user = await requireAuth(req);');
      expect(routeContent).toContain('if (!isAdmin)');
    });

    it('as rotas REST de clientes e tarefas verificam erros de base de dados e não engolem excepções', () => {
      const clientRoute = readFileSync(join(process.cwd(), 'app/api/v1/clients/route.ts'), 'utf-8');
      expect(clientRoute).toContain('if (insertError)');

      const taskRoute = readFileSync(join(process.cwd(), 'app/api/v1/tasks/route.ts'), 'utf-8');
      expect(taskRoute).toContain('if (!createRes.success');
      const taskServiceContent = readFileSync(join(process.cwd(), 'lib/tasks/taskService.ts'), 'utf-8');
      expect(taskServiceContent).toContain('if (rpcError)');
    });
  });

  describe('4. Regras de Negócio e Segurança de Utilizadores', () => {
    it('mantém o utilizador ricardo75@gmail.com permanentemente marcado como eliminado', () => {
      const agentsRules = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8');
      expect(agentsRules).toContain('ricardo75@gmail.com');
      expect(agentsRules).toContain('deleted: true');
    });
  });

});
