import {expect,test} from '@playwright/test';

test('analytics is opt-in, can be refused, and can be enabled later',async({page})=>{
  const events:Array<{stage:string;sessionId:string}>=[];
  await page.route('**/api/**',async route=>{
    if(new URL(route.request().url()).pathname==='/api/analytics/event')events.push(route.request().postDataJSON() as {stage:string;sessionId:string});
    await route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });

  await page.goto('/');
  const consent=page.getByRole('complementary',{name:'Налаштування аналітики'});
  await expect(consent).toBeVisible();
  await consent.getByRole('button',{name:'Ні, дякую'}).click();
  await expect(consent).toBeHidden();
  expect(events).toHaveLength(0);

  await page.reload();
  await expect(consent).toBeHidden();
  const settings=page.getByRole('button',{name:'Налаштування приватності'});
  await settings.scrollIntoViewIfNeeded();
  await settings.click();
  await expect(consent).toBeVisible();
  await consent.getByRole('button',{name:'Дозволити'}).click();
  await expect.poll(()=>events.length).toBe(1);
  expect(events[0]?.stage).toBe('visit');
  expect(events[0]?.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
});

test('Do Not Track suppresses the consent banner and tracking',async({page})=>{
  const events:string[]=[];
  await page.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{configurable:true,value:'1'}));
  await page.route('**/api/**',async route=>{if(new URL(route.request().url()).pathname==='/api/analytics/event')events.push(route.request().url());await route.fulfill({status:200,contentType:'application/json',body:'{}'})});
  await page.goto('/');
  await expect(page.getByRole('complementary',{name:'Налаштування аналітики'})).toBeHidden();
  await page.waitForTimeout(100);
  expect(events).toHaveLength(0);
});

test('funnel dashboard renders aggregate counts without horizontal overflow',async({page})=>{
  await page.route('**/api/analytics/funnel',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({funnel:{visit:100,analyze:64,signup:24,paywall:12,pay:7},periodDays:30,generatedAt:'2026-11-03T12:00:00.000Z'})}));
  await page.goto('/dashboard/analytics');
  await expect(page.getByRole('heading',{name:/Шлях від візиту/})).toBeVisible();
  await expect(page.locator('.funnelStep')).toHaveCount(5);
  await expect(page.locator('.funnelStep').nth(4).locator('.funnelStepValue')).toHaveText('7');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('only the authenticated admin account receives the Dashboard funnel link',async({page})=>{
  let isAdmin=true;
  await page.route('**/api/account**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'admin-user',email:'admin@example.test',emailVerified:true},access:{plan:'free',credits:0,used:0,limit:3},subscription:null,payments:[],history:[],canViewAnalytics:isAdmin})}));
  await page.goto('/dashboard');
  const link=page.getByRole('link',{name:'Воронка'});
  await expect(link).toHaveAttribute('href','/dashboard/analytics');
  isAdmin=false;
  await page.reload();
  await expect(link).toHaveCount(0);
});
