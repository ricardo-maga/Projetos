import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import * as authBoundary from '../lib/auth/requireAuth';
import * as dbBoundary from '../lib/supabase/requireServerDbClient';
import * as rateBoundary from '../lib/rateLimit';
import { POST } from '../app/api/supabase/special-days/route';
import { PATCH } from '../app/api/supabase/special-days/[id]/route';

const spies: Array<{ mockRestore: () => void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
const id = '30b5b0f2-b19a-4c87-b0a2-672b8b103649';
const request = (method: string, body: unknown) => new NextRequest(`http://localhost/api/supabase/special-days/${id}`, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function authorized(db: object) {
  spies.push(spyOn(authBoundary, 'requireAuth').mockResolvedValue({ id: 'user-1', auth_user_id: 'auth-1' } as any));
  spies.push(spyOn(rateBoundary, 'checkRateLimit').mockResolvedValue({ success: true, remaining: 20, resetTime: 0 }));
  spies.push(spyOn(dbBoundary, 'requireServerDbClient').mockReturnValue(db as any));
}

describe('Special day write boundary', () => {
  it('rejects a write without config permission before touching the table', async () => {
    const tables: string[] = [];
    authorized({ rpc: async () => ({ data: false, error: null }), from: (table: string) => { tables.push(table); throw new Error('unexpected table'); } });
    const response = await POST(request('POST', { date: '2026-12-25', name: 'Natal' }));
    expect(response.status).toBe(403);
    expect(tables).toEqual([]);
  });

  it('rejects an invalid calendar date', async () => {
    const tables: string[] = [];
    authorized({ rpc: async () => ({ data: true, error: null }), from: (table: string) => { tables.push(table); throw new Error('unexpected table'); } });
    const response = await POST(request('POST', { date: '2026-02-30', name: 'Teste' }));
    expect(response.status).toBe(400);
    expect(tables).toEqual([]);
  });

  it('returns the authoritative row and version after create', async () => {
    let inserted: any;
    authorized({ rpc: async () => ({ data: true, error: null }), from: (table: string) => {
      expect(table).toBe('special_days');
      return { insert: (row: any) => { inserted = row; return { select: () => ({ single: async () => ({ data: { id, ...row, sync_version: 2 }, error: null }) }) }; } };
    } });
    const response = await POST(request('POST', { date: '2026-12-25', name: ' Natal ' }));
    expect(response.status).toBe(201);
    expect(inserted).toEqual({ date: '2026-12-25', name: 'Natal' });
    expect((await response.json()).data).toMatchObject({ id, syncVersion: 2 });
  });

  it('returns a conflict when another write changed the version', async () => {
    const predicates: Array<[string, unknown]> = [];
    let changes: any;
    authorized({ rpc: async () => ({ data: true, error: null }), from: () => ({
      update: (row: any) => { changes = row; const query: any = {
        eq: (column: string, value: unknown) => { predicates.push([column, value]); return query; },
        select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }; return query; },
    }) });
    const response = await PATCH(request('PATCH', { name: 'Novo nome', syncVersion: 3 }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(409);
    expect(changes).toEqual({ name: 'Novo nome' });
    expect(predicates).toEqual([['id', id], ['sync_version', 3]]);
  });
});
