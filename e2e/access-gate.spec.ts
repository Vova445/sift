import {expect,test} from '@playwright/test';

const guestRoutes=['/dashboard','/dashboard/integrations','/dashboard/space','/dashboard/support','/dashboard/support/domains','/dashboard/analytics'];

test('all private and allowlist pages use the shared guest gate',async({page})=>{
  for(const path of guestRoutes){
    await page.goto(path);
    await expect(page.locator('.accessGateRoot')).toBeVisible();
    const expectedHref=['/dashboard/support','/dashboard/support/domains','/dashboard/analytics'].includes(path)?'/':path==='/dashboard/space'?'/?login=1':`/?login=1&next=${encodeURIComponent(path)}`;
    await expect(page.locator('.accessGatePrimary')).toHaveAttribute('href',expectedHref);
  }
});

test('private gate stays usable at 360px and honors reduced motion',async({page})=>{
  await page.setViewportSize({width:360,height:780});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/dashboard');
  await expect(page.locator('.accessGateRoot')).toBeVisible();
  await expect(page.getByRole('link',{name:'Створити безкоштовний акаунт'})).toBeVisible();
  const metrics=await page.evaluate(()=>({
    width:document.documentElement.scrollWidth,
    viewport:window.innerWidth,
    trustSize:parseFloat(getComputedStyle(document.querySelector('.accessGateTrust')!).fontSize),
    glowAnimation:getComputedStyle(document.querySelector('.accessGateHero')!,'::after').animationName,
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.trustSize).toBeGreaterThanOrEqual(12);
  expect(metrics.glowAnimation).toBe('none');
});

test('restricted gate has no signup action',async({page})=>{
  await page.goto('/dashboard/analytics');
  await expect(page.locator('.accessGateRoot.isRestricted')).toBeVisible();
  await expect(page.getByText(/доступ за allowlist/i)).toBeVisible();
  await expect(page.getByRole('link',{name:'Створити безкоштовний акаунт'})).toHaveCount(0);
});

test('guest space invitation survives the trip to sign-in',async({page})=>{
  const path='/dashboard/space?invite=invite-token-for-testing';
  const signedIn={user:{id:'e2e-user',email:'guest-gate@example.test',emailVerified:true},access:{plan:'free',credits:0,used:0,limit:3},history:[]};
  await page.route('**/api/auth/login',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(signedIn)}));
  await page.route('**/api/account?deviceId=*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(signedIn)}));
  await page.goto(path);
  await expect(page.locator('.accessGateRoot')).toBeVisible();
  await page.getByRole('link',{name:'Увійти до Sift'}).click();
  await page.waitForURL(url=>url.pathname==='/'&&!url.search);
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('sift-auth-next'))).toBe(path);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Email',{exact:true}).fill('guest-gate@example.test');
  await page.getByLabel('Пароль',{exact:true}).fill('correct-horse-battery');
  await page.locator('.authSubmit').click();
  await page.waitForURL(url=>url.pathname==='/dashboard/space'&&url.searchParams.get('invite')==='invite-token-for-testing');
});
