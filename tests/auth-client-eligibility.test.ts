import { afterEach, expect, it, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import * as headers from 'next/headers';
import * as server from '../lib/supabase/server';
import * as rate from '../lib/rateLimit';
import * as audit from '../lib/audit';
import * as central from '../lib/auth/requireAuth';
import * as boundary from '../lib/auth/authorization';
import { POST as login } from '../app/api/auth/login/route';
import { GET as session } from '../app/api/auth/session/route';
import { GET as me } from '../app/api/auth/me/route';
import { isMechanicalDesignManager } from '../lib/mechanicalDesign';
const spies: Array<{mockRestore():void}>=[];
afterEach(()=>spies.splice(0).forEach(spy=>spy.mockRestore()));
const role='10000000-0000-0000-0000-000000000003';
const user={id:'qa',name:'QA Manager',email:'qa@example.invalid',preferredTheme:'violet',role_id:role,role_ids:[role],role_names:['Project Manager'],role_codes:['PROJECT_MANAGER'],permissions:['mechanical_design.manage'],type:'Team',is_admin:false,is_super_admin:false};
function verify(body:any){expect(body.success).toBe(true);expect(body.user.approved).toBe(true);expect(body.user.deleted).toBe(false);expect(body.user.preferredTheme).toBe('violet');expect(isMechanicalDesignManager(body.user)).toBe(true);}
it('keeps a freshly logged-in project manager eligible for mechanical design management',async()=>{
  spies.push(spyOn(rate,'checkRateLimit').mockResolvedValue({success:true} as any));
  spies.push(spyOn(audit,'logAuditEvent').mockResolvedValue(undefined as any));
  spies.push(spyOn(headers,'cookies').mockResolvedValue({set:()=>{}} as any));
  spies.push(spyOn(server,'createClient').mockResolvedValue({auth:{signInWithPassword:async()=>({data:{user:{id:'auth'}},error:null}),signOut:async()=>({error:null})}} as any));
  spies.push(spyOn(server,'createAdminClient').mockReturnValue({from:(table:string)=>{
    const data:any=table==='users'?{...user,preferred_theme:user.preferredTheme,auth_user_id:'auth',approved:true,deleted:false}:table==='roles'?[{id:role,code:'PROJECT_MANAGER',name:'Project Manager'}]:table==='user_roles'?[{role_id:role}]:table==='role_permissions'?[{permission_id:'perm'}]:[{code:'mechanical_design.manage'}];
    const chain:any={select:()=>chain,eq:()=>chain,in:()=>chain,maybeSingle:async()=>({data,error:null}),then:(resolve:any)=>Promise.resolve({data,error:null}).then(resolve)};return chain;
  }} as any));
  const response=await login(new NextRequest('http://localhost/api/auth/login',{method:'POST',body:JSON.stringify({email:user.email,password:'Synthetic-test-password-123!'})}));
  expect(response.status).toBe(200);verify(await response.json());
});
it('preserves eligibility when the browser restores its session',async()=>{
  spies.push(spyOn(central,'requireAuth').mockResolvedValue(user as any));
  const response=await session(new NextRequest('http://localhost/api/auth/session'));
  expect(response.status).toBe(200);verify(await response.json());
});
it('preserves eligibility when refreshing the current-user DTO',async()=>{
  spies.push(spyOn(boundary,'authenticateRequest').mockResolvedValue({authenticated:true,requestId:'qa',user:{...user,roleId:role,roleIds:[role],approved:true}} as any));
  const response=await me(new NextRequest('http://localhost/api/auth/me'));
  expect(response.status).toBe(200);verify(await response.json());
});
