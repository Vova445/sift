type ExportReport={id:string;createdAt?:string;result:{title:string;url:string;score:number;prices?:string[];verdict?:string;findings:Array<unknown>}};
type ExportPlannerItem={scan_id:string;status:string;note:string;review_at?:string|null};
export function buildHistoryCsv(history:ExportReport[],watchlist:ExportPlannerItem[]):string;
