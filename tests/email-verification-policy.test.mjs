import test from 'node:test';
import assert from 'node:assert/strict';
import {RESEND_COOLDOWN_MS,RESEND_MAX_PER_WINDOW,RESEND_WINDOW_MS,VERIFICATION_TTL_MS,resendBlockReason,verificationTokenState} from '../lib/email-verification-policy.js';

test('verification links expire after 24 hours and are one-time',()=>{
  const now=Date.parse('2026-11-02T12:00:00.000Z'),expiresAt=new Date(now+VERIFICATION_TTL_MS).toISOString();
  assert.equal(VERIFICATION_TTL_MS,24*60*60*1000);
  assert.equal(verificationTokenState({expiresAt,usedAt:null},now),'valid');
  assert.equal(verificationTokenState({expiresAt,usedAt:null},now+VERIFICATION_TTL_MS),'expired');
  assert.equal(verificationTokenState({expiresAt,usedAt:new Date(now).toISOString()},now),'used');
});

test('resend throttles to one per minute and five per 24-hour window',()=>{
  const now=Date.parse('2026-11-02T12:00:00.000Z'),windowStartedAt=new Date(now-1000).toISOString();
  assert.equal(RESEND_WINDOW_MS,24*60*60*1000);
  assert.equal(RESEND_COOLDOWN_MS,60*1000);
  assert.equal(RESEND_MAX_PER_WINDOW,5);
  assert.equal(resendBlockReason({sentCount:1,lastSentAt:new Date(now-30_000).toISOString(),windowStartedAt},now),'cooldown');
  assert.equal(resendBlockReason({sentCount:5,lastSentAt:new Date(now-61_000).toISOString(),windowStartedAt},now),'daily_limit');
  assert.equal(resendBlockReason({sentCount:5,lastSentAt:new Date(now-61_000).toISOString(),windowStartedAt:new Date(now-RESEND_WINDOW_MS-1).toISOString()},now),null);
});
