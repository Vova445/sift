import test from 'node:test';
import assert from 'node:assert/strict';
import {RESET_TOKEN_TTL_MS,LOGIN_ACCOUNT_FAILURE_LIMIT,LOGIN_IP_FAILURE_LIMIT,LOGIN_LOCK_MS,RESET_EMAIL_MAX_REQUESTS,RESET_IP_MAX_REQUESTS,RESET_RESEND_COOLDOWN_MS,RESET_TOKEN_ATTEMPT_LIMIT,RESET_TOKEN_ATTEMPT_WINDOW_MS,resetTokenState,loginLocked,resetRequestBlocked} from '../lib/password-security-policy.js';

test('reset tokens have a one hour TTL and reject expired or consumed tokens',()=>{
  const now=Date.parse('2026-11-02T12:00:00.000Z');
  assert.equal(RESET_TOKEN_TTL_MS,60*60*1000);
  assert.equal(resetTokenState({expiresAt:new Date(now+1).toISOString()},now),'valid');
  assert.equal(resetTokenState({expiresAt:new Date(now).toISOString()},now),'expired');
  assert.equal(resetTokenState({expiresAt:new Date(now+1000).toISOString(),usedAt:'2026-11-02T11:00:00.000Z'},now),'used');
  assert.equal(resetTokenState(null,now),'used');
});

test('login lockout bounds guesses by account and source IP',()=>{
  assert.equal(LOGIN_ACCOUNT_FAILURE_LIMIT,5);
  assert.equal(LOGIN_IP_FAILURE_LIMIT,20);
  assert.equal(LOGIN_LOCK_MS,15*60*1000);
  const now=Date.parse('2026-11-02T12:00:00.000Z');
  assert.equal(loginLocked({lockedUntil:new Date(now+1).toISOString()},now),true);
  assert.equal(loginLocked({lockedUntil:new Date(now).toISOString()},now),false);
});

test('reset request limit enforces cooldown and per-window cap',()=>{
  const now=Date.parse('2026-11-02T12:00:00.000Z');
  assert.equal(RESET_EMAIL_MAX_REQUESTS,3);
  assert.equal(RESET_IP_MAX_REQUESTS,20);
  assert.equal(RESET_RESEND_COOLDOWN_MS,60*1000);
  const bucket={requestCount:1,windowStartedAt:new Date(now-1000).toISOString(),lastRequestedAt:new Date(now-30_000).toISOString()};
  assert.equal(resetRequestBlocked(bucket,{now,maxRequests:3}),true);
  assert.equal(resetRequestBlocked({...bucket,lastRequestedAt:new Date(now-60_000).toISOString()},{now,maxRequests:3}),false);
  assert.equal(resetRequestBlocked({...bucket,requestCount:3,lastRequestedAt:new Date(now-60_000).toISOString()},{now,maxRequests:3}),true);
  assert.equal(resetRequestBlocked({...bucket,requestCount:3,windowStartedAt:new Date(now-60*60*1000).toISOString(),lastRequestedAt:new Date(now-60*60*1000).toISOString()},{now,maxRequests:3}),false);
});

test('reset token endpoint is capped per source IP to slow guessing',()=>{
  assert.equal(RESET_TOKEN_ATTEMPT_LIMIT,30);
  assert.equal(RESET_TOKEN_ATTEMPT_WINDOW_MS,15*60*1000);
});
