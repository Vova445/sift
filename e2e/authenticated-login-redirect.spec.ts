import {expect,test} from '@playwright/test';

test('an existing authenticated session skips the account modal and opens Dashboard',async({page})=>{
  const user={id:'already-authenticated',email:'vvvmikhnov@gmail.com',emailVerified:true};
  const account={user,access:{plan:'free',credits:0,used:0,limit:3},subscription:null,payments:[],history:[]};
  await page.route('**/api/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user})}));
  await page.route('**/api/account?deviceId=*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(account)}));
  await page.goto('/?login=1');
  await page.waitForURL(url=>url.pathname==='/dashboard');
  await expect(page.locator('.authModal')).toHaveCount(0);
  await expect(page.locator('.dashHeader')).toBeVisible();
});
