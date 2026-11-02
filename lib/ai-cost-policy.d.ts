export function estimateTokens(text:string):number;
export function canReserveDailyAi(state:{requests:number;actualTokens:number;reservedTokens:number},estimatedTokens:number,requestLimit:number,tokenLimit:number):boolean;
export function estimateCostMicros(inputTokens:number,outputTokens:number,usdPerMillion?:number):number;
export function translationHash(text:string,model?:string,source?:string,target?:string):Promise<string>;
