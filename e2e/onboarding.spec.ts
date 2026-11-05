import {expect,test,type Page} from '@playwright/test';

const exampleUrl='https://www.apple.com/icloud/';
const sampleReport={
  id:'onboarding-report',url:exampleUrl,host:'www.apple.com',title:'iCloud+ - Apple',score:45,
  prices:['$0.99','$2.99','$9.99'],findings:[{kind:'price',title:'Вартість підписки',summary:'Знайдено кілька тарифів',evidence:'iCloud+ monthly plans.',severity:'medium'}],
  wordCount:240,verdict:'Перевірте умови повернення перед оплатою.',decision:'wait',access:{plan:'free',credits:0,used:1,limit:3},
};

async function waitForClientHydration(page:Page){
  await page.waitForFunction(()=>{
    const button=document.querySelector('button.exampleButton');
    return Boolean(button&&Object.keys(button).some(key=>key.startsWith('__reactProps')));
  },null,{timeout:20_000});
}

test('a new visitor can choose a real example and start the first scan',async({page})=>{
  let submittedUrl='';
  const funnelEvents:string[]=[];
  await page.addInitScript(()=>localStorage.setItem('sift-funnel-consent','granted'));
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==='/api/analytics/event'){
      funnelEvents.push((request.postDataJSON() as {stage:string}).stage);
      return route.fulfill({json:{ok:true}});
    }
    if(path==='/api/auth/me')return route.fulfill({json:{user:null}});
    if(path==='/api/history')return route.fulfill({json:{items:[],access:{plan:'free',credits:0,used:0,limit:3}}});
    if(path==='/api/analyze'&&request.method()==='POST'){
      submittedUrl=(request.postDataJSON() as {url:string}).url;
      return route.fulfill({json:sampleReport});
    }
    return route.fulfill({json:{}});
  });

  await page.goto('/');
  await waitForClientHydration(page);
  await expect(page.getByText(/вхід не потрібен/)).toBeVisible();
  await expect(page.getByText(/Перший звіт зазвичай займає до 30 секунд/)).toBeVisible();
  const example=page.getByRole('button',{name:/iCloud/});
  await expect(example).toBeVisible();
  await example.click();
  const input=page.getByRole('textbox',{name:'Посилання для перевірки'});
  await expect(input).toHaveValue(exampleUrl);
  const scan=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/analyze');
  await input.press('Enter');
  await scan;
  await expect.poll(()=>submittedUrl).toBe(exampleUrl);
  await expect(page.getByRole('heading',{name:'iCloud+ - Apple'})).toBeVisible();
  await expect.poll(()=>funnelEvents).toContain('analyze');
  expect(funnelEvents).toContain('visit');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('invalid URL schemes show a clear inline error before any request',async({page})=>{
  let analyzeRequests=0;
  await page.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{configurable:true,value:'1'}));
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/analyze')analyzeRequests++;
    return route.fulfill({json:path==='/api/history'?{items:[],access:{plan:'free',credits:0,used:0,limit:3}}:{user:null}});
  });
  await page.goto('/');
  await waitForClientHydration(page);
  const input=page.getByRole('textbox',{name:'Посилання для перевірки'});
  await input.fill('javascript:alert(1)');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Посилання має починатися з http:// або https://.');
  expect(analyzeRequests).toBe(0);
});
