export const FREE_MONTHLY_SCAN_LIMIT = 3;

export function scanLimitForPlan(plan) {
  if (plan === 'pro') return 999;
  if (plan === 'one') return 1;
  return FREE_MONTHLY_SCAN_LIMIT;
}

export function canReserveScan(used, limit) {
  return Number.isInteger(used) && Number.isInteger(limit) && used >= 0 && limit >= 0 && used < limit;
}
