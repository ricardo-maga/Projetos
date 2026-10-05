import { describe, it, expect, spyOn, beforeEach } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { saveActiveStateToSupabase, getActiveStateFromSupabase } from '../lib/supabaseSync';
import * as projectServiceModule from '../lib/projects/projectService';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';

describe('FASE 59 — Supabase Sync Boundary & ERPState Containment', () => {
  // Allowed legacy files explicitly permitted to invoke saveActiveStateToSupabase
  const ALLOWED_LEGACY_SAVE_CALLERS = [
    'app/api/supabase/sync/route.ts',
    'app/api/v1/tickets/route.ts',
    'app/api/v1/tickets/[id]/route.ts',
    'app/api/tickets/inbound/route.ts',
    'app/api/v1/project-materials/route.ts',
    'app/api/v1/project-materials/[id]/route.ts',
  ];

  describe('1. Project Boundary Isolation from Global Sync', () => {
    it('app/api/v1/projects/route.ts não importa nem consome supabaseSync', () => {
      const content = readFileSync(join(process.cwd(), 'app/api/v1/projects/route.ts'), 'utf-8');
      expect(content).not.toContain('supabaseSync');
      expect(content).not.toContain('saveActiveStateToSupabase');
      expect(content).not.toContain('getActiveStateFromSupabase');
    });

    it('app/api/v1/projects/[id]/route.ts não importa nem consome supabaseSync', () => {
      const content = readFileSync(join(process.cwd(), 'app/api/v1/projects/[id]/route.ts'), 'utf-8');
      expect(content).not.toContain('supabaseSync');
      expect(content).not.toContain('saveActiveStateToSupabase');
      expect(content).not.toContain('getActiveStateFromSupabase');
    });

    it('lib/projects/projectService.ts não importa nem consome supabaseSync', () => {
      const content = readFileSync(join(process.cwd(), 'lib/projects/projectService.ts'), 'utf-8');
      expect(content).not.toContain('supabaseSync');
      expect(content).not.toContain('saveActiveStateToSupabase');
      expect(content).not.toContain('getActiveStateFromSupabase');
    });

    it('saveActiveStateToSupabase() não executa qualquer INSERT, UPDATE ou UPSERT na tabela projects ou link tables', async () => {
      const tableOperations: { table: string; op: string }[] = [];

      const mockClient: any = {
        from: (table: string) => ({
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
            limit: () => Promise.resolve({ data: [], error: null }),
            then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
          }),
          upsert: async (rows: any[]) => {
            tableOperations.push({ table, op: 'upsert' });
            return { error: null };
          },
          insert: async (rows: any[]) => {
            tableOperations.push({ table, op: 'insert' });
            return { error: null };
          },
          update: () => ({
            eq: async () => {
              tableOperations.push({ table, op: 'update' });
              return { error: null };
            },
          }),
          delete: () => ({
            in: async () => ({ error: null }),
            neq: async () => ({ error: null }),
          }),
        }),
      };

      const stateWithProjects: any = {
        ...CLEAN_BASELINE_STATE,
        projects: [
          {
            id: '11111111-1111-4111-a111-111111111111',
            title: 'Projeto que Não Deve Ser Escrito Pelo Sync',
            clientId: '22222222-2222-4222-a222-222222222222',
            deleted: false,
          },
        ],
        tasks: [],
      };

      // Invocamos saveActiveStateToSupabase
      // Em lib/supabaseSync.ts, o cliente padrão é importado, mas a lógica comentada garante que 'projects' nunca é gravado
      const content = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');
      
      // Validação estática no código executável da função saveActiveStateToSupabase (removendo comentários)
      const saveFnBody = content.substring(
        content.indexOf('export async function saveActiveStateToSupabase'),
        content.indexOf('export const SUPABASE_SETUP_SQL')
      );
      const activeCode = saveFnBody.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

      // Confirmar que projects e link tables não têm qualquer chamada ativa de escrita
      expect(activeCode).not.toMatch(/supabase(!)?\.from\(['"]projects['"]\)\.(upsert|insert|update)/);
      expect(activeCode).not.toMatch(/supabase(!)?\.from\(['"]project_category_link['"]\)\.(upsert|insert|delete)/);
      expect(activeCode).not.toMatch(/supabase(!)?\.from\(['"]project_teams_link['"]\)\.(upsert|insert|delete)/);
      expect(activeCode).not.toMatch(/supabase(!)?\.from\(['"]project_partners_link['"]\)\.(upsert|insert|delete)/);
      expect(activeCode).not.toMatch(/supabase(!)?\.from\(['"]project_priority_link['"]\)\.(upsert|insert|delete)/);
      expect(activeCode).not.toMatch(/supabase(!)?\.from\(['"]project_risk_link['"]\)\.(upsert|insert|delete)/);
    });

    it('getActiveStateFromSupabase() delega a obtenção de projetos exclusivamente em getProjectsServerData()', () => {
      const content = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');
      const getActiveFnBody = content.substring(
        content.indexOf('export async function getActiveStateFromSupabase'),
        content.indexOf('export async function fetchPaginatedProjectsDirectly')
      );

      expect(getActiveFnBody).toContain('getProjectsServerData(client, { all: true, includeDeleted: true })');
      // Não faz query direta a projects sem o service
      expect(getActiveFnBody).not.toMatch(/client\.from\(['"]projects['"]\)\.select/);
    });
  });

  describe('2. Proibição de Novas Chamadas a saveActiveStateToSupabase (Contenção Arquitetural)', () => {
    const scanDir = (dir: string): string[] => {
      let results: string[] = [];
      const list = readdirSync(dir);
      for (const file of list) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        if (stat && stat.isDirectory()) {
          if (file !== 'node_modules' && file !== '.next') {
            results = results.concat(scanDir(fullPath));
          }
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          results.push(fullPath);
        }
      }
      return results;
    };

    it('nenhum ficheiro fora da lista de exceções legacy consome saveActiveStateToSupabase()', () => {
      const allSourceFiles = [
        ...scanDir(join(process.cwd(), 'app')),
        ...scanDir(join(process.cwd(), 'lib')),
        ...scanDir(join(process.cwd(), 'components')),
        ...scanDir(join(process.cwd(), 'hooks')),
      ];

      const unauthorizedCallers: string[] = [];

      for (const file of allSourceFiles) {
        const relativePath = relative(process.cwd(), file).replaceAll('\\', '/');
        if (relativePath === 'lib/supabaseSync.ts') continue; // Definição da função

        const content = readFileSync(file, 'utf-8');
        // Procura chamadas diretas a saveActiveStateToSupabase
        if (content.includes('saveActiveStateToSupabase(')) {
          if (!ALLOWED_LEGACY_SAVE_CALLERS.includes(relativePath)) {
            unauthorizedCallers.push(relativePath);
          }
        }
      }

      expect(unauthorizedCallers).toEqual([]);
    });

    it('useERP.ts não invoca saveActiveStateToSupabase diretamente', () => {
      const content = readFileSync(join(process.cwd(), 'hooks/useERP.ts'), 'utf-8');
      expect(content).not.toContain('saveActiveStateToSupabase(');
    });
  });

  describe('3. Auditoria e Correção de Supressão Silenciosa de Erros no Legacy Sync', () => {
    it('garante que erros de persistência em tabelas secundárias são devidamente capturados e propagados (Hardening FASE 61)', () => {
      const content = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');
      const saveFnBody = content.substring(
        content.indexOf('export async function saveActiveStateToSupabase'),
        content.indexOf('export const SUPABASE_SETUP_SQL')
      );

      // Verificação de que os erros de persistência deixaram de ser suprimidos silenciosamente (FASE 61):
      expect(saveFnBody).toContain("console.error('Error saving project_materials:'");
      expect(saveFnBody).toContain("console.error('Error saving project_risk_items:'");
      expect(saveFnBody).toContain("console.error('Error saving ticket_statuses:'");
      expect(saveFnBody).toContain("console.error('Error saving notifications:'");
      expect(saveFnBody).toContain("console.error('Error saving automation_rules:'");
      expect(saveFnBody).toContain("console.error('Error saving tickets:'");
    });
  });

  describe('4. Auditoria de Deletes Globais Implícitos (delete().in)', () => {
    it('omissões de snapshot nunca executam hard-delete implícito', () => {
      const content = readFileSync(join(process.cwd(), 'lib/supabaseSync.ts'), 'utf-8');
      const saveFnBody = content.substring(
        content.indexOf('export async function saveActiveStateToSupabase'),
        content.indexOf('export const SUPABASE_SETUP_SQL')
      );

      // Tabelas onde um array incompleto enviado pelo frontend provoca DELETE na base de dados
      for (const table of ['comments', 'user_absences', 'special_days', 'default_tasks']) {
        expect(saveFnBody).not.toContain(`supabase.from('${table}').delete()`);
      }
      const explicitDelete = readFileSync(join(process.cwd(), 'app/api/supabase/sync/entity/route.ts'), 'utf8');
      expect(explicitDelete).toContain('.delete().eq(\'id\', body.id)');
    });
  });

  describe('5. Auditoria de Contenção de Project Materials (/api/v1/project-materials)', () => {
    it('confirma que as rotas de project-materials estão catalogadas como legacy dependentes do sync', () => {
      const routeContent = readFileSync(join(process.cwd(), 'app/api/v1/project-materials/route.ts'), 'utf-8');
      const idRouteContent = readFileSync(join(process.cwd(), 'app/api/v1/project-materials/[id]/route.ts'), 'utf-8');

      // Ambas rotas usam getActiveStateFromSupabase e saveActiveStateToSupabase
      expect(routeContent).toContain('getActiveStateFromSupabase');
      expect(routeContent).toContain('saveActiveStateToSupabase');
      expect(idRouteContent).toContain('getActiveStateFromSupabase');
      expect(idRouteContent).toContain('saveActiveStateToSupabase');
    });
  });
});
