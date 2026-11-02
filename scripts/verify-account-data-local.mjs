import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const baseUrl=process.env.SIFT_LOCAL_URL||'http://127.0.0.1:8788';
const base=new URL(baseUrl);
assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname),'This smoke test is restricted to localhost.');
const email=`account-delete-${randomUUID()}@example.invalid`;
const password=`Smoke-${randomUUID()}-Q7`;
let cookie='',accountId='',orderReference='',deleted=false;
const escapeSql=value=>`'${String(value).replaceAll("'","''")}'`;
function d1(sql){
  const output=execFileSync(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','sift-production','--local','--json','--command',sql],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  return JSON.parse(output.trim());
}
async function request(path,init={}){
  const headers=new Headers(init.headers||{});
  if(cookie)headers.set('cookie',cookie);
  if(init.method==='DELETE')headers.set('origin',base.origin);
  return fetch(new URL(path,base),{...init,headers});
}
async function removeTestAccount(){
  if(!accountId||deleted)return;
  const response=await request('/api/account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({password,confirmation:'ВИДАЛИТИ'})});
  if(response.ok)deleted=true;
}

try{
  const signup=await fetch(new URL('/api/auth/signup',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(signup.status,201,'throwaway account signup should work locally');
  const data=await signup.json();accountId=data.user.id;cookie=(signup.headers.get('set-cookie')||'').split(';',1)[0];
  assert.ok(cookie.startsWith('sift_session='),'signup should issue a session cookie');

  const scanId=randomUUID(),note='Тестова нотатка: перевірити повернення';orderReference=`sift_${randomUUID().replaceAll('-','')}`;
  const report={title:'Test subscription terms',url:'https://example.invalid/terms',score:42,verdict:'Перевірити умови',prices:['$12 / month'],findings:[{title:'Renewal',summary:'Monthly renewal',evidence:'This plan renews monthly.'}]};
  const now=new Date().toISOString();
  const seed=`INSERT INTO scans(id,device_id,url,title,score,result_json,created_at,user_id,translation_plan) VALUES(${escapeSql(scanId)},${escapeSql('smoke-device')},${escapeSql(report.url)},${escapeSql(report.title)},42,${escapeSql(JSON.stringify(report))},${escapeSql(now)},${escapeSql(accountId)},NULL); INSERT INTO watchlist(id,user_id,scan_id,status,note,review_at,created_at,updated_at) VALUES(${escapeSql(randomUUID())},${escapeSql(accountId)},${escapeSql(scanId)},'considering',${escapeSql(note)},'2026-11-12',${escapeSql(now)},${escapeSql(now)}); INSERT INTO payment_orders(order_reference,user_id,plan,amount_uah,currency,status,test_mode,created_at,updated_at,expires_at) VALUES(${escapeSql(orderReference)},${escapeSql(accountId)},'one',59,'UAH','pending',1,${escapeSql(now)},${escapeSql(now)},${escapeSql(new Date(Date.now()+60*60*1000).toISOString())});`;
  d1(seed);

  const jsonResponse=await request('/api/account/export?format=json');
  assert.equal(jsonResponse.status,200,'JSON export endpoint should succeed');
  const json=await jsonResponse.json();
  assert.equal(json.reports.length,1);assert.equal(json.reports[0].findings[0].evidence,report.findings[0].evidence);
  assert.equal(json.planner[0].note,note);
  const csvResponse=await request('/api/account/export?format=csv');
  assert.equal(csvResponse.status,200,'CSV export endpoint should succeed');
  const csv=await csvResponse.text();assert.ok(csv.includes(note));assert.ok(csv.includes(report.findings[0].evidence));

  const wrong=await request('/api/account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({password:'wrong-password',confirmation:'ВИДАЛИТИ'})});
  assert.equal(wrong.status,401,'wrong password must not delete the account');
  const wrongConfirmation=await request('/api/account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({password,confirmation:'DELETE'})});
  assert.equal(wrongConfirmation.status,400,'the explicit confirmation phrase must be required');
  const pending=await request('/api/account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({password,confirmation:'ВИДАЛИТИ'})});
  assert.equal(pending.status,409,'an active checkout must not be silently removed');
  d1(`UPDATE payment_orders SET status='expired',expires_at=${escapeSql(new Date(Date.now()-1000).toISOString())} WHERE order_reference=${escapeSql(orderReference)};`);
  const response=await request('/api/account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({password,confirmation:'ВИДАЛИТИ'})});
  assert.equal(response.status,200,'confirmed local deletion should succeed');deleted=true;
  const me=await request('/api/auth/me');assert.equal((await me.json()).user,null,'all sessions should be revoked');
  const refHash=createHash('sha256').update(orderReference).digest('hex');
  const counts=d1(`SELECT (SELECT COUNT(*) FROM users WHERE id=${escapeSql(accountId)}) AS users,(SELECT COUNT(*) FROM scans WHERE user_id=${escapeSql(accountId)}) AS scans,(SELECT COUNT(*) FROM watchlist WHERE user_id=${escapeSql(accountId)}) AS notes,(SELECT COUNT(*) FROM subscriptions WHERE user_id=${escapeSql(accountId)}) AS subscriptions,(SELECT COUNT(*) FROM payment_orders WHERE user_id=${escapeSql(accountId)}) AS orders,(SELECT COUNT(*) FROM deleted_billing_refs WHERE reference_hash=${escapeSql(refHash)}) AS callback_tombstone;`)[0].results[0];
  assert.deepEqual(counts,{users:0,scans:0,notes:0,subscriptions:0,orders:0,callback_tombstone:1});
  d1(`DELETE FROM deleted_billing_refs WHERE reference_hash=${escapeSql(refHash)};`);
  console.log('PASS: JSON/CSV include report evidence and Planner notes; invalid confirmation/password and pending checkout were rejected; confirmed deletion revoked sessions, removed D1 account data, and retained only the one-way late-callback tombstone.');
}finally{if(!deleted){if(accountId&&orderReference){try{d1(`UPDATE payment_orders SET status='expired',expires_at=${escapeSql(new Date(Date.now()-1000).toISOString())} WHERE order_reference=${escapeSql(orderReference)};`)}catch{}}await removeTestAccount().catch(()=>{})}}
