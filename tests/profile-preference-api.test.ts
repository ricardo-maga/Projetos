import { afterEach, expect, it, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import { PATCH } from '../app/api/auth/profile/route';
import * as auth from '../lib/auth/requireAuth';
import * as audit from '../lib/audit';
import * as server from '../lib/supabase/server';

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => spies.splice(0).forEach(spy => spy.mockRestore()));

const profile = { id: 'synthetic-profile', auth_user_id: 'synthetic-auth', name: 'Nome inicial', preferredTheme: 'violet' };

function request(body: unknown) {
  return new NextRequest('http://localhost/api/auth/profile', { method: 'PATCH', body: JSON.stringify(body) });
}

function mockStore(row: { name: string; preferred_theme: string | null } | null, error: { code: string } | null = null) {
  const writes: unknown[] = [];
  const filters: unknown[] = [];
  const query = {
    update(values: unknown) { writes.push(values); return query; },
    eq(column: string, value: unknown) { filters.push(['eq', column, value]); return query; },
    neq(column: string, value: unknown) { filters.push(['neq', column, value]); return query; },
    select() { return query; },
    async maybeSingle() { return { data: row, error }; },
  };
  spies.push(spyOn(auth, 'requireAuth').mockResolvedValue(profile as auth.AuthenticatedUser));
  spies.push(spyOn(server, 'createAdminClient').mockReturnValue({ from: () => query } as any));
  spies.push(spyOn(audit, 'logAuditEvent').mockResolvedValue());
  return { writes, filters };
}

it('updates the signed-in profile with the supplied fields in one write', async () => {
  const store = mockStore({ name: 'Nome atualizado', preferred_theme: 'emerald' });
  const response = await PATCH(request({ name: ' Nome atualizado ', preferredTheme: 'emerald' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, profile: { name: 'Nome atualizado', preferredTheme: 'emerald' } });
  expect(store.writes).toEqual([{ name: 'Nome atualizado', preferred_theme: 'emerald' }]);
  expect(store.filters).toEqual([
    ['eq', 'id', profile.id], ['eq', 'auth_user_id', profile.auth_user_id],
    ['eq', 'approved', true], ['eq', 'deleted', false], ['neq', 'type', 'External'],
  ]);
});

it('clears a preference without replacing the name, and updates the name without replacing the preference', async () => {
  const store = mockStore({ name: 'Nome inicial', preferred_theme: null });
  const reset = await PATCH(request({ preferredTheme: null }));
  expect((await reset.json()).profile.preferredTheme).toBeNull();
  expect((await PATCH(request({ name: 'Novo nome' }))).status).toBe(200);
  expect(store.writes).toEqual([{ preferred_theme: null }, { name: 'Novo nome' }]);
});

it('rejects invalid choices, unknown fields and empty updates before writing', async () => {
  const store = mockStore(null);
  for (const body of [{ preferredTheme: 'default' }, { preferredTheme: 'unknown' }, { id: 'another-account', preferredTheme: 'rose' }, {}]) {
    expect((await PATCH(request(body))).status).toBe(400);
  }
  expect(store.writes).toEqual([]);
});

it('rejects the update if the profile is no longer eligible', async () => {
  mockStore(null);
  expect((await PATCH(request({ preferredTheme: 'blue' }))).status).toBe(403);
});

it('reports a conflict that can be retried after a concurrent profile operation', async () => {
  mockStore(null, { code: 'PT409' });
  expect((await PATCH(request({ preferredTheme: 'blue' }))).status).toBe(409);
});
