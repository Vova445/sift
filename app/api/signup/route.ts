import {saveSignup} from '../../../lib/db';
export async function POST(req:Request){try{const{email}=await req.json() as {email?:string};if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:'Введіть коректний email'},{status:400});await saveSignup(email);return Response.json({ok:true})}catch{return Response.json({error:'Не вдалося зберегти email'},{status:500})}}
