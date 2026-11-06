import { POST as signup } from '../../app/api/auth/signup/route';
import { POST as login } from '../../app/api/auth/login/route';
import { POST as passwordChallenge } from '../../app/api/auth/password/challenge/route';
import { POST as logout } from '../../app/api/auth/logout/route';
import { GET as me } from '../../app/api/auth/me/route';
import { POST as verifyEmail } from '../../app/api/auth/verify-email/route';
import { POST as resendVerification } from '../../app/api/auth/email-verification/resend/route';
import { POST as forgotPassword } from '../../app/api/auth/password/forgot/route';
import { POST as resetPassword } from '../../app/api/auth/password/reset/route';
import { POST as changePassword } from '../../app/api/auth/password/change/route';
import { POST as analyze } from '../../app/api/analyze/route';
import { POST as translate } from '../../app/api/translate/route';
import { POST as cancelSubscription } from '../../app/api/billing/subscription/cancel/route';
import { POST as darkPatternAnalyze } from '../../app/api/dark-patterns/route';
import { GET as history } from '../../app/api/history/route';
import { GET as savings, POST as savingsCreate, PUT as savingsUpdate, DELETE as savingsDelete } from '../../app/api/savings/route';
import { GET as savingsExport } from '../../app/api/savings/export/route';
import { GET as health } from '../../app/health/route';
import { POST as checkout } from '../../app/api/billing/wayforpay/checkout/route';
import { POST as wayForPayCallback } from '../../app/api/billing/wayforpay/callback/route';
import { GET as paymentStatus } from '../../app/api/billing/wayforpay/status/route';
import { POST as analyticsEvent } from '../../app/api/analytics/event/route';
import { GET as analyticsFunnel } from '../../app/api/analytics/funnel/route';
import { GET as achievementAnalytics, POST as achievementAnalyticsUpdate } from '../../app/api/analytics/achievements/route';
import { POST as privacyRetention } from '../../app/api/internal/privacy-retention/route';
import { GET as account } from '../../app/api/account/route';
import { GET as achievements } from '../../app/api/achievements/route';
import { GET as rewards } from '../../app/api/rewards/route';
import { POST as cancellationKitAchievement } from '../../app/api/achievements/cancellation-kit/route';
import { GET as referralLink } from '../../app/api/referral/route';
import { GET as supportGet, POST as supportPost } from '../../app/api/admin/support/route';
import { POST as supportRefund } from '../../app/api/admin/support/refund/route';
import { POST as emailReminders } from '../../app/api/internal/email-reminders/route';
import { GET as emailReminderUnsubscribe, POST as emailReminderUnsubscribePost } from '../../app/api/email-reminders/unsubscribe/route';
import { GET as tosMonitoringGet, POST as tosMonitoringPost } from '../../app/api/tos-monitoring/route';
import { POST as tosMonitoringCron } from '../../app/api/internal/tos-monitoring/route';
import { GET as watchlistGet, POST as watchlistPost, DELETE as watchlistDelete } from '../../app/api/watchlist/route';
import { GET as publicVerdictManageGet, POST as publicVerdictCreate, DELETE as publicVerdictRevoke } from '../../app/api/public-verdict/route';
import { GET as publicVerdictRead } from '../../app/api/public-verdict/[token]/route';
import { GET as subscriptionRadarGet, POST as subscriptionRadarPost, DELETE as subscriptionRadarDelete } from '../../app/api/subscription-radar/route';
import { POST as subscriptionRadarCron } from '../../app/api/internal/subscription-radar/route';
import { processSubscriptionRadarEmail, processSubscriptionRadarReminders } from '../../lib/subscription-radar';
import { GET as domainIndexList } from '../../app/api/domain-index/route';
import { GET as domainIndexProfile } from '../../app/api/domain-index/[domain]/route';
import { GET as domainConsentGet, POST as domainConsentPost } from '../../app/api/domain-index/consent/route';
import { POST as domainCorrectionPost } from '../../app/api/domain-index/corrections/route';
import { GET as domainCorrectionAdminGet, POST as domainCorrectionAdminPost } from '../../app/api/admin/domain-corrections/route';
import { GET as spacesGet, POST as spacesPost } from '../../app/api/spaces/route';
import { GET as spaceGet, PATCH as spacePatch } from '../../app/api/spaces/[spaceId]/route';
import { POST as acceptSpaceInvite } from '../../app/api/spaces/invites/accept/route';
import { POST as createSpaceInvite, DELETE as revokeSpaceInvite } from '../../app/api/spaces/[spaceId]/invites/route';
import { GET as spaceItemsGet, POST as spaceItemsPost, PUT as spaceItemsPut, DELETE as spaceItemsDelete } from '../../app/api/spaces/[spaceId]/items/route';
import { POST as spaceCheckout } from '../../app/api/spaces/[spaceId]/checkout/route';
import { GET as spaceBillingStatus } from '../../app/api/spaces/[spaceId]/billing/route';
import { GET as developerKeysGet, POST as developerKeysPost, DELETE as developerKeysDelete } from '../../app/api/developer/keys/route';
import { GET as telegramLinkGet, POST as telegramLinkPost, DELETE as telegramLinkDelete } from '../../app/api/telegram/link/route';
import { POST as telegramWebhook } from '../../app/api/telegram/webhook/route';
import { POST as publicApiAnalyze } from '../../app/api/v1/analyze/route';
import { GET as openApiDocument } from '../../app/api/v1/openapi.json/route';

