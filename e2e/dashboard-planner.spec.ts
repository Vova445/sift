import { expect, test, type Route } from '@playwright/test';

const report = {
  id: 'planner-report-1',
  url: 'https://example.test/terms',
  host: 'example.test',
  title: 'Terms and Subscription',
  score: 74,
  prices: ['$12.99 / month'],
  findings: [],
  wordCount: 1200,
  verdict: 'Перевірте наступне списання перед оплатою.',
  decision: 'wait',
};

async function json(route: Route, value: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value) });
}

test('Planner date picker supports keyboard navigation and restores focus', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-05T12:00:00.000Z') });
  await page.route('**/api/account**', route => json(route, {
    user: { id: 'planner-user', email: 'planner@example.test', emailVerified: true },
    access: { plan: 'pro', credits: 0, used: 1, limit: 999 },
    subscription: null,
    payments: [],
    history: [{ id: report.id, createdAt: '2026-11-05T12:00:00.000Z', result: report }],
  }));
  await page.route('**/api/watchlist', route => json(route, {
    items: [{ id: 'watch-1', scan_id: report.id, status: 'considering', note: '', review_at: '', updated_at: '2026-11-05T12:00:00.000Z', title: report.title, url: report.url, score: report.score }],
  }));
  await page.route('**/api/tos-monitoring', route => json(route, { configured: true, activeCount: 0, items: [] }));

  await page.goto('/dashboard');
  const edit = page.getByRole('button', { name: 'Редагувати' });
  await expect(edit).toBeVisible();
  await edit.click();

  const trigger = page.getByRole('button', { name: 'Обрати дату' });
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Календар дати нагадування' });
  await expect(calendar).toBeVisible();

  const activeDate = calendar.locator('button[data-date]:focus');
  await expect(activeDate).toHaveAttribute('data-date', '2026-11-05');
  await page.keyboard.press('ArrowLeft');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-11-04');
  await page.keyboard.press('ArrowDown');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-11-11');
  await page.keyboard.press('ArrowUp');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-11-04');
  await page.keyboard.press('Home');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-11-02');
  await page.keyboard.press('End');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-11-08');
  await page.keyboard.press('Home');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-11-02');
  await page.keyboard.press('ArrowLeft');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-11-01');
  await page.keyboard.press('ArrowLeft');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-10-31');
  await expect(calendar.getByText('жовтень 2026')).toBeVisible();
  await page.keyboard.press('PageDown');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-11-30');
  await page.keyboard.press('Shift+PageUp');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2025-11-30');
  await page.keyboard.press('Shift+PageDown');
  await expect(calendar.locator('button[data-date]:focus')).toHaveAttribute('data-date', '2026-11-30');

  await page.keyboard.press('Tab');
  await expect(calendar.getByRole('button', { name: 'Очистити' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(calendar.getByRole('button', { name: 'Сьогодні' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(calendar.getByRole('button', { name: 'Очистити' })).toBeFocused();
  await calendar.getByRole('button', { name: 'Сьогодні' }).click();

  await expect(calendar).toBeHidden();
  const selectedTrigger = page.getByRole('button', { name: /Змінити дату/ });
  await expect(selectedTrigger).toBeFocused();
  await expect(selectedTrigger).toContainText('05.11.2026');

  await selectedTrigger.click();
  const escapeCalendar = page.getByRole('dialog', { name: 'Календар дати нагадування' });
  await page.keyboard.press('Escape');
  await expect(escapeCalendar).toBeHidden();
  await expect(selectedTrigger).toBeFocused();

  await selectedTrigger.click();
  const reopenedCalendar = page.getByRole('dialog', { name: 'Календар дати нагадування' });
  await reopenedCalendar.getByRole('button', { name: 'Очистити' }).click();
  await expect(reopenedCalendar).toBeHidden();
  await expect(page.getByRole('button', { name: 'Обрати дату' })).toBeFocused();
});
