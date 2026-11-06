import {ImageResponse} from 'next/og';
import {getPublicVerdict} from '../../../../lib/public-verdict';
import {publicVerdictImage} from '../../../../lib/public-verdict-image.js';

export const dynamic='force-dynamic';
export const revalidate=0;

const headers={'Cache-Control':'no-store, max-age=0','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};

export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params,card=await getPublicVerdict(token);
  if(!card)return new Response('Картку відкликано або не знайдено.',{status:404,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
  return new ImageResponse(publicVerdictImage(card),{width:1200,height:630,headers});
}
