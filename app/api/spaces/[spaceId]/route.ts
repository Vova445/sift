import { currentUser } from '../../../../lib/auth';
import { getSharedSpace, leaveSharedSpace, removeSharedSpaceMember, renameSharedSpace, validateSharedSpaceTitle } from '../../../../lib/shared-spaces';

const noStore = { 'Cache-Control': 'no-store' };
function sameOrigin(req: Request) { try { return new URL(req.headers.get('origin') || '').origin === new URL(req.url).origin; } catch { return false; } }
type Context = { params: Promise<{ spaceId: string }> };

export async function GET(req: Request, { params }: Context) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт.' }, { status: 401, headers: noStore });
  const { spaceId } = await params;
  try {
    const space = await getSharedSpace(spaceId, user.id);
    if (!space) return Response.json({ error: 'Простір недоступний або підписка завершилася.' }, { status: 404, headers: noStore });
    return Response.json({ space }, { headers: noStore });
  } catch { return Response.json({ error: 'Не вдалося завантажити простір.' }, { status: 503, headers: noStore }); }
}

export async function PATCH(req: Request, { params }: Context) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт.' }, { status: 401, headers: noStore });
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  const { spaceId } = await params;
  let body: { title?: unknown; action?: unknown; memberId?: unknown };
  try { body = await req.json() as typeof body; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  const space = await getSharedSpace(spaceId, user.id);
  if (!space) return Response.json({ error: 'Простір недоступний.' }, { status: 404, headers: noStore });
  if (body.action === 'leave') {
    if (space.role !== 'member') return Response.json({ error: 'Власник не може вийти, поки простір не передано іншому власнику.' }, { status: 403, headers: noStore });
    const left = await leaveSharedSpace(spaceId, user.id);
    return left ? Response.json({ ok: true }, { headers: noStore }) : Response.json({ error: 'Не вдалося вийти.' }, { status: 409, headers: noStore });
  }
  if (space.role !== 'owner') return Response.json({ error: 'Цю дію може виконати лише власник.' }, { status: 403, headers: noStore });
  if (body.action === 'remove_member') {
    if (typeof body.memberId !== 'string') return Response.json({ error: 'Оберіть учасника.' }, { status: 400, headers: noStore });
    const removed = await removeSharedSpaceMember(spaceId, body.memberId, user.id);
    return removed ? Response.json({ ok: true }, { headers: noStore }) : Response.json({ error: 'Учасника не знайдено або це власник.' }, { status: 404, headers: noStore });
  }
  const parsed = validateSharedSpaceTitle(body.title);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: noStore });
  const updated = await renameSharedSpace(spaceId, user.id, parsed.value);
  return updated ? Response.json({ space: await getSharedSpace(spaceId, user.id) }, { headers: noStore }) : Response.json({ error: 'Не вдалося перейменувати простір.' }, { status: 409, headers: noStore });
}
