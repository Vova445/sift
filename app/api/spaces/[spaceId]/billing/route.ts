import { currentUser } from '../../../../../lib/auth';
import { callbackSignatureFields, signatureMatches, wayForPayConfig } from '../../../../../lib/wayforpay';
import { getSharedSpace, getSharedSpacePayment, setSharedSpacePaymentStatus, sharedSpaceAmountMatches } from '../../../../../lib/shared-spaces';

const noStore = { 'Cache-Control': 'no-store' };
type Context = { params: Promise<{ spaceId: string }> };

export async function GET(req: Request, { params }: Context) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт.' }, { status: 401, headers: noStore });
  const { spaceId } = await params, reference = new URL(req.url).searchParams.get('reference') || '';
  if (!/^space_[a-f\d]{32}$/i.test(reference)) return Response.json({ error: 'Некоректний номер платежу.' }, { status: 400, headers: noStore });
  const space = await getSharedSpace(spaceId, user.id);
  if (!space) return Response.json({ error: 'Простір не знайдено.' }, { status: 404, headers: noStore });
  if (space.role !== 'owner') return Response.json({ error: 'Статус оплати доступний лише власнику простору.' }, { status: 403, headers: noStore });
  const order = await getSharedSpacePayment(reference, user.id);
  if (!order || order.space_id !== spaceId) return Response.json({ error: 'Платіж не знайдено.' }, { status: 404, headers: noStore });
  if (order.status === 'pending' && Date.parse(order.expires_at) > Date.now()) {
    const config = wayForPayConfig();
    if (!config.merchantAccount || !config.secret) return Response.json({ error: 'WayForPay не налаштовано.' }, { status: 503, headers: noStore });
    const request = { transactionType: 'CHECK_STATUS', merchantAccount: config.merchantAccount, orderReference: reference, merchantSignature: (await import('node:crypto')).createHmac('md5', config.secret).update(`${config.merchantAccount};${reference}`).digest('hex'), apiVersion: 1 };
    try {
      const response = await fetch('https://api.wayforpay.com/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
      if (response.ok) {
        const status = await response.json() as Record<string, unknown>;
        if (status.merchantAccount === config.merchantAccount && status.orderReference === reference && sharedSpaceAmountMatches(order, status.amount, status.currency) && signatureMatches(callbackSignatureFields(status), status.merchantSignature)) {
          if (status.transactionStatus === 'Approved') await setSharedSpacePaymentStatus(order, 'paid');
          else if (status.transactionStatus === 'Declined') await setSharedSpacePaymentStatus(order, 'declined');
        }
      }
    } catch { /* the signed provider callback can still arrive */ }
  } else if (order.status === 'pending') await setSharedSpacePaymentStatus(order, 'expired');
  const latest = await getSharedSpacePayment(reference, user.id);
  return Response.json({ status: latest?.status || 'pending', testMode: latest?.test_mode === 1, price: { uah: latest?.amount_uah || 119, termDays: 30, autoRenew: false }, periodEnd: latest?.period_end }, { headers: noStore });
}
