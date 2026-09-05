import {scanHistory} from '../../../lib/db';import {currentUser} from '../../../lib/auth';
export async function GET(req:Request){const id=new URL(req.url).searchParams.get('deviceId');if(!id)return Response.json({error:'deviceId required'},{status:400});const user=await currentUser(req);return Response.json({items:await scanHistory(id,user?.id||null)})}
