import { expect, test, type Locator, type Page } from '@playwright/test';

for (const trigger of ['click', 'Enter'] as const) {
  test(`sends only one comment for five rapid ${trigger} submissions while saving`, async ({ page }) => {
    let attempts = 0;
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    await page.route('**/comment-submit', async route => {
      attempts++;
      await pending;
      await route.fulfill({ status: 200, body: '{}' });
    });
    await page.goto('/?asyncComments=1');
    const editor = page.getByRole('textbox', { name: 'Comentário ou nota', includeHidden: true });
    const send = page.getByRole('button', { name: 'Enviar', exact: true });
    await editor.fill('Comentário único');
    if (trigger === 'click') {
      await send.evaluate(element => { for (let i = 0; i < 5; i++) (element as HTMLButtonElement).click(); });
    } else {
      await editor.evaluate(element => {
        for (let i = 0; i < 5; i++) element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });
    }
    try {
      await expect.poll(() => attempts).toBe(1);
      await expect(send).toBeDisabled();
      await expect(editor).toHaveText('Comentário único');
      await expect(editor.locator('xpath=ancestor::*[@inert]')).toHaveCount(1);
    } finally { finish(); }
    const sent = page.getByRole('region', { name: 'Comentários enviados' });
    await expect(sent.locator('p')).toHaveCount(1);
    await expect(editor).toHaveText('');
    expect(attempts).toBe(1);
    await editor.fill('Novo comentário');
    await send.click();
    await expect(sent.locator('p')).toHaveCount(2);
    expect(attempts).toBe(2);
  });
}

test('keeps the draft and unlocks submission after a failed request', async ({ page }) => {
  let attempts = 0;
  await page.route('**/comment-submit', route => route.fulfill({ status: ++attempts === 1 ? 500 : 200, body: '{}' }));
  await page.goto('/?asyncComments=1');
  const editor = page.getByRole('textbox', { name: 'Comentário ou nota' });
  const send = page.getByRole('button', { name: 'Enviar', exact: true });
  await editor.fill('Texto preservado');
  await send.click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível gravar');
  await expect(editor).toHaveText('Texto preservado');
  await expect(send).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Comentários enviados' })).toHaveText('');
  await send.click();
  await expect(page.getByRole('region', { name: 'Comentários enviados' })).toHaveText('Texto preservado');
  await expect(editor).toHaveText('');
  expect(attempts).toBe(2);
});

async function selectText(editor: Locator, text: string) {
  await editor.focus();
  await editor.evaluate((element, needle) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const start = node.textContent?.indexOf(needle) ?? -1;
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + needle.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error(`Text not found: ${needle}`);
  }, text);
  // Allow ProseMirror's selectionchange handler to sync its selection.
  await expect.poll(() => editor.evaluate(() => window.getSelection()?.toString())).toBe(text);
}

async function pressFormat(page: Page, label: string, touch: boolean) {
  const control = page.getByRole('toolbar', { name: 'Formatar descrição' }).getByRole('button', { name: label, exact: true });
  if (touch) await control.tap();
  else await control.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Descrição', exact: true })).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus && testInfo.title.includes('formats selected text')) {
    await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true });
  }
});

