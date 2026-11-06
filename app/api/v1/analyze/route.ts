import { analyzeUrl, AnalyzerError } from '../../../../lib/analyzer';
import { accessFor, saveScan } from '../../../../lib/db';
import { can } from '../../../../lib/entitlements';
import { authenticateDeveloperApiKey } from '../../../../lib/developer-integrations';
import { ANALYZE_REQUESTS_PER_MINUTE } from '../../../../lib/request-rate-limit-policy.js';
import { enforceRateLimit, rateLimitIdentities, rateLimitedResponse } from '../../../../lib/request-rate-limit';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function POST(request: Request) {
  let owner;
  try { owner = await authenticateDeveloperApiKey(request); }
  catch { return Response.json({ error: 'Тимчасово не вдалося перевірити API-ключ.' }, { status: 503, headers: noStore }); }
  if (!owner) return Response.json({ error: 'Невірний або відкликаний API-ключ. Передайте його як Bearer token.' }, { status: 401, headers: noStore });
  if (!owner.email_verified_at) return Response.json({ error: 'Підтвердіть email Sift акаунта.' }, { status: 403, headers: noStore });

  let access;
  try { access = await accessFor(owner.user_id); }
  catch { return Response.json({ error: 'Тимчасово не вдалося перевірити тариф.' }, { status: 503, headers: noStore }); }
  if (!await can({ id: owner.user_id, emailVerified: true }, 'unlimited_scans', { access })) return Response.json({ error: 'Sift API доступний лише з активним Sift Pro.' }, { status: 403, headers: noStore });

  let rateLimit;
  try { rateLimit = await enforceRateLimit('analyze:pro', rateLimitIdentities(request, owner.user_id, owner.key_id), ANALYZE_REQUESTS_PER_MINUTE.pro); }
  catch { return Response.json({ error: 'Лімітатор тимчасово недоступний.' }, { status: 503, headers: noStore }); }
  if (!rateLimit.allowed) return rateLimitedResponse('Перевищено ліміт Sift Pro — 30 аналізів за хвилину.', rateLimit.retryAfter);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 8192) return Response.json({ error: 'Тіло запиту завелике.' }, { status: 413, headers: noStore });
  let body: { url?: unknown };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8192) return Response.json({ error: 'Тіло запиту завелике.' }, { status: 413, headers: noStore });
    body = JSON.parse(raw) as { url?: unknown };
  } catch { return Response.json({ error: 'Передайте JSON із полем url.' }, { status: 400, headers: noStore }); }
  if (typeof body.url !== 'string' || !body.url.trim() || body.url.length > 2048) return Response.json({ error: 'Поле url має містити адресу до 2048 символів.' }, { status: 400, headers: noStore });

  try {
    const result = await analyzeUrl(body.url.trim());
    const id = await saveScan(`api:${owner.key_id}`, owner.user_id, result, 'pro');
    return Response.json({ id, ...result }, { headers: noStore });
  } catch (error) {
    const status = error instanceof AnalyzerError ? error.status : 422;
    return Response.json({ error: error instanceof Error ? error.message : 'Не вдалося проаналізувати сторінку.' }, { status, headers: noStore });
  }
}
