export function buildHistoryCsv(history,watchlist){
 const plannerByScan=new Map(watchlist.map(item=>[item.scan_id,item]));
 const fields=['Сайт','URL','Дата перевірки','Бал ясності','Вердикт','Знайдені ціни','Кількість доказів','Докази звіту (JSON)','Статус Planner','Нотатка Planner','Дата повторної перевірки'];
 const quote=(value)=>{
  let text=String(value??'');
  if(/^[\u0000-\u0020]*[=+\-@]/.test(text))text=`'${text}`;
  return`"${text.replaceAll('"','""')}"`;
 };
 const statusNames={considering:'Розглядаю',bought:'Куплено',rejected:'Відмовився'};
 const rows=['sep=;',fields.map(quote).join(';'),...history.map(item=>{
  const planner=plannerByScan.get(item.id),status=planner?(statusNames[planner.status]||planner.status):'';
  return[item.result.title,item.result.url,item.createdAt||'',item.result.score,item.result.verdict||'',(item.result.prices||[]).join(' | '),item.result.findings.length,JSON.stringify(item.result.findings),status,planner?.note||'',planner?.review_at||''].map(quote).join(';');
 })];
 return`\uFEFF${rows.join('\r\n')}`;
}
