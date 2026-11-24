import { expect, test, type Page } from '@playwright/test';

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
async function screen(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Ecrã de teste' }).getByRole('button', { name: label, exact: true }).click();
}
test('recopia uma subscrição após recarregar e orienta a renovação de um endereço antigo', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const existing = '/api/calendar/feeds/mine/example.ics';
  const renewed = '/api/calendar/feeds/all/renewed.ics';
  let savedAll: string | null = null;
  let failuresRemaining = 1;
  let mutations = 0;
  await page.route('**/api/calendar/subscriptions/*', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const path = request.url().endsWith('/mine') ? existing : savedAll;
      await route.fulfill({ json: { configured: true, path } });
    } else {
      mutations += 1;
      expect(request.headers()['content-type']).toBe('application/json');
      if (failuresRemaining-- > 0) {
        await route.fulfill({ status: 415, json: { error: { message: 'Formato do pedido não suportado.' } } });
      } else {
        savedAll = renewed;
        await route.fulfill({ json: { configured: true, path: savedAll } });
      }
    }
  });
  await page.goto('/?subscricoes');
  const mine = page.getByRole('heading', { name: 'As minhas tarefas' }).locator('..');
  const all = page.getByRole('heading', { name: 'Todas as tarefas' }).locator('..');
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  await mine.getByRole('button', { name: 'Copiar endereço' }).click();
  expect(await clipboard()).toBe(new URL(existing, page.url()).href);
  await page.reload();
  await mine.getByRole('button', { name: 'Copiar endereço' }).click();
  expect(await clipboard()).toBe(new URL(existing, page.url()).href);
  expect(mutations).toBe(0);
  await expect(all.getByRole('button', { name: 'Copiar endereço' })).toBeDisabled();
  await expect(all.getByText(/Renove este endereço/)).toBeVisible();
  await all.getByRole('button', { name: 'Renovar endereço' }).click();
  await expect(page.getByRole('alert')).toHaveText('Formato do pedido não suportado.');
  await all.getByRole('button', { name: 'Renovar endereço' }).click();
  await expect(all.getByRole('button', { name: 'Copiar endereço' })).toBeEnabled();
  await page.reload();
  await all.getByRole('button', { name: 'Copiar endereço' }).click();
  expect(await clipboard()).toBe(new URL(renewed, page.url()).href);
  expect(mutations).toBe(2);
});

