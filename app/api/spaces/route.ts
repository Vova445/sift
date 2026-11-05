import { currentUser } from '../../../lib/auth';
import { createSharedSpace, listSharedSpaces, validateSharedSpaceTitle } from '../../../lib/shared-spaces';

function sameOrigin(req: Request) { try { return new URL(req.headers.get('origin') || '').origin === new URL(req.url).origin; } catch { return false; } }
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт.' }, { status: 401, headers: noStore });
  try { return Response.json({ spaces: await listSharedSpaces(user.id) }, { headers: noStore }); }
  catch { return Response.json({ error: 'Не вдалося завантажити простори.' }, { status: 503, headers: noStore }); }
}

export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт, щоб створити простір.' }, { status: 401, headers: noStore });
  if (!user.emailVerified) return Response.json({ error: 'Підтвердіть email перед створенням простору.' }, { status: 403, headers: noStore });
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  let body: { title?: unknown };
  try { body = await req.json() as { title?: unknown }; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  const parsed = validateSharedSpaceTitle(body.title);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: noStore });
  try {
    const space = await createSharedSpace(user.id, parsed.value);
    return Response.json({ space }, { status: 201, headers: noStore });
  } catch { return Response.json({ error: 'Не вдалося створити простір.' }, { status: 503, headers: noStore }); }
}
