import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { assessFullTestRun } from './full-test-regression-gate.mjs';

const knownFailures = new Set(JSON.parse(
  await readFile(new URL('../tests/known-failures.json', import.meta.url), 'utf8'),
));

// Windows workstations do not necessarily have Bun on PATH. Use a pinned
// package there; CI installs the same version directly with setup-bun.
const command = process.env.BUN_BIN || (process.platform === 'win32' ? 'npx.cmd' : 'bun');
const args = process.env.BUN_BIN || process.platform !== 'win32'
  ? ['test', 'tests']
  : ['--yes', 'bun@1.3.1', 'test', 'tests'];
const child = spawn(command, args, {
  cwd: new URL('..', import.meta.url),
  env: process.env,
  shell: process.platform === 'win32',
});

let output = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    output += chunk;
    (stream === child.stdout ? process.stdout : process.stderr).write(chunk);
  });
}

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});

const { actualFailures, unexpected, resolved, errors } = assessFullTestRun(output, exitCode, knownFailures);

console.log(`\nFull-suite regression gate: ${actualFailures.size} failing, ${unexpected.length} new, ${resolved.length} resolved.`);
if (resolved.length) {
  console.log('Known failures no longer reproduced:');
  resolved.forEach(name => console.log(`- ${name}`));
}
if (unexpected.length) {
  console.error('Unexpected failures:');
  unexpected.forEach(name => console.error(`- ${name}`));
}
if (errors.length) {
  errors.forEach(error => console.error(error));
  process.exitCode = 1;
}
