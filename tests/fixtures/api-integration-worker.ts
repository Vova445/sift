import { POST as signup } from '../../app/api/auth/signup/route';
import { POST as login } from '../../app/api/auth/login/route';
import { POST as logout } from '../../app/api/auth/logout/route';
import { GET as me } from '../../app/api/auth/me/route';
import { POST as verifyEmail } from '../../app/api/auth/verify-email/route';
import { POST as resendVerification } from '../../app/api/auth/email-verification/resend/route';
import { POST as forgotPassword } from '../../app/api/auth/password/forgot/route';
import { POST as resetPassword } from '../../app/api/auth/password/reset/route';
import { POST as changePassword } from '../../app/api/auth/password/change/route';
import { POST as analyze } from '../../app/api/analyze/route';
import { GET as history } from '../../app/api/history/route';
import { POST as checkout } from '../../app/api/billing/wayforpay/checkout/route';
import { POST as wayForPayCallback } from '../../app/api/billing/wayforpay/callback/route';
import { GET as paymentStatus } from '../../app/api/billing/wayforpay/status/route';

const routes: Record<string, (request: Request) => Promise<Response>> = {
  'POST /api/auth/signup': signup,
  'POST /api/auth/login': login,
  'POST /api/auth/logout': logout,
  'GET /api/auth/me': me,
  'POST /api/auth/verify-email': verifyEmail,
  'POST /api/auth/email-verification/resend': resendVerification,
  'POST /api/auth/password/forgot': forgotPassword,
  'POST /api/auth/password/reset': resetPassword,
  'POST /api/auth/password/change': changePassword,
  'POST /api/analyze': analyze,
  'GET /api/history': history,
  'POST /api/billing/wayforpay/checkout': checkout,
  'POST /api/billing/wayforpay/callback': wayForPayCallback,
  'GET /api/billing/wayforpay/status': paymentStatus,
};

const integrationWorker = {
  async fetch(request: Request) {
    const key = `${request.method.toUpperCase()} ${new URL(request.url).pathname}`;
    const handler = routes[key];
    if (!handler) return Response.json({ error: 'Not found' }, { status: 404 });
    return handler(request);
  },
};

export default integrationWorker;
