import {expect,test,type Route} from '@playwright/test';

test.use({trace:'off',video:'off',screenshot:'off'});

const result={
  id:'timeline-report',url:'https://example.test/terms',host:'example.test',title:'Subscription Terms',score:71,
  decision:'wait',verdict:'Перевірте умови перед оплатою.',prices:['$5','$10','$20'],
  priceDetails:[
    {amount:5,currency:'USD',cadence:'monthly',annualAmount:60,firstYearAmount:60,introMonths:0},
    {amount:10,currency:'USD',cadence:'monthly',annualAmount:120,firstYearAmount:120,introMonths:0},
    {amount:20,currency:'USD',cadence:null,annualAmount:null,firstYearAmount:null,introMonths:0},
  ],
  findings:[
    {kind:'refund',title:'Умови повернення',summary:'Згадано',evidence:'Request a refund within 14 days of purchase.',confidence:'high'},
    {kind:'penalty',title:'Штраф',summary:'Потребує уваги',evidence:'Early cancellation fee is $20.',confidence:'high'},
    {kind:'price',title:'Ціна',summary:'Знайдено',evidence:'For the first 3 months you pay $5 per month.',confidence:'high'},
    {kind:'price',title:'Ціна після підвищення',summary:'Знайдено',evidence:'Then the price increases to $10 per month after the first 3 months.',confidence:'high'},
    {kind:'price',title:'Сума штрафу',summary:'Знайдено',evidence:'Early cancellation fee is $20.',confidence:'medium'},
  ],unknowns:[],wordCount:500,
};

async function json(route:Route,value:unknown){await route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(value)});}

test('the 12-month cost chart fits mobile widths and labels its evidence-backed dates',async({page})=>{
  await page.clock.install({time:new Date('2026-11-04T12:00:00.000Z')});
  await page.route('**/api/account**',route=>json(route,{
    user:{id:'test-user',email:'test@example.test',emailVerified:true},
    access:{plan:'one',credits:1,used:0,limit:3},subscription:null,payments:[],
    history:[{id:result.id,createdAt:'2026-11-04T12:00:00.000Z',result}],canViewAnalytics:false,canAccessSupport:false,
  }));
  await page.route('**/api/public-verdict**',route=>json(route,{share:null}));
  await page.goto('/dashboard');
  await page.getByRole('button',{name:/Subscription Terms/}).click();
  await expect(page.getByRole('heading',{name:'Часова шкала реальної вартості'})).toBeVisible();
  await expect(page.locator('.realCostTotal')).toContainText('105');
  await expect(page.locator('time[datetime="2027-02-04"]')).toBeVisible();
  await expect(page.getByText(/14 днів/)).toBeVisible();

  for(const width of [360,390,430]){
    await page.setViewportSize({width,height:844});
    await expect(page.locator('.realCostCard')).toBeVisible();
    const dimensions=await page.evaluate(()=>({
      viewport:window.innerWidth,document:document.documentElement.scrollWidth,
      card:document.querySelector('.realCostCard')?.getBoundingClientRect().width,
      cardContent:document.querySelector('.realCostCard')?.scrollWidth,
    }));
    expect(dimensions.document,`document overflows at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.cardContent,`timeline card overflows at ${width}px`).toBeLessThanOrEqual((dimensions.card||0)+1);
  }
});
