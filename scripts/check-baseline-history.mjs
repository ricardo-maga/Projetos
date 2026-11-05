import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generated = process.argv.includes('--generate');

function sha256(path) {
  // Git stores these SQL files with LF; normalize Windows checkout line endings.
  const sql = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(sql).digest('hex');
}

for (const environment of ['production', 'staging']) {
  const directory = join(root, 'database', 'history', environment);
  const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  const baseline = environment === 'production'
    ? join(root, 'supabase', 'migrations', '20261105000000_production_baseline.sql')
    : join(root, 'database', 'staging', 'supabase', 'migrations', '20261105000000_staging_baseline.sql');
  const actual = {
    baselineSha256: sha256(baseline),
    history: files.map(name => ({ name, sha256: sha256(join(directory, name)) })),
  };
  const manifestPath = join(root, 'database', environment, 'history-manifest.json');
  if (generated) {
    writeFileSync(manifestPath, JSON.stringify(actual, null, 2) + '\n');
  } else {
    const expected = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${environment} baseline/history changed without updating its verified manifest`);
    }
  }
  console.log(`${environment}: baseline and ${files.length} historical migrations verified`);
}
