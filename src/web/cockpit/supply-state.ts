// Project verified server state; storage and local clicks never establish business facts.
// 只投影服务端已核对状态；本地存储和点击不建立业务事实。
type Goal={cashBudgetCny:number;planVariant?:string;copackAllowed?:boolean};
type Action={id:string;commit_state:string;args:{origin:string;lines:{quantity:number}[]}};
export type SupplyStatus={run?:{goal:Goal;plans:{status:string}[];actions:Action[];obligations:{action_id:string;state:string}[]};reviews?:{kind:string;state:string;selection:{shelf:number;period:string}}[]};
export function projectSupplyState(status:SupplyStatus|null|undefined){
 const run=status?.run;
 const base={networkStage:'draft',networkReceipts:[] as number[],networkPaid:false,networkObserved:false};
 if(!run)return base;
 const receipts:number[]=[];
 for(const [origin,index]of [['own',0],['transfer',1],['copack',2]]as const){
  if(run.actions.some(a=>a.args.origin===origin&&a.commit_state==='committed'&&run.obligations.some(o=>o.action_id===a.id&&o.state==='closed')))receipts.push(index);
 }
 // A separate store review is not a receipt for this supply run. / 独立门店评估不构成本供货任务的回执。
 return {...base,networkStage:run.plans.some(p=>p.status==='approved')?'approved':'draft',networkBudget:run.goal.cashBudgetCny/10000,networkPlan:run.goal.planVariant??'balanced',networkQualified:run.goal.copackAllowed!==false,networkReceipts:receipts};
}
export function sameSupplyGoal(a:Goal,b:Goal){return a.cashBudgetCny===b.cashBudgetCny&&(a.planVariant??'balanced')===(b.planVariant??'balanced')&&(a.copackAllowed!==false)===(b.copackAllowed!==false);}
export function projectSelectedSupplyState(status:SupplyStatus|null|undefined,selected:Goal){
 const run=status?.run,approved=run?.plans.some(p=>p.status==='approved');
 return projectSupplyState(run&&(approved||sameSupplyGoal(run.goal,selected))?status:null);
}
export function supplyQuantities(actions:Action[],obligations:{action_id:string;state:string}[]){
 const accepted=actions.filter(a=>a.commit_state==='committed').reduce((s,a)=>s+a.args.lines.reduce((n,l)=>n+l.quantity,0),0);
 const received=actions.filter(a=>a.commit_state==='committed'&&obligations.some(o=>o.action_id===a.id&&o.state==='closed')).reduce((s,a)=>s+a.args.lines.reduce((n,l)=>n+l.quantity,0),0);
 return {accepted,received};
}
type ExecutionEvent={sequence:number;kind:string;details?:{actionId?:string;state?:string};created_at:string};
export function projectExecutionEvents(events:ExecutionEvent[]){
 const allowed=new Set(['run_created','plan_proposed','plan_approve','action_dispatch_started','action_result_unknown','action_committed','obligation_verified','lease_recovered','run_succeeded']);
 const seen=new Set<string>();
 return events.filter(e=>{if(!allowed.has(e.kind))return false;const key=e.kind+'/'+(e.details?.actionId??'')+'/'+(e.details?.state??'');if(seen.has(key))return false;seen.add(key);return true;});
}
