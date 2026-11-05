import {expect,test,type Page} from '@playwright/test';

const scanUrl='https://shop.example.test/checkout';
const findings=[
  {kind:'price',title:'Ціна',summary:'Знайдено щомісячну ціну',evidence:'The plan costs $9.99 per month.',severity:'medium',confidence:'high',sourceUrl:scanUrl},
  {kind:'trial',title:'Пробний період',summary:'Після пробного періоду спишеться оплата',evidence:'Your trial lasts 14 days.',severity:'medium',confidence:'high',sourceUrl:scanUrl},
  {kind:'renewal',title:'Автоматичне продовження',summary:'Підписка продовжується автоматично',evidence:'Your plan renews automatically each month.',severity:'high',confidence:'high',sourceUrl:scanUrl},
  {kind:'cancellation',title:'Скасування',summary:'Скасування доступне в налаштуваннях',evidence:'Cancel at any time in account settings.',severity:'good',confidence:'medium',sourceUrl:scanUrl},
  {kind:'refund',title:'Повернення коштів',summary:'Є 14-денне вікно повернення',evidence:'You may request a refund within 14 days.',severity:'good',confidence:'high',sourceUrl:scanUrl},
];
const baseReport={id:'report-panel-test',url:scanUrl,host:'shop.example.test',title:'Checkout offer',score:78,prices:['$9.99'],priceDetails:[{amount:9.99,currency:'USD',cadence:'monthly',annualAmount:119.88,firstYearAmount:99.9,introMonths:2}],findings,unknowns:[{kind:'penalty',title:'Штрафи',summary:'Не вдалося знайти згадку про штрафи. Це не підтверджує, що їх немає.',evidence:'',severity:'medium',confidence:'low',sourceUrl:scanUrl,unresolved:true}],wordCount:840,verdict:'Почекати: перевірте умови перед оплатою.',decision:'wait' as const};

async function hydrate(page:Page){
  await page.waitForFunction(()=>{const button=document.querySelector('button.exampleButton');return Boolean(button&&Object.keys(button).some(key=>key.startsWith('__reactProps')))});
}
async function prepare(page:Page,reportHandler:(url:string)=>unknown){
  await page.addInitScript(()=>localStorage.setItem('sift-funnel-consent','granted'));
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==='/api/auth/me')return route.fulfill({json:{user:null}});
    if(path==='/api/history')return route.fulfill({json:{items:[],access:{plan:'free',credits:0,used:0,limit:3}}});
    if(path==='/api/analytics/event')return route.fulfill({json:{ok:true}});
    if(path==='/api/translate')return route.fulfill({json:{translation:'Ваш план автоматично поновлюється щомісяця.'}});
    if(path==='/api/analyze'){
      const body=request.postDataJSON() as {url:string};
      const result=reportHandler(body.url);
      if(result instanceof Response)return route.fulfill({status:result.status,json:await result.json()});
      return route.fulfill({json:result});
    }
    return route.fulfill({json:{}});
  });
  await page.goto('/');
  await hydrate(page);
}
async function submit(page:Page,url:string){
  await page.getByRole('textbox',{name:'Посилання для перевірки'}).fill(url);
  await page.getByRole('button',{name:'Перевірити',exact:true}).click();
}

test('scan button uses a blocked cursor while disabled and a pointer when ready',async({page})=>{
  await prepare(page,()=>baseReport);
  const button=page.getByRole('button',{name:'Перевірити',exact:true});
  await expect(button).toBeDisabled();
  await expect.poll(()=>button.evaluate(element=>getComputedStyle(element).cursor)).toBe('not-allowed');
  await page.getByRole('textbox',{name:'Посилання для перевірки'}).fill(scanUrl);
  await expect(button).toBeEnabled();
  await expect.poll(()=>button.evaluate(element=>getComputedStyle(element).cursor)).toBe('pointer');
});

