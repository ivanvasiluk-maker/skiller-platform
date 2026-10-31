// S07: actual local-clock delivery, network recovery and conflicting-tab acceptance.
// Uses the real application, signed guest cookie and migrated disposable D1.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser } from './browser-launch.mjs';
const target = new URL(process.env.SKILLER_UI_TEST_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname), 'Local test server required');
await mkdir('test-results/pilot-ui', { recursive: true });
const watchdog = setTimeout(() => { console.error('S07 timeout: pilot did not finish'); process.exit(1); }, 300000);
const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC', serviceWorkers: 'block' });
  const guest = await context.request.get(new URL('/api/auth/guest', target).href, { maxRedirects: 0 });
  assert.equal(guest.status(), 303);
  const post = async (path, body) => {
    const response = await context.request.post(new URL(path, target).href, { data: body });
    const result = await response.json();
    assert.equal(response.status(), 200, `${path}: ${JSON.stringify(result)}`);
    return result;
  };
  const get = async path => {
    const response = await context.request.get(new URL(path, target).href);
    assert.equal(response.status(), 200);
    return response.json();
  };
  const initial = await post('/api/trainer', { action: 'onboard', requestId: crypto.randomUUID(), sessionId: crypto.randomUUID(), name: 'Пилот', trainerId: 'beck', text: 'Синтетическая приёмка напоминаний', consent: true });
  const date = new Date().toISOString().slice(0, 10);
  await post('/api/day-tasks', { action: 'add', date, timezone: 'UTC', text: 'Пилот: сделано\nПилот: частично\nПилот: не начал\nПилот: нужна помощь' });
  const tasks = await get(`/api/day-tasks?date=${date}`);
  const localTime = new Date(Date.now() + 121000).toISOString().slice(0, 16);
  for (const task of tasks) await post('/api/reminders', { action: 'schedule', taskId: task.id, timezone: 'UTC', localTime, consent: true });
  const early = await get('/api/reminders');
  assert.equal(early.items.length, 4);
  assert.equal(early.items.some(item => item.due), false, 'No reminder before the server deadline');
  console.log(`S07: real-clock reminders scheduled for ${localTime} UTC; network/conflict checks run while waiting.`);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let submitted = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/trainer' && ['message', 'situation'].includes(request.postDataJSON()?.action)) submitted++;
  });
  await page.goto(target.href);
  await page.getByRole('button', { name: 'Разговор', exact: true }).click();
  const composer = page.locator('#message');
  await composer.fill('Неотправленный комментарий');
  await page.getByRole('button', { name: 'Практики', exact: true }).click();
  const plan = page.getByRole('region', { name: 'Дела на день', exact: true });
  await plan.getByRole('article').first().waitFor();
  let abortNext = true;
  const route = async route => {
    if (abortNext && route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'add') { abortNext = false; await route.abort('failed'); }
    else await route.continue();
  };
  console.log('S07: task list opened; injecting one failed save.');
  await page.route('**/api/day-tasks', route);
  await plan.getByLabel('Список дел').fill('Сетевая задача');
  await plan.getByRole('button', { name: 'Добавить дела', exact: true }).click();
  await plan.getByRole('alert').waitFor();
  console.log('S07: network failure surfaced to the user.');
  assert.equal(await plan.getByLabel('Список дел').inputValue(), 'Сетевая задача', 'Failed save retains input');
  await page.unroute('**/api/day-tasks', route);
  await plan.getByRole('button', { name: 'Добавить дела', exact: true }).click();
  await plan.getByRole('article', { name: 'Дело: Сетевая задача', exact: true }).waitFor();
  let stored = await get(`/api/day-tasks?date=${date}`);
  assert.equal(stored.filter(task => task.title === 'Сетевая задача').length, 1);
  const networkTask = stored.find(task => task.title === 'Сетевая задача');
  // Another tab changes the same task after this page rendered its old version.
  await post('/api/day-tasks', { action: 'update', id: networkTask.id, version: networkTask.version, title: networkTask.title, date, timezone: 'UTC', status: 'partial' });
  const staleRow = plan.getByRole('article', { name: 'Дело: Сетевая задача', exact: true });
  await staleRow.getByRole('checkbox').click();
  await plan.getByRole('alert').filter({ hasText: 'Дело изменилось' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Выполнено: Сетевая задача"]')?.checked);
  assert.equal((await get(`/api/day-tasks?date=${date}`)).find(task => task.id === networkTask.id).status, 'partial', 'Stale checkbox cannot overwrite another tab');
  await plan.getByRole('button', { name: 'Обновить список дел', exact: true }).click();
  await staleRow.getByText('Начато, но не закончено', { exact: true }).waitFor();
  console.log('S07: failed save preserved input; retry created one row; stale checkbox reverted without overwriting another tab.');
  const inbox = page.getByRole('region', { name: 'Мои напоминания', exact: true });
  const reminder = title => inbox.getByRole('article', { name: `Напоминание: ${title}`, exact: true });
  // No clock mocking or force-delivery endpoint: wait for the real deadline and normal poll.
  await reminder('Пилот: частично').getByRole('button', { name: 'Начал, но не закончил', exact: true }).waitFor({ timeout: 180000 });
  assert.equal((await get('/api/reminders')).items.filter(item => item.due).length, 4);
  await page.screenshot({ path: 'test-results/pilot-ui/due-reminders-390.png', fullPage: true });
  await reminder('Пилот: частично').getByRole('button', { name: 'Начал, но не закончил', exact: true }).click();
  await reminder('Пилот: частично').waitFor({ state: 'hidden' });
  await reminder('Пилот: не начал').getByRole('button', { name: 'Ещё не начал', exact: true }).click();
  await reminder('Пилот: не начал').waitFor({ state: 'hidden' });
  await reminder('Пилот: сделано').getByRole('button', { name: 'Сделано', exact: true }).click();
  await reminder('Пилот: сделано').waitFor({ state: 'hidden' });
  await reminder('Пилот: нужна помощь').getByRole('button', { name: 'Помоги начать', exact: true }).click();
  await inbox.waitFor({ state: 'hidden' });
  await composer.waitFor();
  const draft = await composer.inputValue();
  assert.match(draft, /Неотправленный комментарий/);
  assert.match(draft, /Возвращаюсь к делу: Пилот: нужна помощь/);
  assert.equal(submitted, 0, 'Reminder replies must not submit a conversation automatically');
  stored = await get(`/api/day-tasks?date=${date}`);
  const status = title => stored.find(task => task.title === title)?.status;
  assert.equal(status('Пилот: сделано'), 'done');
  assert.equal(status('Пилот: частично'), 'partial');
  assert.equal(status('Пилот: не начал'), 'todo');
  assert.equal(status('Пилот: нужна помощь'), 'todo');
  assert.deepEqual((await get('/api/reminders')).items, []);
  const after = await get('/api/trainer');
  assert.deepEqual(after.plans, initial.plans, 'Task replies cannot invent skill attempts or outcomes');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('S07 pilot UI PASS: real-clock due delivery, all four responses, persisted task facts, draft preserved, no invented attempt, no automatic AI submission, network retry and conflicting-tab recovery.');
  await context.close();
} finally { await browser.close(); clearTimeout(watchdog); }
