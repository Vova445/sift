import { currentUser } from '../../../lib/auth';
import { accessFor, deleteWatchlist, saveWatchlist, watchlistFor } from '../../../lib/db';
import { guardFeature } from '../../../lib/entitlements';
import { trackEvent } from '../../../lib/event-bus';

async function proUser(req: Request) {
  const user = await currentUser(req);
  if (!user) return { error: Response.json({ error: 'Увійдіть в акаунт' }, { status: 401 }) };
  const access = await accessFor(user.id);
  const denied = await guardFeature(user, 'purchase_planner', { access, message: 'Планувальник покупок доступний у Sift Pro' });
  if (denied) return { error: denied };
  return { user };
}

export async function GET(req: Request) {
  const auth = await proUser(req);
  if (auth.error) return auth.error;
  return Response.json({ items: await watchlistFor(auth.user!.id) });
}

export async function POST(req: Request) {
  try {
    const auth = await proUser(req);
    if (auth.error) return auth.error;
    const userId = auth.user!.id;
    const body = await req.json() as { scanId?: unknown; status?: unknown; note?: unknown; reviewAt?: unknown };
    if (typeof body.scanId !== 'string' || !body.scanId) return Response.json({ error: 'Оберіть звіт' }, { status: 400 });
    const statuses = ['considering', 'bought', 'rejected'];
    if (!statuses.includes(typeof body.status === 'string' ? body.status : 'considering')) return Response.json({ error: 'Некоректний статус' }, { status: 400 });
    const note = body.note === undefined ? '' : body.note;
    if (typeof note !== 'string') return Response.json({ error: 'Некоректна нотатка' }, { status: 400 });
    if (note.length > 500) return Response.json({ error: 'Нотатка задовга' }, { status: 400 });
    let reviewAt: string | null = null;
    if (body.reviewAt !== undefined && body.reviewAt !== null && body.reviewAt !== '') {
      if (typeof body.reviewAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.reviewAt)) return Response.json({ error: 'Вкажіть коректну дату' }, { status: 400 });
      const parsed = new Date(`${body.reviewAt}T00:00:00.000Z`);
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== body.reviewAt) return Response.json({ error: 'Вкажіть коректну дату' }, { status: 400 });
      reviewAt = body.reviewAt;
    }
    const items = await saveWatchlist(userId, {
      scanId: body.scanId,
      status: typeof body.status === 'string' ? body.status : 'considering',
      note: note.trim(),
      reviewAt,
    });
    try {
      await trackEvent({ userId, type: 'watchlist_added', sourceId: body.scanId, payload: { scanId: body.scanId } });
    } catch {
      return Response.json({ error: 'Планувальник збережено, але подію не записано. Повторіть збереження.' }, { status: 503 });
    }
    return Response.json({ items });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Не вдалося зберегти' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await proUser(req);
    if (auth.error) return auth.error;
    let body: { scanId?: unknown };
    try { body = await req.json() as { scanId?: unknown }; }
    catch { return Response.json({ error: 'Некоректний запит' }, { status: 400 }); }
    if (typeof body.scanId !== 'string' || !body.scanId) return Response.json({ error: 'Оберіть запис Planner' }, { status: 400 });
    const items = await deleteWatchlist(auth.user!.id, body.scanId);
    await trackEvent({ userId: auth.user!.id, type: 'watchlist_removed', sourceId: body.scanId, payload: { scanId: body.scanId } });
    return Response.json({ items });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Не вдалося видалити' }, { status: 400 });
  }
}
