// Proves restoration of a backup taken while the temporary guard is installed.
// Offline Docker only. Keeps the recovery database for inspection; never drops data.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const container='solprojetos-cutover-restore-20261005';
const original='cutover_restore';
const restored=`cutover_freeze_restore_${Date.now()}`;
function run(args,input) {
  const result=spawnSync('docker',['exec','-i',container,...args],{input,encoding:'utf8',timeout:60000,maxBuffer:64*1024*1024});
  if(result.status!==0)throw Error(`Offline recovery failed: ${(result.stderr||'').slice(0,500)}`);
  return result.stdout.trim();
}
function query(database,sql){return run(['psql','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-At'],sql);}
const inspection=JSON.parse(spawnSync('docker',['inspect',container],{encoding:'utf8'}).stdout)[0];
if(inspection.HostConfig.NetworkMode!=='none'||Object.keys(inspection.HostConfig.PortBindings||{}).length)throw Error('Offline network guard failed');
const source=name=>readFileSync(new URL('../supabase/security-drafts/'+name,import.meta.url),'utf8').replace('BEGIN;',"BEGIN;\nSET LOCAL app.cutover_freeze_reviewed='on';");
const countsSQL=`SELECT jsonb_build_object('users',(SELECT count(*) FROM public.users),'auth_users',(SELECT count(*) FROM auth.users),'projects',(SELECT count(*) FROM public.projects),'tasks',(SELECT count(*) FROM public.tasks),'comments',(SELECT count(*) FROM public.comments),'risks',(SELECT count(*) FROM public.project_risk_items));`;
const before=query(original,countsSQL);
query(original,source('cutover-freeze-enable.sql'));
let digest;
try {
  // Include the private guard schema: public trigger definitions depend on it.
  const dump=run(['pg_dump','-U','supabase_admin','-d',original,'--schema=public','--schema=auth','--schema=cutover_control']);
  digest=createHash('sha256').update(dump).digest('hex');
  query('postgres',`CREATE DATABASE ${restored} TEMPLATE template0;`);
  query(restored,readFileSync(new URL('../supabase/security-drafts/restore-test-bootstrap.sql',import.meta.url),'utf8'));
  query(restored,'ALTER EXTENSION btree_gist SET SCHEMA extensions;');
  // template0 supplies an empty public schema; dump recreates its exact owner/ACL.
  if(query(restored,"SELECT NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public');")!=='t')throw Error('Recovery public schema is not empty');
  query(restored,'DROP SCHEMA public;'); // RESTRICT, only the newly created offline database.
  query(restored,dump);
  if(query(restored,countsSQL)!==before)throw Error('Recovery row counts differ');
  if(Number(query(restored,"SELECT count(*) FROM pg_trigger WHERE tgname='cutover_write_freeze';"))!==55)throw Error('Restored guard incomplete');
  query(restored,source('cutover-freeze-disable.sql'));
  if(query(restored,"SELECT to_regnamespace('cutover_control') IS NULL;")!=='t')throw Error('Recovery left guard objects');
  if(query(restored,countsSQL)!==before)throw Error('Reopening recovery changed data');
} finally {
  query(original,source('cutover-freeze-disable.sql'));
}
console.log(JSON.stringify({passed:true,offline:true,recoveryDatabase:restored,rowCountsPreserved:true,restoredGuards:55,unfreezePassed:true,dumpSha256:digest}));
