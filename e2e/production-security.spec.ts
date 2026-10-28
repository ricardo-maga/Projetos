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
  for (const table of [
    'notifications',
    'notification_reads',
    'user_roles',
    // Internal planning tables are server-authoritative. Authenticated users
    // must not bypass API RBAC through the Supabase Data API.
    'planning_allocations',
    'work_schedules',
    'work_schedule_periods',
    'resource_work_schedules',
    'work_schedule_overrides',
    'work_schedule_override_periods',
    'non_project_work',
    'resource_non_project_allocations',
    'skills',
    'resource_skills',
    'task_skill_requirements',
  ]) {
    const response = await request.get(`${supabaseUrl}/rest/v1/${table}?select=*`, { headers });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  }
});

test('integration endpoints reject malformed credentials', async ({ request }) => {
  const invalidKey = await request.get('/api/integrations/v1/projects', {
    headers: { Authorization: 'Bearer erp_int_invalid' },
  });
  expect(invalidKey.status()).toBe(401);
});

test('integration keys enforce scope, quotas, expiry and revocation', async ({ request }) => {
  test.setTimeout(90_000);
  const managerEmail = process.env.E2E_INTEGRATION_MANAGER_EMAIL;
  const managerPassword = process.env.E2E_INTEGRATION_MANAGER_PASSWORD;
  test.skip(!managerEmail || !managerPassword,
    'Set E2E_INTEGRATION_MANAGER_EMAIL and E2E_INTEGRATION_MANAGER_PASSWORD for an account with roles.manage.');
  const adminToken = await login(request, managerEmail!, managerPassword!);
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const projectsResponse = await request.get('/api/v1/projects?page=1&pageSize=1', { headers: adminHeaders });
  expect(projectsResponse.status()).toBe(200);
  const projects = await projectsResponse.json();
  const projectId = projects.data?.[0]?.id as string | undefined;
  expect(projectId, 'The production integration test needs an existing project').toBeTruthy();

  const createdIds: string[] = [];
  const createKey = async (expiresInMs: number, rateLimitPerMinute: number) => {
    const response = await request.post('/api/integrations', {
      headers: adminHeaders,
      data: {
        name: `CI integration probe ${Date.now()}`,
        permissions: ['projects:read', 'tasks:read'],
        projectIds: [projectId],
        expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
        rateLimitPerMinute,
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.key).toMatch(/^erp_int_/);
    createdIds.push(body.data.id);
    return body.key as string;
  };

  try {
    const key = await createKey(60_000, 4);
    const headers = { Authorization: `Bearer ${key}` };
    const scoped = await request.get('/api/integrations/v1/projects?page=1&pageSize=25', { headers });
    expect(scoped.status()).toBe(200);
    const page = await scoped.json();
    expect(page.data.length).toBeGreaterThan(0);
    expect(page.data.every((project: { id: string }) => project.id === projectId)).toBe(true);

    const outside = await request.get('/api/integrations/v1/tasks?projectId=00000000-0000-4000-8000-000000000000', { headers });
    expect(outside.status()).toBe(404);
    const changes = await request.get(`/api/integrations/v1/tasks/changes?projectId=${projectId}&since=2026-01-01T00%3A00%3A00Z`, { headers });
    expect(changes.status()).toBe(200);
    const fourth = await request.get('/api/integrations/v1/projects?page=1&pageSize=1', { headers });
    expect(fourth.status()).toBe(200);
    const limited = await request.get('/api/integrations/v1/projects?page=1&pageSize=1', { headers });
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);

    const revoked = await request.delete(`/api/integrations/${createdIds[0]}`, { headers: adminHeaders });
    expect(revoked.status()).toBe(200);
    const afterRevocation = await request.get('/api/integrations/v1/projects', { headers });
    expect(afterRevocation.status()).toBe(401);

    const expiringKey = await createKey(3_000, 10);
    await new Promise(resolve => setTimeout(resolve, 3_200));
    const afterExpiry = await request.get('/api/integrations/v1/projects', {
      headers: { Authorization: `Bearer ${expiringKey}` },
    });
    expect(afterExpiry.status()).toBe(401);
  } finally {
    for (const id of createdIds) {
      await request.delete(`/api/integrations/${id}`, { headers: adminHeaders });
    }
  }
});
