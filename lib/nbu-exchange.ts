export type OfficialUsdRate = { rate: number; date: string };

/** Fetch the official UAH/USD rate for an auditable USD-equivalent badge. */
export async function currentOfficialUsdRate(): Promise<OfficialUsdRate | null> {
  try {
    const response = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json&valcode=USD', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    const rows = await response.json() as Array<{ rate?: unknown; exchangedate?: unknown }>;
    const row = Array.isArray(rows) ? rows[0] : null;
    const rate = Number(row?.rate);
    const date = typeof row?.exchangedate === 'string' ? row.exchangedate : '';
    if (!Number.isFinite(rate) || rate <= 0 || !/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return null;
    return { rate, date };
  } catch {
    return null;
  }
}
