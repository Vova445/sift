import {expect,test} from '@playwright/test';

async function waitForSettingsHydration(page: import('@playwright/test').Page){
  await page.waitForFunction(()=>{
    const button=document.querySelector('.funnelSettingsLink');
    return Boolean(button&&Object.keys(button).some(key=>key.startsWith('__reactProps')));
  },null,{timeout:20_000});
}

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
  await waitForSettingsHydration(page);
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
  await page.route('**/api/analytics/achievements',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(achievementAnalyticsFixture(false))}));
  await page.goto('/dashboard/analytics');
  await expect(page.getByRole('heading',{name:/Шлях від візиту/})).toBeVisible();
  await expect(page.locator('.funnelStep')).toHaveCount(5);
  await expect(page.locator('.funnelStep').nth(4).locator('.funnelStepValue')).toHaveText('7');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

function achievementAnalyticsFixture(enabled:boolean){
  const group=(variant:'progress'|'control')=>({variant,assigned:12,earnedAfterAssignment:3,earnedRate:25,d7:{eligible:8,returned:4,rate:50,interval95:{low:21.5,high:78.5}},d30:{eligible:0,returned:0,rate:null,interval95:null},pro30:{eligible:0,converted:0,rate:null,interval95:null}});
  return {experiment:{key:'badge_progress_visibility_v1',enabled,progressPercent:50,startedAt:'2026-11-01T00:00:00.000Z',daysRunning:4,reportDueAt:'2026-11-15T00:00:00.000Z',minimumArmSize:50,reportReady:false,updatedAt:'2026-11-01T00:00:00.000Z'},badgeDistribution:{totalUsers:100,usersWithAnyBadge:35,usersWithAnyBadgeRate:35,badges:[{key:'skeptic',title:'Скептик',users:20,rate:20}]},groups:[group('progress'),group('control')],generatedAt:'2026-11-05T12:00:00.000Z'};
}

test('achievement experiment is toggled live and shows badge, retention, and Pro metrics',async({page})=>{
  let enabled=false;
  let updateCount=0;
  await page.route('**/api/analytics/funnel',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({funnel:{visit:100,analyze:64,signup:24,paywall:12,pay:7},periodDays:30,generatedAt:'2026-11-03T12:00:00.000Z'})}));
  await page.route('**/api/analytics/achievements',async route=>{
    if(route.request().method()==='POST'){
      enabled=Boolean((route.request().postDataJSON() as {enabled?:boolean}).enabled);updateCount++;
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(achievementAnalyticsFixture(enabled))});
  });
  await page.goto('/dashboard/analytics');
  await expect(page.getByRole('heading',{name:'Досягнення у цифрах'})).toBeVisible();
  await expect(page.getByText('35 із 100 акаунтів')).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'D7 повернення'}).first()).toBeVisible();
  await expect(page.getByText(/95% ДІ 21,5%–78,5%/).first()).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'Оплата Pro за 30 днів'}).first()).toBeVisible();
  await page.getByRole('button',{name:'Увімкнути тест'}).click();
  await expect(page.getByText('Тест активний')).toBeVisible();
  expect(updateCount).toBe(1);
  await page.getByRole('button',{name:'Зупинити тест'}).click();
  await expect(page.getByText('Тест призупинено')).toBeVisible();
  expect(updateCount).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('only the authenticated admin account receives the Dashboard funnel link',async({page})=>{
  let isAdmin=true;
  await page.route('**/api/account**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'admin-user',email:'admin@example.test',emailVerified:true},access:{plan:'free',credits:0,used:0,limit:3},subscription:null,payments:[],history:[],canViewAnalytics:isAdmin})}));
  await page.goto('/dashboard');
  const link=page.getByRole('link',{name:'Аналітика'});
  await expect(link).toHaveAttribute('href','/dashboard/analytics');
  isAdmin=false;
  await page.reload();
  await expect(link).toHaveCount(0);
});
