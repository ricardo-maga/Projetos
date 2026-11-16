import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import * as auth from '../lib/auth/requireAuth';
import * as db from '../lib/supabase/requireServerDbClient';
import * as rate from '../lib/rateLimit';
import { POST } from '../app/api/v1/absences/route';
import { configurationReadQuery } from '../domains/configuration/data/configurationRepository';
import { createDefaultTaskSchema, updateDefaultTaskSchema } from '../lib/defaultTasks/contracts';
import { runIdempotent } from '../lib/apiIdempotency';
import { createHash } from 'node:crypto';
const spies: Array<{mockRestore():void}> = [];
it('preserves existing GUID task types when creating and editing a template', () => {
  const taskTypeId = '36742500-5c1b-6a6f-1410-928f50aaaaaa';
  expect(createDefaultTaskSchema.safeParse({ title: 'Modelo', estimatedHours: '02:30', taskTypeId }).success).toBe(true);
  expect(updateDefaultTaskSchema.safeParse({ taskTypeId, syncVersion: 1 }).success).toBe(true);
  expect(createDefaultTaskSchema.safeParse({ title: 'Modelo', estimatedHours: '02:30', taskTypeId: 'broken' }).success).toBe(false);
});
afterEach(()=>{spies.splice(0).forEach(s=>s.mockRestore());});
describe('Absence validation matches the database contract',()=>{
  for(const reason of ['Vacation','Sick leave','Other','invalid']) it(`handles ${reason} before persistence`,async()=>{
    let inserts=0;
    spies.push(spyOn(auth,'requireAuth').mockResolvedValue({id:'11111111-1111-4111-8111-111111111111',auth_user_id:'auth'} as any));
    spies.push(spyOn(rate,'checkRateLimit').mockResolvedValue({success:true} as any));
    spies.push(spyOn(db,'requireServerDbClient').mockReturnValue({rpc:async()=>({data:true,error:null}),from:()=>({insert:(row:any)=>{inserts++;return {select:()=>({single:async()=>({data:{...row,id:'absence'},error:null})})}}})} as any));
    const response=await POST(new NextRequest('http://localhost/api/v1/absences',{method:'POST',body:JSON.stringify({userId:'11111111-1111-4111-8111-111111111111',absenceStartDate:'2026-11-18',absenceEndDate:'2026-11-18',reason})}));
    expect(response.status).toBe(reason==='invalid'?400:201);
    expect(inserts).toBe(reason==='invalid'?0:1);
  });
});
describe('Historical duplicate configurations',()=>{
  it('selects the same canonical row independent of database result order',async()=>{
    for(const input of [[{id:'b'},{id:'a'}],[{id:'a'},{id:'b'}]]) {
      let rows=[...input];
      const chain:any={select:()=>chain,order:(column:string,options:any)=>{expect(column).toBe('id');expect(options.ascending).toBe(true);rows.sort((a,b)=>a.id.localeCompare(b.id));return chain},limit:(n:number)=>{rows=rows.slice(0,n);return Promise.resolve({data:rows,error:null})}};
      const result=await configurationReadQuery({from:(table:string)=>{expect(table).toBe('app_configuration');return chain}});
      expect(result.data).toEqual([{id:'a'}]);
    }
  });
});
describe('Presales recovery after a worker stops before storing its response', () => {
  for (const operation of ['presales:create', 'presales:registry:create']) it(operation, async () => {
    const body = JSON.stringify({ title: 'Synthetic recovery test' });
    const reads: string[] = [];
    const claim: any = {
      insert: async () => ({ error: { code: '23505' } }),
      select: () => claim, eq: () => claim, lt: () => claim, is: () => claim,
      update: () => claim,
      single: async () => ({ data: { request_hash: createHash('sha256').update(body).digest('hex'), claim_token: 'old', completed_at: null }, error: null }),
      maybeSingle: async () => ({ data: { key_hash: 'taken' }, error: null }),
    };
    const persisted: any = { select: () => persisted, eq: () => persisted, maybeSingle: async () => ({ data: { id: 'existing' }, error: null }) };
    spies.push(spyOn(db, 'requireServerDbClient').mockReturnValue({ from: (table: string) => {
      reads.push(table); return table === 'api_idempotency' ? claim : persisted;
    } } as any));
    let invoked = false;
    const response = await runIdempotent(new NextRequest('http://localhost/api/v1/presales', {
      method: 'POST', headers: { 'Idempotency-Key': 'test-recovery-key' }, body,
    }), 'qa-user', operation, async () => { invoked = true; throw new Error('Must not create twice'); });
    expect(response.status).toBe(409);
    expect(reads).toEqual(['api_idempotency', 'api_idempotency', 'api_idempotency', 'work_requests']);
    expect(invoked).toBe(false);
  });
});
