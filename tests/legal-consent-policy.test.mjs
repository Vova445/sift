import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutLegalConsent,LEGAL_POLICY_VERSIONS,signupLegalConsent} from '../lib/legal-consent-policy.js';

test('signup requires explicit terms acceptance and privacy acknowledgement',()=>{
  assert.deepEqual(signupLegalConsent({acceptTerms:true,acknowledgePrivacy:true}),{acceptTerms:true,acknowledgePrivacy:true});
  assert.equal(signupLegalConsent({acceptTerms:true,acknowledgePrivacy:false}),null);
  assert.equal(signupLegalConsent({acceptTerms:'true',acknowledgePrivacy:true}),null);
  assert.equal(signupLegalConsent(null),null);
});

test('checkout requires terms, privacy, refund and immediate-performance confirmations',()=>{
  const valid={acceptTerms:true,acknowledgePrivacy:true,acceptRefund:true,requestImmediatePerformance:true};
  assert.deepEqual(checkoutLegalConsent(valid),valid);
  for(const key of Object.keys(valid))assert.equal(checkoutLegalConsent({...valid,[key]:false}),null,key);
  assert.equal(checkoutLegalConsent({...valid,policyVersion:'attacker-controlled'})?.policyVersion,undefined);
  assert.deepEqual(LEGAL_POLICY_VERSIONS,{privacy:'1.0.0',terms:'1.0.0',refund:'1.0.0'});
});
