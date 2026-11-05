import { env } from 'cloudflare:workers';
import { isTelegramUpdate, processTelegramUpdate, telegramWebhookAuthorized } from '../../../../lib/telegram-bot';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function POST(request: Request) {
  const values = env as unknown as Record<string, string | undefined>;
  const secret = values.TELEGRAM_WEBHOOK_SECRET || '';
  if (secret.trim().length < 32 || !values.TELEGRAM_BOT_TOKEN) return Response.json({ error: 'Telegram webhook is not configured.' }, { status: 503, headers: noStore });
  if (!telegramWebhookAuthorized(request, secret)) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: noStore });
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 64 * 1024) return Response.json({ error: 'Payload too large.' }, { status: 413, headers: noStore });
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 64 * 1024) return Response.json({ error: 'Payload too large.' }, { status: 413, headers: noStore });
    body = JSON.parse(raw);
  } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400, headers: noStore }); }
  if (!isTelegramUpdate(body) || (body.message?.text?.length || 0) > 4096) return Response.json({ error: 'Invalid Telegram update.' }, { status: 400, headers: noStore });
  try {
    const result = await processTelegramUpdate(request, body);
    return Response.json({ ok: true, ...result }, { headers: noStore });
  } catch {
    return Response.json({ error: 'Telegram update will be retried.' }, { status: 503, headers: { ...noStore, 'Retry-After': '5' } });
  }
}
