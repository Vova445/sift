import {expect,test,type Page} from '@playwright/test';

async function waitForClientHydration(page:Page){
  await page.waitForFunction(()=>{
    const button=document.querySelector('button.exampleButton');
    return Boolean(button&&Object.keys(button).some(key=>key.startsWith('__reactProps')));
  },null,{timeout:20_000});
}

test('checkout prompt is local-only, strips URL secrets, and ignores form values',async({page})=>{
  await page.route('https://secure.wayforpay.com/**',route=>route.fulfill({
    contentType:'text/html; charset=utf-8',
    body:'<!doctype html><html lang="uk"><head><title>Secure payment</title></head><body><form><label>Email<input type="email" value="buyer.private@example.test"></label><label>Card number<input value="4111111111111111"></label><input type="password" value="never-share-this"></form></body></html>',
  }));
  await page.goto('https://secure.wayforpay.com/pay?email=buyer.private%40example.test&session=do-not-share#card-token');
  await page.addScriptTag({path:'extension/checkout-detector.js'});
  await page.addScriptTag({path:'extension/content.js'});

  const root=page.locator('#sift-checkout-detector-root');
  await expect(root).toBeAttached();
  const link=root.locator('a');
  const href=await link.getAttribute('href');
  expect(href).toContain('https://sift-app.sift-vova445.workers.dev/');
  expect(href).not.toMatch(/buyer\.private|do-not-share|card-token|4111111111111111|never-share-this/);
  await expect(link).toHaveAttribute('rel',/noreferrer/);
  await expect(link).toHaveAttribute('referrerpolicy','no-referrer');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);

  await root.locator('button').click();
  await expect(root).toHaveCount(0);
  await page.evaluate(()=>{history.pushState({},'','/account/profile');document.title='My account'});
  await page.waitForTimeout(1300);
  await expect(root).toHaveCount(0);
  await page.evaluate(()=>{history.pushState({},'','/checkout/review?order=123456789');document.title='Order review'});
  await expect(root).toBeAttached({timeout:4_000});
});

test('injects the prompt across ten checkout-page fixtures',async({page})=>{
  const fixtures=[
    ['/c/pay/session','Checkout - Stripe'],
    ['/checkoutnow','PayPal'],
    ['/checkouts/cn/session','Shopify checkout'],
    ['/gp/buy/spc/handlers/display.html','Amazon Checkout'],
    ['/cart','Your cart'],
    ['/shop/bag','Your bag'],
    ['/checkout-external','Complete your order'],
    ['/pay','Secure payment'],
    ['/book/stays/12345678','Confirm and pay'],
    ['/checkout/review','Review your purchase'],
  ];
  await page.goto('/');
  await page.addScriptTag({path:'extension/checkout-detector.js'});
  await page.addScriptTag({path:'extension/content.js'});
  const root=page.locator('#sift-checkout-detector-root');
  for(const[path,title]of fixtures){
    await page.evaluate(()=>{history.pushState({},'','/account/profile');document.title='My account'});
    await expect(root).toHaveCount(0);
    await page.evaluate(({path,title})=>{history.pushState({},'',path);document.title=title},{path,title});
    await expect(root).toBeAttached({timeout:4_000});
    expect(await root.locator('a').getAttribute('href')).toContain('sift-scan=');
  }
});

