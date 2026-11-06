import { currentUser } from '../../../../lib/auth';
import { buildSavingsCsv } from '../../../../lib/savings-policy.js';
import { savingsEntriesForUser } from '../../../../lib/savings';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт, щоб завантажити CSV.' }, { status: 401, headers: noStore });
  try {
    const entries = await savingsEntriesForUser(user.id, null);
    const csv = buildSavingsCsv(entries.map((row) => ({ confirmedAt: row.confirmed_at, title: row.title, outcome: row.outcome, amountMinor: row.amount_minor })));
    return new Response(csv, { headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sift-savings.csv"' } });
  } catch {
    return Response.json({ error: 'Не вдалося сформувати CSV.' }, { status: 503, headers: noStore });
  }
}