const routes: Record<string, (request: Request) => Promise<Response>> = {
  'POST /api/auth/signup': signup,
  'POST /api/auth/login': login,
  'POST /api/auth/password/challenge': passwordChallenge,
  'POST /api/auth/logout': logout,
  'GET /api/auth/me': me,
  'POST /api/auth/verify-email': verifyEmail,
  'POST /api/auth/email-verification/resend': resendVerification,
  'POST /api/auth/password/forgot': forgotPassword,
  'POST /api/auth/password/reset': resetPassword,
  'POST /api/auth/password/change': changePassword,
  'POST /api/analyze': analyze,
  'POST /api/translate': translate,
  'POST /api/billing/subscription/cancel': cancelSubscription,
  'POST /api/dark-patterns': darkPatternAnalyze,
  'GET /api/history': history,
  'GET /api/savings': savings,
  'POST /api/savings': savingsCreate,
  'PUT /api/savings': savingsUpdate,
  'DELETE /api/savings': savingsDelete,
  'GET /api/savings/export': savingsExport,
  'GET /health': health,
  'POST /api/billing/wayforpay/checkout': checkout,
  'POST /api/billing/wayforpay/callback': wayForPayCallback,
  'GET /api/billing/wayforpay/status': paymentStatus,
  'POST /api/analytics/event': analyticsEvent,
  'GET /api/analytics/funnel': analyticsFunnel,
  'GET /api/analytics/achievements': achievementAnalytics,
  'POST /api/analytics/achievements': achievementAnalyticsUpdate,
  'POST /api/internal/privacy-retention': privacyRetention,
  'GET /api/account': account,
  'GET /api/achievements': achievements,
  'GET /api/rewards': rewards,
  'GET /api/referral': referralLink,
  'POST /api/achievements/cancellation-kit': cancellationKitAchievement,
  'GET /api/admin/support': supportGet,
  'POST /api/admin/support': supportPost,
  'POST /api/admin/support/refund': supportRefund,
  'POST /api/internal/email-reminders': emailReminders,
  'GET /api/email-reminders/unsubscribe': emailReminderUnsubscribe,
  'POST /api/email-reminders/unsubscribe': emailReminderUnsubscribePost,
  'GET /api/tos-monitoring': tosMonitoringGet,
  'POST /api/tos-monitoring': tosMonitoringPost,
  'POST /api/internal/tos-monitoring': tosMonitoringCron,
  'GET /api/watchlist': watchlistGet,
  'POST /api/watchlist': watchlistPost,
  'DELETE /api/watchlist': watchlistDelete,
  'GET /api/public-verdict': publicVerdictManageGet,
  'POST /api/public-verdict': publicVerdictCreate,
  'DELETE /api/public-verdict': publicVerdictRevoke,
  'GET /api/subscription-radar': subscriptionRadarGet as unknown as (request:Request)=>Promise<Response>,
  'POST /api/subscription-radar': subscriptionRadarPost as unknown as (request:Request)=>Promise<Response>,
  'DELETE /api/subscription-radar': subscriptionRadarDelete as unknown as (request:Request)=>Promise<Response>,
  'GET /api/domain-index': domainIndexList,
  'GET /api/domain-index/consent': domainConsentGet,
  'POST /api/domain-index/consent': domainConsentPost,
  'POST /api/domain-index/corrections': domainCorrectionPost,
  'GET /api/admin/domain-corrections': domainCorrectionAdminGet,
  'POST /api/admin/domain-corrections': domainCorrectionAdminPost,
  'POST /api/internal/subscription-radar': subscriptionRadarCron,
  'GET /api/spaces': spacesGet,
  'POST /api/spaces': spacesPost,
  'GET /api/developer/keys': developerKeysGet,
  'POST /api/developer/keys': developerKeysPost,
  'DELETE /api/developer/keys': developerKeysDelete,
  'GET /api/telegram/link': telegramLinkGet,
  'POST /api/telegram/link': telegramLinkPost,
  'DELETE /api/telegram/link': telegramLinkDelete,
  'POST /api/telegram/webhook': telegramWebhook,
  'POST /api/v1/analyze': publicApiAnalyze,
  'GET /api/v1/openapi.json': openApiDocument,
};

