type ExportReport={id:string;result:{title:string;url:string;score:number;prices?:string[];findings:Array<unknown>}};
type ExportPlannerItem={scan_id:string;status:string;note:string;review_at?:string|null};

export function buildHistoryCsv(history:ExportReport[],watchlist:ExportPlannerItem[]){
 const plannerByScan=new Map(watchlist.map(item=>[item.scan_id,item]));
 const fields=['Сайт','URL','Бал ясності','Знайдені ціни','Кількість доказів','Статус Planner','Нотатка','Дата повторної перевірки'];
 const quote=(value:unknown)=>{
  let text=String(value??'');
  if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;
  return`"${text.replaceAll('"','""')}"`;
 };
 const statusNames:Record<string,string>={considering:'Розглядаю',bought:'Куплено',rejected:'Відмовився'};
 const rows=['sep=;',fields.map(quote).join(';'),...history.map(item=>{
  const planner=plannerByScan.get(item.id);
  const status=planner?(statusNames[planner.status]||planner.status):'';
  return[item.result.title,item.result.url,item.result.score,(item.result.prices||[]).join(' | '),item.result.findings.length,status,planner?.note||'',planner?.review_at||''].map(quote).join(';');
 })];
 return`\uFEFF${rows.join('\r\n')}`;
}
