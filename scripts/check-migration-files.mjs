import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const errors = [];
const targets = [
  ['production', fileURLToPath(new URL('../supabase/migrations/', import.meta.url))],
  ['staging', fileURLToPath(new URL('../database/staging/supabase/migrations/', import.meta.url))],
];

for (const [environment, directory] of targets) {
  const files = readdirSync(directory).filter(name => name.endsWith('.sql'));
  const versions = new Set();
  for (const file of files) {
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(file);
    if (!match) { errors.push(`${environment}: nome de migration inválido: ${file}`); continue; }
    if (versions.has(match[1])) errors.push(`${environment}: versão duplicada ${match[1]}`);
    versions.add(match[1]);
  }
  if (files.length === 0) errors.push(`${environment}: nenhuma migration ativa`);
  console.log(`${environment}: ${files.length} migrations ativas válidas`);
}

if (errors.length) {
  errors.forEach(error => console.error(error));
  process.exitCode = 1;
}
