import {expect,test} from '@playwright/test';

test('unknown public URL renders a useful 404 with two exits',async({page,request})=>{
  const response=await page.goto('/this-route-does-not-exist-93');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading',{name:'Цієї сторінки немає'})).toBeVisible();
  await expect(page.getByRole('link',{name:/На головну/})).toHaveAttribute('href','/');
  await expect(page.getByRole('link',{name:'Підтримка'})).toHaveAttribute('href',/^mailto:support@sift\.app/);
  await expect(page.getByText('HTTP 404 · NOT FOUND')).toBeVisible();
  const health=await request.get('/health');
  expect(health.headers()['content-type']).toContain('application/json');
  const robots=await request.get('/robots.txt');
  expect(robots.headers()['content-type']).toMatch(/text\/plain|text\/x-robots/);
  const sitemap=await request.get('/sitemap.xml');
  expect(sitemap.headers()['content-type']).toContain('application/xml');
});

test('referral URL briefly redirects and preserves a valid token for signup attribution',async({page})=>{
  const token='A'.repeat(43);
  await page.goto(`/r/${token}`);
  await expect(page.getByRole('heading',{name:'Перенаправляємо на Sift…'})).toBeVisible();
  await page.waitForURL(url=>url.pathname==='/'&&!url.searchParams.has('ref'));
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('sift-referral-token'))).toBe(token);
});

test('invalid referral URL falls back home without storing a token',async({page})=>{
  await page.goto('/r/invalid');
  await page.waitForURL(url=>url.pathname==='/'&&!url.searchParams.has('ref'));
  expect(await page.evaluate(()=>sessionStorage.getItem('sift-referral-token'))).toBeNull();
});
