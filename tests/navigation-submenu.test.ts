import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { canOpenSection } from '../lib/sectionCatalog';

const source = readFileSync('app/page.tsx', 'utf8');
const sectionCatalog = readFileSync('lib/sectionCatalog.ts', 'utf8');
const configSource = readFileSync('domains/administration/ui/ConfigSection.tsx', 'utf8');
const sectionExpression = source.match(/const isConfigSectionActive = ([\s\S]*?);/)![1];
const selectionExpression = source.match(/const isSubActive = ([\s\S]*?);/)![1];
const items = [{ id: 'clientes' }, { id: 'ausencias' }, { id: 'tarefas' }, { id: 'sistema' }];

describe('Configuration navigation regression', () => {
  it('keeps the requested primary and configuration menu order', () => {
    const primary = sectionCatalog.slice(sectionCatalog.indexOf('export const APP_SECTIONS'), sectionCatalog.indexOf('];', sectionCatalog.indexOf('export const APP_SECTIONS')));
    const ids = [...primary.matchAll(/id: '([^']+)'/g)].map(m => m[1]);
    expect(ids).toEqual(['dashboard', 'my-focus', 'projetos', 'tarefas', 'calendario', 'presales', 'mechanical-design', 'reports', 'configuracoes']);
    const submenu = source.match(/const configSubItems = \[([\s\S]*?)\];/)![1];
    expect([...submenu.matchAll(/id: '([^']+)'/g)].map(m => m[1])).toEqual([
      'aplicacao-menu', 'clientes', 'ausencias', 'utilizadores', 'notificacoes', 'sistema-menu',
    ]);
    expect(submenu).toContain('Configurações da aplicação');
    expect(submenu).toContain("label: 'Sistema'");
  });
  it('does not expand configuration for Tasks despite the template identifier', () => {
    const section = new Function('isActive', 'visibleConfigSubItems', 'activeTab', `return ${sectionExpression}`);
    expect(section(false, items, 'tarefas')).toBe(false);
    for (const tab of ['clientes', 'ausencias']) expect(section(false, items, tab)).toBe(true);
    expect(section(true, items, 'configuracoes')).toBe(true);
  });
  it('only selects templates while actually inside configuration', () => {
    const selected = new Function('sub', 'activeTab', 'activeConfigTab', `return ${selectionExpression}`);
    expect(selected({ id: 'tarefas' }, 'tarefas', 'tarefas')).toBe(false);
    expect(selected({ id: 'aplicacao-menu' }, 'configuracoes', 'tarefas')).toBe(true);
    expect(selected({ id: 'sistema-menu' }, 'configuracoes', 'importacao')).toBe(true);
    expect(selected({ id: 'aplicacao-menu' }, 'clientes', 'sistema')).toBe(false);
    expect(selected({ id: 'clientes' }, 'clientes', 'sistema')).toBe(true);
  });
  it('renders the requested tabs in the main configuration page', () => {
    const applicationTabs = configSource.match(/title="Configurações da aplicação" \/>([\s\S]*?)activeTabId=\{activeConfigTab\}/)![1];
    const systemTabs = configSource.match(/title="Sistema" \/>([\s\S]*?)activeTabId=\{activeConfigTab\}/)![1];
    expect([...applicationTabs.matchAll(/label: '([^']+)'/g)].map(m => m[1])).toEqual([
      'Aplicação', 'Campos auxiliares', 'Dias especiais', 'Tarefas modelo',
    ]);
    expect([...systemTabs.matchAll(/label: '([^']+)'/g)].map(m => m[1])).toEqual([
      'Registo de auditoria', 'Base de dados',
    ]);
  });
  it('recognizes nested pages without bypassing their existing permissions', () => {
    const viewer = { roleId: '10000000-0000-0000-0000-000000000004', permissions: ['clients.read', 'tasks.read'] };
    expect(canOpenSection(viewer, 'clientes')).toBe(true);
    expect(canOpenSection(viewer, 'tarefas')).toBe(true);
    expect(canOpenSection(viewer, 'ausencias')).toBe(false);
    expect(canOpenSection(viewer, 'configuracoes', 'auditoria')).toBe(false);
    expect(canOpenSection(viewer, 'unknown')).toBe(false);
  });
});
