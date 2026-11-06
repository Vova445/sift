import { expect, test, type Page, type Route } from '@playwright/test';

const account = { id: 'e2e-user-1', email: 'e2e@example.test', emailVerified: true };
const freeAccess = { plan: 'free', credits: 0, used: 1, limit: 3 };
const paidAccess = { plan: 'one', credits: 0, used: 1, limit: 3, testMode: true };

function testReport(unlocked: boolean) {
  return {
    id: 'e2e-report-1',
    url: 'https://www.coursera.org/learn/test-terms',
    host: 'www.coursera.org',
    title: 'Terms of Use | Coursera',
    score: 72,
    prices: ['$20 per month'],
    findings: [
      { kind: 'renewal', title: 'Автоматичне продовження', summary: 'Потребує уваги до оплати', evidence: 'Your subscription will renew automatically at the end of each billing period.', severity: 'high' },
      { kind: 'refund', title: 'Умови повернення', summary: 'Перевірте деталі перед оплатою', evidence: 'Certain subscriptions may be eligible for a refund within 14 days.', severity: 'medium' },
      { kind: 'cancellation', title: 'Скасування', summary: 'Скасуйте до наступного списання', evidence: 'You may cancel your subscription at any time in account settings.', severity: 'medium' },
    ],
    wordCount: 9304,
    verdict: 'Перевірте умови продовження та повернення перед оплатою.',
    decision: 'wait',
    translationPlan: unlocked ? 'one' : null,
    lockedCount: unlocked ? 0 : 1,
    access: unlocked ? paidAccess : freeAccess,
  };
}

async function fulfillJson(route: Route, value: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value) });
}

async function waitForClientHydration(page: Page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('.navright button.dark');
    return Boolean(button && Object.keys(button).some(key => key.startsWith('__reactProps')));
  }, null, { timeout: 20_000 });
}

