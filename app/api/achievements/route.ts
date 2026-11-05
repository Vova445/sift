import { currentUser } from '../../../lib/auth';
import { getAchievementCollection } from '../../../lib/achievements';
import { achievementProgressVariant } from '../../../lib/achievement-experiments';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт, щоб переглянути досягнення.' }, { status: 401, headers: noStore });
  try {
    const analyticsConsent = new URL(req.url).searchParams.get('experimentConsent') === 'granted';
    const [collection, experiment] = await Promise.all([
      getAchievementCollection(user.id),
      achievementProgressVariant(user.id, analyticsConsent),
    ]);
    return Response.json({ userId: user.id, ...collection, experiment }, { headers: noStore });
  } catch {
    return Response.json({ error: 'Не вдалося завантажити досягнення. Спробуйте ще раз.' }, { status: 503, headers: noStore });
  }
}
