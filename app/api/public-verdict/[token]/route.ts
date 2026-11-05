import {getPublicVerdict} from '../../../../lib/public-verdict';

const privateHeaders={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params,card=await getPublicVerdict(token);
  if(!card)return Response.json({error:'Картку відкликано або не знайдено.'},{status:404,headers:privateHeaders});
  return Response.json(card,{headers:privateHeaders});
}
