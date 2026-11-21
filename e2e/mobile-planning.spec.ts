import { expect, test, type Page } from '@playwright/test';

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
async function screen(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Ecrã de teste' }).getByRole('button', { name: label, exact: true }).click();
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
