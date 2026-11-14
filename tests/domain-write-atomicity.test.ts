import { expect, test } from 'bun:test';
import { writeDomainChanges } from '../lib/supabase/writeDomainChanges';
import type { ERPState } from '../lib/types';

test('services share one atomic commit and preserve revisions across domains', async () => {
  let calls = 0;
  const result = await writeDomainChanges({
    comments: [{ id: '92000000-0000-4000-8000-000000000001', comment: 'Nota', syncVersion: 3 }],
    notifications: [{ id: '92000000-0000-4000-8000-000000000002', title: 'Aviso', syncVersion: 7 }],
  } as unknown as ERPState, {
    rpc: async (name: string, payload: any) => {
      calls++;
      expect(name).toBe('write_legacy_batch');
      expect(payload.p_changes.map((row: any) => row.table_name)).toEqual(['comments', 'notifications']);
      expect(payload.p_changes.map((row: any) => row.expected_version)).toEqual([3, 7]);
      return { error: { code: 'PT409' }, data: null };
    },
  } as any);
  expect(calls).toBe(1);
  expect(result.success).toBe(false);
  expect(result.status).toBe(409);
});
