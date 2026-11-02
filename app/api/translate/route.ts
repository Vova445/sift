import {env} from 'cloudflare:workers';
import {currentUser} from '../../../lib/auth';
import {accessFor,getCachedTranslation,releaseTranslation,reserveTranslation,saveCachedTranslation,scanFindingForTranslation} from '../../../lib/db';

const hashText=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');

export async function POST(req:Request){
 let reservedDay:string|null=null;
 let userId:string|null=null;
 try{
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть для перекладу'},{status:401});
  userId=user.id;
  let body:{scanId?:unknown;findingIndex?:unknown};
  try{body=await req.json() as {scanId?:unknown;findingIndex?:unknown}}catch{return Response.json({error:'Некоректний запит'},{status:400})}
  if(typeof body.scanId!=='string'||body.scanId.length>100||!Number.isInteger(body.findingIndex)||Number(body.findingIndex)<0||Number(body.findingIndex)>99)return Response.json({error:'Вкажіть збережений звіт і доказ для перекладу'},{status:400});
  const access=await accessFor(user.id);
  if(access.plan==='free')return Response.json({error:'Переклад доступний у One Sift і Pro'},{status:403});
  const finding=await scanFindingForTranslation(body.scanId,user.id,Number(body.findingIndex));
  if(!finding)return Response.json({error:'Доказ не знайдений у ваших збережених звітах'},{status:404});
  if(access.plan==='one'&&finding.translationPlan!=='one')return Response.json({error:'One Sift перекладає докази лише у звіті, відкритому цим тарифом. Pro перекладає всю вашу історію.'},{status:403});
  const sourceHash=await hashText(`english\0ukrainian\0${finding.evidence}`);
  const cached=await getCachedTranslation(sourceHash);
  if(cached)return Response.json({translation:cached,cached:true});
  reservedDay=await reserveTranslation(user.id,300);
  if(!reservedDay)return Response.json({error:'Досягнуто денний ліміт перекладів. Спробуйте завтра.'},{status:429});
  const out=await env.AI.run('@cf/meta/m2m100-1.2b',{text:finding.evidence,source_lang:'english',target_lang:'ukrainian'}) as {translated_text?:unknown};
  const translation=typeof out?.translated_text==='string'?out.translated_text.trim():'';
  if(!translation)throw new Error('AI повернув порожній переклад');
  await saveCachedTranslation(sourceHash,translation);
  reservedDay=null;
  return Response.json({translation,cached:false});
 }catch{
  if(reservedDay&&userId){try{await releaseTranslation(userId,reservedDay)}catch{}}
  return Response.json({error:'AI-переклад тимчасово недоступний. Оригінальний доказ і звіт збережені — спробуйте ще раз.'},{status:503});
 }
}
