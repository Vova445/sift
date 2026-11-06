import {expect,test,type Page,type Route} from '@playwright/test';

const radarSeed={
  configured:true,
  address:'inbox+sample@receipts.sift.app',
  addressEnabled:true,
  items:[
    {id:'radar-1',service_name:'Streamline Plus',amount_minor:1299,currency:'USD',next_charge_date:'2026-12-05',source_count:1},
    {id:'radar-2',service_name:'Cloud Notes',amount_minor:499,currency:'USD',next_charge_date:'2026-12-11',source_count:2},
  ],
  receiptSummary:{},
  remindersEnabled:true,
  reminderConfigured:true,
  rawEmailStorage:'never' as const,
  metadataRetentionDays:7,
};

async function json(route:Route,value:unknown,status=200){await route.fulfill({status,contentType:'application/json; charset=utf-8',body:JSON.stringify(value)})}

async function setup(page:Page,{emailVerified=true,routing=true}:{emailVerified?:boolean;routing?:boolean}={}){
  let consent={enabled:false,agreedAt:null as string|null,updatedAt:null as string|null,contributionCount:2};
  let radar={...radarSeed,configured:routing,address:routing?radarSeed.address:null,items:routing?radarSeed.items:[]};
  await page.route('**/api/**',async(route:Route)=>{
    const url=new URL(route.request().url()),method=route.request().method();
    if(url.pathname==='/api/account')return json(route,{user:{id:'radar-user',email:'radar@example.test',emailVerified},access:{plan:'pro',credits:0,used:1,limit:999},subscription:null,payments:[],history:[]});
    if(url.pathname==='/api/domain-index/consent'){
      if(method==='GET')return json(route,consent);
      const body=route.request().postDataJSON() as {enabled?:boolean;action?:string};
      if(body.action==='delete_contributions')consent={...consent,contributionCount:0,updatedAt:new Date().toISOString()};
      else if(body.enabled===true)consent={...consent,enabled:true,agreedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      else consent={...consent,enabled:false,contributionCount:0,updatedAt:new Date().toISOString()};
      return json(route,consent);
    }
    if(url.pathname==='/api/subscription-radar'){
      if(method==='GET')return json(route,radar);
      if(method==='POST'){
        const body=route.request().postDataJSON() as {action?:string;enabled?:boolean};
        if(body.action==='rotate')radar={...radar,address:'inbox+rotated@receipts.sift.app'};
        if(body.action==='set_reminders')radar={...radar,remindersEnabled:Boolean(body.enabled)};
        return json(route,radar);
      }
      if(method==='DELETE'){
        const body=route.request().postDataJSON() as {itemId?:string;action?:string};
        if(body.itemId)radar={...radar,items:radar.items.filter(item=>item.id!==body.itemId)};
        if(body.action==='purge_data')radar={...radar,items:[]};
        if(body.action==='disable')radar={...radar,address:null,addressEnabled:false};
        return json(route,radar);
      }
    }
    if(url.pathname==='/api/watchlist')return json(route,{items:[]});
    if(url.pathname==='/api/tos-monitoring')return json(route,{configured:true,activeCount:0,items:[]});
    if(url.pathname==='/api/savings')return json(route,{entries:[],summary:{monthMinor:0,yearMinor:0,entryCount:0,currency:'UAH'}});
    if(url.pathname==='/api/achievements')return json(route,{userId:'radar-user',badges:[],analysisCount:0,longestStreak:0,recentStreak:[],confirmedReferrals:0,experiment:{enabled:false,assigned:false,variant:'control',showProgress:false}});
    return json(route,{});
  });
}

test('Radar records and domain-index contributions have clear, confirmed controls',async({page})=>{
  await setup(page);
  await page.goto('/dashboard');

  const consentSwitch=page.getByRole('switch',{name:'Внесок до публічного індексу доменів'});
  await expect(consentSwitch).toHaveAttribute('aria-checked','false');
  await expect(page.getByText('Що передається')).toBeVisible();
  await expect(page.getByText('Що не передається')).toBeVisible();
  await consentSwitch.click();
  await expect(consentSwitch).toHaveAttribute('aria-checked','true');

  await page.getByRole('button',{name:'Видалити внески'}).click();
  const deleteDialog=page.getByRole('dialog',{name:'Видалити ваші внески?'});
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button',{name:'Видалити внески'}).click();
  await expect(page.getByText(/Видалено внесків: 0/)).toBeVisible();
  await expect(consentSwitch).toHaveAttribute('aria-checked','true','delete-only keeps participation enabled');

  await page.getByRole('button',{name:'Відкликати участь'}).click();
  const revokeDialog=page.getByRole('dialog',{name:'Відкликати участь в індексі?'});
  await expect(revokeDialog).toBeVisible();
  await revokeDialog.getByRole('button',{name:'Відкликати й видалити'}).click();
  await expect(consentSwitch).toHaveAttribute('aria-checked','false');

  await expect(page.getByText('Email Routing не налаштовано')).toHaveCount(0);
  await expect(page.getByText('inbox+sample@receipts.sift.app')).toBeVisible();
  await page.getByRole('button',{name:'Змінити',exact:true}).click();
  const rotateDialog=page.getByRole('dialog',{name:'Змінити адресу пересилання?'});
  await rotateDialog.getByRole('button',{name:'Створити нову адресу'}).click();
  await expect(page.getByText('inbox+rotated@receipts.sift.app')).toBeVisible();
  const reminder=page.getByRole('switch',{name:'Нагадати за 3 дні та інші email-нагадування Sift'});
  await expect(reminder).toHaveAttribute('aria-checked','true');
  await reminder.click();
  await expect(reminder).toHaveAttribute('aria-checked','false');
  await page.getByRole('button',{name:'Видалити Streamline Plus'}).click();
  const itemDialog=page.getByRole('dialog',{name:'Видалити «Streamline Plus»?'});
  await expect(itemDialog).toBeVisible();
  await itemDialog.getByRole('button',{name:'Видалити запис'}).click();
  await expect(page.getByText('Streamline Plus')).toHaveCount(0);

  await page.getByRole('button',{name:'Видалити всі',exact:true}).click();
  const purgeDialog=page.getByRole('dialog',{name:'Видалити всі імпортовані дані?'});
  await expect(purgeDialog).toBeVisible();
  await purgeDialog.getByRole('button',{name:'Видалити всі дані'}).click();
  await expect(page.getByText('Календар поки порожній')).toBeVisible();
  await page.getByRole('button',{name:'Вимкнути'}).click();
  const disableDialog=page.getByRole('dialog',{name:'Вимкнути адресу пересилання?'});
  await disableDialog.getByRole('button',{name:'Вимкнути адресу'}).click();
  await expect(page.getByRole('button',{name:'Створити адресу'})).toBeVisible();
});

test('unverified account cannot opt in and missing Email Routing is explicit',async({page})=>{
  await setup(page,{emailVerified:false,routing:false});
  await page.goto('/dashboard');
  const consentSwitch=page.getByRole('switch',{name:'Внесок до публічного індексу доменів'});
  await expect(consentSwitch).toHaveAttribute('aria-checked','false');
  await expect(consentSwitch).toBeDisabled();
  await expect(page.getByText('Участь поки заблокована')).toBeVisible();
  await expect(page.getByText('Email Routing не налаштовано')).toBeVisible();
  await expect(page.getByRole('button',{name:'Створити адресу'})).toBeDisabled();
});
