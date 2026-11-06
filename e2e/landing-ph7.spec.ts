import {expect,test,type Page} from '@playwright/test';

const deviceHistory=Array.from({length:6},(_,index)=>({
  id:`device-report-${index+1}`,
  createdAt:`2026-11-${String(5-index).padStart(2,'0')}T12:00:00.000Z`,
  result:{
    id:`device-report-${index+1}`,
    url:`https://service-${index+1}.example.test/terms`,
    host:`service-${index+1}.example.test`,
    title:`Terms of Use ${index+1}`,
    score:50+index*5,
    prices:[],
    findings:[{kind:'renewal',title:'Продовження',summary:'Умову знайдено',evidence:'Renewal details.',severity:'medium'}],
    wordCount:120,
    verdict:'Перевірте умови перед оплатою.',
    lockedCount:1,
  },
}));

async function prepare(page:Page,items:typeof deviceHistory=[]){
  await page.addInitScript(()=>localStorage.setItem('sift-funnel-consent','granted'));
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/me')return route.fulfill({json:{user:null}});
    if(path==='/api/history')return route.fulfill({json:{items,access:{plan:'free',credits:0,used:0,limit:3}}});
    return route.fulfill({json:{ok:true}});
  });
}

test('landing uses real empty-history state and adapts navigation, plans and ticker at 390px',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await prepare(page);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/Sift покаже наступне списання/})).toBeVisible();
  await expect(page.getByText('Перевірте першу сторінку')).toBeVisible();
  await expect(page.locator('.deviceStats')).toHaveCount(0);
  await expect(page.locator('.purchases .emptyHistory')).toContainText('Перевірте перше посилання');
  await expect(page.locator('.scenarioTickerItem').first()).toContainText('КУРСИ');
  expect(await page.locator('.scenarioTickerTrack').evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
  expect(await page.locator('.scenarioTickerGroup[aria-hidden="true"]').evaluate(element=>getComputedStyle(element).display)).toBe('none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  expect(await page.locator('.scenarioTickerTrack').evaluate(element=>getComputedStyle(element).animationName)).toBe('scenario-ticker-scroll');
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.scenarioTickerTrack').evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
  await expect(page.locator('.footerColumnLinks').first()).not.toBeVisible();
  await expect(page.locator('.footerColumn')).toHaveCount(5);
  await page.locator('.footerColumn').first().locator('summary').click();
  await expect(page.locator('.footerColumn').first().locator('.footerColumnLinks')).toBeVisible();
  expect(await page.locator('.plans.three .pro').evaluate(element=>getComputedStyle(element).borderTopColor)).toBe('rgb(185, 243, 83)');
  expect(await page.locator('.cta').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(16, 19, 15)');
  const planOrder=await page.locator('.plans.three>article').evaluateAll(cards=>cards.map(card=>({name:card.className,top:card.getBoundingClientRect().top})));
  expect(planOrder.find(item=>item.name.includes('pro'))!.top).toBeLessThan(planOrder.find(item=>item.name.includes('freePlan'))!.top);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('device history shows at most five reports with their actual score, domain and date',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await prepare(page,deviceHistory);
  await page.goto('/');
  await expect(page.locator('.purchaseRow')).toHaveCount(5);
  await expect(page.locator('.purchaseRow').first()).toContainText('service-1.example.test');
  await expect(page.locator('.purchaseRow').first().locator('.purchaseScore')).toContainText('50');
  await expect(page.locator('.purchaseDate').first()).not.toBeEmpty();
  for(const width of [390,443]){
    await page.setViewportSize({width,height:844});
    const scoreBox=await page.locator('.purchaseRow').first().locator('.purchaseScore').boundingBox();
    const titleBox=await page.locator('.purchaseRow').first().locator('.purchaseInfo>b').boundingBox();
    expect(scoreBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(scoreBox!.x+scoreBox!.width).toBeLessThanOrEqual(titleBox!.x);
  }
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.deviceStats article')).toHaveCount(3);
  await expect(page.locator('.deviceStats article').first()).toContainText('6');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
