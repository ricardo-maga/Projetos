import { expect, test, type Page } from '@playwright/test';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';
import { SYNC_PARTITIONS, type SyncPartition } from '../lib/supabase/syncPartitions';

const owner = {
  id: '11111111-1111-4111-8111-000000000001', name: 'Conta de teste', email: 'teste@example.test',
  roleId: '10000000-0000-0000-0000-000000000004',
  permissions: ['clients.read', 'clients.write', 'projects.read', 'tasks.read', 'tasks.write', 'calendar.read'],
};
const clientId = '22222222-2222-4222-8222-000000000001';

async function fixture(page: Page) {
  let user = owner;
  let loginUser = owner;
  let sessionStatus = 200;
  let syncStatus = 200;
  let delayWork = 0;
  let saveStatus = 200;
  let clients = [{ id: clientId, clientName: 'Cliente de teste', shortName: 'CT', deleted: false, version: 1 }];
  let writes = 0;

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (url.pathname === '/api/auth/session') {
      if (sessionStatus !== 200) return json({ success: false }, sessionStatus);
      return json({ success: true, user });
    }
    if (url.pathname === '/api/auth/login') {
      user = loginUser;
      sessionStatus = 200;
      syncStatus = 200;
      return json({ success: true, user });
    }
    if (url.pathname === '/api/supabase/config') {
      return json({ isConfigured: true, appConfig: CLEAN_BASELINE_STATE.appConfig });
    }
    if (url.pathname === '/api/supabase/sync') {
      const partition = url.searchParams.get('partition') as SyncPartition;
      if (partition === 'work' && delayWork) await new Promise(resolve => setTimeout(resolve, delayWork));
      if (syncStatus !== 200) return json({ success: false }, syncStatus);
      const state = { ...CLEAN_BASELINE_STATE, users: [user], clients };
      const data = Object.fromEntries(SYNC_PARTITIONS[partition].map(field => [field, state[field] || []]));
      return json({ success: true, data });
    }
    if (url.pathname === '/api/v1/clients/' + clientId && route.request().method() === 'PATCH') {
      writes += 1;
      if (saveStatus === 401) return json({ error: { code: 'UNAUTHORIZED', message: 'Sessão expirada.' } }, 401);
      if (saveStatus === 422) return json({ error: {
        code: 'VALIDATION_ERROR', message: 'Dados inválidos.', details: { fieldErrors: { taxId: ['Confirme o NIF.'] } },
      } }, 422);
      const updated = { ...clients[0], ...route.request().postDataJSON(), id: clientId, version: 2 };
      clients = [updated];
      return json({ success: true, data: updated });
    }
    if (url.pathname === '/api/v1/projects' || url.pathname === '/api/v1/project-materials') {
      return json({ success: true, data: [], total: 0 });
    }
    return json({ success: true, data: [] });
  });

  return {
    setUser: (value: typeof owner) => { user = value; },
    setLoginUser: (value: typeof owner) => { loginUser = value; },
    setSessionStatus: (value: number) => { sessionStatus = value; },
    setSaveStatus: (value: number) => { saveStatus = value; },
    setSyncStatus: (value: number) => { syncStatus = value; },
    setDelayWork: (value: number) => { delayWork = value; },
    getWrites: () => writes,
  };
}

async function editClient(page: Page) {
  await page.getByRole('button', { name: 'Editar cliente' }).click();
  await expect(page.getByRole('textbox', { name: 'Nome do cliente *' })).toBeVisible();
}

async function signIn(page: Page) {
  await page.locator('#login-email').fill(owner.email);
  await page.locator('#login-password').fill('password-de-teste');
  await page.getByRole('button', { name: /Entrar|Iniciar sessão/i }).click();
}

