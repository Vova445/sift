import { expect, test } from '@playwright/test';

test('integration management is clear for signed-out users and fits mobile screens', async ({ page }) => {
  await page.goto('/dashboard/integrations');
  await expect(page.locator('.accessGateRoot')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Підключіть Sift до Telegram і API.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Увійти до Sift' })).toHaveAttribute('href', '/?login=1&next=%2Fdashboard%2Fintegrations');
  const integrationOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(integrationOverflow).toBe(false);

  await page.goto('/api-docs');
  await expect(page.getByRole('heading', { name: 'Вбудуйте перевірку Sift у свій процес.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'POST /api/v1/analyze' })).toBeVisible();
  await expect(page.getByText(/Перевищено ліміт 30 запитів за хвилину/)).toBeVisible();
  const docsOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(docsOverflow).toBe(false);
});

test('OpenAPI 3.1 document is publicly readable', async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/api/v1/openapi.json`);
  expect(response.ok()).toBeTruthy();
  const spec = await response.json();
  expect(spec.openapi).toBe('3.1.0');
  expect(spec.paths['/api/v1/analyze'].post.security).toEqual([{ BearerApiKey: [] }]);
  expect(spec.paths['/api/v1/analyze'].post.responses['429']).toBeTruthy();
});
