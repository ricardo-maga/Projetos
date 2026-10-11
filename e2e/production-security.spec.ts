import { expect, test, type APIRequestContext } from '@playwright/test';

const required = [
  'E2E_BASE_URL',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_VIEWER_EMAIL',
  'E2E_VIEWER_PASSWORD',
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_ANON_KEY',
] as const;

function environment(name: (typeof required)[number]) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required CI variable: ${name}`);
  return value;
}

async function login(request: APIRequestContext, email: string, password: string) {
  const response = await request.post('/api/auth/login', { data: { email, password, rememberMe: false } });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.token).toBeTruthy();
  return body.token as string;
}

test.beforeEach(() => required.forEach(environment));

test('anonymous and limited users cannot bypass server authorization', async ({ request }) => {
  const anonymousAttempt = await request.get('/api/v1/tasks');
  expect(anonymousAttempt.status()).toBe(401);

  const viewerToken = await login(request, environment('E2E_VIEWER_EMAIL'), environment('E2E_VIEWER_PASSWORD'));
  const writeAttempt = await request.post('/api/v1/projects', {
    headers: { Authorization: `Bearer ${viewerToken}` },
    data: {},
  });
  expect(writeAttempt.status()).toBe(403);
});

test('admin session and Supabase Data API boundaries are valid', async ({ request }) => {
  const adminToken = await login(request, environment('E2E_ADMIN_EMAIL'), environment('E2E_ADMIN_PASSWORD'));
  const profile = await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
  expect(profile.status()).toBe(200);

  const headers = {
    apikey: environment('E2E_SUPABASE_ANON_KEY'),
    Authorization: `Bearer ${adminToken}`,
  };
  const supabaseUrl = environment('E2E_SUPABASE_URL');
  for (const table of ['notifications', 'notification_reads', 'user_roles']) {
    const response = await request.get(`${supabaseUrl}/rest/v1/${table}?select=*`, { headers });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  }
});
