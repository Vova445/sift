import { currentUser } from '../../../../../lib/auth';
import { canonicalAppUrl, merchantDomainMatches, sameOriginBillingRequest } from '../../../../../lib/billing-security.js';
import { createSharedSpacePayment, getSharedSpace } from '../../../../../lib/shared-spaces';
import { purchaseSignature, sandboxAllowed, wayForPayConfig } from '../../../../../lib/wayforpay';

const noStore = { 'Cache-Control': 'no-store' };
type Context = { params: Promise<{ spaceId: string }> };

export async function POST(req: Request, { params }: Context) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт, щоб оформити окрему оплату простору.' }, { status: 401, headers: noStore });
  if (!user.emailVerified) return Response.json({ error: 'Підтвердіть email перед оплатою.' }, { status: 403, headers: noStore });
  const config = wayForPayConfig(), testMode = config.mode === 'sandbox', appUrl = canonicalAppUrl(config.appBaseUrl, testMode);
  if (!appUrl) return Response.json({ error: 'Платіжний сервіс тимчасово недоступний.' }, { status: 503, headers: noStore });
  if (!sameOriginBillingRequest(req, appUrl)) return Response.json({ error: 'Запит оплати має надійти з офіційного сайту Sift.' }, { status: 403, headers: noStore });
  if (!config.merchantAccount || !config.secret) return Response.json({ error: 'WayForPay ще не налаштовано на сервері.' }, { status: 503, headers: noStore });
  if (testMode && !sandboxAllowed(user.email)) return Response.json({ error: 'Sandbox checkout обмежено тестовим списком акаунтів.' }, { status: 403, headers: noStore });
  if (!merchantDomainMatches(config.domain, appUrl)) return Response.json({ error: 'Налаштуйте WAYFORPAY_MERCHANT_DOMAIN відповідно до APP_BASE_URL.' }, { status: 503, headers: noStore });
  const { spaceId } = await params;
  const space = await getSharedSpace(spaceId, user.id);
  if (!space) return Response.json({ error: 'Простір не знайдено.' }, { status: 404, headers: noStore });
  if (space.role !== 'owner') return Response.json({ error: 'Окрему оплату простору може оформити лише власник.' }, { status: 403, headers: noStore });
  let body: { legalConsent?: unknown };
  try { body = await req.json() as typeof body; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  const reference = `space_${crypto.randomUUID().replaceAll('-', '')}`;
  const order = await createSharedSpacePayment({ spaceId, ownerId: user.id, reference, testMode, legalConsent: body.legalConsent });
  if (order.kind === 'consent_required') return Response.json({ error: 'Для оплати прийміть Умови й Політику повернення, підтвердьте ознайомлення з приватністю та негайний початок послуги.' }, { status: 400, headers: noStore });
  if (order.kind === 'missing') return Response.json({ error: 'Простір не знайдено або його закрито.' }, { status: 404, headers: noStore });
  const orderDate = Math.floor(Date.now() / 1000), amount = order.amountUah, productName = ['Спільний простір Sift · 30 днів'];
  const fields = { merchantAccount: config.merchantAccount, merchantDomainName: config.domain, orderReference: reference, orderDate, amount, currency: 'UAH', productName, productCount: [1], productPrice: [amount] };
  const form = {
    ...fields,
    merchantAuthType: 'SimpleSignature', merchantTransactionSecureType: 'AUTO', merchantSignature: purchaseSignature(fields), apiVersion: 1, language: 'UA',
    returnUrl: `${appUrl.origin}/dashboard/space?spacePayment=${encodeURIComponent(reference)}&spaceId=${encodeURIComponent(spaceId)}`,
    serviceUrl: `${appUrl.origin}/api/billing/wayforpay/callback`, orderTimeout: 3600, clientAccountId: user.id,
  };
  return Response.json({ action: 'https://secure.wayforpay.com/pay', fields: form, testMode, price: { uah: amount, termDays: 30, autoRenew: false } }, { headers: noStore });
}
