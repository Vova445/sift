const encoder=new TextEncoder();

export function estimateTokens(text){return Math.max(1,Math.ceil(String(text).length/3));}
export function canReserveDailyAi(state,estimatedTokens,requestLimit,tokenLimit){
  return estimatedTokens>0&&state.requests<requestLimit&&state.actualTokens+state.reservedTokens+estimatedTokens<=tokenLimit;
}
export function estimateCostMicros(inputTokens,outputTokens,usdPerMillion=0.342){
  return Math.max(0,Math.round((inputTokens+outputTokens)*usdPerMillion));
}
export async function translationHash(text,model='@cf/meta/m2m100-1.2b',source='english',target='ukrainian'){
  const normalized=String(text).normalize('NFKC').replace(/\s+/g,' ').trim();
  const material=`${model}\0${source}\0${target}\0${normalized}`;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(material)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
