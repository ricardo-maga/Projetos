import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const base = 'http://127.0.0.1:3110';
if (!process.env.STAGING_CREDENTIALS_FILE) throw new Error('Definir STAGING_CREDENTIALS_FILE local, sem passwords na linha de comandos.');
const credentials = JSON.parse(readFileSync(process.env.STAGING_CREDENTIALS_FILE,'utf8'));
if (credentials.length !== 2 || credentials.some(c => !['admin.staging@example.com','viewer.staging@example.com'].includes(c.email)))
  throw new Error('Só são permitidas as duas contas fictícias de staging.');
const outcomes = [];
async function request(path, token, options = {}) {
  return fetch(base + path, { ...options, headers: { 'Content-Type':'application/json',
    ...(token ? { Authorization:`Bearer ${token}` } : {}) }, signal:AbortSignal.timeout(60000) });
}
async function expectStatus(label,response,status) {
  outcomes.push({ check:label,status:response.status,pass:response.status === status });
  if (response.status !== status) throw new Error(`${label}: HTTP ${response.status}, esperado ${status}`);
  return response;
}
try {
  await expectStatus('Projects sem sessão',await request('/api/v1/projects'),401);
  const tokens = {};
  const users = {};
  for (const credential of credentials) {
    const response = await expectStatus(`Login ${credential.email}`,await request('/api/auth/login',null,
      { method:'POST',body:JSON.stringify(credential) }),200);
    const result = await response.json();
    if (!result.token) throw new Error('Login sem token');
    tokens[credential.email] = result.token;
    users[credential.email] = result.user;
    await expectStatus(`Projetos ${credential.email}`,await request('/api/v1/projects',result.token),200);
    await expectStatus(`Tarefas ${credential.email}`,await request('/api/v1/tasks',result.token),200);
  }
  const admin = tokens['admin.staging@example.com'];
  const viewer = tokens['viewer.staging@example.com'];
  const syncRead = await expectStatus('Viewer lê snapshot autorizado',await request('/api/supabase/sync',viewer),200);
  const visible = (await syncRead.json()).data;
  if (!visible || visible.automationRules?.length || visible.auditLogs?.length || visible.notificationSettings?.length)
    throw new Error('Sync expôs coleção administrativa ao viewer');
  if (visible.users.some(user => 'password' in user)) throw new Error('Sync expôs password');
  if (visible.notifications.some(row => row.userId !== users['viewer.staging@example.com'].id && row.userId !== 'all'))
    throw new Error('Sync expôs notificação de terceiro');
  if (!visible.taskStatuses.length || !visible.users.length) throw new Error('Sync perdeu referências de apresentação');
  outcomes.push({check:'Projeção de leitura, notificações e referências',pass:true});
  for (const field of ['comments','projectRiskItems','materials','quotes','equipmentList','tickets']) {
    await expectStatus(`Snapshot misto não permite escrita em ${field}`,await request('/api/supabase/sync',viewer,
      {method:'POST',body:JSON.stringify({taskStatuses:[{id:'tampered',name:'NÃO PERSISTIR'}],
        [field]:[{id:'11111111-2222-4333-8444-555555555555',comment:'NÃO PERSISTIR',title:'NÃO PERSISTIR'}]})}),403);
  }
  const brandingResponse = await expectStatus('Branding público disponível',await request('/api/supabase/config'),200);
  const brandingBefore = JSON.stringify(await brandingResponse.json());
  for (const field of ['projectStatuses','taskStatuses','riskCategories','specialDays','defaultTasks','appConfig']) {
    await expectStatus(`Viewer não altera ${field} por sync`,await request('/api/supabase/sync',viewer,
      {method:'POST',body:JSON.stringify({[field]: field === 'appConfig' ? {appName:'NÃO PERSISTIR'} : [{id:'tampered',name:'NÃO PERSISTIR'}]})}),403);
  }
  await expectStatus('Sync recusa array como payload',await request('/api/supabase/sync',admin,
    {method:'POST',body:'[]'}),400);
  if (JSON.stringify(await (await request('/api/supabase/config')).json()) !== brandingBefore) throw new Error('Branding foi alterado indevidamente');
  outcomes.push({check:'Branding inalterado após payloads recusados',pass:true});
  await expectStatus('Viewer não cria projeto',await request('/api/v1/projects',viewer,{method:'POST',body:'{}'}),403);
  await expectStatus('Viewer não lê auditoria',await request('/api/audit',viewer),403);
  await expectStatus('Admin lê auditoria',await request('/api/audit',admin),200);
  await expectStatus('Relato de cliente sem identidade controlável',await request('/api/audit',admin,
    { method:'POST',body:JSON.stringify({action:'UPDATE',userId:'fake',details:'ignored',entityType:'PROJECT'}) }),200);
  const response = await request('/api/audit',admin);
  const result = await response.json();
  const reported = result.data?.find(item => item.action === 'CLIENT_EVENT');
  if (!reported || reported.userEmail !== 'admin.staging@example.com' || reported.entityType !== 'SYSTEM')
    throw new Error('Falha na identidade/rotulagem do evento de cliente');
  outcomes.push({check:'Identidade server-side e CLIENT_EVENT',pass:true});
  const fixtures = await (await request('/api/v1/projects',admin)).json();
  const fixture = fixtures.data?.find(p => p.title === 'Projeto fictício STAGING');
  if (!fixture) throw new Error('Projeto base de staging não encontrado');
  let projectId;
  let taskId;
  let commentId;
  try {
    const createProject = await expectStatus('Criar projeto sintético por API',await request('/api/v1/projects',admin,
      {method:'POST',body:JSON.stringify({title:'QA RLS '+Date.now(),clientId:fixture.clientId,statusId:fixture.statusId,demo:true})}),201);
    const createdProject = (await createProject.json()).data;
    projectId = createdProject.id;
    const initial = (await (await request(`/api/v1/projects/${projectId}`,admin)).json()).data;
    if (!Number.isInteger(initial.version)) throw new Error('Projeto sem versão');
    const updateProject = await expectStatus('Atualizar projeto com versão atual',await request(`/api/v1/projects/${projectId}`,admin,
      {method:'PATCH',body:JSON.stringify({version:initial.version,description:'Atualização QA fictícia'})}),200);
    await expectStatus('Projeto rejeita versão antiga',await request(`/api/v1/projects/${projectId}`,admin,
      {method:'PATCH',body:JSON.stringify({version:initial.version,description:'NÃO DEVE PERSISTIR'})}),409);
    const refreshedProject = (await (await request(`/api/v1/projects/${projectId}`,admin)).json()).data;
    if (refreshedProject.version <= initial.version || refreshedProject.description !== 'Atualização QA fictícia')
      throw new Error('OCC projeto não preservou atualização');
    const id = randomUUID();
    await expectStatus('Comentário recusa autor falsificado',await request('/api/supabase/sync',admin,
      {method:'POST',body:JSON.stringify({comments:[{id,projectId,authorId:users['viewer.staging@example.com'].id,comment:'NÃO PERSISTIR'}]})}),403);
    await expectStatus('Criar comentário com autor de sessão',await request('/api/supabase/sync',admin,
      {method:'POST',body:JSON.stringify({comments:[{id,projectId,comment:'QA comment',createdDate:'1899-01-01T00:00:00Z'}]})}),200);
    commentId=id;
    const readComments=await (await request('/api/supabase/sync',admin)).json();
    const persisted=readComments.data.comments.find(row=>row.id===id);
    if (!persisted || persisted.authorId!==users['admin.staging@example.com'].id || persisted.projectId!==projectId || persisted.createdDate.startsWith('1899'))
      throw new Error('Autor/projeto/data do comentário não preservados');
    outcomes.push({check:'Autor, projeto e data canónicos persistidos',pass:true});
    await expectStatus('Comentário não muda de projeto',await request('/api/supabase/sync',admin,
      {method:'POST',body:JSON.stringify({comments:[{...persisted,projectId:fixture.id}]})}),403);
    await expectStatus('Comentário existente não muda de autor',await request('/api/supabase/sync',admin,
      {method:'POST',body:JSON.stringify({comments:[{...persisted,authorId:users['viewer.staging@example.com'].id}]})}),403);
    const owner = users['admin.staging@example.com'].id;
    const assignee = users['viewer.staging@example.com'].id;
    const created = await expectStatus('Criar tarefa por API',await request('/api/v1/tasks',admin,
      {method:'POST',body:JSON.stringify({title:'Tarefa QA RLS',projectId,estimatedDate:new Date().toISOString().slice(0,10),estimatedHours:2,assignedUserIds:[owner]})}),201);
    const task = (await created.json()).data;
    taskId = task.id;
    const updatedResponse = await expectStatus('Atualizar tarefa e responsável',await request(`/api/v1/tasks/${taskId}`,admin,
      {method:'PATCH',body:JSON.stringify({version:task.version,actualHours:1,assignedUserIds:[assignee]})}),200);
    const updatedTask = (await updatedResponse.json()).data;
    await expectStatus('Tarefa rejeita versão antiga',await request(`/api/v1/tasks/${taskId}`,admin,
      {method:'PATCH',body:JSON.stringify({version:task.version,actualHours:99})}),409);
    const refreshedTask = (await (await request(`/api/v1/tasks/${taskId}`,admin)).json()).data;
    if (updatedTask.version <= task.version || refreshedTask.actualHours !== 1 ||
        !refreshedTask.assignedUserIds?.includes(assignee) || refreshedTask.assignedUserIds?.includes(owner))
      throw new Error('OCC/assignees de tarefa inválidos');
    outcomes.push({check:'OCC e assignees persistidos',pass:true});
  } finally {
    if (commentId) await expectStatus('Eliminar comentário QA',await request('/api/supabase/sync/entity',admin,
      {method:'DELETE',body:JSON.stringify({entity:'comments',id:commentId})}),200);
    if (taskId) {
      await expectStatus('Soft-delete da tarefa QA',await request(`/api/v1/tasks/${taskId}`,admin,{method:'DELETE'}),200);
      await expectStatus('Tarefa eliminada deixa de estar disponível',await request(`/api/v1/tasks/${taskId}`,admin),404);
    }
    if (projectId) {
      await expectStatus('Soft-delete do projeto QA',await request(`/api/v1/projects/${projectId}`,admin,{method:'DELETE'}),200);
      await expectStatus('Projeto eliminado deixa de estar disponível',await request(`/api/v1/projects/${projectId}`,admin),404);
    }
  }
  console.log(JSON.stringify({ passed:true,outcomes }));
} catch (error) {
  console.log(JSON.stringify({passed:false,outcomes,error:error.message}));
  process.exitCode = 1;
}
