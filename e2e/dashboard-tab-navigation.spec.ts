import {expect,test} from '@playwright/test';

test('Dashboard navigation returns to the overview at the top',async({page})=>{
  const account={user:{id:'tab-navigation-user',email:'tab-navigation@example.test',emailVerified:true},access:{plan:'free',credits:0,used:0,limit:3},subscription:null,payments:[],history:[]};
  await page.route('**/api/account?deviceId=*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(account)}));
  await page.goto('/dashboard');
  const overview=page.locator('#overview');
  await expect(overview).toBeVisible();
  await page.evaluate(()=>document.querySelector('#history')?.scrollIntoView());
  const dashboardTab=page.locator('.productTabNav').getByRole('link',{name:'Дашборд'});
  if(await dashboardTab.isVisible()){
    await dashboardTab.click();
  }else{
    await page.locator('.productSidebarNav').getByRole('link',{name:'Дашборд'}).click();
  }
  await expect(page).toHaveURL(/#overview$/);
  await expect.poll(async()=>Math.abs((await overview.boundingBox())?.y||0)).toBeLessThan(80);
});
