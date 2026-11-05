export function isPaidPlan(value){return value==='one'||value==='pro';}

export function planDetails(plan){
  if(plan==='one')return{label:'One Sift — full report',uah:59,usd:'1.49',credits:1,days:90};
  if(plan==='pro')return{label:'Sift Pro — monthly subscription',uah:279,usd:'6.90',credits:0,days:30};
  throw new Error('Unknown paid plan');
}
