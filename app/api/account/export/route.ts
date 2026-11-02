import {currentUser} from '../../../../lib/auth';
import {accountExport} from '../../../../lib/account-export';

export async function GET(req:Request){
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть в акаунт, щоб експортувати свої дані.'},{status:401});
  try{
    const data=await accountExport(user.id),format=new URL(req.url).searchParams.get('format');
    if(format==='csv')return new Response(data.csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="sift-account-export.csv"','Cache-Control':'no-store, private'}});
    if(format==='json'||!format)return new Response(JSON.stringify(data.json,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="sift-account-export.json"','Cache-Control':'no-store, private'}});
    return Response.json({error:'Оберіть формат JSON або CSV.'},{status:400});
  }catch{return Response.json({error:'Не вдалося сформувати експорт. Спробуйте ще раз.'},{status:500})}
}
