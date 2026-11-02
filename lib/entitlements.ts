import {accessFor} from './db';
import {featureAllowed,featureDeniedResponse,type EntitlementFeature,type EntitlementAccess} from './entitlement-policy.js';
export type {EntitlementFeature} from './entitlement-policy.js';
export type EntitlementUser = {id:string;emailVerified?:boolean}|null;

/** Resolve access from D1 by default; routes may pass their already verified access snapshot. */
export async function can(user:EntitlementUser,feature:EntitlementFeature,options:{access?:EntitlementAccess;translationPlan?:string|null}={}){
  if(!user?.emailVerified)return false;
  const access=options.access||await accessFor(user.id);
  return featureAllowed(access,feature,options.translationPlan);
}

export async function guardFeature(user:EntitlementUser,feature:EntitlementFeature,options:{access?:EntitlementAccess;translationPlan?:string|null;message?:string}={}){
  return featureDeniedResponse(await can(user,feature,options),options.message);
}