for (const width of [390, 1280]) {
  test(`confirma uma reserva e atualiza horas e conflitos a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?provisoria');
    const hours = page.getByText('Horas prev. semana', { exact: true }).locator('..');
    await expect(hours).toContainText(/3\s*h/);

    await screen(page, 'Calendário');
    const plannedTask = page.getByRole('button', { name: /Expandir tarefa de Indústria/ });
    const create = width < 768
      ? page.getByRole('button', { name: 'Criar tarefa para Ana de exemplo', exact: true })
      : page.getByRole('cell').filter({ has: plannedTask })
        .getByRole('button', { name: /^Adicionar nova tarefa para Ana de exemplo em / });
    await create.click();

    const dialog = page.getByRole('dialog');
    const planning = dialog.getByLabel('Planeamento', { exact: true });
    await expect(dialog.getByLabel('Data planeada', { exact: false }).first()).not.toHaveValue('');
    await dialog.getByLabel('Título da tarefa').fill('Reserva de montagem');
    await dialog.getByLabel('Tipo de tarefa').selectOption('qa-type');
    await dialog.getByLabel('Horas previstas (h)').fill('4');
    await planning.selectOption('provisional');
    await dialog.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const conflicts = width < 768
      ? page.getByRole('region', { name: 'Agenda diária' }).getByText(/Aviso operacional/)
      : page.locator('.project-timeline-conflict-cell');
    await expect(conflicts).toHaveCount(0);

    await screen(page, 'Tarefas');
    await page.getByLabel('Filtrar por planeamento').selectOption('provisional');
    await expect(page.getByText('Instalação confirmada', { exact: true })).toHaveCount(0);
    await page.getByText('Reserva de montagem', { exact: true }).filter({ visible: true }).click();
    await expect(planning).toHaveValue('provisional');
    await expect(dialog.getByLabel('Horas consumidas (h)')).toHaveAttribute('readonly', '');
    await expect(dialog.getByText(/Aviso Informativo de Conflitos/)).toHaveCount(0);
    await planning.selectOption('planned');
    await expect(dialog.getByText(/já tem 1 tarefa planeada/)).toBeVisible();
    await expect(dialog.getByLabel('Horas consumidas (h)')).toHaveAttribute('readonly', '');
    await dialog.getByRole('button', { name: 'Confirmar planeamento' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(hours).toContainText(/7\s*h/);

    await screen(page, 'Calendário');
    await expect(conflicts.first()).toBeVisible();
    await fits(page);
  });
}

for (const width of [360, 390, 430, 768, 1280]) {
  test(`four screens fit at ${width}px and preserve task opening`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Lista de tarefas' })).toBeVisible();
    if (width < 768) {
      const list = page.getByRole('list', { name: 'Lista compacta de tarefas' });
      await expect(list).toBeVisible();
      await list.getByRole('button').first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await fits(page);
      await page.keyboard.press('Escape');
    } else await expect(page.getByRole('columnheader', { name: 'Responsáveis', exact: true })).toBeVisible();
    await fits(page);
    await page.screenshot({ path: `.qa-runtime/mobile-results/tasks-${width}.png` });
    await screen(page, 'Projetos');
    await expect(page.getByRole('heading', { name: 'Lista de projetos' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Lista compacta de projetos' }).or(page.locator('.mobile-project-section table')).filter({ visible: true })).toContainText('Linha de embalagem com título extenso e identificação industrial');
    if (width < 768) await expect(page.getByRole('list', { name: 'Lista compacta de projetos' }).getByText('Risco crítico', { exact: true })).toBeVisible();
    await fits(page);
    await page.screenshot({ path: `.qa-runtime/mobile-results/projects-${width}.png` });
    await screen(page, 'Calendário');
    if (width < 768) {
      const agenda = page.getByRole('region', { name: 'Agenda diária', exact: true });
      await expect(agenda).toBeVisible();
      await expect(agenda.getByText('Férias de exemplo', { exact: false })).toBeVisible();
      await expect(agenda.getByText('02:30', { exact: false }).first()).toBeVisible();
      await page.screenshot({ path: `.qa-runtime/mobile-results/calendar-${width}.png` });
      await agenda.getByRole('button', { name: 'Dia seguinte', exact: true }).click();
      const date = await agenda.getByLabel('Data da agenda').inputValue();
      await page.getByRole('button', { name: 'Grelha completa', exact: true }).click();
      await fits(page);
      await page.getByRole('button', { name: 'Vista móvel', exact: true }).click();
      await expect(agenda.getByLabel('Data da agenda')).toHaveValue(date);
    }
    await fits(page);
    await page.getByRole('button', { name: 'Timeline de projetos', exact: true }).click();
    if (width < 768) {
      const agenda = page.getByRole('region', { name: 'Agenda de projetos', exact: true });
      await expect(agenda).toBeVisible();
      const project = agenda.getByRole('region', { name: 'Agenda de Linha de embalagem com título extenso e identificação industrial' });
      await project.getByRole('button', { expanded: false }).click();
      await expect(project.getByRole('heading', { name: 'Tarefas sem data', exact: true })).toBeVisible();
      await project.getByRole('button', { name: /Afinação do equipamento/ }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await fits(page);
      await page.keyboard.press('Escape');
      await page.screenshot({ path: `.qa-runtime/mobile-results/timeline-${width}.png` });
    }
    await fits(page);
    expect(errors).toEqual([]);
  });
}

for (const width of [360, 768, 1280]) {
  test(`Dashboard project panels fit and show the right details at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await screen(page, 'Dashboard');

    const forecast = page.locator('div[aria-label="Projetos em Forecast"]');
    const delivered = page.locator('div[aria-label="Projetos entregues com pendentes"]');
    const forecastHeaderBackground = await forecast.locator(':scope > div').first().evaluate(header => getComputedStyle(header).backgroundColor);
    await expect(delivered.locator(':scope > div').first()).toHaveCSS('background-color', forecastHeaderBackground);
    const forecastBorder = await forecast.evaluate(panel => getComputedStyle(panel).borderTopColor);
    await expect(delivered).toHaveCSS('border-top-color', forecastBorder);
    const deliveredProject = delivered.getByRole('button', { name: 'Abrir projeto Linha entregue com dois ajustes' });
    const taskName = /Abrir tarefa Afinação do equipamento/;
    for (const panel of [forecast, delivered]) {
      await expect(panel).toBeVisible();
      await expect.poll(() => panel.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      const header = panel.locator(':scope > div').first();
      await expect(header).toHaveCSS('padding-left', width < 640 ? '16px' : '20px');
      await expect(header).toHaveCSS('padding-top', width < 640 ? '16px' : '20px');
      await expect(panel.getByRole(width < 768 ? 'listitem' : 'columnheader').first()).toHaveCSS('padding-top', '10.5px');
    }
    await expect(delivered.getByRole('button', { name: /Abrir projeto/ })).toHaveText([
      /Linha entregue com dois ajustes/,
      /Instalação entregue com um ajuste/,
    ]);
    if (width < 768) {
      await expect(forecast.getByRole('list')).toContainText('Entrega:');
      await expect(forecast.getByRole('table')).toBeHidden();
      await expect(forecast.getByText('Em curso', { exact: true })).toBeHidden();
      await forecast.getByRole('button', { name: /Abrir projeto Linha de embalagem/ }).click();
      await expect(page.getByText('Projeto qa-project-0', { exact: true })).toBeVisible();
      await expect(delivered.getByText('2 tarefas abertas', { exact: true })).toBeVisible();
      await expect(delivered.getByText('1 tarefa aberta', { exact: true })).toBeVisible();
      await expect(delivered.getByRole('button', { name: taskName })).toBeHidden();
    } else {
      await expect(forecast.getByRole('columnheader', { name: 'Estado' })).toBeVisible();
      await expect(delivered.getByRole('table')).toBeVisible();
      const [client, title] = await deliveredProject.locator('span').evaluateAll(spans => spans.map(span => span.getBoundingClientRect().toJSON()));
      expect(title.top - client.bottom).toBeLessThanOrEqual(2);
      await delivered.getByRole('button', { name: taskName }).click();
      await expect(page.getByText('Tarefa qa-task-0', { exact: true })).toBeVisible();
    }
    await deliveredProject.click();
    await expect(page.getByText('Projeto qa-delivered', { exact: true })).toBeVisible();
  });
}

