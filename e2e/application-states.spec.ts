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
  type FixtureUser = typeof owner & { preferredTheme?: string | null };
  let user: FixtureUser = owner;
  let loginUser: FixtureUser = owner;
  let sessionStatus = 200;
  let syncStatus = 200;
  let delayDirectory = 0;
  let saveStatus = 200;
  let profileSaveStatus = 200;
  let applicationTheme = 'default';
  let calendarConfigured = false;
  let clients = [{ id: clientId, clientName: 'Cliente de teste', shortName: 'CT', deleted: false, version: 1 }];
  let writes = 0;

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (url.pathname === '/api/auth/session') {
      if (route.request().method() === 'DELETE') {
        if (route.request().headers()['content-type'] !== 'application/json') return json({ success: false }, 415);
        sessionStatus = 401;
        return json({ success: true });
      }
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
      return json({ isConfigured: true, appConfig: { ...CLEAN_BASELINE_STATE.appConfig, theme: applicationTheme } });
    }
    if (url.pathname === '/api/auth/profile') {
      if (profileSaveStatus !== 200) return json({ success: false }, profileSaveStatus);
      user = { ...user, ...route.request().postDataJSON() };
      return json({ success: true, profile: { name: user.name, preferredTheme: user.preferredTheme } });
    }
    if (url.pathname === '/api/auth/password') {
      if (route.request().postDataJSON().currentPassword === 'incorrecta') {
        return json({ error: { message: 'Palavra-passe atual incorreta.' } }, 403);
      }
      return json({ success: true });
    }
    if (url.pathname === '/api/calendar/subscriptions/mine') {
      const method = route.request().method();
      if (method === 'POST') calendarConfigured = true;
      if (method === 'DELETE') calendarConfigured = false;
      return json({ configured: calendarConfigured, path: calendarConfigured ? '/calendar/fixture.ics' : null });
    }
    if (url.pathname === '/api/calendar/subscriptions/all') return json({ configured: false, path: null });
    if (url.pathname === '/api/v1/configuration') {
      applicationTheme = route.request().postDataJSON().updates.theme;
      return json({ success: true, data: { theme: applicationTheme, syncVersion: 43 } });
    }
    if (url.pathname === '/api/supabase/sync') {
      const partition = url.searchParams.get('partition') as SyncPartition;
      if (partition === 'directory' && delayDirectory) await new Promise(resolve => setTimeout(resolve, delayDirectory));
      if (syncStatus !== 200) return json({ success: false }, syncStatus);
      const appConfig = { ...CLEAN_BASELINE_STATE.appConfig, theme: applicationTheme, syncVersion: 42 };
      const state = { ...CLEAN_BASELINE_STATE, users: [user], clients, appConfig };
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
    setUser: (value: FixtureUser) => { user = value; },
    setLoginUser: (value: FixtureUser) => { loginUser = value; },
    setSessionStatus: (value: number) => { sessionStatus = value; },
    setSaveStatus: (value: number) => { saveStatus = value; },
    setSyncStatus: (value: number) => { syncStatus = value; },
    setDelayDirectory: (value: number) => { delayDirectory = value; },
    setProfileSaveStatus: (value: number) => { profileSaveStatus = value; },
    setApplicationTheme: (value: string) => { applicationTheme = value; },
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

test('uses the configured browser title before and after sign-in', async ({ page }) => {
  const api = await fixture(page);
  api.setSessionStatus(401);
  await page.route('**/api/supabase/config', route => route.fulfill({
    json: { isConfigured: true, appConfig: { appName: 'Portal público de teste' } },
  }));

  await page.goto('/');
  await expect(page).toHaveTitle('Portal público de teste');

  await signIn(page);
  await expect(page).toHaveTitle(CLEAN_BASELINE_STATE.appConfig.appName);
});

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
  api.setDelayDirectory(4500);
  await page.goto('/?tab=clients');
  await expect(page.getByText('Está a demorar mais do que o habitual.')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Carregamento dos dados' })).toHaveAttribute('value', '1');
  await expect(page.locator('#main-root')).toBeVisible();
  api.setDelayDirectory(0);
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

test('opens a standalone profile and applies a saved scheme across navigation and account changes', async ({ page }) => {
  const api = await fixture(page);
  api.setApplicationTheme('emerald');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?tab=clients');
  const theme = page.locator('#main-root');
  const title = page.getByRole('heading', { name: 'Editar perfil' });
  await page.getByRole('link', { name: 'Editar perfil' }).click();
  await expect(page).toHaveURL(/\?tab=perfil$/);
  await expect(title).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(owner.email);
  const header = page.locator('header').filter({ has: title });
  const save = header.getByRole('button', { name: 'Guardar', exact: true });
  const logoutButton = header.getByRole('button', { name: 'Terminar sessão' });
  await expect(save).toBeVisible();
  await expect(logoutButton).toBeVisible();
  const [titleBox, saveBox, logoutBox] = await Promise.all([title.boundingBox(), save.boundingBox(), logoutButton.boundingBox()]);
  expect(saveBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width);
  expect(logoutBox!.x).toBeGreaterThan(saveBox!.x);
  const schemeOptions = page.getByRole('group', { name: 'Esquema de cores' }).locator('label');
  expect(await schemeOptions.evaluateAll(options => new Set(options.map(option => option.getBoundingClientRect().left)).size)).toBe(1);
  await expect(theme).toHaveAttribute('data-theme', 'emerald');
  await page.getByText('Violeta Elegante', { exact: true }).click();
  await expect(theme).toHaveAttribute('data-theme', 'emerald');
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Conta atualizada');
  api.setProfileSaveStatus(503);
  await save.click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Não foi possível guardar o perfil.');
  await expect(theme).toHaveAttribute('data-theme', 'emerald');
  api.setProfileSaveStatus(200);
  await save.click();
  await expect(page.getByText('Perfil atualizado.', { exact: true })).toBeVisible();
  for (const selector of ['html', 'body', '#main-root']) {
    await expect(page.locator(selector)).toHaveAttribute('data-theme', 'violet');
  }
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Pesquisar clientes' })).toBeVisible();
  await expect(theme).toHaveAttribute('data-theme', 'violet');
  await page.goForward();
  await expect(title).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Violeta Elegante' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Conta atualizada');
  expect(await page.evaluate(() => localStorage.getItem('erp_theme'))).toBe('emerald');
  await page.screenshot({ path: '.qa-runtime/states/profile-desktop.png', fullPage: true });

  const [logout] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/session' && response.request().method() === 'DELETE'),
    logoutButton.click(),
  ]);
  expect(logout.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'emerald');
  api.setLoginUser({ ...owner, id: '11111111-1111-4111-8111-000000000002', permissions: [], preferredTheme: 'invalid' });
  await signIn(page);
  await expect(page.getByRole('radio', { name: /Usar o esquema da aplicação/ })).toBeChecked();
  await expect(theme).toHaveAttribute('data-theme', 'emerald');
  await page.getByText('Rosa Coral', { exact: true }).click();
  await save.click();
  await expect(theme).toHaveAttribute('data-theme', 'rose');
  await page.getByText('Usar o esquema da aplicação', { exact: true }).click();
  await save.click();
  await expect(theme).toHaveAttribute('data-theme', 'emerald');
});

