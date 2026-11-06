import {currentUser} from '../../../../lib/auth';
import {deleteDomainIndexContributions,domainIndexConsentForUser,setDomainIndexConsent} from '../../../../lib/domain-index';

const noStore={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function sameOrigin(req:Request){const origin=req.headers.get('origin');if(!origin)return false;try{return new URL(origin).origin===new URL(req.url).origin}catch{return false}}

export async function GET(req:Request){
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть до акаунта, щоб керувати участю в індексі.'},{status:401,headers:noStore});
  const consent=await domainIndexConsentForUser(user.id);
  return Response.json(consent,{headers:noStore});
}

export async function POST(req:Request){
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть до акаунта, щоб керувати участю в індексі.'},{status:401,headers:noStore});
  if(!sameOrigin(req))return Response.json({error:'Запит має надійти з цього сайту.'},{status:403,headers:noStore});
  let body:{enabled?:unknown;action?:unknown};try{body=await req.json() as {enabled?:unknown;action?:unknown}}catch{return Response.json({error:'Некоректний запит.'},{status:400,headers:noStore})}
  if(body.action==='delete_contributions'){
    try{
      const removedContributions=await deleteDomainIndexContributions(user.id);
      return Response.json({...await domainIndexConsentForUser(user.id),removedContributions},{headers:noStore});
    }catch{return Response.json({error:'Не вдалося видалити внески. Спробуйте пізніше.'},{status:503,headers:noStore})}
  }
  if(typeof body.enabled!=='boolean')return Response.json({error:'Вкажіть, чи дозволяєте використовувати знеособлені підсумки.'},{status:400,headers:noStore});
  if(body.enabled&&!user.emailVerified)return Response.json({error:'Підтвердіть email перед участю в індексі.'},{status:403,headers:noStore});
  try{return Response.json(await setDomainIndexConsent(user.id,body.enabled),{headers:noStore})}
  catch{return Response.json({error:'Не вдалося оновити згоду. Спробуйте пізніше.'},{status:503,headers:noStore})}
}
