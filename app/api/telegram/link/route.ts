import { currentUser } from '../../../../lib/auth';
import { accessFor } from '../../../../lib/db';
import { can } from '../../../../lib/entitlements';
import { createTelegramLinkCode, telegramLinkStatus, unlinkTelegram } from '../../../../lib/developer-integrations';
import { telegramBotConfig } from '../../../../lib/telegram-bot';
import { enforceRateLimit, rateLimitIdentities, rateLimitedResponse } from '../../../../lib/request-rate-limit';

const noStore = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
function sameOrigin(request: Request) { try { return new URL(request.headers.get('origin') || '').origin === new URL(request.url).origin; } catch { return false; } }

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: 'Увійдіть у Sift.' }, { status: 401, headers: noStore });
  try {
    const [access, telegram] = await Promise.all([accessFor(user.id), telegramLinkStatus(user.id)]);
    return Response.json({ plan: access.plan, bot: telegramBotConfig(), telegram }, { headers: noStore });
  } catch { return Response.json({ error: 'Не вдалося завантажити стан Telegram.' }, { status: 503, headers: noStore }); }
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: 'Увійдіть у Sift.' }, { status: 401, headers: noStore });
  if (!user.emailVerified) return Response.json({ error: 'Підтвердіть email перед підключенням Telegram.' }, { status: 403, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  try { const limit = await enforceRateLimit('telegram:link', rateLimitIdentities(request, user.id), 5); if (!limit.allowed) return rateLimitedResponse('Забагато спроб підключення Telegram. Спробуйте пізніше.', limit.retryAfter); }
  catch { return Response.json({ error: 'Лімітатор тимчасово недоступний.' }, { status: 503, headers: noStore }); }
  const config = telegramBotConfig();
  if (!config.configured) return Response.json({ error: 'Telegram Bot API ще не налаштовано адміністратором.' }, { status: 503, headers: noStore });
  try {
    const access = await accessFor(user.id);
    if (!await can(user, 'unlimited_scans', { access })) return Response.json({ error: 'Telegram-бот доступний у Sift Pro.' }, { status: 403, headers: noStore });
    const link = await createTelegramLinkCode(user.id);
    return Response.json({ ...link, startUrl: config.startUrl ? `${config.startUrl}?start=${link.code}` : null, username: config.username }, { headers: noStore });
  } catch { return Response.json({ error: 'Не вдалося створити код підключення.' }, { status: 503, headers: noStore }); }
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: 'Увійдіть у Sift.' }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  try { await unlinkTelegram(user.id); return Response.json({ ok: true }, { headers: noStore }); }
  catch { return Response.json({ error: 'Не вдалося відв’язати Telegram.' }, { status: 503, headers: noStore }); }
}
