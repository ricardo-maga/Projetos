// Isolated QA accounts and API verification. Never accepts a production database.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ref = 'caaiydcycrnwcqefdldz';
const url = `https://${ref}.supabase.co`;
const runtime = path.join(root, '.qa-runtime');
const credentialsPath = path.join(runtime, 'accounts.json');
const mode = process.argv[2];
if (!['prepare', 'probe'].includes(mode)) throw new Error('Use application-qa.mjs prepare|probe');
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--yes', '--offline=false', 'supabase@2.119.0', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json'],
  { cwd: root, shell: process.platform === 'win32', encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (result.status !== 0) throw new Error('Cannot read staging keys; check CLI access.');
const keys = JSON.parse(result.stdout);
const service = keys.find(k => k.name === 'service_role')?.api_key;
if (!service) throw new Error('Missing service key');
const claims = JSON.parse(Buffer.from(service.split('.')[1], 'base64url'));
if (claims.ref !== ref || claims.role !== 'service_role') throw new Error('Wrong database target');
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
function checked(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.code || result.error.status || result.error.message}`);
  return result.data;
}
fs.mkdirSync(runtime, { recursive: true });
if (process.platform === 'win32') {
  const identity = spawnSync('whoami.exe', [], { encoding: 'utf8' }).stdout.trim();
  if (!identity || spawnSync('icacls.exe', [runtime, '/inheritance:r', '/grant:r', `${identity}:(OI)(CI)F`], { encoding: 'utf8' }).status !== 0) throw new Error('Cannot restrict QA runtime ACL');
}

if (mode === 'prepare') {
  if (fs.existsSync(credentialsPath)) throw new Error('QA run already exists; reuse credentials, never reset passwords.');
  const runId = `qa-${Date.now()}`;
  const roles = checked(await admin.from('roles').select('id,code').eq('is_active', true), 'Read roles');
  const accounts = [];
  const state = { runId, project: ref, accounts };
  for (const code of ['SUPER_ADMIN', 'ADMIN', 'VIEWER', 'PROJECT_MANAGER', 'COMMERCIAL', 'SOLUTIONS', 'TECHNICIAN']) {
    const role = roles.find(r => r.code === code);
    if (!role) throw new Error(`Missing role ${code}`);
    const email = `${runId}-${code.toLowerCase()}@example.invalid`;
    const password = `${randomBytes(24).toString('base64url')}!aA1`;
    const name = `${runId} ${code}`;
    const { user } = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'Create QA auth');
    accounts.push({ email, password, name, id: user.id, code });
    fs.writeFileSync(credentialsPath, JSON.stringify(state, null, 2), { mode: 0o600 });
    checked(await admin.from('users').insert({ id: user.id, auth_user_id: user.id, email, name, role_id: role.id, approved: true, deleted: false, type: 'Team', is_admin: ['SUPER_ADMIN', 'ADMIN'].includes(code) }), 'Create QA profile');
    checked(await admin.from('user_roles').upsert({ user_id: user.id, role_id: role.id }, { onConflict: 'user_id,role_id' }), 'Assign QA role');
  }
  console.log(JSON.stringify({ project: ref, runId, accounts: accounts.map(({ code, email }) => ({ code, email })), credentials: '.qa-runtime/accounts.json' }));
} else {
  const state = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  if (state.project !== ref) throw new Error('Wrong QA state');
  const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3110';
  if (base !== 'http://127.0.0.1:3110' && base !== 'https://projex-ld1yrjy7f-gestao-de-projetos.vercel.app') throw new Error('Unapproved application URL');
  const outcomes = [];
  for (const account of state.accounts) {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }), signal: AbortSignal.timeout(120000) });
    const body = await response.json();
    outcomes.push({ role: account.code, path: '/api/auth/login', status: response.status, success: body.success === true, message: body.error || body.message });
    const cookies = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    if (response.ok) for (const route of ['/api/auth/me', '/api/v1/projects', '/api/v1/tasks', '/api/v1/clients', '/api/v1/presales', '/api/v1/mechanical-design', '/api/v1/reference-data', '/api/v1/configuration', '/api/rbac/catalog']) {
      const res = await fetch(base + route, { headers: { Cookie: cookies }, signal: AbortSignal.timeout(120000) });
      outcomes.push({ role: account.code, path: route, status: res.status });
    }
  }
  fs.writeFileSync(path.join(runtime, 'probe.json'), JSON.stringify({ runId: state.runId, project: ref, base, outcomes }, null, 2));
  console.log(JSON.stringify({ project: ref, base, outcomes }, null, 2));
}