async function installCriticalPathMocks(page: Page) {
  let report: ReturnType<typeof testReport> | null = null;
  let paid = false;
  let loggedIn = false;
  let emailVerified = false;

  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({
    contentType: 'application/javascript; charset=utf-8',
    body: `window.turnstile={render:function(_container,options){setTimeout(function(){options.callback('e2e-turnstile-token')},0);return 'e2e-widget'},remove:function(){}};`,
  }));

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === '/api/auth/me') return fulfillJson(route, { user: loggedIn ? { ...account, emailVerified } : null });
    if (url.pathname === '/api/history') {
      const items = report ? [{ result: testReport(paid) }] : [];
      return fulfillJson(route, { items, access: paid ? paidAccess : freeAccess });
    }
    if (url.pathname === '/api/translate' && method === 'POST') return fulfillJson(route, { translation: 'Український переклад доказу.' });
    if (url.pathname === '/api/security/turnstile') return fulfillJson(route, { siteKey: 'e2e-site-key' });
    if (url.pathname === '/api/auth/signup' && method === 'POST') {
      const body = request.postDataJSON() as { email?: string; turnstileToken?: string; legalConsent?: { acceptTerms?: boolean } };
      if (!body.email || body.turnstileToken !== 'e2e-turnstile-token' || !body.legalConsent?.acceptTerms) {
        return fulfillJson(route, { error: 'Signup test input invalid' }, 400);
      }
      loggedIn = true;
      return fulfillJson(route, { user: { ...account, email: body.email, emailVerified: false }, verification: { sent: true } });
    }
    if (url.pathname === '/api/auth/verify-email' && method === 'POST') {
      emailVerified = true;
      return fulfillJson(route, { verified: true, message: 'Email підтверджено. Тепер доступні платні можливості Sift.' });
    }
    if (url.pathname === '/api/account') return fulfillJson(route, { user: { ...account, emailVerified }, access: paid ? paidAccess : freeAccess, history: report ? [{ result: testReport(paid) }] : [] });
    if (url.pathname === '/api/analyze' && method === 'POST') {
      report = testReport(false);
      return fulfillJson(route, report);
    }
    if (url.pathname === '/api/billing/wayforpay/checkout' && method === 'POST') {
      paid = true;
      return fulfillJson(route, {
        action: 'https://secure.wayforpay.com/pay',
        fields: { orderReference: 'sift-e2e-one-001', amount: '59.00', currency: 'UAH', productName: ['One Sift — один повний звіт'] },
        testMode: true,
      });
    }
    if (url.pathname === '/api/billing/wayforpay/status') {
      return fulfillJson(route, { status: 'paid', plan: 'one', testMode: true, access: paidAccess });
    }

    return fulfillJson(route, { error: `Unexpected API request: ${method} ${url.pathname}` }, 500);
  });

  await page.route('https://secure.wayforpay.com/pay', async route => {
    const form = new URLSearchParams(route.request().postData() || '');
    const reference = form.get('orderReference');
    if (!reference) return route.fulfill({ status: 400, body: 'Missing sandbox order reference' });
    const returnUrl = new URL('/', page.url());
    returnUrl.searchParams.set('payment', reference);
    returnUrl.searchParams.set('plan', 'one');
    const returnHref = returnUrl.toString().replaceAll('&', '&amp;');
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="uk"><meta charset="utf-8"><title>WayForPay Sandbox</title><body style="font:16px sans-serif;max-width:680px;margin:15vh auto;padding:24px;color:#111"><main><p>WAYFORPAY · SANDBOX</p><h1>Тестовий платіж</h1><p>Цей браузерний сценарій не списує кошти.</p><a id="confirm" href="${returnHref}" style="display:inline-flex;align-items:center;min-height:48px;padding:0 24px;background:#aff45a;color:#111;text-decoration:none">Підтвердити тестову оплату</a></main></body></html>`,
    });
  });
}

test('signup → analyze → sandbox checkout → reopen saved report', async ({ page }) => {
  await installCriticalPathMocks(page);
  const authBootstrap = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/me');
  await page.goto('/');
  await authBootstrap;
  await waitForClientHydration(page);
  const analyticsConsent=page.getByRole('complementary',{name:'Налаштування аналітики'});
  if(await analyticsConsent.isVisible())await analyticsConsent.getByRole('button',{name:'Ні, дякую'}).click();

  await page.getByRole('button', { name: 'Реєстрація' }).click();
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Пароль').fill('E2E-test-password-123');
  await page.locator('.signupLegalCheckbox input').check();
  await expect(page.getByRole('button', { name: 'Створити акаунт' })).toBeEnabled();
  await page.getByRole('button', { name: 'Створити акаунт' }).click();
  await page.waitForURL(url=>url.pathname==='/dashboard');
  await expect(page.getByText('Email ще не підтверджено')).toBeVisible();

  // Open the one-time link that the signup email would contain.
  await page.goto('/verify-email#token=e2e-test-verification-token');
  await page.getByRole('button', { name: 'Підтвердити email' }).click();
  await expect(page.getByRole('heading', { name: 'Email підтверджено' })).toBeVisible();
  await page.getByRole('link', { name: 'Перейти до входу' }).click();
  await page.waitForURL(url=>url.pathname==='/dashboard');
  await page.goto('/#top');
  await waitForClientHydration(page);

  const analyzeInput = page.getByRole('textbox', { name: 'Посилання для перевірки' });
  await analyzeInput.fill('https://www.coursera.org/learn/test-terms');
  await expect(analyzeInput).toHaveValue('https://www.coursera.org/learn/test-terms');
  const analyzeButton = page.getByRole('button', { name: 'Перевірити', exact: true });
  await expect(analyzeButton).toBeEnabled();
  await analyzeButton.click();
  await expect(page.getByRole('heading', { name: 'Terms of Use | Coursera' })).toBeVisible();
  await expect(page.getByText('Потребує уваги до оплати')).toBeVisible();

  await page.getByRole('button', { name: 'Купити · $1.49' }).click();
  await expect(page.getByRole('heading', { name: 'One Sift' })).toBeVisible();
  for (const checkbox of await page.locator('.checkoutLegalChecks input').all()) await checkbox.check();
  await page.getByRole('button', { name: 'Перейти до WayForPay' }).click();

  await expect(page.getByRole('heading', { name: 'Тестовий платіж' })).toBeVisible();
  await page.getByRole('link', { name: 'Підтвердити тестову оплату' }).click();
  await expect(page.getByText('Оплату підтверджено WayForPay.')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Закрити' }).click();

  await page.locator('.purchaseRow').filter({ hasText: 'Terms of Use | Coursera' }).click();
  const reportSection = page.locator('#report');
  await expect(reportSection.getByRole('heading', { name: 'Terms of Use | Coursera' })).toBeVisible();
  const ukrainianTranslation = reportSection.getByRole('button', { name: 'Українська' }).first();
  await expect(ukrainianTranslation).toBeEnabled();
  await ukrainianTranslation.click();
  await expect(reportSection.getByText('Український переклад доказу.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.mouse.move(-1, -1);
  await expect(reportSection).toHaveScreenshot('paid-purchase-report.png');
});
