import { env } from 'cloudflare:workers';
import { currentUser } from '../../../../lib/auth';
import { trackEvent } from '../../../../lib/event-bus';
import { publicVerdictOrigin } from '../../../../lib/public-verdict';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === publicVerdictOrigin(); } catch { return false; }
}

export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт, щоб зберегти це досягнення.' }, { status: 401, headers: noStore });
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено. Оновіть сторінку та спробуйте ще раз.' }, { status: 403, headers: noStore });
  let body: { scanId?: unknown };
  try { body = await req.json() as { scanId?: unknown }; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  if (typeof body.scanId !== 'string' || body.scanId.length < 8 || body.scanId.length > 80 || !/^[A-Za-z0-9_-]+$/.test(body.scanId)) {
    return Response.json({ error: 'Вкажіть коректний збережений звіт.' }, { status: 400, headers: noStore });
  }
  const owned = await env.DB.prepare(`SELECT id FROM scans WHERE id=? AND user_id=?`).bind(body.scanId, user.id).first<{ id: string }>();
  if (!owned) return Response.json({ error: 'Збережений звіт не знайдено.' }, { status: 404, headers: noStore });
  try {
    await trackEvent({
      userId: user.id,
      type: 'cancellation_kit_used',
      sourceId: body.scanId,
      payload: { scanId: body.scanId },
    });
    return Response.json({ ok: true }, { headers: noStore });
  } catch {
    return Response.json({ error: 'Не вдалося зберегти подію. Спробуйте ще раз.' }, { status: 503, headers: noStore });
  }
}
