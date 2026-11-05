import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMAIN_INDEX_MIN_ACCOUNTS,normalizeDomain,summarizeDomainObservations,validateDomainCorrection} from '../lib/domain-index-policy.js';

test('normalizes public hostnames and removes only the www prefix',()=>{
  assert.equal(normalizeDomain('https://WWW.Example.COM:443/terms?account=private#part'),'example.com');
  assert.equal(normalizeDomain('shop.example.co.uk'),'shop.example.co.uk');
  assert.equal(normalizeDomain('https://münich.example/terms'),'xn--mnich-kva.example');
});

test('rejects non-web schemes, credentials, IP addresses, local hosts, and malformed domains',()=>{
  for(const value of ['javascript:alert(1)','ftp://example.com','https://user:pass@example.com','http://127.0.0.1','http://[::1]','localhost','billing.local','a','https://-bad.example','https://example.123'])assert.equal(normalizeDomain(value),null,value);
});

function row(score,indicators,lastSeen='2026-11-04T10:00:00.000Z'){return{clarity_score:score,indicators_json:JSON.stringify(indicators),last_seen_at:lastSeen}}

test('keeps profiles private until there are five recent independent-account observations',()=>{
  assert.equal(DOMAIN_INDEX_MIN_ACCOUNTS,5);
  assert.equal(summarizeDomainObservations(Array.from({length:4},(_,index)=>row(80,{price:index===0})),new Date('2026-11-04T12:00:00Z')),null);
  assert.ok(summarizeDomainObservations(Array.from({length:5},()=>row(80,{})),new Date('2026-11-04T12:00:00Z')));
});

test('summarizes account-weighted clarity and condition signals without exposing row identities',()=>{
  const summary=summarizeDomainObservations([
    row(60,{price:true,renewal:true}),row(70,{price:true}),row(80,{price:true,cancellation:true}),row(90,{price:false}),row(100,{price:true,refund:true}),
  ],new Date('2026-11-04T12:00:00Z'));
  assert.equal(summary.clarityScore,80);
  assert.equal(summary.sampleCount,5);
  assert.equal(summary.confidence,'limited');
  assert.equal(summary.indicators.find(item=>item.key==='price').accountCount,4);
  assert.equal(summary.indicators.find(item=>item.key==='price').sharePercent,80);
  assert.equal(Object.hasOwn(summary,'email'),false);
});

test('uses only observations from the last year and rejects timestamps far in the future',()=>{
  const summary=summarizeDomainObservations([
    row(99,{},'2024-01-01T00:00:00.000Z'),row(99,{},'2027-01-01T00:00:00.000Z'),
    ...Array.from({length:4},(_,index)=>row(50+index,{},'2026-11-03T00:00:00.000Z')),
  ],new Date('2026-11-04T12:00:00Z'));
  assert.equal(summary,null);
});

test('requires a reasonable confidence threshold as independent sample size grows',()=>{
  const now=new Date('2026-11-04T12:00:00Z');
  assert.equal(summarizeDomainObservations(Array.from({length:9},()=>row(70,{})),now).confidence,'limited');
  assert.equal(summarizeDomainObservations(Array.from({length:10},()=>row(70,{})),now).confidence,'moderate');
  assert.equal(summarizeDomainObservations(Array.from({length:30},()=>row(70,{})),now).confidence,'higher');
});

test('validates correction submissions and rejects unsafe evidence links',()=>{
  const valid=validateDomainCorrection({domain:'www.example.com',contactName:'Site owner',contactEmail:'owner@example.com',organization:'Example Inc.',message:'The latest terms now describe an annual renewal and current cancellation path.',evidenceUrl:'https://example.com/terms',ownerAttests:true});
  assert.equal(valid.ok,true);
  assert.equal(valid.value.domain,'example.com');
  assert.equal(validateDomainCorrection({...valid.value,evidenceUrl:'javascript:alert(1)'}).ok,false);
  assert.equal(validateDomainCorrection({...valid.value,domain:'localhost'}).ok,false);
  assert.equal(validateDomainCorrection({...valid.value,message:'Too short'}).ok,false);
  assert.equal(validateDomainCorrection({...valid.value,ownerAttests:false}).ok,false);
});

test('normalizes control characters and caps submitted text',()=>{
  const result=validateDomainCorrection({domain:'example.com',contactName:'  Owner  ',contactEmail:' OWNER@Example.com ',organization:'Example',message:`A specific correction request should be understandable.\u0000${'x'.repeat(4000)}`,evidenceUrl:'',ownerAttests:true});
  assert.equal(result.ok,true);
  assert.equal(result.value.contactEmail,'owner@example.com');
  assert.equal(result.value.message.length,3000);
  assert.equal(result.value.message.includes('\u0000'),false);
});
