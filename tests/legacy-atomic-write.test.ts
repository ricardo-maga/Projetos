import { expect, test } from 'bun:test';
import { createLegacyWriteBatch, applyLegacyVersions } from '../lib/supabase/legacyWriteBatch';
import type { ERPState } from '../lib/types';
import { buildLegacySyncPayload } from '../lib/supabase/syncPayload';

test('buffers mutations and submits only changed rows with the original revision', async () => {
  const calls: any[] = [];
  const database = { rpc: async (name: string, payload: any) => { calls.push({name,payload}); return {
    data: [{table_name:'tickets',id:'one',sync_version:8}], error:null }; } };
  const batch = createLegacyWriteBatch(database, { tickets:[{id:'one',syncVersion:7},{id:'untouched',syncVersion:2}] } as ERPState);
  await (batch.client.from('tickets') as any).upsert([{id:'one',title:'Changed'}]);
  expect(calls).toHaveLength(0);
  const result = await batch.commit();
  expect(calls[0].payload.p_changes).toEqual([{table_name:'tickets',row:{id:'one',title:'Changed'},expected_version:7}]);
  expect(result.versions).toEqual({tickets:{one:8}});
});

test('conflict fails closed without retrying stale writes', async () => {
  let attempts = 0;
  const batch = createLegacyWriteBatch({rpc:async()=>{attempts++; return {error:{code:'PT409'}};}}, {} as ERPState);
  await (batch.client.from('tickets') as any).upsert([{id:'new'}]);
  expect(await batch.commit()).toMatchObject({success:false,status:409});
  expect(attempts).toBe(1);
});

test('cannot add canonical task/project writers to a legacy batch', async () => {
  const batch = createLegacyWriteBatch({}, {} as ERPState);
  await expect((batch.client.from('tasks') as any).upsert([{id:'forbidden'}])).rejects.toThrow('fora do boundary');
});

test('acknowledges revisions without replacing unrelated rows or changing the source', () => {
  const state = {tickets:[{id:'one',syncVersion:2},{id:'other',syncVersion:4}]} as ERPState;
  const next = applyLegacyVersions(state,{tickets:{one:3}});
  expect(next.tickets?.map(row=>row.syncVersion)).toEqual([3,4]);
  expect(state.tickets?.[0].syncVersion).toBe(2);
  expect(applyLegacyVersions(next,{tickets:{one:1}}).tickets?.[0].syncVersion).toBe(3);
});

test('client expresses only changed legacy rows, not unrelated cached domains or omissions', () => {
  const before = {tickets:[{id:'one',title:'old',syncVersion:2}],comments:[{id:'unchanged'}],projects:[{id:'canonical'}]};
  expect(buildLegacySyncPayload(before,{...before,tickets:[{...before.tickets[0],title:'new'}]})).toEqual({tickets:[{id:'one',title:'new',syncVersion:2}]});
  expect(buildLegacySyncPayload(before,{...before,tickets:[]})).toEqual({});
});
