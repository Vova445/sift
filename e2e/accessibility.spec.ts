import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function audit(page: Page, screen: string) {
  const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  const summary = results.violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  }));
  if (summary.length) console.log(`Axe findings on ${screen}: ${JSON.stringify(summary)}`);
  expect(
    results.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious'),
    `Critical/serious Axe violations on ${screen}: ${JSON.stringify(summary)}`,
  ).toEqual([]);
  return results;
}

async function fulfillJson(route: Route, value: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value) });
}

test('landing, auth, and checkout dialogs pass Axe and contain keyboard focus', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/auth/me') return fulfillJson(route, { user: null });
    if (pathname === '/api/history') return fulfillJson(route, { items: [], access: { plan: 'free', credits: 0, used: 0, limit: 3 } });
    if (pathname === '/api/security/turnstile') return fulfillJson(route, { siteKey: 'a11y-test-site-key' });
    return fulfillJson(route, {});
  });
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({
    contentType: 'application/javascript; charset=utf-8',
    body: 'window.turnstile={render:function(_node,options){setTimeout(function(){options.callback("a11y-test-token")},0);return "a11y-widget"},remove:function(){}};',
  }));

  await page.goto('/');
  await page.waitForFunction(() => {
    const button = document.querySelector('.navright button.dark');
    return Boolean(button && Object.keys(button).some(key => key.startsWith('__reactProps')));
  }, null, { timeout: 20_000 });
  await expect(page.locator('.hero h1')).toHaveCSS('opacity', '1');
  await audit(page, 'landing');

  const register = page.getByRole('button', { name: 'Реєстрація' });
  await register.click();
  const authDialog = page.locator('.overlay .modal');
  await expect(authDialog).toHaveAttribute('role', 'dialog');
  await expect(authDialog).toHaveAttribute('aria-modal', 'true');
  await expect(authDialog).toHaveAttribute('aria-labelledby', 'auth-modal-title');
  await expect(authDialog).toBeVisible();
  await expect(page.locator('.overlay')).toHaveCSS('opacity', '1');
  await audit(page, 'registration dialog');

  const authButtons = authDialog.locator('button:not([disabled])');
  const close = authDialog.getByRole('button', { name: 'Закрити' });
  await expect(close).toBeFocused();
  await authButtons.last().focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(authButtons.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(authDialog).toBeHidden();
  await expect(register).toBeFocused();

  const oneSift = page.getByRole('button', { name: 'Купити · $1.49' });
  await oneSift.click();
  const checkoutDialog = page.getByRole('dialog', { name: 'One Sift' });
  await expect(checkoutDialog).toBeVisible();
  await expect(page.locator('.overlay')).toHaveCSS('opacity', '1');
  await audit(page, 'checkout dialog');
  await page.keyboard.press('Escape');
  await expect(checkoutDialog).toBeHidden();
  await expect(oneSift).toBeFocused();
});

test('dashboard, saved report, billing, and account deletion dialogs pass Axe and keyboard checks', async ({ page }) => {
  const report = {
    id: 'a11y-report-1',
    url: 'https://www.coursera.org/terms',
    host: 'www.coursera.org',
    title: 'Terms of Use | Coursera',
    score: 78,
    prices: ['$20 per month'],
    findings: [{ title: 'Автоматичне продовження', summary: 'Перевірте умови до оплати', evidence: 'Your subscription renews automatically each month.', severity: 'medium' }],
    wordCount: 2400,
    verdict: 'Уточніть наступне списання перед оплатою.',
    decision: 'wait',
  };
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/account') return fulfillJson(route, {
      user: { id: 'a11y-user', email: 'a11y@example.test', emailVerified: true },
      access: { plan: 'pro', credits: 0, used: 2, limit: 999 },
      subscription: { id: 'sub-1', status: 'active', expires_at: '2027-01-01T00:00:00.000Z', grace_until: null, past_due_at: null, dunning_email_sent_at: null, cancel_at_period_end: 0, canceled_at: null, last_payment_at: null, auto_renew: 1 },
      payments: [],
      history: [{ id: report.id, createdAt: '2026-10-01T00:00:00.000Z', result: report }],
    });
    if (pathname === '/api/watchlist') return fulfillJson(route, { items: [] });
    return fulfillJson(route, {});
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Покупки без неприємних сюрпризів.' })).toBeVisible();
  const consent=page.getByRole('complementary',{name:'Налаштування аналітики'});
  if(await consent.isVisible())await consent.getByRole('button',{name:'Ні, дякую'}).click();
  await audit(page, 'dashboard');

  await page.locator('.billingCancel').click();
  const billingDialog = page.getByRole('dialog', { name: 'Скасувати автопродовження?' });
  await expect(billingDialog).toBeVisible();
  await audit(page, 'billing cancellation dialog');
  const billingClose = billingDialog.getByRole('button', { name: 'Закрити' });
  await expect(billingClose).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(billingDialog).toBeHidden();
  await expect(page.locator('.billingCancel')).toBeFocused();

  await page.locator('.dashTable button').first().click();
  const reportDialog = page.getByRole('dialog', { name: 'Terms of Use | Coursera' });
  await expect(reportDialog).toBeVisible();
  await audit(page, 'saved report dialog');
  await page.keyboard.press('Escape');
  await expect(reportDialog).toBeHidden();

  const deleteButton = page.locator('.accountDeleteRow').getByRole('button', { name: 'Видалити' });
  await deleteButton.click();
  const deleteDialog = page.getByRole('dialog', { name: 'Видалити акаунт?' });
  await expect(deleteDialog).toBeVisible();
  await audit(page, 'delete account dialog');
  await page.keyboard.press('Escape');
  await expect(deleteDialog).toBeHidden();
  await expect(deleteButton).toBeFocused();
});
