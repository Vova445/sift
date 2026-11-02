import {analyzeUrl,AnalyzerError} from '../../../lib/analyzer';
import {accessFor,quotaIpKey,quotaOwnerKey,releaseFreeScan,releaseOne,reserveFreeScan,reserveOne,saveScan} from '../../../lib/db';
import {currentUser} from '../../../lib/auth';

export async function POST(req:Request){
 let ownerKey:string|null=null;
 let freeReservation:Awaited<ReturnType<typeof reserveFreeScan>>=null;
 let oneReservation:string|null=null;
 try{
  const body=await req.json() as {url?:unknown;deviceId?:unknown};
  if(typeof body.url!=='string'||typeof body.deviceId!=='string'||!body.url||!body.deviceId)return Response.json({error:'Вкажіть посилання та deviceId'},{status:400});
  if(body.url.length>2048||body.deviceId.length>100)return Response.json({error:'Некоректні вхідні дані'},{status:400});
  const user=await currentUser(req);
  ownerKey=await quotaOwnerKey(req,user?.id||null);
  const ipKey=await quotaIpKey(req);
  const access=await accessFor(user?.id||null,body.deviceId,ownerKey,ipKey);
  if(access.plan==='free'){
   freeReservation=await reserveFreeScan(ownerKey,user?.id||null,body.deviceId,ipKey);
   if(!freeReservation)return Response.json({error:'Безкоштовний ліміт — 3 перевірки на місяць. Оберіть One Sift або Pro.'},{status:402});
  }else if(access.plan==='one'){
   oneReservation=await reserveOne(user!.id);
   if(!oneReservation)return Response.json({error:'One Sift уже використано. Активуйте ще один або перейдіть на Pro.'},{status:402});
  }
  const result=await analyzeUrl(body.url);
  const translationPlan=user&&(access.plan==='one'||access.plan==='pro')?access.plan:null;
  const id=await saveScan(body.deviceId,user?.id||null,result,translationPlan);
  freeReservation=null;
  oneReservation=null;
  const visible=access.plan==='free'?{...result,findings:result.findings.slice(0,2).map(x=>({...x,evidence:'Повний доказ доступний у One Sift або Pro'})),lockedCount:Math.max(0,result.findings.length-2)}:result;
  return Response.json({id,translationPlan,...visible,access:await accessFor(user?.id||null,body.deviceId,ownerKey,ipKey)});
 }catch(e){
  if(freeReservation){try{await releaseFreeScan(freeReservation)}catch{}}
  if(oneReservation){try{await releaseOne(oneReservation)}catch{}}
  return Response.json({error:e instanceof Error?e.message:'Не вдалося перевірити сторінку'},{status:e instanceof AnalyzerError?e.status:422});
 }
}
