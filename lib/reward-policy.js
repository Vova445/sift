export const QUARTERLY_FREE_CREDIT_LIMIT = 3;

export const REWARD_TYPE_BY_BADGE = Object.freeze({
  skeptic: 'one_credit',
  renewal_hunter: 'priority_alerts',
  saver: 'pro_discount_50',
  timely_stop: 'one_credit',
  polyglot: 'priority_alerts',
  guardian: 'one_credit',
  streak_7_days: 'pro_discount_50',
  mentor: 'one_credit',
});

export function rewardLedgerKey(badgeKey, rewardType) {
  return `badge:${badgeKey}:${rewardType}`;
}

export function quarterlyCreditStatus(issuedThisQuarter) {
  return Number.isInteger(issuedThisQuarter) && issuedThisQuarter >= QUARTERLY_FREE_CREDIT_LIMIT ? 'capped' : 'available';
}

export function referralIdentityAllowed({ ownerIpHash, ownerDeviceHash, refereeIpHash, refereeDeviceHash, emailAlreadyUsed, deviceAlreadyUsed, ipAlreadyUsed }) {
  if (emailAlreadyUsed || deviceAlreadyUsed || ipAlreadyUsed) return false;
  if (ownerIpHash && refereeIpHash && ownerIpHash === refereeIpHash) return false;
  if (ownerDeviceHash && refereeDeviceHash && ownerDeviceHash === refereeDeviceHash) return false;
  return true;
}
