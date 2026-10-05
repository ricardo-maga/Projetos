// Offline only; contains no production URL, API key or user credentials.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const container = 'solprojetos-cutover-restore-20261005';
const database = 'cutover_restore';
function query(sql) {
  const result = spawnSync('docker',['exec','-i',container,'psql','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input:sql,encoding:'utf8',timeout:60000});
  if(result.status!==0) throw Error(`Offline freeze test failed: ${(result.stderr||'').slice(0,700)}`);
  return result.stdout.trim();
}
const inspection=JSON.parse(spawnSync('docker',['inspect',container],{encoding:'utf8'}).stdout)[0];
if(inspection.HostConfig.NetworkMode!=='none'||Object.keys(inspection.HostConfig.PortBindings||{}).length) throw Error('Offline container must have no network or ports');
const source=name=>readFileSync(new URL('../supabase/security-drafts/'+name,import.meta.url),'utf8').replace('BEGIN;',"BEGIN;\nSET LOCAL app.cutover_freeze_reviewed='on';");
const counts=()=>query(`SELECT jsonb_build_object('users',(SELECT count(*) FROM public.users),'projects',(SELECT count(*) FROM public.projects),'tasks',(SELECT count(*) FROM public.tasks),'comments',(SELECT count(*) FROM public.comments));`);
const before=counts();
query(source('cutover-freeze-enable.sql'));
let checks=0;
try {
  const installed=Number(query("SELECT count(*) FROM pg_trigger WHERE tgname='cutover_write_freeze' AND tgenabled='O';"));
  if(installed!==55)throw Error('Not all 55 tables are guarded');
  query(`CREATE FUNCTION cutover_control.definer_probe() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'UPDATE public.tasks SET task_title=task_title WHERE false'; REVOKE ALL ON FUNCTION cutover_control.definer_probe() FROM PUBLIC;`);
  for(const role of ['anon','authenticated','service_role']) {
    for(const statement of ['INSERT INTO public.tasks DEFAULT VALUES','UPDATE public.tasks SET task_title=task_title WHERE false','DELETE FROM public.tasks WHERE false','TRUNCATE public.audit_logs','SELECT cutover_control.definer_probe()']) {
      query(`BEGIN; SET LOCAL request.jwt.claims='{"role":"${role}"}'; DO $test$ BEGIN BEGIN ${statement}; RAISE EXCEPTION 'Expected maintenance rejection'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END; END $test$; ROLLBACK;`);
      checks++;
    }
  }
  // No REST context: actual service role must still be blocked, while trusted SQL works.
  query(`BEGIN; SET LOCAL ROLE service_role; DO $test$ BEGIN BEGIN UPDATE public.tasks SET task_title=task_title WHERE false; RAISE EXCEPTION 'Expected role rejection'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END; END $test$; ROLLBACK;`); checks++;
  query('BEGIN; UPDATE public.tasks SET task_title=task_title WHERE false; ROLLBACK;'); checks++;
  if(before!==counts())throw Error('Operational row counts changed');
} finally {
  query('DROP FUNCTION IF EXISTS cutover_control.definer_probe();');
  query(source('cutover-freeze-disable.sql'));
}
query(`BEGIN; SET LOCAL request.jwt.claims='{"role":"service_role"}'; UPDATE public.tasks SET task_title=task_title WHERE false; ROLLBACK;`); checks++;
if(query("SELECT to_regnamespace('cutover_control') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='cutover_write_freeze');")!=='t')throw Error('Temporary guard was not completely removed');
if(before!==counts())throw Error('Unfreeze changed row counts');
console.log(JSON.stringify({passed:true,offline:true,checks,tablesGuarded:55,rowCountsPreserved:true,temporaryObjectsRemoved:true}));
