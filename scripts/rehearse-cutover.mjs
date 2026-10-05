// Offline rehearsal only. No URL, credentials, network or production target.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const container = 'solprojetos-cutover-restore-20261005';
const database = 'cutover_restore';
function query(sql) {
  const result = spawnSync('docker', ['exec','-i',container,'psql','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-At'], {input:sql,encoding:'utf8',timeout:60000});
  if (result.status !== 0) throw Error(`Local rehearsal failed: ${(result.stderr || '').slice(0,800)}`);
  return result.stdout.trim();
}
const inspect = JSON.parse(spawnSync('docker',['inspect',container],{encoding:'utf8'}).stdout)[0];
if (inspect.HostConfig.NetworkMode !== 'none' || Object.keys(inspect.HostConfig.PortBindings || {}).length)
  throw Error('Restore test must have no network/ports.');
const countsSQL = `SELECT jsonb_build_object('users',(SELECT count(*) FROM public.users),'auth_users',(SELECT count(*) FROM auth.users),'projects',(SELECT count(*) FROM public.projects),'tasks',(SELECT count(*) FROM public.tasks),'comments',(SELECT count(*) FROM public.comments),'risks',(SELECT count(*) FROM public.project_risk_items));`;
const before = query(countsSQL);
for (const path of [
  'supabase/migrations/20261005160525_legacy_atomic_writes.sql',
  'supabase/migrations/20261005161953_security_function_hardening.sql',
  'supabase/migrations/20261005162756_legacy_conflict_http_status.sql',
  'supabase/security-drafts/20261005_backend_only_rls.sql',
  'supabase/security-drafts/20261005_backend_rpc_access.sql',
]) {
  const source = readFileSync(new URL('../' + path,import.meta.url),'utf8');
  const sql = source.startsWith('-- PROPOSTA:') ? source.replace('BEGIN;',"BEGIN;\nSET LOCAL app.rls_cutover_reviewed = 'on';") : `BEGIN;\n${source}\nCOMMIT;`;
  query(sql);
}
const after = query(countsSQL);
if (before !== after) throw Error('Cutover changed operational row counts.');
const result = JSON.parse(query(`SELECT jsonb_build_object(
  'public_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
  'without_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity),
  'version_columns',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='sync_version'),
  'canonical_locks',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('update_task_atomic','delete_task_atomic','update_project_transaction','delete_project_transaction') AND position('FOR UPDATE' in pg_get_functiondef(p.oid))>0),
  'conflict_code',(SELECT position('PT409' in pg_get_functiondef('public.write_legacy_batch(jsonb)'::regprocedure))>0),
  'browser_rpc_grants',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('write_legacy_batch','reserve_ticket_number','create_task_atomic','update_task_atomic','delete_task_atomic','create_project_transaction','update_project_transaction','delete_project_transaction') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))));`));
if (result.public_tables!==55 || result.without_rls!==0 || result.version_columns!==28 || result.canonical_locks!==4 || !result.conflict_code || result.browser_rpc_grants!==0)
  throw Error('Rehearsal invariants failed.');
console.log(JSON.stringify({passed:true,offline:true,rowCountsPreserved:true,result}));
