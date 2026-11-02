import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import * as authBoundary from '../lib/auth/requireAuth';
import * as dbBoundary from '../lib/supabase/requireServerDbClient';
import { GET } from '../app/api/supabase/config-runtime/route';

const request = () => new NextRequest('http://localhost/api/supabase/config-runtime');
const spies: Array<{ mockRestore: () => void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });

function setup(allowed: ReadonlySet<string>) {
  const tables: string[] = [];
  spies.push(spyOn(authBoundary, 'requireAuth').mockResolvedValue({ id: 'user-1', auth_user_id: 'auth-1' } as any));
  spies.push(spyOn(dbBoundary, 'requireServerDbClient').mockReturnValue({
    rpc: async (_name: string, args: { p_permission_code: string }) => ({ data: allowed.has(args.p_permission_code), error: null }),
    from: (table: string) => {
      tables.push(table);
      return { select: () => ({
        order: async () => ({ data: [], error: null }),
        eq: () => ({ order: async () => ({ data: [], error: null }) }),
      }) };
    },
  } as any));
  return tables;
}

describe('Config runtime read boundary', () => {
  it('rejects an anonymous request before opening the database', async () => {
    spies.push(spyOn(authBoundary, 'requireAuth').mockRejectedValue(new authBoundary.AuthError('Sessão inválida.', 401)));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect((await response.json()).data).toBeUndefined();
  });

  it('never reads automation rules with configuration permission alone', async () => {
    const tables = setup(new Set(['config:read']));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(tables).toEqual(['notification_settings']);
    expect((await response.json()).data.automationRules).toEqual([]);
  });

  it('rejects a user without either permission before reading a table', async () => {
    const tables = setup(new Set());
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(tables).toEqual([]);
  });

  it('reads automation rules without exposing notification settings to an admin lacking config access', async () => {
    const tables = setup(new Set(['admin:access']));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(tables).toEqual(['automation_rules']);
    expect((await response.json()).data.notificationSettings).toEqual([]);
  });
});
