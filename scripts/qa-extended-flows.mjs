import fs from 'node:fs';
import path from 'node:path';
import {state,runtime,expect,request,track,record,ledger} from './qa-session.mjs';
const fixtures=JSON.parse(fs.readFileSync(path.join(runtime,'core-fixtures.json'),'utf8'));
const refs={};
const prefix=state.runId;
const account=code=>state.accounts.find(a=>a.code===code);
async function checkpoint(key,value){fixtures[key]=value;fs.writeFileSync(path.join(runtime,'core-fixtures.json'),JSON.stringify(fixtures,null,2));return value;}
try {
 for(const collection of ['projectStatuses','projectCategories','projectRisks','projectPriorities','projectTeams','projectPartners','taskStatuses','taskTypes','riskCategories','riskStatuses','riskPriorities']) {
  const created=track('reference:'+collection,(await expect('Create reference '+collection,'/api/v1/reference-data','POST',{collection,fields:{name:`${prefix} ${collection}`,scale:2,color:'#38bdf8'}},201)).data);
  const edited=(await expect('Edit reference '+collection,'/api/v1/reference-data','PATCH',{collection,id:created.id,syncVersion:created.sync_version,fields:{name:`${prefix} ${collection} editado`}})).data;
  refs[collection]=edited;await checkpoint('references',refs);
  await expect('Stale reference rejected '+collection,'/api/v1/reference-data','PATCH',{collection,id:created.id,syncVersion:created.sync_version,fields:{name:'stale'}},409);
 }
 const directory=(await expect('Read all saved references','/api/supabase/sync?partition=directory','GET')).data;
 for(const [collection,row] of Object.entries(refs)) record('Reference edit persisted '+collection,directory[collection].some(r=>r.id===row.id&&r.name===row.name));
 const special=track('specialDay',(await expect('Create special day','/api/supabase/special-days','POST',{date:'2028-12-27',name:`${prefix} Dia QA`},201)).data);
 await checkpoint('specialDay',(await expect('Edit special day',`/api/supabase/special-days/${special.id}`,'PATCH',{name:`${prefix} Dia editado`,syncVersion:special.syncVersion})).data);
 await expect('Invalid template duration','/api/supabase/default-tasks','POST',{title:prefix,estimatedHours:'broken'},400);
 const template=track('defaultTask',(await expect('Create task template','/api/supabase/default-tasks','POST',{title:`${prefix} Modelo QA`,estimatedHours:'02:30',taskTypeId:refs.taskTypes.id},201)).data);
 await checkpoint('defaultTask',(await expect('Edit task template',`/api/supabase/default-tasks/${template.id}`,'PATCH',{title:`${prefix} Modelo editado`,syncVersion:template.syncVersion})).data);
 const ruleInput={name:`${prefix} Regra inativa`,enabled:false,triggerType:'task_created',actions:[{type:'send_notification',params:{notificationTitle:prefix,notificationMessage:'Synthetic QA'}}]};
 const rule=track('automationRule',(await expect('Create disabled automation','/api/v1/automation-rules','POST',ruleInput,201)).data);
 await checkpoint('automationRule',(await expect('Edit disabled automation',`/api/v1/automation-rules/${rule.id}`,'PATCH',{...ruleInput,name:`${prefix} Regra editada`,syncVersion:rule.syncVersion})).data);
 const presalesList=await expect('List Presales eligibility','/api/v1/presales','GET');
 record('QA presales manager eligible',presalesList.eligibleManagerIds.includes(account('SOLUTIONS').id));
 const presale=track('presales',(await expect('Create Presales request','/api/v1/presales','POST',{title:`${prefix} Presales`,ownerId:account('SOLUTIONS').id,plannedStartDate:'2026-11-17',plannedEndDate:'2026-11-20',requirements:'Requisitos QA',commercialManagerId:account('COMMERCIAL').id,projectManagerId:account('PROJECT_MANAGER').id},201,'COMMERCIAL')).data);
 let ps=(await expect('Read Presales request',`/api/v1/presales/${presale.id}`,'GET')).data;await checkpoint('presales',ps);
 if(ps.status==='submitted') ps=(await expect('Accept Presales request',`/api/v1/presales/${ps.id}`,'PATCH',{action:'accept',version:ps.version,assigneeIds:[account('SOLUTIONS').id],estimatedDays:1},200,'SOLUTIONS')).data;
 else record('Presales created in accepted state',ps.status==='accepted');
 await checkpoint('presales',ps);
 ps=(await expect('Add Presales item',`/api/v1/presales/${ps.id}`,'PATCH',{action:'save_item',version:ps.version,title:prefix+' Item',unit:'un',quantity:2,unitPrice:10},200,'SOLUTIONS')).data;await checkpoint('presales',ps);
 const registry=track('presalesRegistry',(await expect('Create Presales registry without dates','/api/v1/presales/registry','POST',{title:`${prefix} Registo`,clientId:fixtures.client.id,projectManagerId:account('PROJECT_MANAGER').id,commercialManagerId:account('COMMERCIAL').id},201,'COMMERCIAL')).data);
 await checkpoint('presalesRegistry',registry);
 const mech=track('mechanicalDesign',(await expect('Create mechanical design request','/api/v1/mechanical-design','POST',{title:`${prefix} Desenho`,ownerId:account('PROJECT_MANAGER').id,projectId:fixtures.project.id,plannedStartDate:'2026-11-17',plannedEndDate:'2026-11-20',instructions:'Instruções QA'},201,'PROJECT_MANAGER')).data);
 let md=(await expect('Read mechanical design request',`/api/v1/mechanical-design/${mech.id}`,'GET')).data;await checkpoint('mechanicalDesign',md);
 if(md.status==='submitted') md=(await expect('Accept mechanical design request',`/api/v1/mechanical-design/${md.id}`,'PATCH',{action:'accept',version:md.version,assigneeIds:[account('TECHNICIAN').id],estimatedDays:1},200,'PROJECT_MANAGER')).data;
 else record('Mechanical design created in accepted state',md.status==='accepted');
 await checkpoint('mechanicalDesign',md);
 record('Extended fixtures ready',true);
} catch(error) {console.error(error.message);process.exitCode=1;}
