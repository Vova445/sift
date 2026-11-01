import {endSession,sessionCookie} from '../../../../lib/auth';
export async function POST(req:Request){await endSession(req);return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie('',0)}})}
