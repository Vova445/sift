import { currentUser } from '../../../lib/auth';
import { referralUrlForUser } from '../../../lib/referrals';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть, щоб створити запрошення.' }, { status: 401, headers: noStore });
  if (!user.emailVerified) return Response.json({ error: 'Підтвердіть email, щоб запросити друга.' }, { status: 403, headers: noStore });
  try {
    const origin = new URL(req.url).origin;
    const deviceId = new URL(req.url).searchParams.get('deviceId');
    return Response.json({ url: await referralUrlForUser(user.id, origin, req, deviceId) }, { headers: noStore });
  } catch {
    return Response.json({ error: 'Не вдалося створити посилання. Спробуйте ще раз.' }, { status: 503, headers: noStore });
  }
}
