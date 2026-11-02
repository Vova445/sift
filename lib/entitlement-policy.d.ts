export type EntitlementFeature = 'full_evidence' | 'translate' | 'purchase_planner' | 'export_history' | 'unlimited_scans';
export type EntitlementAccess = {plan:string;credits?:number};
export function featureAllowed(access:EntitlementAccess,feature:EntitlementFeature,translationPlan?:string|null):boolean;
export function featureDeniedResponse(allowed:boolean,message?:string):Response|null;
