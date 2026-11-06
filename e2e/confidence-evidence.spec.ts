import {expect,test,type Route} from '@playwright/test';

async function json(route:Route,value:unknown){return route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(value)})}

test('low-confidence clauses stay cautious and each visible condition links to its source',async({page})=>{
  const url='https://example.com/subscription-terms';
  await page.route('**/api/auth/me',route=>json(route,{user:null}));
  await page.route('**/api/history**',route=>json(route,{items:[],access:{plan:'free',credits:0,used:0,limit:3}}));
  await page.route('**/api/analyze',route=>json(route,{
    id:'confidence-e2e',url,host:'example.com',title:'Subscription terms',score:45,prices:['$10 per month'],wordCount:1300,
    findings:[{kind:'renewal',title:'Автоматичне продовження',summary:'Не вдалося впевнено визначити за цим фрагментом',evidence:'The subscription may renew depending on your region.',severity:'high',confidence:'low',sourceUrl:url}],
    unknowns:[{kind:'refund',title:'Повернення коштів',summary:'Не вдалося знайти підтверджувальний фрагмент про повернення.',evidence:'',confidence:'low',sourceUrl:url,unresolved:true}],
    verdict:'Почекати: не вдалося впевнено визначити умову автопродовження та умови повернення.',decision:'wait',access:{plan:'free',credits:0,used:1,limit:3},
  }));
  await page.goto('/#top');
  await page.waitForFunction(()=>{const button=document.querySelector('.inputrow button');return Boolean(button&&Object.keys(button).some(key=>key.startsWith('__reactProps')))});
  await page.locator('.inputrow input').fill(url);
  await page.getByRole('button',{name:'Перевірити',exact:true}).click();
  await expect(page.getByText('Низька впевненість').first()).toBeVisible();
  await expect(page.getByText(/не вдалося впевнено визначити/i).first()).toBeVisible();
  await expect(page.getByText(/Цитату не знайдено у доступному тексті/)).toBeVisible();
  await expect(page.getByRole('link',{name:'Джерело: example.com ↗'}).first()).toHaveAttribute('href',url);
  await expect(page.getByText('Почекати',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