test('formats selected text, persists Markdown, cancels changes and clears the description', async ({ page, isMobile }) => {
  const editor = page.getByRole('textbox', { name: 'Descrição', exact: true });
  await selectText(editor, 'Motor');
  await pressFormat(page, 'Negrito', isMobile);
  await expect(editor.locator('strong')).toHaveText('Motor');
  await expect(page.getByTestId('description')).toContainText('**Motor**');
  await expect(page.getByRole('toolbar', { name: 'Formatar descrição' }).getByRole('button', { name: 'Negrito', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await pressFormat(page, 'Itálico', isMobile);
  await expect(editor.locator('strong em, em strong')).toHaveText('Motor');
  await page.getByRole('button', { name: 'Gravar projeto' }).click();
  await expect(page.getByRole('region', { name: 'Descrição guardada' }).locator('strong')).toHaveText('Motor');
  await editor.fill('Descartar');
  await page.getByRole('button', { name: 'Cancelar alterações' }).click();
  await expect(editor.locator('strong')).toHaveText('Motor');
  await editor.fill('');
  await page.getByRole('button', { name: 'Gravar projeto' }).click();
  await expect(page.getByRole('region', { name: 'Descrição guardada' })).toHaveText('');
});

test('restores the selected range after editing a link, validates URLs and never submits the parent form', async ({ page, isMobile }) => {
  const editor = page.getByRole('textbox', { name: 'Descrição', exact: true });
  await selectText(editor, 'sensor');
  await pressFormat(page, 'Link', isMobile);
  const input = page.getByRole('textbox', { name: 'Endereço do link' });
  await input.fill('javascript:alert(1)');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('save-count')).toHaveText('0');
  await input.fill('https://example.com/manual');
  await input.press('Enter');
  await expect(editor.locator('a')).toHaveText('sensor');
  await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/manual');
  await expect(page.getByTestId('save-count')).toHaveText('0');
  await selectText(editor, 'Motor');
  await pressFormat(page, 'Link', isMobile);
  await input.fill('https://example.com/discard');
  await input.press('Escape');
  await expect(input).not.toBeVisible();
  await expect(editor.locator('a')).toHaveCount(1);
  await editor.press('End');
  await editor.press('Enter');
  await editor.pressSequentially('Novo parágrafo');
  await expect(editor.locator('p')).toHaveCount(2);
  await expect(page.getByTestId('save-count')).toHaveText('0');
});

test('supports headings and both list formats', async ({ page, isMobile }) => {
  const editor = page.getByRole('textbox', { name: 'Descrição', exact: true });
  await selectText(editor, 'Motor');
  await pressFormat(page, 'Título 1', isMobile);
  await expect(editor.locator('h1')).toHaveText('Motor e sensor');
  await selectText(editor, 'Motor');
  await pressFormat(page, 'Título 2', isMobile);
  await expect(editor.locator('h2')).toHaveText('Motor e sensor');
  await selectText(editor, 'Motor');
  await pressFormat(page, 'Lista com marcas', isMobile);
  await expect(editor.locator('ul li')).toHaveText('Motor e sensor');
  await selectText(editor, 'Motor');
  await pressFormat(page, 'Lista numerada', isMobile);
  await expect(editor.locator('ol li')).toHaveText('Motor e sensor');
});

test('enforces the stored Markdown length, including formatting characters', async ({ page, isMobile }) => {
  const editor = page.getByRole('textbox', { name: 'Descrição', exact: true });
  await page.getByRole('button', { name: 'Preencher limite' }).click();
  await editor.press('ControlOrMeta+End');
  await editor.pressSequentially('bc');
  await expect.poll(async () => (await page.getByTestId('description').textContent())?.length).toBe(10000);
  await editor.pressSequentially('d');
  await expect.poll(async () => (await page.getByTestId('description').textContent())?.length).toBe(10000);
  await selectText(editor, 'bc');
  await pressFormat(page, 'Negrito', isMobile);
  await expect(editor.locator('strong')).toHaveCount(0);
  await expect.poll(async () => (await page.getByTestId('description').textContent())?.length).toBe(10000);
});

test('keeps comment submission, multiline input, formatting and reset independent of the description', async ({ page, isMobile }) => {
  const editor = page.getByRole('textbox', { name: 'Comentário ou nota' });
  await editor.fill('Uma nota');
  await editor.press('Shift+Enter');
  await editor.pressSequentially('Segunda linha');
  await selectText(editor, 'nota');
  const bold = page.getByRole('toolbar', { name: 'Formatar comentário ou nota' }).getByRole('button', { name: 'Negrito', exact: true });
  if (isMobile) await bold.tap(); else await bold.click();
  await expect(editor.locator('strong')).toHaveText('nota');
  await editor.press('Enter');
  const sent = page.getByRole('region', { name: 'Comentários enviados' });
  await expect(sent.locator('strong')).toHaveText('nota');
  await expect(sent).toContainText('Segunda linha');
  await expect(editor).toHaveText('');
  await editor.fill('Outra nota');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(sent).toContainText('Outra nota');
  await expect(page.getByTestId('save-count')).toHaveText('0');
  await expect(page.getByTestId('description')).toHaveText('Motor e sensor');
  await editor.fill('x'.repeat(1001));
  await expect(editor).toHaveText('');
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
});

test('sanitizes pasted rich text while keeping supported formatting', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Descrição', exact: true });
  await editor.fill('');
  await editor.evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<p><strong>Motor</strong> <em>sensor</em><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">inseguro</a></p>');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(editor.locator('strong')).toHaveText('Motor');
  await expect(editor.locator('em')).toHaveText('sensor');
  await expect(editor.locator('script, img, [onerror], a[href^="javascript:"]')).toHaveCount(0);
});

test('adapts the toolbar to touch and mouse without horizontal overflow', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch and hybrid interaction check');
  const editor = page.getByRole('textbox', { name: 'Descrição', exact: true });
  const toolbar = page.getByRole('toolbar', { name: 'Formatar descrição' });
  await expect(toolbar).toBeVisible();
  for (const width of [375, 320, 800]) {
    await page.setViewportSize({ width, height: width === 800 ? 375 : 800 });
    const box = await toolbar.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    for (const control of await toolbar.getByRole('button').all()) {
      const bounds = await control.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await editor.dispatchEvent('pointerdown', { pointerType: 'mouse' });
  await expect(toolbar).not.toBeVisible();
  await editor.tap();
  await expect(toolbar).toBeVisible();
});
