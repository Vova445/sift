import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalAppUrl,checkoutDescriptor,merchantDomainMatches,sameOriginBillingRequest} from '../lib/billing-security.js';

test('canonical payment origins reject untrusted or ambiguous URLs',()=>{
  const prod=canonicalAppUrl('https://sift.example');
  assert.equal(prod.origin,'https://sift.example');
  assert.equal(canonicalAppUrl('http://sift.example/',true),null);
  assert.equal(canonicalAppUrl('http://127.0.0.1:8787/',true).origin,'http://127.0.0.1:8787');
  assert.equal(canonicalAppUrl('http://127.0.0.1:8787/',false),null);
  assert.equal(canonicalAppUrl('https://sift.example/evil'),null);
  assert.equal(canonicalAppUrl('https://sift.example/?next=https://evil.example'),null);
});

test('mutating billing requests require the exact configured Origin',()=>{
  const app=canonicalAppUrl('https://sift.example/');
  assert.equal(sameOriginBillingRequest(new Request('https://sift.example/api/billing/checkout',{method:'POST',headers:{origin:'https://sift.example'}}),app),true);
  assert.equal(sameOriginBillingRequest(new Request('https://sift.example/api/billing/checkout',{method:'POST',headers:{origin:'https://evil.example'}}),app),false);
  assert.equal(sameOriginBillingRequest(new Request('https://sift.example/api/billing/checkout',{method:'POST'}),app),false);
});

test('local sandbox accepts only loopback aliases on the same port',()=>{
  const local=canonicalAppUrl('http://127.0.0.1:8788/',true);
  assert.equal(sameOriginBillingRequest(new Request('http://127.0.0.1:8788/api/space',{headers:{origin:'http://localhost:8788'}}),local),true);
  assert.equal(sameOriginBillingRequest(new Request('http://127.0.0.1:8788/api/space',{headers:{origin:'http://localhost:3000'}}),local),false);
  assert.equal(sameOriginBillingRequest(new Request('http://127.0.0.1:8788/api/space',{headers:{origin:'https://localhost:8788'}}),local),false);
});

test('checkout ignores client user, amount and redirect and uses server prices',()=>{
  const app=canonicalAppUrl('https://sift.example/');
  const descriptor=checkoutDescriptor({plan:'one',userId:'victim',amount:1,returnUrl:'https://evil.example'},'authenticated-user','sift_abc',123,app);
  assert.equal(descriptor.userId,'authenticated-user');
  assert.equal(descriptor.amount,59);
  assert.equal(descriptor.plan,'one');
  assert.equal(descriptor.returnUrl,'https://sift.example/?payment=sift_abc&plan=one#pricing');
  assert.equal(descriptor.serviceUrl,'https://sift.example/api/billing/wayforpay/callback');
  assert.equal(checkoutDescriptor({plan:'pro',userId:'victim',amount:0},'authenticated-user','sift_def',123,app).amount,279);
  assert.equal(checkoutDescriptor({planId:'pro',plan:'admin'},'authenticated-user','sift_x',123,app),null);
});

test('WayForPay merchant domain must match the canonical application host',()=>{
  const app=canonicalAppUrl('https://sift.example/');
  assert.equal(merchantDomainMatches('sift.example',app),true);
  assert.equal(merchantDomainMatches('evil.example',app),false);
  assert.equal(merchantDomainMatches('sift.example/evil',app),false);
});
