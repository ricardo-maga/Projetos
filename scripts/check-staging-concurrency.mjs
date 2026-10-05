import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ref = 'caaiydcycrnwcqefdldz';
const cli = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--yes','--offline=false','supabase@2.119.0','projects','api-keys','--project-ref',ref,'--reveal','--output','json'],
  {shell:process.platform==='win32',encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
if(cli.status!==0) throw Error('CLI staging indisponível');
const keys=JSON.parse(cli.stdout);
const service=keys.find(k=>k.name==='service_role')?.api_key;
const anon=keys.find(k=>k.name==='anon')?.api_key;
for(const [key,role] of [[service,'service_role'],[anon,'anon']]) {
  const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());
  if(claims.ref!==ref || claims.role!==role) throw Error('Ambiente incorreto');
}
const boundedFetch=(url,options={})=>fetch(url,{...options,signal:options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)});
const db=createClient(`https://${ref}.supabase.co`,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
const publicDb=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
const results=[]; const cleanup=[];
function assert(label,condition){results.push({label,pass:Boolean(condition)});if(!condition)throw Error(label);}
function checked(result,label){assert(label,!result.error);return result.data;}
const credentials=JSON.parse(readFileSync(process.env.STAGING_CREDENTIALS_FILE,'utf8'));
if(credentials.some(c=>!['admin.staging@example.com','viewer.staging@example.com'].includes(c.email)))throw Error('Só fixtures fictícias');
const base='http://127.0.0.1:3110';
async function request(path,token,method='GET',body){return fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});}
try {
  const login=await request('/api/auth/login','', 'POST',credentials.find(c=>c.email==='admin.staging@example.com'));
  assert('Login fictício',login.status===200); const token=(await login.json()).token;
  const snapshot=await(await request('/api/supabase/sync',token)).json();
  assert('Snapshot canónico',snapshot.success);
  const project=snapshot.data.projects.find(p=>p.title==='Projeto fictício STAGING');
  const owner=snapshot.data.users.find(u=>u.email==='admin.staging@example.com');
  assert('Fixtures canónicas',project && owner);
  const numbers=checked(await Promise.all(Array.from({length:4},()=>db.rpc('reserve_ticket_number')))
    .then(values=>({error:values.find(v=>v.error)?.error,data:values.map(v=>v.data)})), 'Reservas concorrentes');
  assert('4 números distintos',new Set(numbers).size===4);
  assert('RPC de gravação recusada a anon',(await publicDb.rpc('write_legacy_batch',{p_changes:[]})).error?.code==='42501');
  assert('Reserva recusada a anon',(await publicDb.rpc('reserve_ticket_number')).error?.code==='42501');
  const id=randomUUID(); cleanup.push(['project_materials',id]);
  checked(await db.rpc('write_legacy_batch',{p_changes:[{table_name:'project_materials',expected_version:null,row:{id,project_id:project.id,description:'QA OCC STAGING',supplier:'Fictício',quantity:1}}]}),'Criar fixture OCC');
  const contenders=await Promise.all([2,3].map(quantity=>db.rpc('write_legacy_batch',{p_changes:[{table_name:'project_materials',expected_version:1,row:{id,quantity}}]})));
  assert('Exatamente um update simultâneo aceite',contenders.filter(r=>!r.error).length===1);
  assert('Outro update rejeitado por OCC',contenders.filter(r=>r.error?.code==='PT409').length===1);
  const material=checked(await db.from('project_materials').select('*').eq('id',id).single(),'Ler versão material');
  assert('Versão avançou uma única vez',material.sync_version===2 && [2,3].includes(material.quantity));
  const oldVersion=material.sync_version;
  const rolledId=randomUUID();
  const rollback=await db.rpc('write_legacy_batch',{p_changes:[
    {table_name:'project_materials',expected_version:oldVersion,row:{id,quantity:99}},
    {table_name:'project_materials',expected_version:null,row:{id:rolledId,project_id:randomUUID(),description:'QA rollback',supplier:'Fictício'}}
  ]});
  assert('Lote com FK inválida rejeitado',Boolean(rollback.error));
  const unchanged=checked(await db.from('project_materials').select('quantity,sync_version').eq('id',id).single(),'Verificar rollback');
  assert('Sem alteração parcial de quantidade/versão',unchanged.quantity===material.quantity && unchanged.sync_version===oldVersion);
  assert('Linha inválida não criada',!(checked(await db.from('project_materials').select('id').eq('id',rolledId),'Verificar ausência de inserção')).length);
  assert('Tabela Projects bloqueada no boundary',(await db.rpc('write_legacy_batch',{p_changes:[{table_name:'projects',row:{id:randomUUID()},expected_version:null}]})).error?.code==='22023');

  const riskId=randomUUID(); cleanup.push(['project_risk_items',riskId]);
  const risk={id:riskId,projectId:project.id,title:'QA RISK STAGING',ownerId:owner.id,categoryId:snapshot.data.riskCategories[0].id,
    statusId:snapshot.data.riskStatuses[0].id,priorityId:snapshot.data.riskPriorities[0].id,probability:3,impact:3,identificationDate:'2026-10-05',createdDate:new Date().toISOString(),deleted:false};
  const riskResponse=await request('/api/supabase/sync',token,'POST',{projectRiskItems:[risk]});
  assert('Criar risco sem regravar referências',riskResponse.status===200);
  const savedRisk=checked(await db.from('project_risk_items').select('*').eq('id',riskId).single(),'Risco persistido');
  assert('Vínculos de risco preservados',savedRisk.project_id===project.id && savedRisk.owner_id===owner.id && savedRisk.category_id===risk.categoryId && savedRisk.status_id===risk.statusId && savedRisk.priority_id===risk.priorityId);
  const stale={...risk,syncVersion:savedRisk.sync_version,title:'QA RISK UPDATE'};
  assert('Editar risco canónico',(await request('/api/supabase/sync',token,'POST',{projectRiskItems:[stale]})).status===200);
  assert('Snapshot antigo rejeitado com 409',(await request('/api/supabase/sync',token,'POST',{projectRiskItems:[{...stale,title:'STALE'}]})).status===409);
  const absenceId=randomUUID(); cleanup.push(['user_absences',absenceId]);
  const absence={id:absenceId,userId:owner.id,absenceStartDate:'2026-10-05',absenceEndDate:'2026-10-05',reason:'Other',createdDate:new Date().toISOString()};
  assert('Criar ausência',(await request('/api/supabase/sync',token,'POST',{userAbsences:[absence]})).status===200);
  const savedAbsence=checked(await db.from('user_absences').select('user_id').eq('id',absenceId).single(),'Ausência persistida');
  assert('Utilizador da ausência preservado',savedAbsence.user_id===owner.id);
  const created=await request('/api/v1/tickets',token,'POST',{title:'QA TICKET OCC STAGING',source:'manual'});
  assert('Criar ticket OCC',created.status===201); const ticket=(await created.json()).data;cleanup.push(['tickets',ticket.id]);
  assert('Primeiro PATCH com revisão aceite',(await request('/api/v1/tickets/'+ticket.id,token,'PATCH',{title:'QA TICKET CURRENT',syncVersion:ticket.syncVersion})).status===200);
  assert('PATCH antigo recusado',(await request('/api/v1/tickets/'+ticket.id,token,'PATCH',{title:'STALE',syncVersion:ticket.syncVersion})).status===409);
  const projectResponse=await request('/api/v1/projects',token,'POST',{title:'QA CANONICAL OCC STAGING',clientId:project.clientId,statusId:project.statusId,demo:true});
  assert('Criar projeto de concorrência',projectResponse.status===201);
  const concurrentProject=(await projectResponse.json()).data; cleanup.push(['projects',concurrentProject.id]);
  const projectEdits=await Promise.all(['A','B'].map(description=>request('/api/v1/projects/'+concurrentProject.id,token,'PATCH',{version:concurrentProject.version,description:'QA '+description})));
  assert('Projects: um 200 e um 409 simultâneos',projectEdits.filter(r=>r.status===200).length===1 && projectEdits.filter(r=>r.status===409).length===1);
  const taskResponse=await request('/api/v1/tasks',token,'POST',{title:'QA CANONICAL TASK OCC STAGING',projectId:concurrentProject.id,estimatedDate:'2026-10-05',estimatedHours:2,assignedUserIds:[owner.id]});
  assert('Criar tarefa de concorrência',taskResponse.status===201);
  const concurrentTask=(await taskResponse.json()).data; cleanup.push(['tasks',concurrentTask.id]);
  const viewer=snapshot.data.users.find(u=>u.email==='viewer.staging@example.com');
  const attempts=[{actualHours:1,assignedUserIds:[owner.id]},{actualHours:2,assignedUserIds:[viewer.id]}];
  const taskEdits=await Promise.all(attempts.map(update=>request('/api/v1/tasks/'+concurrentTask.id,token,'PATCH',{version:concurrentTask.version,...update})));
  assert('Tasks: um 200 e um 409 simultâneos',taskEdits.filter(r=>r.status===200).length===1 && taskEdits.filter(r=>r.status===409).length===1);
  const winner=attempts[taskEdits.findIndex(r=>r.status===200)];
  const finalTask=(await(await request('/api/v1/tasks/'+concurrentTask.id,token)).json()).data;
  assert('Tasks: versão, horas e assignees pertencem ao mesmo vencedor',finalTask.version===concurrentTask.version+1 && finalTask.actualHours===winner.actualHours && JSON.stringify(finalTask.assignedUserIds)===JSON.stringify(winner.assignedUserIds));
} catch(error){results.push({label:error.message,pass:false});process.exitCode=1;}
finally {
  // Only IDs generated by this execution; never touch base fixtures/history.
  for(const [table,id] of cleanup.reverse()){const r=await db.from(table).delete().eq('id',id);if(r.error){results.push({label:'Limpeza QA '+table,pass:false});process.exitCode=1;}}
  console.log(JSON.stringify({staging:ref,passed:!process.exitCode,results}));
}
