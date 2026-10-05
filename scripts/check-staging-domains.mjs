import {readFileSync} from 'node:fs';
const base='http://127.0.0.1:3110';
const credentials=JSON.parse(readFileSync(process.env.STAGING_CREDENTIALS_FILE,'utf8'));
if(credentials.length!==2 || credentials.some(c=>!['admin.staging@example.com','viewer.staging@example.com'].includes(c.email))) throw Error('Contas fictícias necessárias');
const results=[];
async function request(path,token,method='GET',body){return fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});}
async function check(label,response,status){results.push({label,status:response.status,pass:response.status===status});if(response.status!==status)throw Error(`${label}: HTTP ${response.status}, esperado ${status}`);return response;}
let admin,ticketId,materialId;
try {
 const tokens={};
 for(const c of credentials){const r=await check('Login fictício',await request('/api/auth/login',null,'POST',c),200);tokens[c.email]=(await r.json()).token;}
 admin=tokens['admin.staging@example.com'];const viewer=tokens['viewer.staging@example.com'];
 const projects=await(await request('/api/v1/projects',admin)).json();
 const project=projects.data.find(row=>row.title==='Projeto fictício STAGING');if(!project)throw Error('Fixture base ausente');
 for(const path of ['/api/v1/tickets','/api/v1/project-materials']) {
  await check('Listagem sem sessão recusada '+path,await request(path),401);
  await check('Escrita viewer recusada '+path,await request(path,viewer,'POST',{}),403);
 }
 const title='QA DOMAINS '+Date.now();
 const created=await check('Criar ticket',await request('/api/v1/tickets',admin,'POST',{title,source:'manual',clientId:project.clientId}),201);
 const ticket=(await created.json()).data;ticketId=ticket.id;
 if(!/^[0-9a-f-]{36}$/i.test(ticketId))throw Error('Ticket não devolve ID canónico');
 const read=await check('Ler ticket pelo ID devolvido',await request('/api/v1/tickets/'+ticketId,admin),200);
 if((await read.json()).data.title!==title)throw Error('Ticket não persistido');
 await check('Atualizar ticket',await request('/api/v1/tickets/'+ticketId,admin,'PATCH',{title:title+' EDITADO'}),200);
 const reread=await(await request('/api/v1/tickets/'+ticketId,admin)).json();if(reread.data.title!==title+' EDITADO')throw Error('Atualização do ticket não persistida');
 results.push({label:'Ticket editado persistido',pass:true});
 const material=await check('Criar material de projeto',await request('/api/v1/project-materials',admin,'POST',{projectId:project.id,description:title,supplier:'Fornecedor fictício STAGING',quantity:2}),201);
 const originalMaterial=(await material.json()).data;
 materialId=originalMaterial.id;
 await check('Atualizar material sem aceitar campos protegidos',await request('/api/v1/project-materials/'+materialId,admin,'PUT',{description:title+' EDITADO',quantity:3,deleted:true,createdDate:'1899-01-01T00:00:00Z',id:'fake'}),200);
 const list=await check('Recarregar materiais do projeto',await request('/api/v1/project-materials?projectId='+project.id,admin),200);
 const saved=(await list.json()).data.find(row=>row.id===materialId);
 if(!saved || saved.projectId!==project.id || saved.quantity!==3 || saved.description!==title+' EDITADO' || saved.deleted || saved.createdDate.startsWith('1899'))throw Error('Material não persistido/associado ou campos protegidos alterados');
 results.push({label:'Material editado e associado ao projeto',pass:true});
} catch(error){results.push({label:error.message,pass:false});process.exitCode=1;}
finally {
 try {
  if(materialId){await check('Soft-delete material QA',await request('/api/v1/project-materials/'+materialId,admin,'DELETE'),200);
   const list=await(await request('/api/v1/project-materials',admin)).json();if(list.data.some(row=>row.id===materialId))throw Error('Material eliminado continua ativo');results.push({label:'Material eliminado ausente da lista',pass:true});}
  if(ticketId){await check('Soft-delete ticket QA',await request('/api/v1/tickets/'+ticketId,admin,'DELETE'),200);await check('Ticket eliminado inacessível',await request('/api/v1/tickets/'+ticketId,admin),404);}
 }catch(error){results.push({label:'Limpeza: '+error.message,pass:false});process.exitCode=1;}
 console.log(JSON.stringify({passed:!process.exitCode,results}));
}
