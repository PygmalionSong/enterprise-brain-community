// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Candidate evaluation, not a global optimizer or measured forecast improvement.
// 已知候选复核，不冒称全局优化或实测预测提升。
import {hash,commandSchema,type SourceSnapshot,type Goal,type Command} from './contracts.ts';
export interface Candidate {feasibility:'feasible'|'infeasible'|'unverified';reason:string|null;commands:Command[];cashCny:number;incrementalCostCny:number;coverageCases:number;goalCases:number;snapshot:SourceSnapshot;finance:{version:number;availableCashCny:number};evidenceHash:string;constraintHash:string;}
export function evaluateCandidate(goal:Goal,snapshot:SourceSnapshot,finance:{version:number;availableCashCny:number},scenario:any):Candidate {
 const keys=snapshot.resources.map(r=>r.origin+'/'+r.sku),ambiguous=new Set(keys).size!==keys.length;
 const commands:Command[]=[];let cashCny=0,incrementalCostCny=0,coverageCases=0,goalCases=0;let feasibility:Candidate['feasibility']='feasible',reason:string|null=null;
 for(const sku of scenario.skus)goalCases+=(sku.south.demand-sku.south.supply)*10000;
 for(const origin of ['own','transfer','copack'] as const){const rows=snapshot.resources.filter(r=>r.origin===origin),versions=new Set(rows.map(r=>r.version)),factor=goal.planVariant==='fast'?(origin==='own'?.5:origin==='copack'?3:1):goal.planVariant==='internal'&&origin==='copack'?0:1;const lines=scenario.skus.map((s:any)=>({sku:s.id,quantity:s.allocation[origin]*10000*factor}));if(factor===0)continue;
  if(versions.size!==1||lines.some((l:{sku:string;quantity:number})=>{const r=rows.find(x=>x.sku===l.sku);return !r||!r.qualified||r.available<l.quantity;})){feasibility='infeasible';reason='qualification_or_capacity';}
  const quantity=lines.reduce((n:number,l:{quantity:number})=>n+l.quantity,0);coverageCases+=quantity;cashCny+=quantity*scenario.sources[origin].cashCnyPerCase;incrementalCostCny+=quantity*scenario.sources[origin].incrementalCnyPerCase;
  commands.push(commandSchema.parse({origin,lines,expectedVersion:rows[0]?.version??1}));
 }
 if(snapshot.resources.some(r=>!r.proof)){feasibility='unverified';reason='hard_constraint_evidence_missing';}
 else if(snapshot.resources.some(r=>r.proof!.availableBy>=scenario.period.endExclusive||r.proof!.expiresOn<scenario.period.endExclusive)){feasibility='infeasible';reason='arrival_or_expiry';}
 if(coverageCases!==goalCases){feasibility='infeasible';reason='coverage_mismatch';}
 if(cashCny>Math.min(goal.cashBudgetCny,finance.availableCashCny)){feasibility='infeasible';reason='cash_limit';}
 if(!snapshot.atomicGuard||!snapshot.lookupComplete||snapshot.idempotencyRetentionSeconds<3600){feasibility='unverified';reason='source_guards_missing';}
 if(ambiguous){feasibility='unverified';reason='ambiguous_resource_identity';}
 if(goal.copackAllowed===false&&commands.some(c=>c.origin==='copack')){feasibility='infeasible';reason='copack_not_authorized';}
 return {feasibility,reason,commands,cashCny,incrementalCostCny,coverageCases,goalCases,snapshot,finance,evidenceHash:hash({snapshot,finance}),constraintHash:hash({goal,version:'candidate-evaluation-v1'})};
}
export function forecastScore(actual:number[],forecast:number[],availableAt:string[],trainingCutoff:string){
 if(!Number.isFinite(Date.parse(trainingCutoff))||availableAt.some(t=>!Number.isFinite(Date.parse(t))))throw Error('invalid_forecast_input');
 if(actual.length<8||actual.length!==forecast.length||actual.length!==availableAt.length)return {status:'insufficient_history'};
 if(availableAt.some(t=>Date.parse(t)>Date.parse(trainingCutoff)))return {status:'future_information_rejected'};
 if(actual.some(x=>!Number.isFinite(x)||x<0)||forecast.some(x=>!Number.isFinite(x)||x<0))throw Error('invalid_forecast_input');
 const denominator=actual.reduce((a,b)=>a+b,0);if(!denominator)return {status:'undefined_zero_actual'};
 return {status:'scored',wape:actual.reduce((sum,n,i)=>sum+Math.abs(n-forecast[i]),0)/denominator,bias:forecast.reduce((sum,n,i)=>sum+n-actual[i],0)/denominator};
}
