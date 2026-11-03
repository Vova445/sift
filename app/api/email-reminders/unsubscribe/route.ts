import {unsubscribeEmailReminders} from '../../../../lib/email-reminders';

const html=(ok:boolean)=>new Response(`<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok?'Відписку оформлено':'Посилання недійсне'} · Sift</title><body style="margin:0;background:#f2f4f0;color:#11150f;font:16px Arial,sans-serif;min-height:100vh;display:grid;place-items:center"><main style="width:min(520px,calc(100% - 40px));box-sizing:border-box;padding:36px;background:white;border:1px solid #d9dfd5;border-radius:20px"><div style="width:46px;height:46px;display:grid;place-items:center;background:#b7f55f;border-radius:13px;font-weight:bold">S</div><h1 style="font-size:28px;margin:24px 0 10px">${ok?'Ви відписалися':'Не вдалося відписати'}</h1><p style="line-height:1.6;color:#60695f">${ok?'Email-нагадування Sift вимкнено. Ви можете знову ввімкнути їх у налаштуваннях Pro Planner.':'Посилання недійсне. Увійдіть до Sift і змініть налаштування нагадувань у Pro Planner.'}</p><a href="/" style="display:inline-block;margin-top:12px;color:#4a44b6;font-weight:bold">Повернутися на Sift</a></main></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});

export async function GET(req:Request){
  const token=new URL(req.url).searchParams.get('token');
  try{return html(await unsubscribeEmailReminders(token))}catch{return new Response('Тимчасова помилка. Повторіть спробу.',{status:503,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}})}
}

export async function POST(req:Request){
  let token=new URL(req.url).searchParams.get('token');
  try{
    const type=req.headers.get('content-type')||'';
    if(type.includes('application/x-www-form-urlencoded'))token=new URLSearchParams(await req.text()).get('token')||token;
    else if(type.includes('application/json')){const body=await req.json() as {token?:unknown};if(typeof body.token==='string')token=body.token}
    return html(await unsubscribeEmailReminders(token));
  }catch{return new Response('Тимчасова помилка. Повторіть спробу.',{status:503,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}})}
}
