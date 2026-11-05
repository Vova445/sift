import { currentUser } from '../../../../../lib/auth';
import { acceptSharedSpaceInvite } from '../../../../../lib/shared-spaces';

const noStore = { 'Cache-Control': 'no-store' };
function sameOrigin(req: Request) { try { return new URL(req.headers.get('origin') || '').origin === new URL(req.url).origin; } catch { return false; } }

export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть або створіть акаунт, щоб прийняти запрошення.' }, { status: 401, headers: noStore });
  if (!user.emailVerified) return Response.json({ error: 'Підтвердіть email перед вступом у простір.' }, { status: 403, headers: noStore });
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  let body: { token?: unknown };
  try { body = await req.json() as { token?: unknown }; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  if (typeof body.token !== 'string') return Response.json({ error: 'Посилання-запрошення некоректне.' }, { status: 400, headers: noStore });
  const result = await acceptSharedSpaceInvite(body.token, user.id);
  if (result.kind === 'invalid') return Response.json({ error: 'Запрошення недійсне, скасоване або прострочене.' }, { status: 410, headers: noStore });
  if (result.kind === 'full') return Response.json({ error: 'У просторі більше немає місць за цим запрошенням.' }, { status: 409, headers: noStore });
  return Response.json({ ok: true, spaceId: result.spaceId, alreadyMember: result.alreadyMember }, { headers: noStore });
}
