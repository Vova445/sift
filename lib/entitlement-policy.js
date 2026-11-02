export function featureAllowed(access,feature,translationPlan=null){
  switch(feature){
    case 'full_evidence': return access.plan==='pro'||(access.plan==='one'&&translationPlan==='one');
    case 'translate': return access.plan==='pro'||(access.plan==='one'&&translationPlan==='one');
    case 'purchase_planner':
    case 'export_history':
    case 'unlimited_scans': return access.plan==='pro';
    default: return false;
  }
}

export function featureDeniedResponse(allowed,message='Ця можливість недоступна у вашому тарифі.'){
  return allowed?null:Response.json({error:message},{status:403});
}
