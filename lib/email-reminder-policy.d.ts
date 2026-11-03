export function isIsoDate(value: unknown): value is string;
export function kyivDate(now?: Date): string;
export function addCalendarDays(isoDate: string, days: number): string | null;
export function isReminderDue(reviewAt: string, today: string, daysBefore?: number): boolean;
export function reminderDaysBefore(value: unknown): number;
export function validUnsubscribeToken(value: unknown): value is string;
export function reminderDeliveryKey(watchlistId: string, reviewAt: string): string;
