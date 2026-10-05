import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cutoverMaintenanceResponse } from '../lib/cutoverMaintenance';

test('maintenance is inactive unless explicitly enabled', () => {
  for (const value of [undefined, '', 'false', '1']) expect(cutoverMaintenanceResponse('/api/auth/login', value)).toBeNull();
});
test('maintenance blocks every API including login, inbound and sync without cache', async () => {
  for (const path of ['/api/auth/login', '/api/tickets/inbound', '/api/supabase/sync', '/api/tasks']) {
    const response = cutoverMaintenanceResponse(path, 'true')!;
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('120');
    expect((await response.json()).success).toBe(false);
  }
});
test('maintenance page is accessible and never contains credentials or a bypass', async () => {
  const response = cutoverMaintenanceResponse('/', 'true')!;
  expect(response.status).toBe(503);
  expect(await response.text()).toContain('Manutenção em curso');
});
test('maintenance intercepts before the unchanged session handler', () => {
  const middleware = readFileSync(new URL('../middleware.ts',import.meta.url),'utf8');
  expect(middleware.indexOf('if (maintenance) return maintenance')).toBeLessThan(middleware.indexOf('return await updateSession(request)'));
});
