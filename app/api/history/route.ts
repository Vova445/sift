import {currentUser} from '../../../lib/auth';
import {accessFor,limitHistory,quotaIpKey,quotaOwnerKey,scanHistory} from '../../../lib/db';
import {can} from '../../../lib/entitlements';

export async function GET(req:Request){
 const deviceId=new URL(req.url).searchParams.get('deviceId');
 if(!deviceId)return Response.json({error:'deviceId required'},{status:400});
 const user=await currentUser(req);
 const access=await accessFor(user?.id||null,deviceId,await quotaOwnerKey(req,user?.id||null),await quotaIpKey(req));
 const items:Awaited<ReturnType<typeof scanHistory>>=await scanHistory(deviceId,user?.id||null);
 const visible=await Promise.all(items.map(async item=>await can(user,'full_evidence',{access,translationPlan:item.result.translationPlan})?item:limitHistory([item],'free')[0]));
 return Response.json({items:visible,access});
}
