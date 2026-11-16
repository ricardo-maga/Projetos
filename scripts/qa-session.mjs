import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtime = path.join(root, '.qa-runtime');
export const state = JSON.parse(fs.readFileSync(path.join(runtime, 'accounts.json'), 'utf8'));
if (state.project !== 'caaiydcycrnwcqefdldz') throw new Error('Wrong QA database');
export const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3110';
if (base !== 'http://127.0.0.1:3110' && !/^https:\/\/projex-[a-z0-9]+-gestao-de-projetos\.vercel\.app$/.test(base)) throw new Error('Unsupported QA URL');
const sessions = new Map();
const report = path.join(runtime, 'functional-results.json');
const previousReport = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : null;
export const results = previousReport?.runId === state.runId ? previousReport.results : [];
export function record(label, passed, details = {}) {
  // Other QA processes may have recorded independent checks since import.
  const latest = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : null;
  if (latest?.runId === state.runId) results.splice(0, results.length, ...latest.results);
  results.push({ label, passed, checkedAt: new Date().toISOString(), ...details });
  fs.writeFileSync(report, JSON.stringify({ runId: state.runId, project: state.project, base, results }, null, 2));
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
}
export async function session(code = 'SUPER_ADMIN') {
  if (sessions.has(code)) return sessions.get(code);
  const account = state.accounts.find(a => a.code === code);
  if (!account || account.email.toLowerCase() === 'ricardo75@gmail.com') throw new Error('Invalid QA identity');
  const branding = await (await fetch(base + '/api/supabase/config')).json();
  if (!branding.appConfig?.appName?.includes('STAGING')) throw new Error('QA target is not branded as STAGING');
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }), signal: AbortSignal.timeout(120000) });
  const body = await res.json();
  if (!res.ok || body.user?.id !== account.id) throw new Error(`QA login failed for ${code}: ${res.status}`);
  const cookie = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  sessions.set(code, cookie);
  return cookie;
}
export async function request(route, method = 'GET', data, code = 'SUPER_ADMIN') {
  const cookie = code === 'ANONYMOUS' ? '' : await session(code);
  const idempotency = method === 'POST' ? { 'Idempotency-Key': state.runId + '-' + createHash('sha256').update(route + JSON.stringify(data)).digest('hex').slice(0, 32) } : {};
  const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...idempotency, ...(cookie ? { Cookie: cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(120000) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
export async function expect(label, route, method, data, expected = 200, code = 'SUPER_ADMIN') {
  const res = await request(route, method, data, code);
  record(label, res.status === expected, { route, method, role: code, status: res.status, expected, ...(res.status === expected ? {} : { error: res.body?.message || res.body?.error, details: res.body?.details }) });
  if (res.status !== expected) throw new Error(`${label}: HTTP ${res.status}, expected ${expected}`);
  return res.body;
}
const ledgerPath = path.join(runtime, 'ledger.json');
export const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { runId: state.runId, project: state.project, entities: [] };
export function track(type, data) {
  if (!data?.id) throw new Error('Missing created entity id');
  const item = { type, id: data.id, version: data.version ?? data.syncVersion ?? 1, deleted: false };
  ledger.entities.push(item);
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  return data;
}
