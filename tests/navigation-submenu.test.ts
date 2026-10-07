import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/page.tsx', 'utf8');
const sectionExpression = source.match(/const isConfigSectionActive = ([\s\S]*?);/)![1];
const selectionExpression = source.match(/const isSubActive = ([\s\S]*?);/)![1];
const allowedBlock = source.match(/const nestedPagePermission = ([\s\S]*?)\n      if \(!allowed\)/)![0].split('\n      if')[0];
const items = [{ id: 'clientes' }, { id: 'ausencias' }, { id: 'tarefas' }, { id: 'sistema' }];

describe('Configuration navigation regression', () => {
  it('keeps the requested primary and configuration menu order', () => {
    const primary = source.slice(source.indexOf('const tabs = React.useMemo'), source.indexOf('// Fallback if active tab'));
    const ids = [...primary.matchAll(/id: '([^']+)'/g)].map(m => m[1]).filter(id => id !== 'tickets');
    expect(ids).toEqual(['dashboard', 'meu-foco', 'projetos', 'tarefas', 'calendario', 'configuracoes']);
    const submenu = source.match(/const configSubItems = \[([\s\S]*?)\];/)![1];
    expect([...submenu.matchAll(/id: '([^']+)'/g)].map(m => m[1])).toEqual([
      'sistema', 'campos', 'dias', 'clientes', 'ausencias', 'tarefas', 'utilizadores',
      'notificacoes', 'automacoes', 'auditoria', 'importacao',
    ]);
    expect(submenu).toContain('Configurações da aplicação');
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
    expect(selected({ id: 'tarefas' }, 'configuracoes', 'tarefas')).toBe(true);
    expect(selected({ id: 'sistema' }, 'clientes', 'sistema')).toBe(false);
    expect(selected({ id: 'clientes' }, 'clientes', 'sistema')).toBe(true);
  });
  it('recognizes nested pages without bypassing their existing permissions', () => {
    const allowed = new Function('activeTab', 'tabs', 'hasPermission', 'currentUser', 'state',
      `${allowedBlock.replace(/ as any/g, '')}; return allowed;`);
    for (const tab of ['clientes', 'ausencias']) {
      const permission = tab === 'clientes' ? 'clients_read' : 'absences_read';
      expect(allowed(tab, [], (_user: unknown, p: string) => p === permission, {}, {})).toBe(true);
      expect(allowed(tab, [], () => false, {}, {})).toBe(false);
    }
    expect(allowed('tarefas', [{ id: 'tarefas' }], () => false, {}, {})).toBe(true);
    expect(allowed('unknown', [], () => true, {}, {})).toBe(false);
  });
});
