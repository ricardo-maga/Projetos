import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import DatabaseStatusIndicator from '../components/DatabaseStatusIndicator';

const render = (props: Partial<React.ComponentProps<typeof DatabaseStatusIndicator>>) => renderToStaticMarkup(
  <DatabaseStatusIndicator status="synced" configured loaded {...props} />);
describe('SQL header status indicator', () => {
  it('shows static green only after a successful confirmed operation', () => {
    const html = render({});
    expect(html).toContain('data-database-status="active"'); expect(html).toContain('text-success-strong');
    expect(html).toContain('SQL: ativo'); expect(html).not.toContain('animate-spin');
    expect(html).toContain('não é uma monitorização permanente');
  });
  it('spins yellow for pending operations and announces initial reads separately', () => {
    const html = render({ status: 'syncing' });
    expect(html).toContain('data-database-status="busy"'); expect(html).toContain('text-warning animate-spin');
    expect(html).toContain('SQL: a gravar / sincronizar'); expect(html).toContain('motion-reduce:animate-none');
    expect(render({ status: 'syncing', loaded: false })).toContain('SQL: a carregar dados');
  });
  it('shows red without spinning on failure or missing configuration and escapes server errors', () => {
    for (const html of [render({ status: 'error', error: '<script>fail</script>' }), render({ configured: false })]) {
      expect(html).toContain('data-database-status="error"'); expect(html).toContain('text-error');
      expect(html).not.toContain('animate-spin'); expect(html).toContain('SQL: em erro');
      expect(html).not.toContain('<script>');
    }
  });
  it('does not claim an active database before confirmation and is accessible without click actions', () => {
    for (const html of [render({ status: 'idle' }), render({ loaded: false })]) {
      expect(html).toContain('data-database-status="idle"'); expect(html).not.toContain('text-success-strong');
    }
    const html = render({}); expect(html).toContain('role="status"'); expect(html).toContain('aria-live="polite"');
    expect(html).toContain('tabindex="0"'); expect(html).toContain('sr-only'); expect(html).not.toContain('<button');
  });
  it('removes sidebar metadata, consumes the existing hook state and preserves logout/error feedback', () => {
    const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('Nível de Acesso:'); expect(source).not.toContain('Sincronização:');
    expect(source).toContain('status={syncStatus} configured={isDbConfigured} loaded={isInitialDataLoaded} error={syncError}');
    expect(source.indexOf('<DatabaseStatusIndicator')).toBeLessThan(source.indexOf('id="user-profile"'));
    expect(source).toContain('aria-label="Terminar sessão"'); expect(source).toContain('clearClientSession();');
    expect(source).toContain("{syncStatus === 'error' && (");
  });
});
