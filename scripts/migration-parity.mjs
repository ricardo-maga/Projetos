import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function compareMigrations(directory, remote) {
  const local = readdirSync(directory).filter(file => /^\d{14}_.+\.sql$/.test(file)).map(file => ({ version: file.slice(0, 14), name: file.slice(15, -4) }));
  const errors = [];
  for (const row of local) {
    const applied = remote.find(item => item.version === row.version);
    if (!applied) errors.push(`Not applied: ${row.version}_${row.name}`);
    else if (applied.name !== row.name) errors.push(`Name mismatch: ${row.version}`);
  }
  for (const row of remote) if (!local.some(item => item.version === row.version)) errors.push(`Missing locally: ${row.version}_${row.name}`);
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN required; never use a database service key.');
  for (const [environment, ref, directory] of [
    ['production', 'lydxxrzbytfzrsuxptsm', 'supabase/migrations'],
    ['staging', 'caaiydcycrnwcqefdldz', 'database/staging/supabase/migrations'],
  ]) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'select version,name from supabase_migrations.schema_migrations order by version', read_only: true }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`${environment}: history unavailable (HTTP ${response.status})`);
    const errors = compareMigrations(directory, await response.json());
    console.log(`${environment}: ${errors.length ? errors.join('; ') : 'versions and names match'}`);
    if (errors.length) process.exitCode = 1;
  }
}
