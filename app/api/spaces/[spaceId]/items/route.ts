import { currentUser } from '../../../../../lib/auth';
import { createSharedSpaceItem, deleteSharedSpaceItem, getSharedSpace, updateSharedSpaceItem, validateSharedSpaceItem } from '../../../../../lib/shared-spaces';

const noStore = { 'Cache-Control': 'no-store' };
function sameOrigin(req: Request) { try { return new URL(req.headers.get('origin') || '').origin === new URL(req.url).origin; } catch { return false; } }
type Context = { params: Promise<{ spaceId: string }> };
async function authenticatedSpace(req: Request, spaceId: string) {
  const user = await currentUser(req);
  if (!user) return { error: Response.json({ error: 'Увійдіть в акаунт.' }, { status: 401, headers: noStore }) };
  const space = await getSharedSpace(spaceId, user.id);
  if (!space) return { error: Response.json({ error: 'Простір недоступний або термін доступу завершився.' }, { status: 404, headers: noStore }) };
  return { user, space };
}

export async function GET(req: Request, { params }: Context) {
  const { spaceId } = await params;
  const result = await authenticatedSpace(req, spaceId);
  if ('error' in result) return result.error;
  return Response.json({ items: result.space.items }, { headers: noStore });
}

export async function POST(req: Request, { params }: Context) {
  const { spaceId } = await params;
  const result = await authenticatedSpace(req, spaceId);
  if ('error' in result) return result.error;
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  const parsed = validateSharedSpaceItem(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: noStore });
  const saved = await createSharedSpaceItem(spaceId, result.user.id, parsed);
  if (saved.kind === 'bad_assignee') return Response.json({ error: 'Відповідальний має бути учасником цього простору.' }, { status: 400, headers: noStore });
  return Response.json({ space: await getSharedSpace(spaceId, result.user.id) }, { status: 201, headers: noStore });
}

export async function PUT(req: Request, { params }: Context) {
  const { spaceId } = await params;
  const result = await authenticatedSpace(req, spaceId);
  if ('error' in result) return result.error;
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  if (typeof body.itemId !== 'string') return Response.json({ error: 'Не вибрано запис.' }, { status: 400, headers: noStore });
  const parsed = validateSharedSpaceItem(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: noStore });
  const saved = await updateSharedSpaceItem(spaceId, body.itemId, result.user.id, result.space.role, parsed);
  if (saved.kind === 'bad_assignee') return Response.json({ error: 'Відповідальний має бути учасником цього простору.' }, { status: 400, headers: noStore });
  if (saved.kind === 'missing') return Response.json({ error: 'Запис не знайдено або у вас немає права його змінити.' }, { status: 404, headers: noStore });
  return Response.json({ space: await getSharedSpace(spaceId, result.user.id) }, { headers: noStore });
}

export async function DELETE(req: Request, { params }: Context) {
  const { spaceId } = await params;
  const result = await authenticatedSpace(req, spaceId);
  if ('error' in result) return result.error;
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  let body: { itemId?: unknown };
  try { body = await req.json() as { itemId?: unknown }; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  if (typeof body.itemId !== 'string') return Response.json({ error: 'Не вибрано запис.' }, { status: 400, headers: noStore });
  const deleted = await deleteSharedSpaceItem(spaceId, body.itemId, result.user.id, result.space.role);
  return deleted ? Response.json({ space: await getSharedSpace(spaceId, result.user.id) }, { headers: noStore }) : Response.json({ error: 'Запис не знайдено або у вас немає права його видалити.' }, { status: 404, headers: noStore });
}
