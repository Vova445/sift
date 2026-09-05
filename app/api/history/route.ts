import {currentUser} from '../../../lib/auth';
import {accessFor,limitHistory,scanHistory} from '../../../lib/db';

export async function GET(req:Request){
 const deviceId=new URL(req.url).searchParams.get('deviceId');
 if(!deviceId)return Response.json({error:'deviceId required'},{status:400});
 const user=await currentUser(req);
 const access=await accessFor(user?.id||null,deviceId);
 const items=await scanHistory(deviceId,user?.id||null);
 return Response.json({items:limitHistory(items,access.plan)});
}
