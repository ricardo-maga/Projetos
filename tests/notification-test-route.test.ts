import { afterEach, expect, it, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import * as auth from '../lib/auth/requireAuth';
import * as database from '../lib/supabase/requireServerDbClient';
import { POST } from '../app/api/notifications/test/route';

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { spies.splice(0).forEach(spy => spy.mockRestore()); });
const request = (body: object) => new NextRequest('http://localhost/api/notifications/test', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
});
function setup(allowed = true) {
  const inserts: any[] = [];
  spies.push(spyOn(auth, 'requireAuth').mockResolvedValue({ id: 'tester', auth_user_id: 'auth-tester' } as any));
  spies.push(spyOn(database, 'requireServerDbClient').mockReturnValue({
    rpc: async () => ({ data: allowed, error: null }),
    from: () => ({ insert: async (value: any) => { inserts.push(value); return { error: null }; } }),
  } as any));
  return inserts;
}
it('sends server-owned sample content only to the authenticated tester', async () => {
  const inserts = setup();
  expect((await POST(request({ type: 'project_comment', user_id: 'another-user', message: 'injected' }))).status).toBe(200);
  expect(inserts).toHaveLength(1);
  expect(inserts[0].user_id).toBe('tester');
  expect(inserts[0].title).toStartWith('[Teste]');
  expect(inserts[0].message).not.toBe('injected');
});
it('rejects a tester without configuration write permission', async () => {
  const inserts = setup(false);
  expect((await POST(request({ type: 'project_closed' }))).status).toBe(403);
  expect(inserts).toHaveLength(0);
});
it('rejects unknown notification types including prototype keys', async () => {
  const inserts = setup();
  for (const type of ['unknown', 'toString', '__proto__'])
    expect((await POST(request({ type }))).status).toBe(400);
  expect(inserts).toHaveLength(0);
});
it('rejects an unauthenticated tester', async () => {
  spies.push(spyOn(auth, 'requireAuth').mockRejectedValue(new auth.AuthError()));
  expect((await POST(request({ type: 'project_comment' }))).status).toBe(401);
});
