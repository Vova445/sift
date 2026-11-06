import {expect,test,type Page,type Route} from '@playwright/test';

type ApiKey={id:string;label:string;key_prefix:string;created_at:string;last_used_at:string|null;revoked_at:string|null};
const now='2026-11-05T12:00:00.000Z';
const secret=`sift_sk_${'a'.repeat(64)}`;
async function json(route:Route,value:unknown,status=200){await route.fulfill({status,contentType:'application/json; charset=utf-8',body:JSON.stringify(value)})}

async function setup(page:Page,{plan='pro',guest=false}:{plan?:'free'|'one'|'pro';guest?:boolean}={}){
  let currentPlan=plan,isGuest=guest,linkCreated=false,linked=false;
  const keys:ApiKey[]=[];
  await page.route('**/api/developer/keys',async(route)=>{
    const method=route.request().method();
    if(isGuest)return json(route,{error:'Увійдіть у Sift.'},401);
    if(method==='GET')return json(route,{user:{email:'integrations@example.test'},plan:currentPlan,keys:[...keys]});
    if(method==='POST'){
      const body=route.request().postDataJSON() as {label:string};
      const key:ApiKey={id:'123e4567-e89b-42d3-a456-426614174000',label:body.label,key_prefix:secret.slice(0,16),created_at:now,last_used_at:null,revoked_at:null};
      keys.unshift(key);
      return json(route,{key:{id:key.id,label:key.label,prefix:key.key_prefix,createdAt:key.created_at},secret},201);
    }
    if(method==='DELETE'){
      const body=route.request().postDataJSON() as {id:string};
      const key=keys.find(item=>item.id===body.id);if(key)key.revoked_at=now;
      return json(route,{ok:true});
    }
    return json(route,{});
  });
  await page.route('**/api/telegram/link',async(route)=>{
    const method=route.request().method();
    if(isGuest)return json(route,{error:'Увійдіть у Sift.'},401);
    if(method==='GET'){
      if(linkCreated)linked=true;
      return json(route,{plan:currentPlan,bot:{configured:true,username:'sift_integration_bot',startUrl:'https://t.me/sift_integration_bot'},telegram:{linked,username:linked?'test_owner':null,firstName:linked?'Test':null,linkedAt:linked?now:null,lastUsedAt:null,authorizedGroups:linked?1:0}});
    }
    if(method==='POST'){
      linkCreated=true;
      return json(route,{code:'a'.repeat(48),createdAt:now,expiresAt:new Date(Date.now()+600_000).toISOString(),startUrl:'https://t.me/sift_integration_bot?start='+('a'.repeat(48)),username:'sift_integration_bot'});
    }
    if(method==='DELETE'){linked=false;linkCreated=false;return json(route,{ok:true})}
    return json(route,{});
  });
  return {setGuest(value:boolean){isGuest=value},setPlan(value:'free'|'one'|'pro'){currentPlan=value}};
}

test('guest is gated and Free sees a clear Pro upgrade path',async({page})=>{
  const session=await setup(page,{guest:true});
  await page.goto('/dashboard/integrations');
  await expect(page.locator('.accessGateRoot')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Підключіть Sift до Telegram і API.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Увійти до Sift'})).toHaveAttribute('href','/?login=1&next=%2Fdashboard%2Fintegrations');
  session.setGuest(false);session.setPlan('free');
  await page.reload();
  await expect(page.getByText('FREE',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:/Перейти на Pro/})).toBeVisible();
  await expect(page.getByRole('link',{name:/Переглянути тариф/})).toBeVisible();
  await expect(page.getByRole('button',{name:'Створити API-ключ'})).toBeDisabled();
});

test('API key is shown once and can be revoked',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('sift-funnel-consent','denied'));
  await setup(page);
  await page.goto('/dashboard/integrations');
  await page.getByLabel('Назва ключа').fill('CI backend');
  await page.getByRole('button',{name:'Створити API-ключ'}).click();
  const secretDialog=page.getByRole('dialog',{name:'Новий API-ключ створено'});
  await expect(secretDialog).toBeVisible();
  await expect(secretDialog.getByText(secret,{exact:true})).toBeVisible();
  await expect(secretDialog.getByRole('alert')).toContainText('відновити секрет неможливо');
  await secretDialog.getByRole('button',{name:'Готово, я зберіг ключ'}).click();
  await expect(secretDialog).toBeHidden();
  await expect(page.getByText(secret,{exact:true})).toHaveCount(0);
  if((page.viewportSize()?.width??1440)<=680){
    await expect(page.locator('.apiKeyTable tbody tr')).toHaveCount(1);
    await expect(page.locator('.apiKeyTable time')).toBeVisible();
    await expect(page.getByText('Ще не використовувався')).toBeVisible();
  }else{
    await expect(page.getByRole('columnheader',{name:'Створено'})).toBeVisible();
    await expect(page.getByRole('columnheader',{name:'Остання активність'})).toBeVisible();
    await expect(page.getByRole('cell').nth(1)).toContainText(/лист/);
  }
  await page.getByRole('button',{name:'Відкликати ключ CI backend'}).click();
  const revoke=page.getByRole('dialog',{name:'Відкликати API-ключ?'});
  await revoke.getByRole('button',{name:'Відкликати ключ'}).click();
  await expect(page.getByText('Відкликано',{exact:true})).toBeVisible();
  await expect(page.getByText(secret,{exact:true})).toHaveCount(0);
});

test('Telegram link code has a live countdown and updates to connected status',async({page})=>{
  await setup(page);
  await page.goto('/dashboard/integrations');
  await expect(page.getByRole('heading',{name:'Зв’яжіть Sift зі своїми інструментами.'})).toBeVisible();
  await page.getByRole('button',{name:'Підключити Telegram'}).click();
  await expect(page.getByText('a'.repeat(48),{exact:true})).toBeVisible();
  await expect(page.getByText(/^КОД ДІЄ ЩЕ 09:[0-9]{2}$/)).toBeVisible();
  await expect(page.getByRole('link',{name:'Відкрити бота'})).toHaveAttribute('href',/t\.me\/sift_integration_bot\?start=/);
  await expect(page.getByText(/Telegram підключено/)).toBeVisible({timeout:6000});
  await expect(page.getByText('a'.repeat(48),{exact:true})).toHaveCount(0);
  await expect(page.getByText(/група — до 10 людей/i)).toBeVisible();
  await expect(page.getByText('/allowgroup',{exact:true})).toBeVisible();
  await expect(page.getByText('/disablegroup',{exact:true})).toBeVisible();
  await expect(page.getByText('/unlink',{exact:true})).toBeVisible();
});
