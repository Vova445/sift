import {env} from 'cloudflare:workers';
import {verifyTurnstileToken} from './turnstile-policy.js';

type Environment=Record<string,string|undefined>;
const vars=()=>env as unknown as Environment;
export function turnstilePublicConfig(){const config=vars(),configured=Boolean(config.TURNSTILE_SITE_KEY&&config.TURNSTILE_SECRET_KEY);return{siteKey:configured?config.TURNSTILE_SITE_KEY||'':''}}
export async function verifyRequestTurnstile(request:Request,token:unknown,action:'signup'|'password_reset'){
  const config=vars(),secret=config.TURNSTILE_SECRET_KEY||'';
  const result=await verifyTurnstileToken({secret,token,expectedAction:action,expectedHostname:new URL(request.url).hostname,remoteIp:request.headers.get('cf-connecting-ip')||undefined});
  if(result.ok)return{ok:true as const};
  if(result.kind==='unconfigured'||result.kind==='unavailable')return{ok:false as const,status:503,retryAfter:30,message:result.kind==='unconfigured'?'Антибот-перевірка тимчасово не налаштована. Спробуйте пізніше.':'Не вдалося перевірити антибот-токен. Спробуйте ще раз.'};
  return{ok:false as const,status:403,retryAfter:0,message:'Підтвердіть антибот-перевірку й надішліть форму ще раз.'};
}
