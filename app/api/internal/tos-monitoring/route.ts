import { env } from 'cloudflare:workers';
import { featureFlagEnabled } from '../../../../lib/support-tools-db';
import { processTosMonitoring } from '../../../../lib/tos-monitoring';

export async function POST(request: Request) {
  const secret = (env as unknown as Record<string, string | undefined>).DUNNING_CRON_SECRET || '';
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!await featureFlagEnabled('tos_monitoring')) return Response.json({ checked: 0, changed: 0, alertsSent: 0, email: 'feature_disabled' });
  try {
    const result = await processTosMonitoring();
    return Response.json(result, { status: result.email === 'not_configured' || result.checkFailures > 0 || result.emailFailures > 0 ? 503 : 200 });
  } catch {
    return Response.json({ error: 'Terms monitoring failed. Inspect the Worker log; the next scheduled run will retry.' }, { status: 503 });
  }
}

