// Run against a locally started SKILLER instance with a migrated, disposable D1.
// Requires Playwright + Chromium in the developer environment.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const target = new URL(process.env.SKILLER_UI_TEST_URL || 'http://127.0.0.1:8794');
if (!['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('Only a local test server is allowed');
const { chromium } = await import('playwright');
await mkdir('test-results/mobile-ui', { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [360, 390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      extraHTTPHeaders: {
        'oai-authenticated-user-id': `ui-smoke-${width}-${Date.now()}`,
        'oai-authenticated-user-email': 'ui-smoke@example.invalid',
      },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(target.href);
    await page.getByRole('button', { name: 'Разобрать мою ситуацию', exact: true }).click();
    await page.getByLabel('Как к Вам обращаться?').fill('Тест');
    await page.getByRole('button', { name: 'Познакомиться с тренерами' }).click();
    await page.getByRole('button', { name: 'Продолжить с Маршей' }).click();
    await page.locator('#first-story').fill('Откладываю отчёт и читаю новости');
    await page.locator('.trainer-consent input').check();
    await page.getByRole('button', { name: 'Начать знакомство', exact: true }).click();
    const input = page.locator('#message');
    await input.waitFor();
    await input.fill('Первая строка');
    let sent = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/trainer') sent++;
    });
    await input.press('Enter');
    await input.press('End');
    await input.type('Вторая строка');
    assert.equal(await input.inputValue(), 'Первая строка\nВторая строка');
    assert.equal(sent, 0, 'Enter must not submit');
    await input.fill('');
    await input.press('Control+Enter');
    assert.equal(sent, 0, 'Empty shortcut must not submit');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `Horizontal overflow at ${width}px`);
    const mic = await page.getByRole('button', { name: 'Записать голосом', exact: true }).boundingBox();
    assert.ok(mic && mic.width >= 44 && mic.height >= 44, 'Microphone touch target too small');
    await page.screenshot({ path: `test-results/mobile-ui/conversation-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`UI smoke passed at ${width}px`);
  }
} finally { await browser.close(); }
