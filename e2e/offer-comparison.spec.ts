import {expect,test,type Route} from '@playwright/test';

const urls={left:'https://www.spotify.com/us/premium/',right:'https://www.apple.com/apple-music/'};
const finding=(kind:string,title:string,evidence:string)=>({kind,title,summary:'Умову знайдено на сторінці',evidence,severity:'medium',confidence:'high'});

async function fulfill(route:Route,value:unknown,status=200){await route.fulfill({status,contentType:'application/json; charset=utf-8',body:JSON.stringify(value)})}
async function waitForHydration(page:import('@playwright/test').Page){await page.waitForFunction(()=>{const button=document.querySelector('.compareExamples button');return Boolean(button&&Object.keys(button).some(key=>key.startsWith('__reactProps')))},null,{timeout:20_000})}

test('compares two real subscription URLs and keeps the comparison table within every viewport',async({page})=>{
  const sent:string[]=[];
  await page.route('**/api/history**',route=>fulfill(route,{items:[],access:{plan:'free',credits:0,used:0,limit:3}}));
  await page.route('**/api/analyze',async route=>{
    const url=(route.request().postDataJSON() as {url:string}).url;sent.push(url);
    const left=url===urls.left;
    await fulfill(route,left?{
      id:'spotify-compare',url:urls.left,host:'www.spotify.com',title:'Spotify Premium',score:72,decision:'wait',verdict:'Уточніть штрафні умови.',prices:['$12.99'],priceDetails:[{amount:12.99,currency:'USD',cadence:'monthly',annualAmount:155.88,firstYearAmount:142.89,introMonths:1}],findings:[finding('renewal','Автопродовження','Renews monthly.'),finding('cancellation','Скасування','Cancel at any time.'),finding('refund','Повернення','Refunds are available within 14 days.'),finding('trial','Пробний період','One month free trial.'),finding('penalty','Штрафи','Early termination fee applies.')],access:{plan:'free',credits:0,used:1,limit:3},
    }:{
      id:'apple-compare',url:urls.right,host:'www.apple.com',title:'Apple Music',score:88,decision:'buy',verdict:'Основні умови знайдено.',prices:['$11.99'],priceDetails:[{amount:11.99,currency:'USD',cadence:'monthly',annualAmount:143.88,firstYearAmount:131.89,introMonths:1}],findings:[finding('renewal','Автопродовження','Renews monthly.'),finding('refund','Повернення','Refund policy within 14 days.'),finding('cancellation','Скасування','Cancel subscription at any time.'),finding('trial','Пробний період','One month free trial.'),finding('penalty','Штрафи','No early cancellation penalty.')],access:{plan:'free',credits:0,used:2,limit:3},
    });
  });
  await page.goto('/compare');
  await waitForHydration(page);
  if((page.viewportSize()?.width||0)>900){await expect(page.locator('.productSidebar')).toBeVisible();await expect(page.locator('.productSidebarNav a')).toHaveCount(5)}
  else{await expect(page.locator('.productTabNav')).toBeVisible();await expect(page.locator('.productTabNav a')).toHaveCount(5)}
  await page.getByRole('button',{name:'Spotify Premium'}).click();
  await expect(page.getByLabel(/Перша пропозиція/)).toHaveValue(urls.left);
  await expect(page.getByLabel(/Друга пропозиція/)).toHaveValue(urls.right);
  await page.getByRole('button',{name:/Порівняти · спише 2 перевірки/}).click();
  await expect(page.getByRole('heading',{name:'Поруч, за однаковими критеріями'})).toBeVisible();
  await expect(page.getByText(/143,88/)).toBeVisible();
  await expect(page.getByText(/Перший рік/).first()).toBeVisible();
  await expect(page.getByText(/Пропозиція 2 на 12\.00 USD/)).toBeVisible();
  await expect(page.getByText(/Early termination fee applies/).last()).toBeVisible();
  await page.getByText('Відкрити окремий звіт Sift').first().click();
  await expect(page.getByText(/Доказ на джерелі/).first()).toBeVisible();
  expect(sent).toEqual([urls.left,urls.right]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('free plan blocks a comparison when fewer than two scans remain',async({page})=>{
  let analyzeCalls=0;
  await page.route('**/api/history**',route=>fulfill(route,{items:[],access:{plan:'free',credits:0,used:2,limit:3}}));
  await page.route('**/api/analyze',async route=>{analyzeCalls++;return fulfill(route,{})});
  await page.goto('/compare');
  await expect(page.getByText(/потрібно 2 перевірки/i)).toBeVisible();
  await expect(page.getByRole('link',{name:/Тарифи/})).toHaveAttribute('href','/#pricing');
  await expect(page.getByRole('button',{name:/Порівняти · спише 2 перевірки/})).toBeDisabled();
  expect(analyzeCalls).toBe(0);
});

test('the same URL is rejected before either analysis starts',async({page})=>{
  let analyzeCalls=0;
  await page.route('**/api/history**',route=>fulfill(route,{items:[],access:{plan:'free',credits:0,used:0,limit:3}}));
  await page.route('**/api/analyze',async route=>{analyzeCalls++;return fulfill(route,{})});
  await page.goto('/compare');await waitForHydration(page);
  await page.getByRole('button',{name:'Spotify Premium'}).click();
  await page.getByLabel(/Друга пропозиція/).fill(urls.left);
  await page.getByRole('button',{name:/Порівняти · спише 2 перевірки/}).click();
  await expect(page.getByRole('alert')).toContainText(/два різні посилання/i);
  expect(analyzeCalls).toBe(0);
});

test('mixed currencies stay visible without declaring a winner',async({page})=>{
  await page.route('**/api/history**',route=>fulfill(route,{items:[],access:{plan:'pro',credits:0,used:0,limit:0}}));
  await page.route('**/api/analyze',async route=>{
    const url=(route.request().postDataJSON() as {url:string}).url;const left=url===urls.left;
    const terms=['renewal','cancellation','refund','trial','penalty'].map(kind=>finding(kind,kind,'Terms are listed on the page.'));
    await fulfill(route,{id:left?'spotify-usd':'apple-eur',url,host:left?'spotify.com':'apple.com',title:left?'Spotify Premium':'Apple Music',score:left?74:79,decision:'wait',verdict:'Звірте умови.',prices:[left?'$12':'€10'],priceDetails:[{amount:left?12:10,currency:left?'USD':'EUR',cadence:'monthly',annualAmount:left?144:120}],findings:terms,access:{plan:'pro',credits:0,used:1,limit:0}});
  });
  await page.goto('/compare');await waitForHydration(page);
  await page.getByRole('button',{name:'Spotify Premium'}).click();
  await page.getByRole('button',{name:/Порівняти · спише 2 перевірки/}).click();
  await expect(page.getByRole('heading',{name:'Поруч, за однаковими критеріями'})).toBeVisible();
  await expect(page.getByText(/144,00/)).toBeVisible();
  await expect(page.getByText(/120,00/)).toBeVisible();
  await expect(page.getByText(/різні або змішані валюти/i)).toBeVisible();
  await expect(page.getByText(/Не оголошуємо переможця/i)).toBeVisible();
});

test('a saved compared report opens directly from its Dashboard link',async({page})=>{
  const report={id:'spotify-compare',url:urls.left,host:'www.spotify.com',title:'Spotify Premium',score:74,decision:'wait',verdict:'Звірте умови першоджерела.',prices:['$12 / місяць'],priceDetails:[],findings:[],unknowns:[],wordCount:1200};
  await page.route('**/api/account**',route=>fulfill(route,{user:{id:'user-1',email:'test@example.com',emailVerified:true},access:{plan:'free',credits:0,used:1,limit:3},subscription:null,payments:[],history:[{id:report.id,createdAt:new Date().toISOString(),result:report}]}));
  await page.goto(`/dashboard?report=${report.id}#history`);
  await expect(page.getByRole('dialog',{name:'Spotify Premium'})).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard#history$/);
});

test('the home page keeps the product tabs hidden',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.productSidebar')).toHaveCount(0);
  await expect(page.locator('.productTabNav')).toHaveCount(0);
});
