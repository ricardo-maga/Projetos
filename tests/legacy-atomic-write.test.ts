import { expect, test } from 'bun:test';
import { createLegacyWriteBatch, applyLegacyVersions } from '../lib/supabase/legacyWriteBatch';
import type { ERPState } from '../lib/types';
import { buildLegacySyncPayload } from '../lib/supabase/syncPayload';

test('buffers mutations and submits only changed rows with the original revision', async () => {
  const calls: any[] = [];
  const database = { rpc: async (name: string, payload: any) => { calls.push({name,payload}); return {
    data: [{table_name:'comments',id:'one',sync_version:8}], error:null }; } };
  const batch = createLegacyWriteBatch(database, { comments:[{id:'one',syncVersion:7},{id:'untouched',syncVersion:2}] } as ERPState);
  await (batch.client.from('comments') as any).upsert([{id:'one',comment:'Changed'}]);
  expect(calls).toHaveLength(0);
  const result = await batch.commit();
  expect(calls[0].payload.p_changes).toEqual([{table_name:'comments',row:{id:'one',comment:'Changed'},expected_version:7}]);
  expect(result.versions).toEqual({comments:{one:8}});
});

test('conflict fails closed without retrying stale writes', async () => {
  let attempts = 0;
  const batch = createLegacyWriteBatch({rpc:async()=>{attempts++; return {error:{code:'PT409'}};}}, {} as ERPState);
  await (batch.client.from('comments') as any).upsert([{id:'new'}]);
  expect(await batch.commit()).toMatchObject({success:false,status:409});
  expect(attempts).toBe(1);
});

test('legacy SQLSTATE conflict is reported as 409 until the database migration is applied', async () => {
  const batch = createLegacyWriteBatch({rpc:async()=>({error:{code:'40001'}})}, {} as ERPState);
  await (batch.client.from('comments') as any).upsert([{id:'new'}]);
  expect(await batch.commit()).toMatchObject({success:false,status:409});
});

test('cannot add canonical task/project writers to a legacy batch', async () => {
  const batch = createLegacyWriteBatch({}, {} as ERPState);
  await expect((batch.client.from('tasks') as any).upsert([{id:'forbidden'}])).rejects.toThrow('fora do boundary');
});

test('acknowledges revisions without replacing unrelated rows or changing the source', () => {
  const state = {comments:[{id:'one',syncVersion:2},{id:'other',syncVersion:4}]} as ERPState;
  const next = applyLegacyVersions(state,{comments:{one:3}});
  expect(next.comments?.map(row=>row.syncVersion)).toEqual([3,4]);
  expect(state.comments?.[0].syncVersion).toBe(2);
  expect(applyLegacyVersions(next,{comments:{one:1}}).comments?.[0].syncVersion).toBe(3);
});

test('client expresses only changed legacy rows, not unrelated cached domains or omissions', () => {
  const before = {comments:[{id:'one',comment:'old',syncVersion:2}],notifications:[{id:'unchanged'}],projects:[{id:'canonical'}]};
  expect(buildLegacySyncPayload(before,{...before,comments:[{...before.comments[0],comment:'new'}]})).toEqual({comments:[{id:'one',comment:'new',syncVersion:2}]});
  expect(buildLegacySyncPayload(before,{...before,comments:[]})).toEqual({});
});
