import {expect,test,type Route} from '@playwright/test';

const urls={left:'https://www.spotify.com/us/premium/',right:'https://www.apple.com/apple-music/'};
const finding=(kind:string,title:string,evidence:string)=>({kind,title,summary:'Умову знайдено на сторінці',evidence,severity:'medium'});

async function fulfill(route:Route,value:unknown,status=200){await route.fulfill({status,contentType:'application/json; charset=utf-8',body:JSON.stringify(value)})}
async function waitForHydration(page:import('@playwright/test').Page){await page.waitForFunction(()=>{const button=document.querySelector('.compareExamples button');return Boolean(button&&Object.keys(button).some(key=>key.startsWith('__reactProps')))},null,{timeout:20_000})}

test('compares two real subscription URLs and keeps the comparison table within every viewport',async({page})=>{
  const sent:string[]=[];
  await page.route('**/api/history**',route=>fulfill(route,{items:[],access:{plan:'free',credits:0,used:0,limit:3}}));
  await page.route('**/api/analyze',async route=>{
    const url=(route.request().postDataJSON() as {url:string}).url;sent.push(url);
    const left=url===urls.left;
    await fulfill(route,left?{
      id:'spotify-compare',url:urls.left,host:'www.spotify.com',title:'Spotify Premium',score:72,decision:'wait',verdict:'Уточніть штрафні умови.',prices:['$12.99'],priceDetails:[{amount:12.99,currency:'USD',cadence:'monthly',annualAmount:155.88,firstYearAmount:142.89,introMonths:1}],findings:[finding('renewal','Автопродовження','Renews monthly.'),finding('penalty','Штрафи','Early termination fee applies.')],access:{plan:'free',credits:0,used:1,limit:3},
    }:{
      id:'apple-compare',url:urls.right,host:'www.apple.com',title:'Apple Music',score:88,decision:'buy',verdict:'Основні умови знайдено.',prices:['$11.99'],priceDetails:[{amount:11.99,currency:'USD',cadence:'monthly',annualAmount:143.88,firstYearAmount:131.89,introMonths:1}],findings:[finding('renewal','Автопродовження','Renews monthly.'),finding('refund','Повернення','Refund policy within 14 days.'),finding('cancellation','Скасування','Cancel subscription at any time.')],access:{plan:'free',credits:0,used:2,limit:3},
    });
  });
  await page.goto('/compare');
  await waitForHydration(page);
  await page.getByRole('button',{name:'Spotify Premium'}).click();
  await expect(page.getByLabel(/Перша пропозиція/)).toHaveValue(urls.left);
  await expect(page.getByLabel(/Друга пропозиція/)).toHaveValue(urls.right);
  await page.getByRole('button',{name:'Порівняти умови'}).click();
  await expect(page.getByRole('heading',{name:'Поруч, за однаковими критеріями'})).toBeVisible();
  await expect(page.getByText(/143,88/)).toBeVisible();
  await expect(page.getByText(/Перший рік/).first()).toBeVisible();
  await expect(page.getByText(/Пропозиція 2 на 12\.00 USD/)).toBeVisible();
  await expect(page.getByText(/Early termination fee applies/)).toBeVisible();
  expect(sent).toEqual([urls.left,urls.right]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('free plan blocks a comparison when fewer than two scans remain',async({page})=>{
  let analyzeCalls=0;
  await page.route('**/api/history**',route=>fulfill(route,{items:[],access:{plan:'free',credits:0,used:2,limit:3}}));
  await page.route('**/api/analyze',async route=>{analyzeCalls++;return fulfill(route,{})});
  await page.goto('/compare');
  await expect(page.getByText(/потрібно 2 перевірки/i)).toBeVisible();
  await expect(page.getByRole('button',{name:'Порівняти умови'})).toBeDisabled();
  expect(analyzeCalls).toBe(0);
});