test('read-only access hides mutation actions and opens a readable task', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/?readonly');
  const list = page.getByRole('list', { name: 'Lista compacta de tarefas' });
  await expect(list).toBeVisible();
  await expect(list.locator('summary')).toHaveCount(0);
  await expect(list.getByRole('button', { name: /Registar execução/ })).toHaveCount(0);
  await list.getByRole('button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Guardar|Eliminar/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await screen(page, 'Calendário');
  await expect(page.getByRole('region', { name: 'Agenda diária' }).getByRole('button', { name: /Criar tarefa|Duplicar tarefa/ })).toHaveCount(0);
});

test.describe('touch actions', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 900 } });
  test('filters and paginates compact rows, executes and duplicates by touch', async ({ page }) => {
    await page.goto('/');
    const list = page.getByRole('list', { name: 'Lista compacta de tarefas' });
    await expect(list).toBeVisible();
    await page.getByRole('combobox', { name: 'Tarefas por página' }).selectOption('10');
    await expect(list.getByRole('listitem')).toHaveCount(10);
    const first = await list.getByRole('listitem').first().innerText();
    await page.getByRole('button', { name: 'Seguinte', exact: true }).tap();
    await expect(list.getByRole('listitem').first()).not.toHaveText(first);
    await page.getByRole('textbox', { name: 'Pesquisar tarefas' }).fill('Afinação');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await list.getByRole('button', { name: /Registar execução/ }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await fits(page);
    await page.keyboard.press('Escape');
    await list.locator('summary').tap();
    await list.getByRole('button', { name: 'Duplicar', exact: true }).tap();
    await expect(page.getByRole('dialog')).toHaveAccessibleName(/Cópia/);
    await page.keyboard.press('Escape');
    await screen(page, 'Projetos');
    await page.getByRole('textbox', { name: 'Pesquisar projetos' }).fill('IP-26');
    const projects = page.getByRole('list', { name: 'Lista compacta de projetos' });
    await expect(projects.getByRole('listitem')).toHaveCount(1);
    await expect(projects).toContainText('IP-26');
    await fits(page);
  });

  test('keeps dates, users and timeline filters across grids and orientation changes', async ({ page }) => {
    await page.goto('/');
    await screen(page, 'Calendário');
    const agenda = page.getByRole('region', { name: 'Agenda diária', exact: true });
    await expect(agenda).toBeVisible();
    await agenda.getByLabel('Data da agenda').fill('2026-12-31');
    await agenda.getByRole('button', { name: 'Dia seguinte', exact: true }).tap();
    await expect(agenda.getByLabel('Data da agenda')).toHaveValue('2027-01-01');
    await agenda.getByRole('button', { name: 'Criar tarefa para Ana de exemplo', exact: true }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input[type=date]').first()).toHaveValue('2027-01-01');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Limpar', exact: true }).tap();
    await expect(agenda).toContainText('Nenhum utilizador visível');
    await page.getByRole('button', { name: 'Grelha completa', exact: true }).tap();
    await expect(page.getByText('Nenhum utilizador visível no calendário', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Vista móvel', exact: true }).tap();
    await expect(agenda.getByLabel('Data da agenda')).toHaveValue('2027-01-01');
    await page.getByRole('button', { name: 'Timeline de projetos', exact: true }).tap();
    const search = page.getByRole('textbox', { name: 'Pesquisar na timeline' });
    await search.fill('IP-0');
    await page.getByRole('button', { name: 'Grelha completa', exact: true }).tap();
    await page.setViewportSize({ width: 844, height: 390 });
    await fits(page);
    await expect(search).toHaveValue('IP-0');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Vista móvel', exact: true }).tap();
    await expect(search).toHaveValue('IP-0');
    await expect(page.getByRole('region', { name: 'Agenda de projetos', exact: true })).toBeVisible();
    await fits(page);
  });
});
