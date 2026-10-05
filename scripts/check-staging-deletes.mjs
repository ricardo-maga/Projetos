import { readFileSync } from 'node:fs';
const base = 'http://127.0.0.1:3110';
const credentials = JSON.parse(readFileSync(process.env.STAGING_CREDENTIALS_FILE,'utf8'));
if (credentials.length !== 2 || credentials.some(c => !['admin.staging@example.com','viewer.staging@example.com'].includes(c.email))) throw Error('Contas de teste inválidas');
const results = [];
async function request(path,token,method='GET',body) {
  return fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
    ...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(60000)});
}
async function expect(label,response,status) {
  results.push({label,status:response.status,pass:response.status===status});
  if(response.status!==status) throw Error(`${label}: HTTP ${response.status}, esperado ${status}`);
}
try {
  const tokens={};
  for(const credential of credentials) {
    const response=await request('/api/auth/login',null,'POST',credential);
    await expect('Login fictício',response,200);
    tokens[credential.email]=(await response.json()).token;
  }
  const admin=tokens['admin.staging@example.com'],viewer=tokens['viewer.staging@example.com'];
  const endpoint='/api/supabase/sync/entity';
  const rows=[['specialDays','001'],['defaultTasks','003'],['comments','004'],['userAbsences','005']];
  const id=suffix=>'92000000-0000-4000-8000-000000000'+suffix;
  await expect('Sem sessão',await request(endpoint,null,'DELETE',{entity:'specialDays',id:id('001')}),401);
  await expect('Tabela arbitrária recusada',await request(endpoint,admin,'DELETE',{entity:'users',id:id('001')}),400);
  for(const [entity,suffix] of rows) {
    await expect(`Viewer não elimina ${entity}`,await request(endpoint,viewer,'DELETE',{entity,id:id(suffix)}),403);
    await expect(`Admin elimina ${entity}`,await request(endpoint,admin,'DELETE',{entity,id:id(suffix)}),200);
    await expect(`Repetição não confirma falso sucesso ${entity}`,await request(endpoint,admin,'DELETE',{entity,id:id(suffix)}),404);
  }
  const snapshot=await request('/api/supabase/sync',admin);
  await expect('Recarregar estado canónico',snapshot,200);
  const data=(await snapshot.json()).data;
  if(!data.specialDays.some(row=>row.id===id('002'))) throw Error('Registo não solicitado foi eliminado');
  results.push({label:'Registo adjacente preservado',pass:true});
  await expect('Limpar registo adjacente QA',await request(endpoint,admin,'DELETE',{entity:'specialDays',id:id('002')}),200);
  console.log(JSON.stringify({passed:true,results}));
} catch(error) { console.log(JSON.stringify({passed:false,results,error:error.message}));process.exitCode=1; }
