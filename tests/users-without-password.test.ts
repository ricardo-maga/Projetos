import { afterEach, expect, it, mock, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import * as server from '../lib/supabase/server';
import * as access from '../lib/auth/requireAuth';
import * as audit from '../lib/audit';
import { POST, PATCH } from '../app/api/users/route';
import { CANONICAL_ROLE_IDS } from '../lib/permissions';

const id = 'a1111111-1111-4111-8111-111111111111';
const authId = 'b2222222-2222-4222-8222-222222222222';
const input = { name: 'Pessoa de teste', email: 'person@example.invalid', type: 'Team' };
const password = 'Synthetic-test-password-123!';
const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => spies.splice(0).forEach(spy => spy.mockRestore()));

function setup(options: { linked?: boolean; deleted?: boolean; duplicate?: boolean; profileError?: boolean; roleError?: boolean; authError?: boolean; forbidden?: boolean } = {}) {
  const profile = { id, ...input, auth_user_id: options.linked ? authId : null, approved: true, deleted: !!options.deleted };
  const writes: Array<{ table: string; operation: string; values?: any; filters: Record<string, any> }> = [];
  const createUser = mock(async () => ({ data: { user: options.authError ? null : { id: authId } }, error: options.authError ? new Error('Auth conflict') : null }));
  const deleteUser = mock(async () => ({ error: null }));
  const updateUserById = mock(async () => ({ error: null }));
  const admin = {
    auth: { admin: { createUser, deleteUser, updateUserById, getUserById: mock(async () => ({ data: { user: { id: authId, email: input.email } }, error: null })) } },
    from(table: string) {
      let operation = 'select';
      let values: any;
      const filters: Record<string, any> = {};
      const result = () => {
        if (operation === 'select') return { data: filters.id === id ? profile : options.duplicate ? { id: 'existing' } : null, error: null };
        writes.push({ table, operation, values, filters });
        const failed = (table === 'users' && options.profileError && operation !== 'delete') || (table === 'user_roles' && options.roleError);
        return { data: failed ? null : { id }, error: failed ? new Error('Synthetic write failure') : null };
      };
      const chain: any = {
        select: () => chain,
        ilike: (key: string, value: any) => { filters[key] = value; return chain; },
        eq: (key: string, value: any) => { filters[key] = value; return chain; },
        neq: () => chain,
        upsert: (payload: any) => { operation = 'upsert'; values = payload; return chain; },
        update: (payload: any) => { operation = 'update'; values = payload; return chain; },
        delete: () => { operation = 'delete'; return chain; },
        maybeSingle: async () => result(), single: async () => result(),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      };
      return chain;
    },
  };
  spies.push(spyOn(access, 'requirePermission').mockImplementation(async () => {
    if (options.forbidden) throw new access.AuthError('Sem permissão.', 403);
    return { id: 'actor' } as any;
  }));
  spies.push(spyOn(server, 'createAdminClient').mockReturnValue(admin as any));
  spies.push(spyOn(audit, 'logAuditEvent').mockResolvedValue(undefined as any));
  return { writes, createUser, deleteUser, updateUserById };
}

function request(method: string, body: any) {
  return new NextRequest('http://localhost/api/users', { method, body: JSON.stringify(body) });
}

for (const empty of [undefined, '']) {
  it(`creates only a profile when password is ${empty === '' ? 'empty' : 'omitted'}`, async () => {
    const h = setup();
    const response = await POST(request('POST', { ...input, password: empty }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.writes[0].values).toMatchObject({ id: body.id, auth_user_id: null, approved: true, deleted: false, role_id: CANONICAL_ROLE_IDS.TECHNICIAN });
    expect(h.writes[1].values).toMatchObject({ user_id: body.id, role_id: CANONICAL_ROLE_IDS.TECHNICIAN });
  });

  it(`edits an unlinked profile without activating it when password is ${empty === '' ? 'empty' : 'omitted'}`, async () => {
    const h = setup();
    const updates = { ...input, id, name: 'Nome atualizado', email: 'changed@example.invalid', password: empty };
    expect((await PATCH(request('PATCH', updates))).status).toBe(200);
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.writes).toEqual([{ table: 'users', operation: 'update', values: { name: updates.name, email: updates.email, type: input.type }, filters: { id } }]);
  });
}

