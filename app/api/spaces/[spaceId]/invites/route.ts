import { currentUser } from '../../../../../lib/auth';
import { createSharedSpaceInvite, getSharedSpace, revokeSharedSpaceInvite } from '../../../../../lib/shared-spaces';
import { canonicalAppUrl } from '../../../../../lib/billing-security.js';
import { wayForPayConfig } from '../../../../../lib/wayforpay';

const noStore = { 'Cache-Control': 'no-store' };
function sameOrigin(req: Request) { try { return new URL(req.headers.get('origin') || '').origin === new URL(req.url).origin; } catch { return false; } }
type Context = { params: Promise<{ spaceId: string }> };

export async function POST(req: Request, { params }: Context) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт.' }, { status: 401, headers: noStore });
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  const { spaceId } = await params;
  const space = await getSharedSpace(spaceId, user.id);
  if (!space) return Response.json({ error: 'Простір недоступний.' }, { status: 404, headers: noStore });
  if (space.role !== 'owner') return Response.json({ error: 'Запрошення може створити лише власник.' }, { status: 403, headers: noStore });
  const result = await createSharedSpaceInvite(spaceId, user.id);
  if (result.kind === 'missing') return Response.json({ error: 'Простір не знайдено.' }, { status: 404, headers: noStore });
  if (result.kind === 'inactive') return Response.json({ error: 'Спершу активуйте або поновіть оплату простору.' }, { status: 409, headers: noStore });
  if (result.kind === 'full') return Response.json({ error: 'У просторі вже немає вільних місць.' }, { status: 409, headers: noStore });
  const config = wayForPayConfig(), appUrl = canonicalAppUrl(config.appBaseUrl, config.mode === 'sandbox');
  if (!appUrl) return Response.json({ error: 'Посилання-запрошення тимчасово недоступне.' }, { status: 503, headers: noStore });
  return Response.json({ invite: { id: result.id, url: `${appUrl.origin}/dashboard/space?invite=${result.token}`, expiresAt: result.expiresAt, maxUses: result.maxUses } }, { status: 201, headers: noStore });
}

export async function DELETE(req: Request, { params }: Context) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт.' }, { status: 401, headers: noStore });
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  const { spaceId } = await params;
  const space = await getSharedSpace(spaceId, user.id);
  if (!space) return Response.json({ error: 'Простір недоступний.' }, { status: 404, headers: noStore });
  if (space.role !== 'owner') return Response.json({ error: 'Запрошення може скасувати лише власник.' }, { status: 403, headers: noStore });
  let body: { inviteId?: unknown };
  try { body = await req.json() as { inviteId?: unknown }; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  if (typeof body.inviteId !== 'string') return Response.json({ error: 'Оберіть запрошення.' }, { status: 400, headers: noStore });
  const revoked = await revokeSharedSpaceInvite(spaceId, body.inviteId, user.id);
  return revoked ? Response.json({ ok: true }, { headers: noStore }) : Response.json({ error: 'Запрошення не знайдено.' }, { status: 404, headers: noStore });
}
