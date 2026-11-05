import { currentUser } from '../../../lib/auth';
import { rewardsForUser } from '../../../lib/rewards';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть, щоб переглянути нагороди.' }, { status: 401, headers: noStore });
  try { return Response.json(await rewardsForUser(user.id), { headers: noStore }); }
  catch { return Response.json({ error: 'Нагороди тимчасово недоступні.' }, { status: 503, headers: noStore }); }
}
