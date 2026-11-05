export const DARK_PATTERN_CATEGORIES: Readonly<Record<string, string>>;
export const MAX_SCREENSHOT_BYTES: number;
export const MAX_SCREENSHOT_PIXELS: number;
export const DARK_PATTERN_MODEL: string;
export function inspectScreenshot(bytes: Uint8Array, declaredType?: string): {ok:false;reason:string}|{ok:true;mime:string;width:number;height:number};
export function darkPatternDailyLimit(plan: string): number;
export function parseDarkPatternFindings(value: unknown): null|Array<{id:string;category:string;label:string;confidence:number;confidenceLevel:'high'|'medium'|'low';evidence:string;explanation:string;bbox:{x:number;y:number;width:number;height:number}}>
export function sanitizeDarkPatternFindings(findings: unknown[]): Array<{id:string;category:string;label:string;confidence:number;confidenceLevel:'high'|'medium'|'low';evidence:string;explanation:string;bbox:{x:number;y:number;width:number;height:number}}>
export function serializeImageForModel(bytes: Uint8Array): string;
