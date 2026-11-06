import { accessFor } from '../../../../lib/db';
import { currentUser } from '../../../../lib/auth';
import { can } from '../../../../lib/entitlements';
import { createDeveloperApiKey, listDeveloperApiKeys, revokeDeveloperApiKey, validateApiKeyLabel } from '../../../../lib/developer-integrations';
import { enforceRateLimit, rateLimitIdentities, rateLimitedResponse } from '../../../../lib/request-rate-limit';

const noStore = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
function sameOrigin(request: Request) { try { return new URL(request.headers.get('origin') || '').origin === new URL(request.url).origin; } catch { return false; } }

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: 'Увійдіть у Sift.' }, { status: 401, headers: noStore });
  try {
    const [access, keys] = await Promise.all([accessFor(user.id), listDeveloperApiKeys(user.id)]);
    return Response.json({ user: { email: user.email }, plan: access.plan, keys }, { headers: noStore });
  } catch { return Response.json({ error: 'Не вдалося завантажити API-ключі.' }, { status: 503, headers: noStore }); }
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: 'Увійдіть у Sift.' }, { status: 401, headers: noStore });
  if (!user.emailVerified) return Response.json({ error: 'Підтвердіть email перед створенням ключа.' }, { status: 403, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  try { const limit = await enforceRateLimit('developer:keys', rateLimitIdentities(request, user.id), 5); if (!limit.allowed) return rateLimitedResponse('Забагато змін API-ключів. Спробуйте пізніше.', limit.retryAfter); }
  catch { return Response.json({ error: 'Лімітатор тимчасово недоступний.' }, { status: 503, headers: noStore }); }
  let body: { label?: unknown };
  try { body = await request.json() as { label?: unknown }; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  const label = validateApiKeyLabel(body.label);
  if (!label.ok) return Response.json({ error: label.error }, { status: 400, headers: noStore });
  try {
    const access = await accessFor(user.id);
    if (!await can(user, 'unlimited_scans', { access })) return Response.json({ error: 'API-ключі доступні лише у Sift Pro.' }, { status: 403, headers: noStore });
    const created = await createDeveloperApiKey(user.id, label.value);
    return Response.json({ key: { id: created.id, label: created.label, prefix: created.prefix, createdAt: created.createdAt }, secret: created.key }, { status: 201, headers: noStore });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('не більше 5') ? error.message : 'Не вдалося створити API-ключ.';
    return Response.json({ error: message }, { status: message.includes('не більше 5') ? 409 : 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: 'Увійдіть у Sift.' }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  try { const limit = await enforceRateLimit('developer:keys', rateLimitIdentities(request, user.id), 5); if (!limit.allowed) return rateLimitedResponse('Забагато змін API-ключів. Спробуйте пізніше.', limit.retryAfter); }
  catch { return Response.json({ error: 'Лімітатор тимчасово недоступний.' }, { status: 503, headers: noStore }); }
  let body: { id?: unknown };
  try { body = await request.json() as { id?: unknown }; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return Response.json({ error: 'Оберіть ключ для відкликання.' }, { status: 400, headers: noStore });
  try {
    const revoked = await revokeDeveloperApiKey(user.id, body.id);
    return revoked ? Response.json({ ok: true }, { headers: noStore }) : Response.json({ error: 'Активний ключ не знайдено.' }, { status: 404, headers: noStore });
  } catch { return Response.json({ error: 'Не вдалося відкликати ключ.' }, { status: 503, headers: noStore }); }
}
