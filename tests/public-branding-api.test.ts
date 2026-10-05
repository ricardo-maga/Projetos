import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadModule(path: string, dependencies: Record<string, unknown>, env = {}) {
  const source = readFileSync(path, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const testModule = { exports: {} as any };
  new Function('require', 'module', 'exports', 'process', code)(
    (name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; },
    testModule, testModule.exports, { env },
  );
  return testModule.exports;
}

describe('Public branding with modern Supabase keys', () => {
  it('prefers the server-only secret key and preserves legacy compatibility', () => {
    for (const [env, expected] of [
      [{ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_SERVICE_ROLE_KEY: 'legacy-test' }, 'sb_secret_test'],
      [{ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'legacy-test' }, 'legacy-test'],
    ] as const) {
      let receivedKey = '';
      const server = loadModule('lib/supabase/server.ts', {
        '@supabase/ssr': {}, 'next/headers': {},
        '@supabase/supabase-js': { createClient: (_url: string, key: string) => { receivedKey = key; return {}; } },
      }, env);
      expect(server.createAdminClient()).not.toBeNull();
      expect(receivedKey).toBe(expected);
    }
  });

  it('reads database branding without browser credentials and only returns public fields', async () => {
    const row = { app_name: 'Soluções', app_description: 'Descrição da base de dados', logo_image_path: '/brand.svg', secret: 'not-public' };
    const client = { from: () => ({ select: () => ({ limit: async () => ({ data: [row], error: null }) }) }) };
    const route = loadModule('app/api/supabase/config/route.ts', {
      'next/server': { NextResponse: { json: (body: unknown, init: unknown) => ({ body, init }) } },
      '@/lib/supabaseClient': { isSupabaseConfigured: false, supabase: null },
      '@/lib/supabase/server': { createAdminClient: () => client },
    });
    for (let refresh = 0; refresh < 2; refresh++) {
      const response = await route.GET();
      expect(response.body.appConfig.appName).toBe(row.app_name);
      expect(response.body.appConfig.appDescription).toBe(row.app_description);
      expect(response.body.appConfig.logo).toBe(row.logo_image_path);
      expect(JSON.stringify(response)).not.toContain('not-public');
      expect(response.init.headers['Cache-Control']).toBe('no-store');
    }
  });

  it('does not manufacture default branding when no database client is available', async () => {
    const route = loadModule('app/api/supabase/config/route.ts', {
      'next/server': { NextResponse: { json: (body: unknown, init: unknown) => ({ body, init }) } },
      '@/lib/supabaseClient': { isSupabaseConfigured: false, supabase: null },
      '@/lib/supabase/server': { createAdminClient: () => null },
    });
    const response = await route.GET();
    expect(response.body.appConfig).toBeNull();
    expect(response.init.status).toBe(503);
  });
});
