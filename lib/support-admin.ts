import {env} from 'cloudflare:workers';
import {currentUser,type AuthUser} from './auth';
import {ensureSupportToolsDb} from './support-tools-db';

const bindings=()=>env as unknown as Record<string,string|undefined>;
export function isSupportAdminEmail(email:string){
  const configured=[bindings().SUPPORT_ADMIN_EMAILS,bindings().ANALYTICS_ADMIN_EMAIL].filter(Boolean).join(',');
  const allowed=new Set(configured.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean));
  return allowed.has(email.trim().toLowerCase());
}

export async function requireSupportAdmin(req:Request):Promise<{user:AuthUser}|{response:Response}>{
  const user=await currentUser(req);
  if(!user)return{response:Response.json({error:'Увійдіть в акаунт.'},{status:401,headers:{'Cache-Control':'no-store'}})};
  if(!user.emailVerified)return{response:Response.json({error:'Підтвердіть email для доступу до support tools.'},{status:403,headers:{'Cache-Control':'no-store'}})};
  if(!isSupportAdminEmail(user.email))return{response:Response.json({error:'Немає доступу.'},{status:403,headers:{'Cache-Control':'no-store'}})};
  await ensureSupportToolsDb();
  return{user};
}

export function supportSameOrigin(req:Request){
  const origin=req.headers.get('origin');
  if(!origin)return false;
  try{return new URL(origin).origin===new URL(req.url).origin}catch{return false}
}
