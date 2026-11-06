import {expect,test,type Page} from '@playwright/test';

const sampleReport={
  id:'cancellation-kit-e2e',url:'https://www.netflix.com/terms',host:'www.netflix.com',title:'Netflix Terms',score:64,
  prices:['$15.49 per month'],findings:[
    {kind:'renewal',title:'Автоматичне продовження',summary:'Підписка може поновитися автоматично',evidence:'Your subscription will continue until canceled.',severity:'high'},
    {kind:'refund',title:'Умови повернення',summary:'Перевірте правила повернення',evidence:'Refunds are not provided for partial billing periods.',severity:'medium'},
  ],wordCount:1200,verdict:'Перевірте дату наступного списання.',decision:'wait',lockedCount:0,
};

async function waitForClientHydration(page:Page){
  await page.waitForFunction(()=>{
    const button=document.querySelector('button.exampleButton');
    return Boolean(button&&Object.keys(button).some(key=>key.startsWith('__reactProps')));
  },null,{timeout:20_000});
}

test('Cancellation Kit opens from a report, cites report evidence, and fits the viewport',async({page})=>{
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.addInitScript(()=>localStorage.setItem('sift-funnel-consent','granted'));
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==='/api/auth/me')return route.fulfill({json:{user:null}});
    if(path==='/api/history')return route.fulfill({json:{items:[],access:{plan:'free',credits:0,used:0,limit:3}}});
    if(path==='/api/analyze'&&request.method()==='POST')return route.fulfill({json:sampleReport});
    return route.fulfill({json:{ok:true}});
  });

  await page.goto('/');
  await waitForClientHydration(page);
  const input=page.getByRole('textbox',{name:'Посилання для перевірки'});
  await input.fill(sampleReport.url);
  await input.press('Enter');
  await expect(page.getByRole('heading',{name:sampleReport.title})).toBeVisible();
  await page.getByRole('button',{name:/Підготувати лист про скасування/}).click();

  const dialog=page.locator('.cancellationKitDialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog',{name:/Звернення до Netflix/})).toBeVisible();
  await expect(dialog.getByRole('heading',{name:'Як скасувати'})).toBeVisible();
  await expect(dialog.getByRole('link',{name:/Netflix: скасування підписки/})).toHaveAttribute('href','https://help.netflix.com/en/node/407');
  await expect(dialog.locator('blockquote').nth(0)).toContainText('Your subscription will continue until canceled.');
  await expect(dialog.locator('blockquote').nth(1)).toContainText('Refunds are not provided for partial billing periods.');
  await expect(dialog.getByRole('textbox',{name:/Перевірте та відредагуйте/})).toHaveValue(/Your subscription will continue until canceled\./);

  const bounds=await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport=page.viewportSize()!;
  expect(Math.abs(bounds!.x+bounds!.width/2-viewport.width/2)).toBeLessThanOrEqual(2);
  expect(Math.abs(bounds!.y+bounds!.height/2-viewport.height/2)).toBeLessThanOrEqual(2);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);

  await dialog.getByLabel('Мова листа').selectOption('en');
  await expect(dialog.getByRole('heading',{name:'Contact Netflix'})).toBeVisible();
  await expect(dialog.getByRole('link',{name:'Netflix: cancel membership'})).toBeVisible();
  await expect(dialog.getByRole('textbox',{name:'Review and edit before sending'})).toHaveValue(/Please turn off auto-renewal/);
  await dialog.getByRole('button',{name:'Copy letter'}).click();
  await expect(dialog.getByRole('button',{name:'Copied'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('Please turn off auto-renewal');
  const downloadPromise=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Download .txt'}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('sift-cancellation-netflix.txt');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
