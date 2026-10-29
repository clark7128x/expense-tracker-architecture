import { test, expect } from '../../src/expense-tracker-web/node_modules/@playwright/test/index.mjs';

test.beforeEach(async ({ request }) => {
  for (const month of ['2026-10', '2026-11']) {
    const response = await request.get(`/api/v1/expenses?month=${month}&pageSize=100`);
    for (const expense of (await response.json()).items) await request.delete(`/api/v1/expenses/${expense.id}`);
  }
});

test('real CRUD, keyboard, filters, month boundaries, long notes and deletion', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Місяць огляду').fill('2026-10');
  await expect(page.getByText('За цей місяць ще немає витрат')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty.png'), fullPage: true });
  await page.getByRole('button', { name: 'Ввести витрату' }).click();
  await expect(page.getByLabel('Сума, ₴')).toBeFocused();
  await page.keyboard.type('125,50');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Дата', { exact: true })).toBeFocused();
  await page.getByLabel('Дата', { exact: true }).fill('2026-10-31');
  await page.getByLabel('Примітка').fill('Довга примітка ' + 'я'.repeat(180));
  await page.getByRole('button', { name: 'Додати витрату' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('total')).toContainText('125,50');
  await expect(page.getByLabel('Сума, ₴')).toHaveValue('');
  await expect(page.getByLabel('Дата', { exact: true })).toHaveValue('2026-10-31');
  await page.screenshot({ path: testInfo.outputPath('populated.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: /^Редагувати / }).click();
  await page.getByLabel('Сума, ₴').fill('200');
  await page.getByLabel('Категорія', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Зберегти зміни' }).click();
  await expect(page.getByTestId('total')).toContainText('200,00');
  await page.getByLabel('Категорія в історії').selectOption('1');
  await expect(page.getByText('У цій категорії витрат немає')).toBeVisible();
  await expect(page.getByTestId('total')).toContainText('200,00');
  await page.getByRole('button', { name: 'Скинути фільтр' }).click();
  await page.getByLabel('Місяць огляду').fill('2026-11');
  await expect(page.getByTestId('total')).toContainText('0,00');
  await page.getByLabel('Місяць огляду').fill('2026-10');
  await page.getByRole('button', { name: /^Видалити / }).click();
  await expect(page.getByRole('dialog')).toContainText('200,00');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Видалити / })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Видалити назавжди' }).click();
  await expect(page.getByText('За цей місяць ще немає витрат')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('total')).toContainText('0,00');
});

test('network errors preserve input, read errors and loading are explicit', async ({ page }, testInfo) => {
  await page.route('**/api/v1/summary?*', async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.continue(); });
  await page.goto('/');
  await expect(page.getByText('Завантаження підсумків…')).toBeVisible();
  await page.getByLabel('Сума, ₴').fill('125,50');
  await page.route('**/api/v1/expenses', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Додати витрату' }).click();
  await expect(page.getByText(/Результат дії невідомий/)).toBeVisible();
  await expect(page.getByLabel('Сума, ₴')).toHaveValue('125,50');
  await page.route('**/api/v1/expenses?*', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Перевірити історію' }).click();
  await expect(page.getByText(/Показані раніше дані не оновлено/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('errors.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('same-origin API and static asset isolation', async ({ request }) => {
  expect((await request.get('/')).headers()['content-type']).toContain('text/html');
  const missing = await request.get('/api/does-not-exist');
  expect(missing.status()).toBe(404);
  expect((await missing.json()).code).toBe('route_not_found');
  for (const path of ['/local-data/expenses.db', '/Data/AppDbContext.cs', '/appsettings.json', '/ExpenseTracker.Api.csproj']) expect((await request.get(path)).status()).toBe(404);
});

test('pagination, discard confirmation and moving an expense between months', async ({ page, request }) => {
  for (let i = 0; i < 26; i++) await request.post('/api/v1/expenses', { data: { amountMinor: i === 0 ? 10000000000 : 100, date: '2026-10-01', categoryId: 1, note: `Запис ${i}` } });
  await page.goto('/');
  await page.getByLabel('Місяць огляду').fill('2026-10');
  await page.getByRole('button', { name: 'Далі', exact: true }).click();
  await expect(page.getByRole('navigation')).toContainText('2 / 2');
  await page.getByRole('button', { name: /^Видалити / }).click();
  await page.getByRole('button', { name: 'Видалити назавжди' }).click();
  await expect(page.getByRole('navigation')).toContainText('1 / 1');
  await page.getByRole('button', { name: /^Редагувати / }).first().click();
  await page.getByLabel('Сума, ₴').fill('500');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await expect(page.getByLabel('Сума, ₴')).toHaveValue('500');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Нова витрата' })).toBeVisible();
  await page.getByRole('button', { name: /^Редагувати / }).first().click();
  await page.getByLabel('Дата', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: 'Зберегти зміни' }).click();
  await expect(page.getByLabel('Місяць огляду')).toHaveValue('2026-11');
  await expect(page.getByRole('button', { name: /^Редагувати / })).toHaveCount(1);
  await page.getByLabel('Місяць огляду').fill('2026-10');
  await expect(page.getByRole('button', { name: /^Редагувати / })).toHaveCount(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