test('Sift pre-fills from an extension fragment and waits for explicit scan confirmation',async({page})=>{
  const rawUrl='https://www.paypal.com/checkoutnow?email=buyer%40example.test&token=private-session#payment';
  const expectedUrl='https://www.paypal.com/checkoutnow';
  const documentRequests:string[]=[];
  const analyzeRequests:Array<{url:string;requestUrl:string}> = [];
  const report={id:'extension-handoff-report',url:expectedUrl,host:'www.paypal.com',title:'PayPal Checkout',score:20,prices:[],findings:[],wordCount:120,verdict:'Перевірте умови перед оплатою.',decision:'wait',lockedCount:0};
  await page.addInitScript(()=>localStorage.setItem('sift-funnel-consent','granted'));
  page.on('request',request=>{if(request.isNavigationRequest())documentRequests.push(request.url())});
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==='/api/auth/me')return route.fulfill({json:{user:null}});
    if(path==='/api/history')return route.fulfill({json:{items:[],access:{plan:'free',credits:0,used:0,limit:3}}});
    if(path==='/api/analyze'){
      const body=request.postDataJSON() as {url:string};
      analyzeRequests.push({url:body.url,requestUrl:request.url()});
      return route.fulfill({json:report});
    }
    return route.fulfill({json:{ok:true}});
  });

  const fragment=new URLSearchParams({'sift-scan':rawUrl}).toString();
  await page.goto(`/#${fragment}`);
  await waitForClientHydration(page);
  const input=page.getByRole('textbox',{name:'Посилання для перевірки'});
  await expect(input).toHaveValue(expectedUrl);
  await expect(page.getByRole('status')).toContainText(/Посилання підставлено/);
  expect(analyzeRequests).toHaveLength(0);
  expect(documentRequests.some(url=>/buyer|private-session|card-token/.test(url))).toBe(false);

  const analyzeWait=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/analyze');
  await page.getByRole('button',{name:'Перевірити',exact:true}).click();
  await analyzeWait;
  await expect.poll(()=>analyzeRequests).toHaveLength(1);
  expect(analyzeRequests[0].url).toBe(expectedUrl);
  expect(analyzeRequests[0].requestUrl).not.toMatch(/buyer|private-session|card-token/);
  await expect(page.getByRole('heading',{name:'PayPal Checkout'})).toBeVisible();
});

test('toolbar popup requests and registers access for only the current host',async({page})=>{
  await page.setContent('<main><b id="site-title"></b><span id="site-status"></span><button id="enable-site" type="button" disabled>Enable</button><p id="feedback"></p></main>');
  await page.evaluate(()=>{
    const state={permissions:[] as string[],registered:[] as unknown[],injections:[] as unknown[]};
    (window as Window&{__extensionState:typeof state}).__extensionState=state;
    (window as Window&{chrome:unknown}).chrome={
      runtime:{lastError:null},
      tabs:{query:(_query:unknown,callback:(tabs:unknown[])=>void)=>callback([{id:7,url:'https://secure.wayforpay.com/pay?token=private'}])},
      permissions:{contains:(_request:unknown,callback:(granted:boolean)=>void)=>callback(false),request:(request:{origins:string[]},callback:(granted:boolean)=>void)=>{state.permissions.push(...request.origins);callback(true)}},
      scripting:{
        getRegisteredContentScripts:(_filter:unknown,callback:(scripts:unknown[])=>void)=>callback([]),
        registerContentScripts:(scripts:unknown[],callback:()=>void)=>{state.registered.push(...scripts);callback()},
        executeScript:(details:unknown,callback:()=>void)=>{state.injections.push(details);callback()},
      },
    };
  });
  await page.addScriptTag({path:'extension/popup.js'});
  const button=page.locator('#enable-site');
  await expect(page.locator('#site-title')).toHaveText('secure.wayforpay.com');
  await button.click();
  await expect(page.locator('#feedback')).toHaveText('На checkout-сторінці з’явиться підказка Sift.');
  const state=await page.evaluate(()=>(window as Window&{__extensionState:{permissions:string[];registered:Array<{matches:string[];persistAcrossSessions:boolean}>;injections:Array<{target:{tabId:number};files:string[]}>}}).__extensionState);
  expect(state.permissions).toEqual(['https://secure.wayforpay.com/*']);
  expect(state.registered[0].matches).toEqual(['https://secure.wayforpay.com/*']);
  expect(state.registered[0].persistAcrossSessions).toBe(true);
  expect(state.injections[0].target.tabId).toBe(7);
  expect(state.injections[0].files).toEqual(['checkout-detector.js','content.js']);
});
