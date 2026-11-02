import {currentUser} from '../../../lib/auth';
import {accessFor,limitHistory,quotaIpKey,scanHistory} from '../../../lib/db';

export async function GET(req:Request){
 const user=await currentUser(req);
 if(!user)return Response.json({error:'Увійдіть в акаунт'},{status:401});
 const deviceId=new URL(req.url).searchParams.get('deviceId')||'';
 const access=await accessFor(user.id,'',undefined,await quotaIpKey(req));
 const history=await scanHistory(deviceId,user.id);
 return Response.json({user,access,history:limitHistory(history,access.plan)});
}
