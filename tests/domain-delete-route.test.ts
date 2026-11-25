import { expect, test, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import { DELETE } from '../app/api/v1/absences/[id]/route';
import * as auth from '../lib/auth/requireAuth';
import * as boundary from '../lib/supabase/requireServerDbClient';
import * as limits from '../lib/rateLimit';

test('domain absence deletion constrains ownership inside the DELETE', async () => {
  const predicates: unknown[] = [];
  const query = { eq(key: string, value: unknown) { predicates.push([key, value]); return this; },
    select: async () => ({ data: [], error: null }) };
  const user = spyOn(auth, 'requireAuth').mockResolvedValue({ id: 'owner', auth_user_id: 'auth-owner' } as any);
  const rate = spyOn(limits, 'checkRateLimit').mockResolvedValue({ success: true } as any);
  const db = spyOn(boundary, 'requireServerDbClient').mockReturnValue({
    rpc: async (_: string, args: any) => ({ data: args.p_permission_code === 'absences:delete', error: null }),
    from: () => ({ delete: () => query }),
  } as any);
  try {
    const id = '92000000-0000-4000-8000-000000000001';
    const response = await DELETE(new NextRequest('http://localhost/api/v1/absences/' + id, { method: 'DELETE' }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(404);
    expect(predicates).toEqual([['id', id], ['user_id', 'owner']]);
  } finally { db.mockRestore(); rate.mockRestore(); user.mockRestore(); }
});
