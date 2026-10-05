// Offline contention test: an in-flight writer must prevent partial freeze installation.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
const container='solprojetos-cutover-restore-20261005';
const database='cutover_restore';
const inspection=JSON.parse(spawnSync('docker',['inspect',container],{encoding:'utf8'}).stdout)[0];
if(inspection.HostConfig.NetworkMode!=='none'||Object.keys(inspection.HostConfig.PortBindings||{}).length)throw Error('Offline guard failed');
const args=['exec','-i',container,'psql','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-At'];
const source=name=>readFileSync(new URL('../supabase/security-drafts/'+name,import.meta.url),'utf8').replace('BEGIN;',"BEGIN;\nSET LOCAL app.cutover_freeze_reviewed='on';");
function query(sql){return spawnSync('docker',args,{input:sql,encoding:'utf8',timeout:30000});}
function checked(sql){const result=query(sql);if(result.status!==0)throw Error('Offline SQL assertion failed');return result.stdout.trim();}
const writer=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
const closed=once(writer,'close');let output='';
const ready=new Promise((resolve,reject)=>{writer.stdout.on('data',c=>{output+=c;if(output.includes('WRITER_READY'))resolve();});writer.on('error',reject);writer.on('close',()=>{if(!output.includes('WRITER_READY'))reject(Error('Writer failed to start'));});});
writer.stderr.on('data',()=>{});
writer.stdin.end("BEGIN; UPDATE public.tasks SET task_title=task_title WHERE false; SELECT 'WRITER_READY'; SELECT pg_sleep(15); ROLLBACK;");
try {
  await ready;
  const result=query(source('cutover-freeze-enable.sql'));
  if(result.status===0||!result.stderr.includes('lock timeout'))throw Error('Freeze did not refuse an in-flight writer');
  if(checked("SELECT to_regnamespace('cutover_control') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='cutover_write_freeze');")!=='t')throw Error('Failed freeze left partial objects');
} finally {await closed;}
checked(source('cutover-freeze-enable.sql'));
checked(source('cutover-freeze-disable.sql'));
console.log(JSON.stringify({passed:true,offline:true,inFlightWriterRespected:true,timeoutRolledBackEntireFreeze:true,retryAfterDrainPassed:true}));
