import { env } from 'cloudflare:workers';
import { accessFor } from '../../../lib/db';
import { currentUser } from '../../../lib/auth';
import { guardFeature } from '../../../lib/entitlements';
import { canonicalAppUrl, sameOriginBillingRequest } from '../../../lib/billing-security.js';
import { featureFlagEnabled } from '../../../lib/support-tools-db';
import { getTosMonitoringForUser, requestTosMonitoringRetry, setTosMonitoring } from '../../../lib/tos-monitoring';

async function authorize(request: Request) {
  const user = await currentUser(request);
  if (!user) return { response: Response.json({ error: 'Увійдіть в акаунт' }, { status: 401 }) };
  const access = await accessFor(user.id);
  const denied = await guardFeature(user, 'purchase_planner', { access, message: 'Моніторинг змін доступний у Sift Pro' });
  if (denied) return { response: denied };
  if (!await featureFlagEnabled('tos_monitoring')) return { response: Response.json({ error: 'Моніторинг тимчасово вимкнений.' }, { status: 503 }) };
  return { user };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ('response' in auth) return auth.response;
  return Response.json(await getTosMonitoringForUser(auth.user.id), { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if ('response' in auth) return auth.response;
  const values = env as unknown as Record<string, string | undefined>;
  const app = canonicalAppUrl(values.APP_BASE_URL, values.WAYFORPAY_MODE === 'sandbox');
  if (!app || !sameOriginBillingRequest(request, app)) return Response.json({ error: 'Недозволене джерело запиту' }, { status: 403 });

  let body: { scanId?: unknown; enabled?: unknown; action?: unknown };
  try { body = await request.json() as { scanId?: unknown; enabled?: unknown; action?: unknown }; }
  catch { return Response.json({ error: 'Некоректний запит' }, { status: 400 }); }
  if (typeof body.scanId !== 'string' || !body.scanId || body.scanId.length > 100) {
    return Response.json({ error: 'Вкажіть звіт для моніторингу' }, { status: 400 });
  }
  if (body.action === 'retry') {
    const result = await requestTosMonitoringRetry(auth.user.id, body.scanId);
    if (!result) return Response.json({ error: 'Не знайдено активний моніторинг цього звіту.' }, { status: 404 });
    if (result.busy) return Response.json({ error: 'Сторінка вже перевіряється. Дочекайтеся завершення.' }, { status: 409 });
    return Response.json({ item: result.item, message: 'Повтор додано до черги на найближчий запланований запуск.' }, { headers: { 'Cache-Control': 'no-store, private' } });
  }
  if (typeof body.enabled !== 'boolean') {
    return Response.json({ error: 'Вкажіть стан моніторингу' }, { status: 400 });
  }
  if (body.enabled && !(await getTosMonitoringForUser(auth.user.id)).configured) {
    return Response.json({ error: 'Email-сповіщення ще не налаштовані. Спробуйте пізніше.' }, { status: 503 });
  }
  try {
    const item = await setTosMonitoring(auth.user.id, body.scanId, body.enabled);
    if (!item) return Response.json({ error: 'Додайте звіт до Planner перед увімкненням моніторингу.' }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не вдалося змінити моніторинг';
    return Response.json({ error: message }, { status: message.includes('до 20') ? 409 : 400 });
  }
}

