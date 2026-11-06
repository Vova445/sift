export type SavingsOutcome = 'not_bought' | 'canceled' | 'refunded';
export type SavingsInput = { scanId?: unknown; outcome?: unknown; amount?: unknown; confirmed?: unknown };
export type ValidSavingsEntry = { scanId: string; outcome: SavingsOutcome; amountMinor: number };
export function parseSavingsAmount(value: unknown): number | null;
export function validateSavingsEntry(input: SavingsInput): { ok: true; value: ValidSavingsEntry } | { ok: false; error: string };
export function buildSavingsCsv(entries: Array<{ confirmedAt: string; title: string; outcome: SavingsOutcome; amountMinor: number }>): string;
