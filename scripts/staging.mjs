// Local-only staging utility. Never accepts an arbitrary project reference.
import { spawnSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ref = 'caaiydcycrnwcqefdldz';
const url = `https://${ref}.supabase.co`;
const mode = process.argv[2];
if (!['seed', 'dev', 'check-access', 'test-integrity'].includes(mode)) throw new Error('Use node scripts/staging.mjs seed|dev|check-access|test-integrity');
// Refuse ambient Next dotenv files: never mix staging keys with production secrets.
for (const name of ['.env','.env.local','.env.development','.env.development.local']) {
  if (existsSync(join(root, name))) throw new Error(`Remover conflito de ambiente antes de staging: ${name}`);
}
const keysResult = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--yes','--offline=false','supabase@2.119.0','projects','api-keys','--project-ref',ref,'--reveal','--output','json'],
  { cwd: root, shell: process.platform === 'win32', encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
if (keysResult.status !== 0) throw new Error('Falha ao obter chaves de staging; verificar login do CLI.');
const keys = JSON.parse(keysResult.stdout);
const anon = keys.find(key => key.name === 'anon')?.api_key;
const service = keys.find(key => key.name === 'service_role')?.api_key;
if (!anon || !service) throw new Error('Chaves legacy necessárias para esta aplicação não disponíveis.');
for (const [key, role] of [[anon,'anon'],[service,'service_role']]) {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (claims.ref !== ref || claims.role !== role) throw new Error('Chave não corresponde ao staging esperado.');
}
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code || result.error.status || 'erro'}`);
  return result.data;
}

if (mode === 'check-access') {
  const credentials = JSON.parse(readFileSync(process.env.STAGING_CREDENTIALS_FILE,'utf8'));
  const outcomes = [];
  const roles = [null,...credentials];
  for (const credential of roles) {
    if (credential && !['admin.staging@example.com','viewer.staging@example.com'].includes(credential.email))
      throw new Error('Conta de teste não autorizada');
    const client = createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    if (credential) checked(await client.auth.signInWithPassword(credential),'Login para testar acesso direto');
    for (const table of ['users','projects','tasks','audit_logs','comments','project_risk_items','task_assignees']) {
      const { error } = await client.from(table).select('*').limit(1);
      if (error?.code !== '42501') throw new Error(`Acesso direto não bloqueado: ${table}`);
      outcomes.push({role:credential?.email || 'anon',table,denied:true});
    }
    for (const [rpc, args] of [
      ['delete_project_transaction',{p_id:randomUUID()}],
      ['write_legacy_batch',{p_changes:[]}],
      ['reserve_ticket_number',{}],
    ]) {
      const { error } = await client.rpc(rpc,args);
      if (error?.code !== '42501') throw new Error(`RPC ${rpc} não bloqueada`);
      outcomes.push({role:credential?.email || 'anon',rpc,denied:true});
    }
    if (credential) checked(await client.auth.signOut(),'Terminar sessão de acesso direto');
  }
  console.log(JSON.stringify({staging:ref,passed:true,outcomes}));
} else if (mode === 'test-integrity') {
  const child = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes','--offline=false','bun','test','tests/fase79-physical-integrity-and-project-boundary.test.ts'],
    {cwd:root,shell:process.platform==='win32',stdio:'inherit',env:{...process.env,
      NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:service,RUN_STAGING_INTEGRITY:'true'}});
  process.exit(child.status ?? 1);
} else if (mode === 'seed') {
  const fixtureSpecs = [
    { email: 'admin.staging@example.com', name: 'Administrador fictício STAGING', role: '10000000-0000-0000-0000-000000000001', isAdmin: true },
    { email: 'viewer.staging@example.com', name: 'Observador fictício STAGING', role: '10000000-0000-0000-0000-000000000007', isAdmin: false },
  ];
  const credentials = [];
  const profiles = [];
  for (const spec of fixtureSpecs) {
    const existing = checked(await admin.from('users').select('id,auth_user_id,email').eq('email',spec.email).maybeSingle(), 'Perfil existente');
    if (existing) throw new Error('Fixtures já existem: não redefinir passwords ou sobrescrever contas automaticamente.');
    checked(await admin.from('roles').select('id').eq('id',spec.role).single(), 'Role de teste');
    const password = randomBytes(24).toString('base64url') + '!aA1';
    const result = checked(await admin.auth.admin.createUser({ email: spec.email, password, email_confirm: true,
      user_metadata: { name: spec.name } }), 'Criar Auth fictício');
    const id = result.user.id;
    checked(await admin.from('users').insert({ id, auth_user_id:id, email:spec.email,
      name:spec.name, role_id:spec.role, approved:true, deleted:false, is_admin:spec.isAdmin, type:'Team' }), 'Criar perfil');
    credentials.push({ email:spec.email, password });
    profiles.push({ ...spec, id });
    const testClient = createClient(url, anon, { auth: { persistSession:false, autoRefreshToken:false } });
    checked(await testClient.auth.signInWithPassword({ email:spec.email, password }), 'Login de teste');
    const permission = checked(await admin.rpc('has_permission',{ p_permission_code:'projects:write',p_user_id:id }), 'RBAC de teste');
    if (permission !== spec.isAdmin) throw new Error('RBAC do role de teste não corresponde ao esperado.');
    checked(await testClient.auth.signOut(), 'Terminar sessão de teste');
  }
  // Credentials outside OneDrive/repository; never contain Supabase API keys.
  const credentialDir = mkdtempSync(join(tmpdir(),'solprojetos-staging-'));
  const credentialPath = join(credentialDir,'test-credentials.json');
  writeFileSync(credentialPath, JSON.stringify(credentials,null,2), { mode:0o600 });
  if (process.platform === 'win32') {
    const identity = spawnSync('whoami.exe',[],{ encoding:'utf8' }).stdout?.trim();
    if (!identity) throw new Error('Não foi possível proteger credenciais locais.');
    const acl = spawnSync('icacls.exe',[credentialDir,'/inheritance:r','/grant:r',`${identity}:(OI)(CI)F`],{ encoding:'utf8' });
    if (acl.status !== 0) throw new Error('Não foi possível restringir acesso às credenciais locais.');
  }
  const owner = profiles[0].id;
  const clientId = randomUUID();
  checked(await admin.from('clients').insert({ id:clientId,client_name:'Cliente fictício STAGING',
    short_name:'STAGING',notes:'Dados sintéticos: não utilizar em produção',created_by:owner }), 'Cliente fictício');
  const status = checked(await admin.from('project_status').select('id').eq('deleted',false).order('scale').limit(1).single(),'Estado de projeto');
  const projectId = randomUUID();
  checked(await admin.from('projects').insert({ id:projectId,client_id:clientId,
    project_title:'Projeto fictício STAGING',demo:true,status_id:status.id,
    project_description:'Fixture isolada para testes RLS',created_by:owner }), 'Projeto fictício');
  const taskStatus = checked(await admin.from('task_status').select('id').eq('deleted',false).order('scale').limit(1).single(),'Estado de tarefa');
  checked(await admin.rpc('create_task_atomic',{ p_id:randomUUID(),p_project_id:projectId,
    p_task_title:'Tarefa fictícia STAGING',p_status_id:taskStatus.id,
    p_estimated_date:new Date().toISOString().slice(0,10),p_estimated_hours:'02:00:00',
    p_created_by:owner,p_assignee_user_ids:[profiles[1].id] }), 'Tarefa fictícia via RPC');
  console.log(JSON.stringify({ project:ref, testUsers:profiles.map(p=>p.email), credentialsFile:credentialPath,
    checks:['Auth login','RBAC admin/viewer','task RPC with assignee'], syntheticFixtures:true }));
} else {
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL:url, SUPABASE_URL:url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:anon, SUPABASE_ANON_KEY:anon, SUPABASE_SERVICE_ROLE_KEY:service,
    ERP_STAGING:'true', ERP_BOOTSTRAP_ENABLED:'false', ERP_BOOTSTRAP_SECRET:'', ERP_BOOTSTRAP_ADMIN_EMAIL:'',
    APP_URL:'http://127.0.0.1:3110', INBOUND_TICKETS_SECRET:randomBytes(32).toString('hex'),
    GEMINI_API_KEY:'', NEXT_TELEMETRY_DISABLED:'1', NEXT_IGNORE_INCORRECT_LOCKFILE:'1' };
  console.log(`STAGING ${ref} — http://127.0.0.1:3110 (sem alterar produção)`);
  const child = spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3110'],
    { cwd:root,env,stdio:'inherit' });
  process.on('SIGINT',()=>child.kill('SIGINT'));
  process.on('SIGTERM',()=>child.kill('SIGTERM'));
  child.on('exit',code=>process.exit(code ?? 1));
}
