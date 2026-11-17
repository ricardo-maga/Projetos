import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {state,runtime,base,expect,request,track,record} from './qa-session.mjs';
const f=JSON.parse(fs.readFileSync(path.join(runtime,'core-fixtures.json'),'utf8'));
const checkpoint=(key,value)=>{f[key]=value;fs.writeFileSync(path.join(runtime,'core-fixtures.json'),JSON.stringify(f,null,2));return value;};
try {
 await expect('Viewer cannot manage roles','/api/rbac/roles','POST',{name:state.runId},403,'VIEWER');
 await expect('Admin without role management cannot alter RBAC','/api/rbac/roles','POST',{name:state.runId},403,'ADMIN');
 const role=f.customRole || track('role',(await expect('Create custom QA role','/api/rbac/roles','POST',{name:state.runId+' Função',description:'Synthetic QA role'},201)).role);checkpoint('customRole',role);
 await expect('Rename custom QA role',`/api/rbac/roles/${role.id}`,'PATCH',{name:state.runId+' Função editada'});
 await expect('Configure custom QA permission',`/api/rbac/roles/${role.id}/permissions`,'PUT',{permissionCodes:['projects.read']});
 const account=state.accounts.find(a=>a.code==='CRUD') || {code:'CRUD',email:state.runId+'-crud@example.invalid',password:randomBytes(24).toString('base64url')+'!aA1',name:state.runId+' Perfil CRUD'};
 const created=f.crudUser || await expect('Create QA user through app API','/api/users','POST',{name:account.name,email:account.email,password:account.password,type:'Team'},201);
 account.id=created.id;if(!state.accounts.some(a=>a.id===account.id))state.accounts.push(account);fs.writeFileSync(path.join(runtime,'accounts.json'),JSON.stringify(state,null,2));track('user',{id:account.id});checkpoint('crudUser',{id:account.id,email:account.email});
 await expect('Edit QA user through app API','/api/users','PATCH',{id:account.id,name:account.name+' editado',email:account.email,type:'Team'});
 await expect('Assign isolated custom role to QA user',`/api/rbac/users/${account.id}/roles`,'PUT',{roleIds:[role.id]});
 const me=await expect('Custom-role user can authenticate','/api/auth/me','GET',undefined,200,'CRUD');
 record('Edited QA user persisted',me.user?.name===account.name+' editado');
 await expect('Custom role denies task creation','/api/v1/tasks','POST',{},403,'CRUD');
 await expect('Custom role grants project read','/api/v1/projects','GET',undefined,200,'CRUD');
 const integration=await expect('Create scoped read-only integration','/api/integrations','POST',{name:state.runId+' API',permissions:['projects:read','tasks:read'],projectIds:[f.project.id],expiresAt:new Date(Date.now()+86400000).toISOString(),rateLimitPerMinute:5},201);
 track('integration',integration.data);checkpoint('integration',{id:integration.data.id});
 for(const resource of ['projects','tasks']) {const res=await fetch(base+'/api/integrations/v1/'+resource+(resource==='tasks'?'?projectId='+f.project.id:''),{headers:{Authorization:'Bearer '+integration.key}});const body=await res.json();record('Scoped integration '+resource,res.status===200&&Array.isArray(body.data)&&body.data.length>0&&body.data.every(row=>resource==='projects'?row.id===f.project.id:row.projectId===f.project.id),{status:res.status});}
 await expect('Revoke QA integration',`/api/integrations/${integration.data.id}`,'DELETE');
 const revoked=await fetch(base+'/api/integrations/v1/projects',{headers:{Authorization:'Bearer '+integration.key}});record('Revoked integration denied',revoked.status===401,{status:revoked.status});
 for(const scope of ['mine','all']) {await expect('Inspect calendar subscription '+scope,'/api/calendar/subscriptions/'+scope,'GET',undefined,200,'PROJECT_MANAGER');const feed=await expect('Create calendar subscription '+scope,'/api/calendar/subscriptions/'+scope,'POST',{},200,'PROJECT_MANAGER');const res=await fetch(base+feed.path);const ics=await res.text();record('Calendar feed '+scope+' has iCalendar content',res.status===200&&ics.includes('BEGIN:VCALENDAR')&&ics.includes(state.runId),{status:res.status});await expect('Revoke calendar subscription '+scope,'/api/calendar/subscriptions/'+scope,'DELETE',undefined,200,'PROJECT_MANAGER');const gone=await fetch(base+feed.path);record('Revoked calendar feed '+scope+' denied',gone.status===404,{status:gone.status});}
 for(const type of ['new_project','project_allocation','project_due_date','project_scheduled_date','project_comment','project_closed','task_allocation','task_due_date','presales_assignment','presales_due_date','presales_result','mechanical_design_assignment','mechanical_design_due_date','mechanical_design_result']) await expect('Send self-only notification '+type,'/api/notifications/test','POST',{type});
 await expect('Mark own notifications read','/api/notifications/read','POST',{all:true});
 await expect('Load audit trail','/api/audit','GET');
 record('Administration API checks completed',true);
} catch(error){console.error(error.message);process.exitCode=1;}
