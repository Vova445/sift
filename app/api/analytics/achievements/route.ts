import { getAchievementExperimentAnalytics, setAchievementProgressExperiment } from '../../../../lib/achievement-experiments';
import { enforceRateLimit, rateLimitIdentities, rateLimitedResponse } from '../../../../lib/request-rate-limit';
import { requireSupportAdmin, supportSameOrigin } from '../../../../lib/support-admin';
import { writeSupportAudit } from '../../../../lib/support-tools-db';

const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(req: Request) {
  const auth = await requireSupportAdmin(req);
  if ('response' in auth) return auth.response;
  try {
    const limited = await enforceRateLimit('analytics:achievements:read', rateLimitIdentities(req, auth.user.id), 30);
    if (!limited.allowed) return rateLimitedResponse('Забагато запитів аналітики.', limited.retryAfter);
    return Response.json(await getAchievementExperimentAnalytics(), { headers: noStore });
  } catch {
    return Response.json({ error: 'Не вдалося завантажити аналітику досягнень.' }, { status: 503, headers: noStore });
  }
}

export async function POST(req: Request) {
  const auth = await requireSupportAdmin(req);
  if ('response' in auth) return auth.response;
  if (!supportSameOrigin(req)) return Response.json({ error: 'Запит має надійти з цього сайту.' }, { status: 403, headers: noStore });
  try {
    const limited = await enforceRateLimit('analytics:achievements:write', rateLimitIdentities(req, auth.user.id), 10);
    if (!limited.allowed) return rateLimitedResponse('Забагато змін експерименту.', limited.retryAfter);
  } catch {
    return Response.json({ error: 'Керування експериментом тимчасово недоступне.' }, { status: 503, headers: noStore });
  }
  const raw = await req.text();
  if (raw.length > 2_048) return Response.json({ error: 'Запит завеликий.' }, { status: 413, headers: noStore });
  let body: { enabled?: unknown };
  try { body = JSON.parse(raw) as typeof body; }
  catch { return Response.json({ error: 'Некоректний JSON.' }, { status: 400, headers: noStore }); }
  if (typeof body.enabled !== 'boolean') return Response.json({ error: 'Вкажіть, чи має бути тест увімкнений.' }, { status: 400, headers: noStore });
  try {
    const summary = await setAchievementProgressExperiment(body.enabled, auth.user.id);
    await writeSupportAudit({ actorUserId: auth.user.id, action: 'set_achievement_progress_experiment', details: { enabled: body.enabled } });
    return Response.json(summary, { headers: noStore });
  } catch (error) {
    console.error('[analytics:achievements] update failed', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'Не вдалося змінити експеримент.' }, { status: 503, headers: noStore });
  }
}
