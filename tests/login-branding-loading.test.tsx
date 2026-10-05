import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import AppLoadingScreen from '../components/AppLoadingScreen';

describe('Public login branding and M3 loading', () => {
  it('never lets the hook baseline mask database branding after a fresh login refresh', () => {
    const page = readFileSync('app/page.tsx', 'utf8');
    const expression = page.match(/const loginBranding = ([^;]+);/)?.[1];
    expect(expression).toBeDefined();
    // Execute the real selection expression with the hook's pre-auth baseline.
    const select = new Function('publicAppConfig', 'isInitialDataLoaded', 'state', `return ${expression}`);
    const baseline = { appConfig: { appName: 'Gestão de Projetos e Planeamento', logo: '' } };
    const databaseBranding = { appName: 'Soluções', appDescription: 'Gestão de projetos e planeamento técnico', logo: '/logo.svg' };
    expect(select(null, false, baseline)).toBeNull();
    expect(select(databaseBranding, false, baseline)).toBe(databaseBranding);
    expect(select(databaseBranding, true, baseline)).toBe(databaseBranding);
    expect(select(null, true, { appConfig: databaseBranding })).toBe(databaseBranding);
  });
  it('retains public branding independently from the authenticated ERP state', () => {
    const hook = readFileSync('hooks/useERP.ts', 'utf8');
    expect(hook).toContain('setPublicAppConfig(configData.appConfig)');
    expect(hook.indexOf('setPublicAppConfig(configData.appConfig)')).toBeLessThan(hook.indexOf('if (!prev) return null'));
    expect(hook).toContain('useState<ERPState | null>(null)');
    expect(hook).toContain('    publicAppConfig,');
    const page = readFileSync('app/page.tsx', 'utf8');
    expect(page).toContain('const loginBranding = publicAppConfig || (isInitialDataLoaded ? state?.appConfig : null)');
    for (const field of ['logoImagePath', 'logo', 'appName', 'appDescription']) expect(page).toContain(`loginBranding?.${field}`);
    expect(page).toContain("fetch('/api/auth/login'");
  });
  it('renders both existing loading branches through one accessible M3 component', () => {
    const page = readFileSync('app/page.tsx', 'utf8');
    for (const id of ['session-check-screen', 'loading-screen']) {
      expect(page).toContain(`<AppLoadingScreen id="${id}" />`);
      const html = renderToStaticMarkup(<AppLoadingScreen id={id} />);
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain('role="status"');
      expect(html).toContain('bg-surface');
      expect(html).toContain('bg-background');
      expect(html).toContain('motion-reduce:animate-none');
      expect(html).not.toContain('bg-blue');
      expect(html).not.toContain('text-xs');
    }
  });
});
