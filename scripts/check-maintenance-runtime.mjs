// Local compiled application only. Never calls a remote application/database.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3111'],{env:{...process.env,ERP_CUTOVER_MAINTENANCE:'true'},windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
const checks=[];
try {
  const started=Date.now();
  while(!output.includes('Ready in')) {
    if(server.exitCode!==null||Date.now()-started>30000)throw Error('Local maintenance server failed to start');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  for(const [path,method] of [['/','GET'],['/api/auth/login','POST'],['/api/tickets/inbound','POST'],['/api/supabase/sync','POST'],['/api/v1/tasks','GET']]) {
    const response=await fetch('http://127.0.0.1:3111'+path,{method,signal:AbortSignal.timeout(10000)});
    if(response.status!==503||response.headers.get('cache-control')!=='no-store'||response.headers.get('retry-after')!=='120')throw Error(`Maintenance runtime mismatch: ${path}`);
    checks.push({path,method,status:response.status});
  }
  console.log(JSON.stringify({passed:true,localOnly:true,checks}));
} finally {
  if(server.exitCode===null){const closed=once(server,'exit');server.kill();await closed;}
}