const integrationWorker = {
  async fetch(request: Request) {
    const pathname=new URL(request.url).pathname;
    if(request.method==='POST'&&pathname==='/__test/subscription-radar/email'){
      let body:Record<string,unknown>;try{body=await request.json() as Record<string,unknown>}catch{return Response.json({error:'bad test JSON'},{status:400})}
      if(typeof body.raw!=='string'||typeof body.recipient!=='string'||typeof body.authenticationResults!=='string')return Response.json({error:'bad test message'},{status:400});
      const result=await processSubscriptionRadarEmail({raw:body.raw,recipient:body.recipient,authenticationResults:body.authenticationResults,aiRun:async()=>({response:JSON.stringify(body.mockResult||{})})});
      return Response.json(result);
    }
    if(request.method==='POST'&&pathname==='/__test/subscription-radar/reminders'){
      let body:Record<string,unknown>;try{body=await request.json() as Record<string,unknown>}catch{return Response.json({error:'bad test JSON'},{status:400})}
      const now=typeof body.now==='string'?new Date(body.now):new Date();
      return Response.json(await processSubscriptionRadarReminders(now));
    }
    const tokenMatch=pathname.match(/^\/api\/public-verdict\/([^/]+)$/);
    if(request.method==='GET'&&tokenMatch)return publicVerdictRead(request,{params:Promise.resolve({token:decodeURIComponent(tokenMatch[1])})});
    const domainMatch=pathname.match(/^\/api\/domain-index\/([^/]+)$/);
    if(request.method==='GET'&&domainMatch&&domainMatch[1]!=='consent')return domainIndexProfile(request,{params:Promise.resolve({domain:decodeURIComponent(domainMatch[1])})});
    const acceptInviteMatch=pathname.match(/^\/api\/spaces\/invites\/accept$/);
    if(request.method==='POST'&&acceptInviteMatch)return acceptSpaceInvite(request);
    const spaceRouteMatch=pathname.match(/^\/api\/spaces\/([^/]+)$/);
    if(spaceRouteMatch){const context={params:Promise.resolve({spaceId:decodeURIComponent(spaceRouteMatch[1])})};if(request.method==='GET')return spaceGet(request,context);if(request.method==='PATCH')return spacePatch(request,context)}
    const spaceSubrouteMatch=pathname.match(/^\/api\/spaces\/([^/]+)\/(items|invites|checkout|billing)$/);
    if(spaceSubrouteMatch){const context={params:Promise.resolve({spaceId:decodeURIComponent(spaceSubrouteMatch[1])})},subroute=spaceSubrouteMatch[2];if(subroute==='items'){if(request.method==='GET')return spaceItemsGet(request,context);if(request.method==='POST')return spaceItemsPost(request,context);if(request.method==='PUT')return spaceItemsPut(request,context);if(request.method==='DELETE')return spaceItemsDelete(request,context)}if(subroute==='invites'){if(request.method==='POST')return createSpaceInvite(request,context);if(request.method==='DELETE')return revokeSpaceInvite(request,context)}if(subroute==='checkout'&&request.method==='POST')return spaceCheckout(request,context);if(subroute==='billing'&&request.method==='GET')return spaceBillingStatus(request,context)}
    const key = `${request.method.toUpperCase()} ${pathname}`;
    const handler = routes[key];
    if (!handler) return Response.json({ error: 'Not found' }, { status: 404 });
    return handler(request);
  },
};

export default integrationWorker;
