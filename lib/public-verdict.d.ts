export type PublicVerdictDecision = 'buy'|'wait'|'close';
export type PublicVerdictCard = {score:number;decision:PublicVerdictDecision};
export function isPublicVerdictToken(token:unknown):boolean;
export function publicVerdictCard(value:unknown):PublicVerdictCard|null;
export function publicVerdictLabel(decision:PublicVerdictDecision,language?:'uk'|'en'):string;