it('keeps creating linked accounts when a valid password is provided', async () => {
  const h = setup();
  expect((await POST(request('POST', { ...input, password }))).status).toBe(201);
  expect(h.createUser).toHaveBeenCalledTimes(1);
  expect(h.writes[0].values).toMatchObject({ id: authId, auth_user_id: authId });
});

it('activates the existing profile while preserving its ID and role assignments', async () => {
  const h = setup();
  expect((await PATCH(request('PATCH', { ...input, id, password }))).status).toBe(200);
  expect(h.createUser).toHaveBeenCalledTimes(1);
  expect(h.writes).toEqual([{ table: 'users', operation: 'update', values: { auth_user_id: authId, name: input.name, type: input.type }, filters: { id } }]);
});

it('leaves an existing linked account password unchanged when omitted', async () => {
  const h = setup({ linked: true });
  expect((await PATCH(request('PATCH', { ...input, id }))).status).toBe(200);
  expect(h.createUser).not.toHaveBeenCalled();
  expect(h.updateUserById.mock.calls[0][1]).not.toHaveProperty('password');
});

it('rejects short passwords instead of silently creating profiles without access', async () => {
  const h = setup();
  for (const method of ['POST', 'PATCH']) {
    const response = await (method === 'POST' ? POST : PATCH)(request(method, { ...input, id, password: 'short' }));
    expect(response.status).toBe(400);
  }
  expect(h.writes).toHaveLength(0);
  expect(h.createUser).not.toHaveBeenCalled();
});

it('rejects duplicate emails without creating or reactivating a profile', async () => {
  const h = setup({ duplicate: true });
  expect((await POST(request('POST', input))).status).toBe(409);
  expect((await PATCH(request('PATCH', { ...input, id }))).status).toBe(409);
  expect(h.writes).toHaveLength(0);
  expect(h.createUser).not.toHaveBeenCalled();
});

it('rejects edits and activation of deleted profiles', async () => {
  const h = setup({ deleted: true });
  for (const provided of [undefined, password]) expect((await PATCH(request('PATCH', { ...input, id, password: provided }))).status).toBe(404);
  expect(h.writes).toHaveLength(0);
  expect(h.createUser).not.toHaveBeenCalled();
});

it('requires users_write even when no password is provided', async () => {
  const h = setup({ forbidden: true });
  expect((await POST(request('POST', input))).status).toBe(403);
  expect((await PATCH(request('PATCH', { ...input, id }))).status).toBe(403);
  expect(h.writes).toHaveLength(0);
});

for (const failure of ['profileError', 'roleError'] as const) {
  it(`rolls back profile-only creation on ${failure} without calling Auth`, async () => {
    const h = setup({ [failure]: true });
    expect((await POST(request('POST', input))).status).toBe(500);
    expect(h.writes.at(-1)).toMatchObject({ table: 'users', operation: 'delete' });
    expect(h.deleteUser).not.toHaveBeenCalled();
    expect(h.createUser).not.toHaveBeenCalled();
  });
}

it('keeps an unlinked profile unchanged when activation encounters an Auth conflict', async () => {
  const h = setup({ authError: true });
  expect((await PATCH(request('PATCH', { ...input, id, password }))).status).toBe(409);
  expect(h.writes).toHaveLength(0);
});

it('rolls back a newly created Auth account if linking the existing profile fails', async () => {
  const h = setup({ profileError: true });
  expect((await PATCH(request('PATCH', { ...input, id, password }))).status).toBe(500);
  expect(h.deleteUser).toHaveBeenCalledWith(authId);
});
