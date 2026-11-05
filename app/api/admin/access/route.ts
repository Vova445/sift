import {currentUser} from '../../../../lib/auth';
import {isSupportAdminEmail} from '../../../../lib/support-admin';

const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export async function GET(req:Request){
  const user=await currentUser(req);
  // The navigation reflects the explicit admin allowlist. Sensitive admin APIs
  // still require a verified email via requireSupportAdmin().
  const isAdmin=Boolean(user&&isSupportAdminEmail(user.email));
  return Response.json({isAdmin},{headers});
}