test('keeps a personal scheme when saving the general configuration', async ({ page }) => {
  const api = await fixture(page);
  api.setUser({ ...owner, permissions: ['config.read', 'config.write'], preferredTheme: 'violet' });
  await page.goto('/?tab=configuration');
  await page.getByRole('button', { name: /Verde Esmeralda/ }).click();
  await expect(page.getByRole('button', { name: /Verde Esmeralda/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#main-root')).toHaveAttribute('data-theme', 'violet');
  await page.getByRole('link', { name: 'Editar perfil' }).click();
  await expect(page.getByRole('radio', { name: /Usar o esquema da aplicação Verde Esmeralda/ })).toBeVisible();
  await page.getByText('Usar o esquema da aplicação', { exact: true }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('#main-root')).toHaveAttribute('data-theme', 'emerald');
});

test('supports mobile profile, keyboard selection, password validation and calendar subscriptions', async ({ page }) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?tab=perfil');
  await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeVisible();
  const inherited = page.getByRole('radio', { name: /Usar o esquema da aplicação/ });
  await inherited.focus();
  await inherited.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'Domino Institucional', exact: true })).toBeChecked();
  await expect(page.locator('#main-root')).toHaveAttribute('data-theme', 'default');
  const current = page.getByLabel('Palavra-passe atual');
  const password = page.getByLabel('Nova palavra-passe', { exact: true });
  const confirmation = page.getByLabel('Confirmar nova palavra-passe');
  const changePassword = page.getByRole('button', { name: 'Alterar palavra-passe' });
  await current.fill('incorrecta');
  await password.fill('password-de-teste');
  await confirmation.fill('diferente-em-teste');
  await changePassword.click();
  await expect(confirmation).toBeFocused();
  await expect(confirmation).toHaveAccessibleDescription('As palavras-passe não coincidem.');
  await confirmation.fill('password-de-teste');
  await changePassword.click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Palavra-passe atual incorreta.');
  await current.fill('password-atual-de-teste');
  await changePassword.click();
  await expect(page.getByText('Palavra-passe alterada.', { exact: true })).toBeVisible();
  await expect(password).toHaveValue('');

  const calendar = page.getByRole('region', { name: 'Subscrições de calendário' });
  await calendar.getByRole('button', { name: 'Criar endereço' }).first().click();
  await expect(calendar.getByRole('textbox', { name: 'Endereço de As minhas tarefas' })).toHaveValue(/fixture\.ics$/);
  await calendar.getByRole('button', { name: 'Desativar endereço' }).click();
  await expect(calendar.getByRole('button', { name: 'Criar endereço' })).toHaveCount(2);
  for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.qa-runtime/states/profile-mobile.png', fullPage: true });
});
