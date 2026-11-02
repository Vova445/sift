import test from 'node:test';
import assert from 'node:assert/strict';
import { TURNSTILE_VERIFY_URL, verifyTurnstileToken } from '../lib/turnstile-policy.js';

const token='test-turnstile-token';
const accepted=(overrides={})=>Response.json({success:true,action:'signup',hostname:'localhost',...overrides});

test('Turnstile requires a configured secret and a non-empty bounded token', async () => {
  assert.deepEqual(await verifyTurnstileToken({secret:'',token,expectedAction:'signup',expectedHostname:'localhost'}),{ok:false,kind:'unconfigured'});
  assert.deepEqual(await verifyTurnstileToken({secret:'secret',token:'',expectedAction:'signup',expectedHostname:'localhost'}),{ok:false,kind:'invalid'});
  assert.deepEqual(await verifyTurnstileToken({secret:'secret',token:'x'.repeat(2049),expectedAction:'signup',expectedHostname:'localhost'}),{ok:false,kind:'invalid'});
});

test('valid token is checked server-side for endpoint, action and hostname', async () => {
  let called=0;
  const result=await verifyTurnstileToken({secret:'server-secret',token,expectedAction:'signup',expectedHostname:'localhost',remoteIp:'127.0.0.1',fetchImpl:async(url,init)=>{
    called+=1;assert.equal(url,TURNSTILE_VERIFY_URL);assert.equal(init.method,'POST');
    const body=new URLSearchParams(init.body);assert.equal(body.get('secret'),'server-secret');assert.equal(body.get('response'),token);assert.equal(body.get('remoteip'),'127.0.0.1');assert.ok(body.get('idempotency_key'));
    return accepted();
  }});
  assert.deepEqual(result,{ok:true,kind:'valid'});assert.equal(called,1);
});

test('invalid, replayed, wrong-action and wrong-host tokens are rejected', async () => {
  for(const response of [Response.json({success:false,'error-codes':['timeout-or-duplicate']}),accepted({action:'password_reset'}),accepted({hostname:'attacker.example'})]){
    const result=await verifyTurnstileToken({secret:'secret',token,expectedAction:'signup',expectedHostname:'localhost',fetchImpl:async()=>response});
    assert.deepEqual(result,{ok:false,kind:'invalid'});
  }
});

test('Siteverify network failures fail closed as unavailable', async () => {
  const result=await verifyTurnstileToken({secret:'secret',token,expectedAction:'signup',expectedHostname:'localhost',fetchImpl:async()=>{throw new Error('network down')}});
  assert.deepEqual(result,{ok:false,kind:'unavailable'});
});
