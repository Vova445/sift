import test from 'node:test';
import assert from 'node:assert/strict';
import { QUARTERLY_FREE_CREDIT_LIMIT, REWARD_TYPE_BY_BADGE, quarterlyCreditStatus, referralIdentityAllowed, rewardLedgerKey } from '../lib/reward-policy.js';

test('reward catalogue maps each achievement to exactly one ledger benefit', () => {
  assert.equal(Object.keys(REWARD_TYPE_BY_BADGE).length, 8);
  assert.equal(REWARD_TYPE_BY_BADGE.mentor, 'one_credit');
  assert.equal(REWARD_TYPE_BY_BADGE.saver, 'pro_discount_50');
  assert.equal(REWARD_TYPE_BY_BADGE.renewal_hunter, 'priority_alerts');
  assert.equal(rewardLedgerKey('mentor', 'one_credit'), 'badge:mentor:one_credit');
});

test('the quarterly credit boundary admits exactly three grants', () => {
  assert.equal(QUARTERLY_FREE_CREDIT_LIMIT, 3);
  assert.equal(quarterlyCreditStatus(0), 'available');
  assert.equal(quarterlyCreditStatus(2), 'available');
  assert.equal(quarterlyCreditStatus(3), 'capped');
  assert.equal(quarterlyCreditStatus(4), 'capped');
});

test('referrals are rejected when email, device or IP was already used or matches the referrer', () => {
  const clean = { ownerIpHash: 'owner-ip', ownerDeviceHash: 'owner-device', refereeIpHash: 'new-ip', refereeDeviceHash: 'new-device' };
  assert.equal(referralIdentityAllowed({ ...clean }), true);
  assert.equal(referralIdentityAllowed({ ...clean, refereeIpHash: 'owner-ip' }), false);
  assert.equal(referralIdentityAllowed({ ...clean, refereeDeviceHash: 'owner-device' }), false);
  assert.equal(referralIdentityAllowed({ ...clean, ipAlreadyUsed: true }), false);
  assert.equal(referralIdentityAllowed({ ...clean, deviceAlreadyUsed: true }), false);
  assert.equal(referralIdentityAllowed({ ...clean, emailAlreadyUsed: true }), false);
});
