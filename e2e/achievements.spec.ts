import { expect, test, type Route } from '@playwright/test';

const initialBadges = [
  { key: 'skeptic', title: 'Скептик', description: 'Перевірте три пропозиції.', goal: 3, current: 3, icon: 'scan', earnedAt: '2026-11-04T10:00:00.000Z', progressLabel: '3 з 3 перевірок' },
  { key: 'saver', title: 'Заощадник', description: 'Зафіксуйте $50 підтверджених заощаджень.', goal: 5000, current: 1200, icon: 'savings', earnedAt: null, progressLabel: '$12.00 з $50' },
];

const unlockedBadges = [
  initialBadges[0],
  { ...initialBadges[1], current: 5000, earnedAt: '2026-11-05T10:00:00.000Z', progressLabel: '$50.00 з $50' },
];

async function fulfillJson(route: Route, value: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value) });
}

test('achievement collection is responsive, accessible, persistent, and announces new badges once', async ({ page }) => {
  let unlocked = false;
  let experimentVariant: 'progress' | 'control' = 'progress';
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/account') return fulfillJson(route, {
      user: { id: 'achievement-e2e-user', email: 'achievement@example.test', emailVerified: true },
      access: { plan: 'pro', credits: 0, used: 2, limit: 999 },
      subscription: null,
      payments: [],
      history: [],
    });
    if (pathname === '/api/watchlist') return fulfillJson(route, { items: [] });
    if (pathname === '/api/savings') return fulfillJson(route, { entries: [], summary: { monthMinor: 0, yearMinor: 0, entryCount: 0, currency: 'UAH' } });
    if (pathname === '/api/subscription-radar') return fulfillJson(route, { configured: false, address: null, addressEnabled: false, items: [], receiptSummary: {}, remindersEnabled: false, reminderConfigured: false, rawEmailStorage: 'never', metadataRetentionDays: 7 });
    if (pathname === '/api/rewards') return fulfillJson(route, { availableOneCredits: 1, items: [
      { id: 'reward-credit', key: 'badge:skeptic:one_credit', type: 'one_credit', status: 'available', title: 'Кредит One Sift', description: 'Один повний звіт без оплати.', earnedAt: '2026-11-05T10:00:00.000Z', expiresAt: '2027-02-03T10:00:00.000Z', quarter: '2026-Q4' },
      { id: 'reward-discount', key: 'badge:saver:pro_discount_50', type: 'pro_discount_50', status: 'available', title: '50% на перший платіж Pro', description: 'Застосовується до першого платежу.', earnedAt: '2026-11-05T10:00:00.000Z', expiresAt: '2027-02-03T10:00:00.000Z', quarter: null },
      { id: 'reward-alerts', key: 'badge:renewal_hunter:priority_alerts', type: 'priority_alerts', status: 'available', title: 'Пріоритетні нагадування', description: 'Planner-нагадування обробляються першими.', earnedAt: '2026-11-05T10:00:00.000Z', expiresAt: '2027-05-04T10:00:00.000Z', quarter: null },
    ] });
    if (pathname === '/api/achievements') return fulfillJson(route, {
      userId: 'achievement-e2e-user', badges: unlocked ? unlockedBadges : initialBadges,
      analysisCount: 3, longestStreak: 1,
      experiment: { enabled: true, assigned: true, variant: experimentVariant, showProgress: experimentVariant === 'progress' },
    });
    if (pathname === '/api/referral') return fulfillJson(route, { url: 'https://example.test/ref/test' });
    return fulfillJson(route, {});
  });

  await page.goto('/dashboard');
  const rewards = page.getByRole('region', { name: 'Ваші переваги' });
  await expect(rewards).toBeVisible();
  await expect(rewards).toContainText('Кредит One Sift');
  await expect(rewards).toContainText('50% на перший платіж Pro');
  await expect(rewards).toContainText('Пріоритетні нагадування');
  const collection = page.locator('#achievements');
  await expect(collection.getByRole('heading', { name: 'Ваші досягнення' })).toBeVisible();
  await page.getByRole('link', { name: 'Досягнення' }).click();
  await expect(page).toHaveURL(/#achievements$/);
  const card = collection.getByRole('button', { name: /Скептик/ });
  await expect(card).toBeVisible();

  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 430) {
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: viewport.height });
      await expect.poll(() => collection.locator('.achievementGrid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `No horizontal scroll at ${width}px`).toBe(true);
    }
    await page.setViewportSize(viewport);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await card.click();
  const dialog = page.getByRole('dialog', { name: 'Скептик' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Отримано 4 листопада 2026');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();

  unlocked = true;
  await page.evaluate(() => window.dispatchEvent(new Event('sift:achievements-updated')));
  const toast = page.getByRole('status').filter({ hasText: 'Заощадник' });
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute('aria-live', 'polite');
  await page.getByRole('button', { name: 'Закрити сповіщення' }).click();

  await page.evaluate(() => window.dispatchEvent(new Event('sift:achievements-updated')));
  await expect(toast).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#achievements').getByRole('button', { name: /Заощадник/ })).toContainText('Отримано 5 листопада 2026');
  await expect(page.getByRole('status').filter({ hasText: 'Заощадник' })).toHaveCount(0);

  experimentVariant = 'control';
  await page.reload();
  await expect(collection.locator('.achievementProgress')).toHaveCount(0);
  await expect(collection.locator('.achievementProgressLabel')).toHaveCount(0);
  await collection.getByRole('button', { name: /Скептик/ }).click();
  await expect(page.getByRole('dialog', { name: 'Скептик' }).getByRole('progressbar')).toHaveCount(0);
});
