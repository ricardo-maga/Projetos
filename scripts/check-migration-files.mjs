import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const files = readdirSync(directory).filter(name => name.endsWith('.sql'));
const versions = new Map();
const errors = [];

for (const file of files) {
  const match = /^(\d{3}|\d{14})_[a-z0-9_]+\.sql$/.exec(file);
  if (!match) {
    errors.push(`Nome de migration inválido: ${file}`);
    continue;
  }
  const version = match[1];
  const previous = versions.get(version) || [];
  versions.set(version, [...previous, file]);
}

const historical009 = [
  '009_public_app_configuration.sql',
  '009_remove_legacy_permissive_policies.sql',
];
for (const [version, names] of versions) {
  if (names.length < 2) continue;
  if (version === '009' && names.length === historical009.length &&
      historical009.every(name => names.includes(name))) continue;
  errors.push(`Versão duplicada ${version}: ${names.join(', ')}`);
}

if (errors.length) {
  errors.forEach(error => console.error(error));
  process.exitCode = 1;
} else {
  console.log(`${files.length} migrations válidas; a duplicação histórica 009 está documentada.`);
}
