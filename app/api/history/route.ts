import {scanHistory} from '../../../lib/db';
export async function GET(req:Request){const id=new URL(req.url).searchParams.get('deviceId');if(!id)return Response.json({error:'deviceId required'},{status:400});return Response.json({items:await scanHistory(id)})}
