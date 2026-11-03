export const FREE_MONTHLY_SCAN_LIMIT: 3;
export function scanLimitForPlan(plan: string): number;
export function canReserveScan(used: number, limit: number): boolean;
