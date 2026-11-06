import { expect, test } from '@playwright/test';

type TestItem = { id: string; space_id: string; title: string; service_url: string | null; amount_minor: number | null; currency: 'UAH' | 'USD' | 'EUR' | 'GBP'; next_charge_date: string | null; status: 'active' | 'canceling' | 'canceled'; note: string; assigned_to_user_id: string | null; assigned_email: string | null; created_by_user_id: string; created_by_email: string; created_at: string; updated_at: string };

test('shared family space shows common calendar and lets an authorized owner add a subscription', async ({ page }) => {
  await page.addInitScript(()=>localStorage.setItem('sift-funnel-consent','denied'));
  const owner = { user_id: 'owner-1', email: 'owner@example.test', role: 'owner', joined_at: '2026-11-01T12:00:00.000Z' } as const;
  const member = { user_id: 'member-1', email: 'member@example.test', role: 'member', joined_at: '2026-11-02T12:00:00.000Z' } as const;
  const space = {
    id: 'space-1', owner_user_id: owner.user_id, title: 'Сім’я', status: 'active', test_mode: 1, expires_at: '2026-12-01T12:00:00.000Z', role: 'owner',
    members: [owner, member], items: [] as TestItem[], invites: [], payments: [], priceUah: 119, termDays: 30, maxMembers: 5,
  };
  let currentSpace = structuredClone(space);
  await page.route('**/api/spaces', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spaces: [{ ...space, memberCount: 2 }] }) }));
  await page.route('**/api/spaces/space-1', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ space: currentSpace }) }));
  await page.route('**/api/spaces/space-1/items', async (route) => {
    if (route.request().method() === 'POST') {
      const request = route.request().postDataJSON() as { title: string; serviceUrl: string | null; amountMinor: number | null; currency: TestItem['currency']; nextChargeDate: string | null; status: TestItem['status']; note: string };
      currentSpace = { ...currentSpace, items: [{ id: 'item-1', space_id: 'space-1', title: request.title, service_url: request.serviceUrl, amount_minor: request.amountMinor, currency: request.currency, next_charge_date: request.nextChargeDate, status: request.status, note: request.note, assigned_to_user_id: member.user_id, assigned_email: member.email, created_by_user_id: owner.user_id, created_by_email: owner.email, created_at: '2026-11-04T12:00:00.000Z', updated_at: '2026-11-04T12:00:00.000Z' }] };
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ space: currentSpace }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: currentSpace.items }) });
  });

  await page.goto('/dashboard/space');
  const consent=page.getByRole('complementary',{name:'Налаштування аналітики'});
  if(await consent.isVisible())await consent.getByRole('button',{name:'Ні, дякую'}).click();
  await expect(page.getByRole('heading', { name: 'Ваші підписки. Спільна ясність.' })).toBeVisible();
  await expect(page.locator('.spaceMemberList b').filter({ hasText: 'owner@example.test' })).toBeVisible();
  await expect(page.locator('.spaceMemberList b').filter({ hasText: 'member@example.test' })).toBeVisible();
  await expect(page.getByText('Власник · керує оплатою й учасниками')).toBeVisible();
  await expect(page.getByText('Учасник · додає та веде власні записи')).toBeVisible();
  await expect(page.locator('.spaceSeatEmpty')).toHaveCount(3);
  await expect(page.getByText('119 ₴ за 30 днів')).toBeVisible();
  await expect(page.getByText(/Автопродовження немає/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Найближчі списання' })).toBeVisible();

  await page.getByLabel('Назва', { exact: true }).fill('Хмарне сховище');
  await page.getByLabel('Сума за період').fill('8.99');
  await page.getByLabel('Наступне списання').fill('2026-11-20');
  await page.getByLabel('Хто відповідає').selectOption(member.user_id);
  await page.getByRole('button', { name: 'Додати до спільного простору' }).click();
  await expect(page.locator('.spaceItemList b').filter({ hasText: 'Хмарне сховище' })).toBeVisible();
  await expect(page.getByText(/Відповідальний: member@example.test/)).toBeVisible();
  await expect(page.locator('.spaceItemList strong').filter({ hasText: /8,99/ })).toBeVisible();

  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  const columns = await page.locator('.spaceList').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  if ((page.viewportSize()?.width ?? 1440) <= 800) expect(columns).toBe(2);
});

test('guest sign-in preserves the shared-space invitation', async ({ page }) => {
  await page.route('**/api/spaces', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Увійдіть до акаунту.' }) }));
  await page.route('**/api/spaces/invites/accept', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Увійдіть, щоб прийняти запрошення.' }) }));
  await page.goto('/dashboard/space?invite=one-time-invite-token');

  await expect(page.getByRole('heading', { name: 'Вас запросили до спільного простору.' })).toBeVisible();
  const loginHref = await page.getByRole('link', { name: 'Увійти до простору' }).getAttribute('href');
  expect(new URL(loginHref!, page.url()).searchParams.get('next')).toBe('/dashboard/space?invite=one-time-invite-token');
});

test('closed spaces show a clear closed state without active controls', async ({ page }) => {
  const owner = { user_id: 'owner-closed', email: 'owner@example.test', role: 'owner', joined_at: '2026-11-01T12:00:00.000Z' } as const;
  const closedSpace = { id: 'space-closed', owner_user_id: owner.user_id, title: 'Закритий простір', status: 'closed', test_mode: 0, expires_at: null, role: 'owner', members: [owner], items: [], invites: [], payments: [], priceUah: 119, termDays: 30, maxMembers: 5 };
  await page.route('**/api/spaces', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spaces: [closedSpace] }) }));
  await page.route('**/api/spaces/space-closed', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ space: closedSpace }) }));
  await page.goto('/dashboard/space');

  await expect(page.getByRole('heading', { name: 'Цей простір закрито' })).toBeVisible();
  await expect(page.getByText('Закритий', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перейти до оплати' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Створити запрошення' })).toHaveCount(0);
});
