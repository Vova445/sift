import {expect,test,type Page} from '@playwright/test';

async function mockTurnstile(page:Page){
  await page.addInitScript(()=>{
    Object.defineProperty(window,'turnstile',{configurable:true,value:{
      render:(_container:unknown,options:{callback:(token:string)=>void})=>{
        window.setTimeout(()=>options.callback('e2e-turnstile-token'),0);
        return 'e2e-widget';
      },
      remove:()=>undefined,
    }});
  });
  await page.route('**/api/security/turnstile',route=>route.fulfill({json:{siteKey:'e2e-site-key'}}));
}

async function expectCenteredCard(page:Page){
  const card=page.locator('.recoveryCard');
  await expect(card).toBeVisible();
  const dimensions=await page.evaluate(()=>{
    const card=document.querySelector('.recoveryCard')!.getBoundingClientRect();
    return{
      width:card.width,
      centerY:card.top+card.height/2,
      viewportHeight:window.innerHeight,
      horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth,
    };
  });
  expect(dimensions.width).toBeLessThanOrEqual(480);
  expect(dimensions.horizontalOverflow).toBe(false);
  if((page.viewportSize()?.height||0)>=760)expect(Math.abs(dimensions.centerY-dimensions.viewportHeight/2)).toBeLessThan(80);
  await expect(page.locator('.productTabNav')).toHaveCount(0);
}

test('forgot password keeps the response neutral and allows a second request',async({page})=>{
  await mockTurnstile(page);
  await page.route('**/api/auth/password/forgot',route=>route.fulfill({json:{ok:true,message:'Якщо акаунт із такою адресою існує, ми надішлемо інструкцію зі скидання пароля.'}}));
  await page.goto('/forgot-password');
  await expectCenteredCard(page);
  await expect(page.getByText('Посилання діє одну годину')).toBeVisible();
  await expect(page.locator('.turnstileStatus')).toContainText('Антибот-перевірку пройдено');
  await page.locator('#reset-email').fill('test@example.com');
  await expect(page.locator('#reset-email')).toHaveValue('test@example.com');
  const submit=page.getByRole('button',{name:'Надіслати посилання'});
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('heading',{name:'Перевірте пошту'})).toBeVisible();
  await expect(page.getByText(/Якщо акаунт із такою адресою існує/)).toBeVisible();
  await page.getByRole('button',{name:/Надіслати запит ще раз/}).click();
  await expect(page.locator('#reset-email')).toHaveValue('test@example.com');
  await expect(submit).toBeVisible();
});

test('reset password gives a clear next step when the token is missing',async({page})=>{
  await page.goto('/reset-password');
  await expectCenteredCard(page);
  await expect(page.getByRole('heading',{name:'Посилання не знайдено'})).toBeVisible();
  await expect(page.getByRole('link',{name:/Запросити нове посилання/})).toHaveAttribute('href','/forgot-password');
});

test('expired reset token reveals the new request action',async({page})=>{
  await mockTurnstile(page);
  await page.route('**/api/auth/password/reset',route=>route.fulfill({
    status:400,
    contentType:'application/json',
    body:JSON.stringify({error:'Посилання недійсне, прострочене або вже використане. Запросіть нове.'}),
  }));
  await page.goto('/reset-password#token=expired-e2e-token');
  await expectCenteredCard(page);
  await page.locator('#new-password').fill('sample-passphrase-123');
  await page.locator('#confirm-password').fill('sample-passphrase-123');
  await expect(page.locator('#password-match')).toContainText('Паролі збігаються');
  const submit=page.getByRole('button',{name:'Змінити пароль'});
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('heading',{name:'Посилання більше не діє'})).toBeVisible();
  await expect(page.getByRole('link',{name:/Запросити нове посилання/})).toHaveAttribute('href','/forgot-password');
});

test('successful password reset confirms other sessions ended and offers sign-in',async({page})=>{
  await mockTurnstile(page);
  await page.route('**/api/auth/password/reset',route=>route.fulfill({
    json:{ok:true,message:'Пароль змінено. Увійдіть з новим паролем; попередні сесії завершено.'},
  }));
  await page.goto('/reset-password#token=valid-e2e-token');
  await expectCenteredCard(page);
  await expect(page.locator('.turnstileStatus')).toContainText('Антибот-перевірку пройдено');
  await page.locator('#new-password').fill('sample-passphrase-123');
  await page.locator('#confirm-password').fill('sample-passphrase-123');
  await page.getByRole('button',{name:'Змінити пароль'}).click();
  await expect(page.getByRole('heading',{name:'Пароль оновлено'})).toBeVisible();
  await expect(page.getByText(/попередні сесії завершено/)).toBeVisible();
  await expect(page.getByRole('link',{name:/Перейти до входу/})).toHaveAttribute('href','/?login=1');
});

test('email confirmation handles missing and expired links with a resend route',async({page})=>{
  await page.goto('/verify-email');
  await expectCenteredCard(page);
  await expect(page.getByRole('heading',{name:'Посилання не діє'})).toBeVisible();
  await expect(page.getByRole('link',{name:/надіслати новий лист/})).toHaveAttribute('href','/?login=1');

  await page.route('**/api/auth/verify-email',route=>route.fulfill({
    status:410,
    contentType:'application/json',
    body:JSON.stringify({error:'Посилання підтвердження прострочене. Увійдіть і надішліть нове.'}),
  }));
  await page.goto('/verify-email#token=expired-e2e-token');
  await page.getByRole('button',{name:/Підтвердити email/}).click();
  await expect(page.getByRole('alert')).toContainText('прострочене');
  await expect(page.getByRole('link',{name:/надіслати новий лист/})).toHaveAttribute('href','/?login=1');
});

test('successful email confirmation offers the next sign-in action',async({page})=>{
  await page.route('**/api/auth/verify-email',route=>route.fulfill({
    json:{verified:true,message:'Email підтверджено. Тепер доступні платні можливості Sift.'},
  }));
  await page.goto('/verify-email#token=valid-e2e-token');
  await expectCenteredCard(page);
  await page.getByRole('button',{name:/Підтвердити email/}).click();
  await expect(page.getByRole('heading',{name:'Email підтверджено'})).toBeVisible();
  await expect(page.getByRole('link',{name:/Перейти до входу/})).toHaveAttribute('href','/?login=1');
});
