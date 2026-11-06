import {expect,test} from '@playwright/test';

const guestRoutes=['/dashboard','/dashboard/integrations','/dashboard/space','/dashboard/support','/dashboard/support/domains','/dashboard/analytics'];

test('all private and allowlist pages use the shared guest gate',async({page})=>{
  for(const path of guestRoutes){
    await page.goto(path);
    await expect(page.locator('.accessGateRoot')).toBeVisible();
    const expectedHref=['/dashboard/support','/dashboard/support/domains','/dashboard/analytics'].includes(path)?'/':`/?login=1&next=${encodeURIComponent(path)}`;
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
  let loggedIn=false,inviteAccepted=false;
  await page.route('**/api/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:loggedIn?signedIn.user:null})}));
  await page.route('**/api/auth/login',route=>{loggedIn=true;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(signedIn)})});
  await page.route('**/api/account?deviceId=*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(signedIn)}));
  await page.route('**/api/spaces**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/api/spaces/invites/accept'){
      if(!loggedIn)return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Потрібен вхід'})});
      inviteAccepted=true;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,spaceId:'shared-space-1'})});
    }
    if(pathname==='/api/spaces/shared-space-1')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({space:{id:'shared-space-1',title:'E2E Space',role:'member',status:'active',maxMembers:5,members:[],items:[]}})});
    if(!loggedIn)return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Потрібен вхід'})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({spaces:[]})});
  });
  await page.goto(path);
  await expect(page.locator('.accessGateRoot')).toBeVisible();
  await page.getByRole('link',{name:'Увійти до простору'}).click();
  await page.waitForURL(url=>url.pathname==='/'&&!url.search);
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('sift-auth-next'))).toBe(path);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Email',{exact:true}).fill('guest-gate@example.test');
  await page.getByLabel('Пароль',{exact:true}).fill('correct-horse-battery');
  await page.locator('.authSubmit').click();
  await page.waitForURL(url=>url.pathname==='/dashboard/space'&&!url.search);
  await expect.poll(()=>inviteAccepted).toBe(true);
  await expect(page.getByText('Ви приєдналися до спільного простору.')).toBeVisible();
});
