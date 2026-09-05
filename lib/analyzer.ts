export type Finding={kind:'renewal'|'refund'|'cancellation'|'trial'|'price'|'warning';title:string;summary:string;evidence:string;severity:'good'|'medium'|'high'};

const privateHost=(host:string)=>host==='localhost'||host==='::1'||host.endsWith('.local')||/^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||/^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
export function safeUrl(raw:string){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||privateHost(u.hostname))throw new Error('Дозволені лише публічні HTTP(S) адреси');return u}
const clean=(html:string)=>html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
const evidence=(text:string,re:RegExp)=>{const m=re.exec(text);if(!m)return'';const start=Math.max(0,m.index-85),end=Math.min(text.length,m.index+m[0].length+120);return `…${text.slice(start,end).trim()}…`};
export async function analyzeUrl(raw:string){let current=safeUrl(raw);let response:Response|undefined;for(let i=0;i<4;i++){response=await fetch(current,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (compatible; SiftPreflight/1.0)','accept':'text/html,application/xhtml+xml'}});if(response.status>=300&&response.status<400){const loc=response.headers.get('location');if(!loc)break;current=safeUrl(new URL(loc,current).toString());continue}break}if(!response||!response.ok)throw new Error(`Сторінка відповіла кодом ${response?.status||'unknown'}`);const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))throw new Error('Зараз підтримуються вебсторінки HTML');const html=(await response.text()).slice(0,1_500_000);const text=clean(html);if(text.length<80)throw new Error('На сторінці недостатньо доступного тексту для перевірки');
 const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||current.hostname).replace(/<[^>]+>/g,' ').trim();const findings:Finding[]=[];
 const rules:[Finding['kind'],string,RegExp,Finding['severity']][]=[
 ['trial','Пробний період',/(?:free|безкоштовн\w*)\s+(?:trial|період)|(?:trial|пробн\w* період)\s+(?:for\s+)?\d+\s*(?:day|дн)/i,'medium'],
 ['renewal','Автоматичне продовження',/auto(?:matically)?[- ]?renew\w*|автоматичн\w+\s+(?:продовжен|поновлен)|recurring\s+(?:billing|payment)/i,'high'],
 ['refund','Умови повернення',/(?:refund|money.back|повернен\w+).{0,80}(?:\d+\s*(?:day|дн)|policy|політик)/i,'good'],
 ['cancellation','Умови скасування',/(?:cancel|скасув\w+).{0,100}(?:subscription|membership|підписк|plan|план)/i,'medium'],
 ['warning','Неповоротна оплата',/non[- ]?refundable|no refunds?|не підлягає поверненню|кошти не повертаються/i,'high']];
 for(const[kind,label,re,severity]of rules){const ev=evidence(text,re);if(ev)findings.push({kind,title:label,summary:severity==='high'?'Потребує уваги до оплати':severity==='good'?'Умову знайдено на сторінці':'Перевірте деталі перед оплатою',evidence:ev,severity})}
 const prices=[...text.matchAll(/(?:[$€£₴]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:USD|EUR|UAH|грн))/gi)].slice(0,8).map(x=>x[0]);
 const score=Math.max(18,Math.min(96,72+(findings.some(x=>x.kind==='refund')?10:0)-(findings.filter(x=>x.severity==='high').length*15)-(findings.some(x=>x.kind==='cancellation')?5:0)));
 return{url:current.toString(),host:current.hostname,title:title.slice(0,140),checkedAt:new Date().toISOString(),score,prices:[...new Set(prices)],findings,wordCount:text.split(' ').length,verdict:score>=80?'Умови виглядають достатньо прозорими.':score>=55?'Купувати можна лише після перевірки позначених умов.':'Високий ризик: не оплачуйте, доки не уточните критичні умови.'};
}
