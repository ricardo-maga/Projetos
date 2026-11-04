import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import * as authBoundary from '../lib/auth/requireAuth';
import * as dbBoundary from '../lib/supabase/requireServerDbClient';
import { GET } from '../app/api/supabase/default-tasks/route';

const request = () => new NextRequest('http://localhost/api/supabase/default-tasks');
const spies: Array<{ mockRestore: () => void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });

describe('Task template read boundary', () => {
  it('rejects an anonymous request before opening the database', async () => {
    spies.push(spyOn(authBoundary, 'requireAuth').mockRejectedValue(new authBoundary.AuthError('Sessão inválida.', 401)));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not query templates when config read permission is absent', async () => {
    const tables: string[] = [];
    spies.push(spyOn(authBoundary, 'requireAuth').mockResolvedValue({ id: 'user-1', auth_user_id: 'auth-1' } as any));
    spies.push(spyOn(dbBoundary, 'requireServerDbClient').mockReturnValue({
      rpc: async () => ({ data: false, error: null }),
      from: (table: string) => { tables.push(table); throw new Error('unexpected query'); },
    } as any));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(tables).toEqual([]);
  });

  it('maps authorized templates without exposing database columns', async () => {
    spies.push(spyOn(authBoundary, 'requireAuth').mockResolvedValue({ id: 'user-1', auth_user_id: 'auth-1' } as any));
    spies.push(spyOn(dbBoundary, 'requireServerDbClient').mockReturnValue({
      rpc: async () => ({ data: true, error: null }),
      from: (table: string) => {
        expect(table).toBe('default_tasks');
        return { select: async () => ({ data: [{ id: 'a', title: 'Preparar', description: null, estimated_hours: '2', task_type_id: 'type-1', internal_note: 'private' }], error: null }) };
      },
    } as any));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([{ id: 'a', title: 'Preparar', description: '', estimatedHours: '2', taskTypeId: 'type-1' }]);
  });
});
