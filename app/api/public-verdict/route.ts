import {env} from 'cloudflare:workers';
import {currentUser} from '../../../lib/auth';
import {activePublicVerdictForUser,createPublicVerdictForUser,publicVerdictOrigin,revokePublicVerdictForUser} from '../../../lib/public-verdict';

const noStore={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function sameOrigin(req:Request){
  const origin=req.headers.get('origin');
  if(!origin)return false;
  try{return new URL(origin).origin===publicVerdictOrigin()}catch{return false}
}
function validScanId(value:unknown):value is string{return typeof value==='string'&&value.length>=8&&value.length<=80&&/^[A-Za-z0-9_-]+$/.test(value)}
async function ownedScan(userId:string,scanId:string){
  return await env.DB.prepare(`SELECT id FROM scans WHERE id=? AND user_id=?`).bind(scanId,userId).first<{id:string}>();
}
function shareUrl(token:string){return `${publicVerdictOrigin()}/share/${encodeURIComponent(token)}`}

export async function GET(req:Request){
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть в акаунт, щоб керувати публічною карткою.'},{status:401,headers:noStore});
  const scanId=new URL(req.url).searchParams.get('scanId');
  if(!validScanId(scanId))return Response.json({error:'Вкажіть коректний звіт.'},{status:400,headers:noStore});
  if(!await ownedScan(user.id,scanId))return Response.json({error:'Звіт не знайдено.'},{status:404,headers:noStore});
  const share=await activePublicVerdictForUser(user.id,scanId);
  return Response.json({share:share?{url:shareUrl(share.token),createdAt:share.created_at}:null},{headers:noStore});
}

export async function POST(req:Request){
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть в акаунт, щоб створити картку.'},{status:401,headers:noStore});
  if(!user.emailVerified)return Response.json({error:'Підтвердіть email, щоб оприлюднювати картку.'},{status:403,headers:noStore});
  if(!sameOrigin(req))return Response.json({error:'Запит відхилено. Оновіть сторінку та спробуйте ще раз.'},{status:403,headers:noStore});
  let body:{scanId?:unknown};
  try{body=await req.json() as {scanId?:unknown}}catch{return Response.json({error:'Некоректний запит.'},{status:400,headers:noStore})}
  if(!validScanId(body.scanId))return Response.json({error:'Вкажіть коректний звіт.'},{status:400,headers:noStore});
  try{
    const share=await createPublicVerdictForUser(user.id,body.scanId);
    if(!share)return Response.json({error:'Цей звіт недоступний для публікації.'},{status:404,headers:noStore});
    return Response.json({share:{url:shareUrl(share.token),createdAt:share.created_at,score:share.score,decision:share.decision}},{status:201,headers:noStore});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Не вдалося створити картку.'},{status:503,headers:noStore})}
}

export async function DELETE(req:Request){
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть в акаунт, щоб відкликати посилання.'},{status:401,headers:noStore});
  if(!sameOrigin(req))return Response.json({error:'Запит відхилено. Оновіть сторінку та спробуйте ще раз.'},{status:403,headers:noStore});
  let body:{scanId?:unknown};
  try{body=await req.json() as {scanId?:unknown}}catch{return Response.json({error:'Некоректний запит.'},{status:400,headers:noStore})}
  if(!validScanId(body.scanId))return Response.json({error:'Вкажіть коректний звіт.'},{status:400,headers:noStore});
  if(!await ownedScan(user.id,body.scanId))return Response.json({error:'Звіт не знайдено.'},{status:404,headers:noStore});
  const revoked=await revokePublicVerdictForUser(user.id,body.scanId);
  return Response.json({ok:true,revoked},{headers:noStore});
}
