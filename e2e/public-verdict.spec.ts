import {expect,test} from '@playwright/test';

const report={
  id:'share-report-12345678',url:'https://private.example.test/checkout?session=secret',host:'private.example.test',title:'Private Service Subscription',score:72,
  prices:['$19.00'],findings:[{kind:'renewal',title:'Автопродовження',summary:'Перевірте умови',evidence:'Private account-specific evidence.',severity:'medium'}],
  wordCount:180,verdict:'Перевірте умови перед оплатою.',decision:'wait',lockedCount:0,
};

test('dashboard creates a minimal Telegram share card and lets its owner revoke the link',async({page})=>{
  const token='A'.repeat(43),shareUrl=`https://sift-app.reviewradar-vova445.workers.dev/share/${token}`;
  const operations:string[]=[];
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/api/account')return route.fulfill({json:{
      user:{id:'user-1',email:'owner@example.test',emailVerified:true},access:{plan:'free',credits:0,used:1,limit:3},subscription:null,payments:[],
      history:[{id:report.id,createdAt:'2026-10-20T12:00:00.000Z',result:report}],
    }});
    if(url.pathname==='/api/public-verdict'&&request.method()==='GET')return route.fulfill({json:{share:null}});
    if(url.pathname==='/api/public-verdict'&&request.method()==='POST'){
      operations.push('create');
      expect(request.postDataJSON()).toEqual({scanId:report.id});
      return route.fulfill({status:201,json:{share:{url:shareUrl,createdAt:'2026-11-04T12:00:00.000Z',score:72,decision:'wait'}}});
    }
    if(url.pathname==='/api/public-verdict'&&request.method()==='DELETE'){
      operations.push('revoke');
      return route.fulfill({json:{ok:true,revoked:true}});
    }
    if(url.pathname==='/api/savings')return route.fulfill({json:{entries:[],summary:{monthMinor:0,yearMinor:0,entryCount:0,currency:'UAH'}}});
    if(url.pathname==='/api/rewards')return route.fulfill({json:{items:[],currentQuarter:'2026-Q4',quarterlyCreditsUsed:0,quarterlyCreditLimit:3}});
    if(url.pathname==='/api/achievements')return route.fulfill({json:{userId:'user-1',badges:[],analysisCount:1,longestStreak:0,recentStreak:[],confirmedReferrals:0,experiment:{enabled:false,assigned:false,variant:'control',showProgress:true}}});
    if(url.pathname==='/api/referral')return route.fulfill({json:{url:'https://sift.app/?ref=test'}});
    return route.fulfill({json:{ok:true}});
  });

  await page.goto('/dashboard');
  await page.getByRole('button',{name:/Private Service Subscription/}).click();
  await expect(page.getByRole('heading',{name:'Private Service Subscription'})).toBeVisible();
  await expect(page.getByText(/Назва сервісу, URL, ціни, докази та дані акаунта не публікуються/)).toBeVisible();
  await page.getByRole('button',{name:/Поділитися оцінкою/}).click();
  await expect(page.locator('#public-share-panel')).toBeVisible();
  await page.getByRole('button',{name:'Створити картку'}).click();
  const link=page.getByRole('textbox',{name:'Посилання на публічну картку'});
  await expect(link).toHaveValue(shareUrl);
  const telegram=page.getByRole('link',{name:'Telegram'});
  const telegramUrl=new URL(await telegram.getAttribute('href')||'');
  expect(telegramUrl.hostname).toBe('t.me');
  expect(telegramUrl.searchParams.get('url')).toBe(shareUrl);
  expect(shareUrl).not.toContain(report.id);
  expect(shareUrl).not.toContain('private.example.test');
  await page.getByRole('button',{name:'Відкликати',exact:true}).click();
  await expect(page.getByText('Посилання відкликано. Картка більше не відкривається.')).toBeVisible();
  expect(operations).toEqual(['create','revoke']);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