test('report verdict, evidence, unknowns and Free locks are explicit and responsive',async({page})=>{
  const decisions:{value:'buy'|'wait'|'close';label:string}[]=[
    {value:'buy',label:'Купувати'},
    {value:'wait',label:'Почекати'},
    {value:'close',label:'Закрити вкладку'},
  ];
  await prepare(page,url=>({...baseReport,decision:url.endsWith('/buy')?'buy':url.endsWith('/close')?'close':'wait',verdict:`Рішення для ${url}.`,findings:baseReport.findings.slice(0,2).map(finding=>({...finding,evidence:'Повний доказ доступний у One Sift або Pro'})),lockedCount:3,access:{plan:'free',credits:0,used:1,limit:3}}));

  for(const decision of decisions){
    await submit(page,`${scanUrl}/${decision.value}`);
    const verdict=page.locator(`.verdict.${decision.value}`);
    await expect(verdict).toBeVisible();
    await expect(verdict.locator('.decisionTag')).toHaveText(decision.label);
    await expect(page.getByText('Score — повнота даних, не чесність компанії.')).toBeVisible();
    await expect(page.getByText('Невідомо',{exact:true})).toBeVisible();
    await expect(page.getByText('Цитату приховано у Free').first()).toBeVisible();
    await expect(page.locator('.priceDetailsGrid')).toContainText('за місяць');
    await expect(page.locator('.priceDetailsGrid')).toContainText(/Еквівалент за 12 місяців за цією ставкою:.*119,88/);
    await expect(page.locator('.priceDetailsGrid')).toContainText(/Перші 12 місяців з урахуванням пробного періоду:.*99,90/);
    await expect(page.getByRole('link',{name:/Джерело: shop\.example\.test/}).first()).toHaveAttribute('href',scanUrl);
    await expect(page.getByText('Висока впевненість').first()).toBeVisible();
    await expect(page.getByRole('button',{name:'Відкрити план'}).first()).toBeVisible();
    await expect(page.getByRole('button',{name:/Зберегти у профіль/})).toBeVisible();
    await expect(page.getByRole('button',{name:/Підготувати лист про скасування/})).toBeVisible();
    const scoreRing=page.locator('.clarityRing'),scoreValue=scoreRing.locator('b'),scoreScale=scoreRing.locator('small');
    const ringBounds=await scoreRing.boundingBox(),scoreBounds=await scoreValue.boundingBox(),scaleBounds=await scoreScale.boundingBox();
    expect(ringBounds&&scoreBounds&&scaleBounds).toBeTruthy();
    expect(scoreBounds!.x).toBeGreaterThanOrEqual(ringBounds!.x);
    expect(scaleBounds!.x+scaleBounds!.width).toBeLessThanOrEqual(ringBounds!.x+ringBounds!.width);
    if((page.viewportSize()?.width||0)<=600){
      const lockedReport=page.locator('.lockedReport').last();
      const lockedCopy=await lockedReport.locator('.lockedCover>span').boundingBox(),lockedButton=await lockedReport.locator('.lockedCover button').boundingBox();
      expect(lockedCopy&&lockedButton).toBeTruthy();
      await expect.poll(async()=>{
        const copy=await lockedReport.locator('.lockedCover>span').boundingBox(),button=await lockedReport.locator('.lockedCover button').boundingBox();
        return Boolean(copy&&button&&button.y>=copy.y+copy.height-1);
      }).toBe(true);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  const order=await page.locator('.reportSummary').evaluate(element=>Array.from(element.children).map(item=>item.className));
  expect(order[0]).toContain('clarityScoreCard');
  expect(order[1]).toContain('verdict');
});

test('Pro evidence switches language per finding and retains source attribution',async({page})=>{
  await prepare(page,()=>({...baseReport,access:{plan:'pro',credits:0,used:1,limit:999}}));
  await submit(page,scanUrl);
  await expect(page.getByText('The plan costs $9.99 per month.').first()).toBeVisible();
  const evidenceCard=page.locator('.reportFindings article').filter({hasText:'Ціна'}).first();
  await evidenceCard.getByRole('button',{name:'Українська'}).click();
  await expect(evidenceCard.getByText('Ваш план автоматично поновлюється щомісяця.')).toBeVisible();
  await expect(evidenceCard.getByRole('link',{name:/Джерело: shop\.example\.test/})).toHaveAttribute('href',scanUrl);
});

test('an unavailable or JS-only page shows a neutral explanation and no fabricated report',async({page})=>{
  await prepare(page,()=>new Response(JSON.stringify({error:'Сторінка майже не містить доступного тексту (ймовірно, контент завантажується JavaScript або захистом сайту).'}),{status:422,headers:{'content-type':'application/json'}}));
  await submit(page,scanUrl);
  const status=page.getByRole('status').filter({hasText:'Не вдалося створити звіт'});
  await expect(status).toBeVisible();
  await expect(status).toContainText('Це не звіт і Sift не робить висновків про умови');
  await expect(page.locator('#report')).toHaveCount(0);
  await expect(page.locator('.clarityScoreCard')).toHaveCount(0);
});
