import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const knownFailures = new Set(JSON.parse(
  await readFile(new URL('../tests/known-failures.json', import.meta.url), 'utf8'),
));

const command = process.env.BUN_BIN || (process.platform === 'win32' ? 'bun.cmd' : 'bun');
const child = spawn(command, ['test', 'tests'], {
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

const actualFailures = new Set();
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^\(fail\) (.*?)(?: \[\d+(?:\.\d+)?ms\])?$/);
  if (match) actualFailures.add(match[1]);
}

const unexpected = [...actualFailures].filter(name => !knownFailures.has(name));
const resolved = [...knownFailures].filter(name => !actualFailures.has(name));

console.log(`\nFull-suite regression gate: ${actualFailures.size} failing, ${unexpected.length} new, ${resolved.length} resolved.`);
if (resolved.length) {
  console.log('Known failures no longer reproduced:');
  resolved.forEach(name => console.log(`- ${name}`));
}
if (unexpected.length) {
  console.error('Unexpected failures:');
  unexpected.forEach(name => console.error(`- ${name}`));
  process.exitCode = 1;
} else if (exitCode !== 0 && actualFailures.size === 0) {
  console.error(`The test runner exited with ${exitCode} without reporting test failures.`);
  process.exitCode = 1;
}
