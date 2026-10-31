// Run against a locally started SKILLER instance with a migrated, disposable D1.
// Requires Playwright + Chromium in the developer environment.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const target = new URL(process.env.SKILLER_UI_TEST_URL || 'http://127.0.0.1:8794');
if (!['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('Only a local test server is allowed');
const { launchBrowser } = await import('./browser-launch.mjs');
await mkdir('test-results/mobile-ui', { recursive: true });
const browser = await launchBrowser();
try {
  for (const width of [360, 390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },

    });
    // Use the real guest entry route, never a forged authentication header.
    const entry = await context.request.get(new URL('/api/auth/guest', target).href, { maxRedirects: 0 });
    assert.equal(entry.status(), 303);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(target.href);
    await page.getByRole('button', { name: 'Разобрать мою ситуацию', exact: true }).click();
    await page.getByLabel('Как к Вам обращаться?').fill('Тест');
    await page.getByRole('button', { name: 'Познакомиться с тренерами' }).click();
    const portraits = page.locator('.trainer-intro-portrait img');
    assert.equal(await portraits.count(), 3);
    await portraits.evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: `test-results/mobile-ui/trainers-${width}.png`, fullPage: true });
    const trainerName = width === 360 ? 'Марша' : width === 390 ? 'Бек' : 'Скинни';
    await page.getByRole('radio').filter({ hasText: trainerName }).click();
    await page.getByRole('button', { name: width === 360 ? 'Продолжить с Маршей' : width === 390 ? 'Продолжить с Беком' : 'Продолжить с Скинни' }).click();
    await page.locator('#first-story').fill('Откладываю отчёт и читаю новости');
    await page.locator('.trainer-consent input').check();
    await page.getByRole('button', { name: 'Начать знакомство', exact: true }).click();
    const input = page.locator('#message');
    await input.waitFor();
    await input.fill('Первая строка');
    let sent = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/trainer'
        && ['message', 'situation'].includes(request.postDataJSON()?.action)) sent++;
    });
    await input.press('Enter');
    await input.press('End');
    await input.type('Вторая строка');
    assert.equal(await input.inputValue(), 'Первая строка\nВторая строка');
    assert.equal(sent, 0, 'Enter must not submit');
    await input.fill('');
    await input.press('Control+Enter');
    assert.equal(sent, 0, 'Empty shortcut must not submit');
    const draft = 'Неотправленный ответ после возвращения';
    await input.fill(draft);
    await page.waitForFunction(text => Object.keys(localStorage)
      .filter(key => key.startsWith('skiller-draft-v1:'))
      .some(key => JSON.parse(localStorage.getItem(key)).text === text), draft);
    await page.reload();
    await input.waitFor();
    await page.waitForFunction(text => document.querySelector('#message')?.value === text, draft);
    assert.equal(await input.inputValue(), draft, 'Reload must restore the unsent draft');
    assert.equal(sent, 0, 'Restoring a draft must not submit it');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `Horizontal overflow at ${width}px`);
    const mic = await page.getByRole('button', { name: 'Записать голосом', exact: true }).boundingBox();
    assert.ok(mic && mic.width >= 44 && mic.height >= 44, 'Microphone touch target too small');
    assert.equal(await page.locator('.trainer-conversation-title img').getAttribute('alt'), trainerName);
    await page.screenshot({ path: `test-results/mobile-ui/conversation-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Записать голосом', exact: true }).click();
    await page.getByText('Доступ к микрофону не получен. Можно продолжить текстом.', { exact: true }).waitFor();
    // Complete a real practice through the UI, then submit the agreed group offer.
    await page.getByText('Нужна пауза? Открыть STOP', { exact: true }).click();
    await page.getByLabel('Перед каким действием Вам нужна пауза?').fill('Волнуюсь перед рабочим отчётом');
    await page.getByLabel('Насколько сильное состояние сейчас, от 0 до 10?').fill('6');
    await page.getByLabel('Что сейчас хочется сделать?').selectOption('withdraw');
    await page.getByLabel('Есть ли сейчас риск причинить вред себе или другому?').selectOption('no');
    await page.getByRole('button', { name: 'Подготовить мою практику', exact: true }).click();
    await page.getByRole('button', { name: 'Начать действие', exact: true }).click();
    await page.getByRole('button', { name: 'Сделано', exact: true }).click();
    await page.getByLabel('Насколько практика помогла, от 0 до 10?').fill('7');
    await page.getByLabel('Интенсивность состояния сейчас, от 0 до 10?').fill('4');
    await page.getByRole('button', { name: 'Сохранить пользу', exact: true }).click();
    await page.getByRole('button', { name: 'Узнать о группе СДВГ', exact: true }).click();
    const offer = page.getByRole('region', { name: 'Группа СДВГ', exact: true });
    const contact = `@synthetic_${width}`;
    await offer.getByLabel('Telegram или email для ответа').fill(contact);
    await offer.getByRole('checkbox').check();
    await offer.getByRole('button', { name: 'Оставить заявку на группу' }).click();
    await offer.getByRole('status').filter({ hasText: 'Заявка получена' }).waitFor();
    await page.screenshot({ path: `test-results/mobile-ui/group-${width}.png`, fullPage: true });
    // Owner UI: no messages or real payments, only a synthetic manual receipt.
    const owner = await context.newPage();
    await owner.goto(new URL('/organizer', target).href);
    await owner.getByLabel('Ключ организатора').fill('local-synthetic-owner');
    await owner.getByRole('button', { name: 'Загрузить', exact: true }).click();
    const lead = owner.locator('article').filter({ hasText: contact });
    await lead.getByRole('button', { name: 'Связались с участником' }).click();
    await lead.getByText('Статус: contacted', { exact: false }).waitFor();
    await lead.getByRole('button', { name: 'Подтвердить оплату и участие' }).click();
    await owner.getByLabel('Полученная сумма, EUR').fill('1');
    await owner.getByLabel('Основание подтверждения').fill('Synthetic receipt, no real payment');
    await owner.getByRole('checkbox').check();
    await owner.getByRole('button', { name: 'Сохранить подтверждение' }).click();
    await lead.getByText('Статус: confirmed', { exact: false }).waitFor();
    await page.reload();
    await page.getByRole('status').filter({ hasText: 'Оплата и участие подтверждены' }).waitFor();
    await page.getByRole('button', { name: 'Настройки тренера', exact: true }).click();
    await page.getByLabel('Для подтверждения введите УДАЛИТЬ').fill('УДАЛИТЬ');
    await page.getByRole('button', { name: 'Запросить удаление данных' }).click();
    await page.getByRole('heading', { name: 'Запрос на удаление принят', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('skiller-draft-v1:')).length), 0);
    await page.screenshot({ path: `test-results/mobile-ui/privacy-${width}.png`, fullPage: true });
    await owner.getByLabel('Раздел').selectOption('privacy');
    await owner.getByLabel('Ключ организатора').fill('local-synthetic-privacy-owner');
    await owner.getByRole('button', { name: 'Загрузить', exact: true }).click();
    await owner.getByRole('button', { name: 'Перейти к подтверждению очистки' }).first().waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`UI smoke passed at ${width}px`);
  }
} finally { await browser.close(); }