test('clears a search, shows a field error and confirms the saved client', async ({ page }) => {
  const api = await fixture(page);
  await page.goto('/?tab=clients');
  await page.getByRole('textbox', { name: 'Pesquisar clientes' }).fill('sem correspondência');
  await expect(page.getByText('Nenhum cliente corresponde à pesquisa.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await editClient(page);
  await page.getByRole('textbox', { name: 'Nome do cliente *' }).fill('Cliente atualizado em teste');
  api.setSaveStatus(422);
  await page.getByRole('button', { name: 'Gravar Cliente', exact: true }).last().click();
  const nif = page.getByRole('textbox', { name: 'NIF (Tax ID)' });
  await expect(nif).toBeFocused();
  await expect(nif).toHaveAccessibleDescription('Confirme o NIF.');
  api.setSaveStatus(200);
  await nif.fill('123456789');
  await page.getByRole('button', { name: 'Gravar Cliente', exact: true }).last().click();
  await expect(page.getByText('Cliente atualizado.', { exact: true })).toBeVisible();
  await expect(page.getByText('Cliente atualizado em teste', { exact: true })).toBeVisible();
});

for (const sameAccount of [true, false]) {
  test('session expiry preserves the draft only for the same account ' + sameAccount, async ({ page }) => {
    const api = await fixture(page);
    await page.goto('/?tab=clients');
    await editClient(page);
    await page.getByRole('textbox', { name: 'Nome do cliente *' }).fill('Edição ainda por gravar');
    api.setSaveStatus(401);
    await page.getByRole('button', { name: 'Gravar Cliente', exact: true }).last().click();
    await expect(page.getByText('A sua sessão expirou. Inicie sessão novamente.')).toBeVisible();
    if (!sameAccount) api.setLoginUser({ ...owner, id: '11111111-1111-4111-8111-000000000002' });
    await signIn(page);
    await expect(page.locator('#main-root')).toBeVisible();
    const resume = page.getByRole('button', { name: 'Retomar edição' });
    if (sameAccount) {
      await resume.click();
      await expect(page.getByRole('textbox', { name: 'Nome do cliente *' })).toHaveValue('Edição ainda por gravar');
    } else {
      await expect(resume).toHaveCount(0);
      await expect(page.getByText('Edição ainda por gravar')).toHaveCount(0);
    }
    expect(api.getWrites()).toBe(1);
  });
}

test('revalidates the session before allowing writes after reconnecting', async ({ page, context }) => {
  await fixture(page);
  await page.goto('/?tab=clients');
  await editClient(page);
  await context.setOffline(true);
  await expect(page.getByText('Sem ligação', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Nome do cliente *' })).toHaveValue('Cliente de teste');
  const save = page.getByRole('button', { name: 'Gravar Cliente', exact: true }).last();
  await expect(save).toBeDisabled();
  await context.setOffline(false);
  await expect(save).toBeEnabled();
  await expect(page.getByText('Sem ligação', { exact: true })).toHaveCount(0);
});

test('reports slow progress and exits an unauthorized initial data load', async ({ page }) => {
  const api = await fixture(page);
  api.setDelayWork(4500);
  await page.goto('/?tab=clients');
  await expect(page.getByText('Está a demorar mais do que o habitual.')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Carregamento dos dados' })).toHaveAttribute('value', '2');
  await expect(page.locator('#main-root')).toBeVisible();
  api.setDelayWork(0);
  api.setSyncStatus(401);
  await page.reload();
  await expect(page.getByText('A sua sessão expirou. Inicie sessão novamente.')).toBeVisible();
  await expect(page.locator('#loading-screen')).toHaveCount(0);
});

test('shows a recovery action for unavailable authentication and denied navigation', async ({ page }) => {
  const api = await fixture(page);
  api.setSessionStatus(503);
  await page.goto('/?tab=clients');
  await expect(page.getByRole('heading', { name: 'Serviço temporariamente indisponível' })).toBeVisible();
  api.setUser({ ...owner, permissions: [] });
  api.setSessionStatus(200);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
  await expect(page.getByText('Cliente de teste', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Voltar ao Dashboard' })).toBeVisible();
});


test('distinguishes an empty task list and focuses the invalid task field on mobile', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=tarefas');
  await expect(page.getByText('Ainda não há tarefas registadas.')).toBeVisible();
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  const title = dialog.locator('#task-formTitle');
  await expect(title).toBeFocused();
  await expect(title).toHaveAccessibleDescription('Introduza o título da tarefa.');
  await expect(dialog.locator('#task-formTypeId')).toHaveAccessibleDescription('Selecione o tipo de tarefa.');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: '.qa-runtime/states/task-validation-mobile.png' });
});
