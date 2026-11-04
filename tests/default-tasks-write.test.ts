import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import * as authBoundary from '../lib/auth/requireAuth';
import * as dbBoundary from '../lib/supabase/requireServerDbClient';
import * as rateBoundary from '../lib/rateLimit';
import { POST } from '../app/api/supabase/default-tasks/route';
import { PATCH } from '../app/api/supabase/default-tasks/[id]/route';

const spies: Array<{ mockRestore: () => void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
const id = '30b5b0f2-b19a-4c87-b0a2-672b8b103649';
const request = (method: string, body: unknown) => new NextRequest(`http://localhost/api/supabase/default-tasks/${id}`, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function authorized(db: object) {
  spies.push(spyOn(authBoundary, 'requireAuth').mockResolvedValue({ id: 'user-1', auth_user_id: 'auth-1' } as any));
  spies.push(spyOn(rateBoundary, 'checkRateLimit').mockResolvedValue({ success: true, remaining: 20, resetTime: 0 }));
  spies.push(spyOn(dbBoundary, 'requireServerDbClient').mockReturnValue(db as any));
}

describe('Task template write boundary', () => {
  it('rejects create without config write before touching the table', async () => {
    const tables: string[] = [];
    authorized({ rpc: async () => ({ data: false, error: null }), from: (table: string) => { tables.push(table); throw new Error('unexpected table'); } });
    const response = await POST(request('POST', { title: 'Montagem', estimatedHours: '08:00' }));
    expect(response.status).toBe(403);
    expect(tables).toEqual([]);
  });

  it('persists a task type and returns the database version after create', async () => {
    let inserted: any;
    authorized({ rpc: async () => ({ data: true, error: null }), from: (table: string) => {
      expect(table).toBe('default_tasks');
      return { insert: (row: any) => { inserted = row; return { select: () => ({ single: async () => ({ data: { id, ...row, sync_version: 2 }, error: null }) }) }; } };
    } });
    const response = await POST(request('POST', { title: ' Montagem ', description: '', estimatedHours: '08:00', taskTypeId: id }));
    expect(response.status).toBe(201);
    expect(inserted).toEqual({ title: 'Montagem', description: null, estimated_hours: '08:00', task_type_id: id });
    expect((await response.json()).data).toMatchObject({ id, taskTypeId: id, syncVersion: 2 });
  });

  it('returns a conflict for a stale version and clears the task type explicitly', async () => {
    const predicates: Array<[string, unknown]> = [];
    let changes: any;
    authorized({ rpc: async () => ({ data: true, error: null }), from: () => ({
      update: (row: any) => { changes = row; const query: any = {
        eq: (column: string, value: unknown) => { predicates.push([column, value]); return query; },
        select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }; return query; },
    }) });
    const response = await PATCH(request('PATCH', { taskTypeId: null, syncVersion: 3 }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(409);
    expect(changes).toEqual({ task_type_id: null });
    expect(predicates).toEqual([['id', id], ['sync_version', 3]]);
  });
});
