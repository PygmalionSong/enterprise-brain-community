// Installed adapters expose existing read/controlled-run contracts, never arbitrary endpoints.
// 已安装适配器复用既有读取/受控运行合同，不接收任意端点。
import {z} from 'zod';
import type {Database} from '../db/adapter.ts';
import type {Actor} from '../identity/service.ts';
import {stageView} from '../core/repository.ts';
import type {RuntimeService} from './service.ts';
import {goalSchema,hash} from './contracts.ts';
import {GraphToolCatalog,type GraphTool} from './graph-contracts.ts';
const stageArgs=z.object({domain:z.string().regex(/^[a-z]{1,30}$/),stageId:z.string().regex(/^[a-z]{1,30}-[1-4]$/)}).strict().refine(v=>v.stageId.startsWith(v.domain+'-'),'stage_domain_mismatch');
const supplyArgs=z.object({caseId:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),goal:goalSchema}).strict();
async function authorized(db:Database,actor:Actor){const p=(await db.query<any>('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2',[actor.enterpriseId,actor.id])).rows[0];if(!p||p.disabled||p.role!==actor.role||!['executive','operations'].includes(actor.role)||Number(p.authorization_version)!==actor.authorizationVersion)throw Error('not_authorized');}
export function installedGraphTools(db:Database,runtime?:RuntimeService){
 const read=async(actor:Actor,args:Record<string,unknown>,reference:string)=>{const q=stageArgs.parse(args);await authorized(db,actor);const data=await stageView(db,actor,q.domain,q.stageId);return {reference,state:'completed',receiptRef:'read-'+reference,sourceRevision:'stage-'+hash(data),data:{domain:q.domain,stageId:q.stageId,recordCount:data.records.length,recordsSha256:hash(data.records),definitionSha256:hash(data.definition)}};};
 const tools:GraphTool[]=[{id:'business.stage.read',version:'v1',effect:'read',validate:a=>stageArgs.parse(a),authorize:(actor)=>authorized(db,actor),submit:read,lookup:read}];
 if(runtime){const inspect=async(actor:Actor,args:Record<string,unknown>,reference:string,create:boolean)=>{const q=supplyArgs.parse(args);await authorized(db,actor);const child=create?await runtime.create(actor,q.caseId,q.goal,'graph-'+reference):await runtime.lookupCreation(actor,q.caseId,q.goal,'graph-'+reference);if(!child)return {reference,state:'missing',receiptRef:null,sourceRevision:null,data:{}};const r=await runtime.get(actor,child.runId),state=r.state==='succeeded'?'completed':r.state==='partially_succeeded'?'partial':['failed','cancelled'].includes(r.state)?'failed':'accepted';return {reference,state,receiptRef:r.id,sourceRevision:'runtime-'+r.version,data:{runId:r.id,state:r.state,receiptCount:r.obligations.filter(o=>o.state==='closed').length,unresolvedObligations:r.obligations.filter(o=>o.state!=='closed').length,paymentVerified:false}};};
  tools.push({id:'runtime.supply.coordinate',version:'v1',effect:'delegated',validate:a=>supplyArgs.parse(a),authorize:actor=>authorized(db,actor),submit:(actor,args,reference)=>inspect(actor,args,reference,true),lookup:(actor,args,reference)=>inspect(actor,args,reference,false)});
 }
 return new GraphToolCatalog(tools);
}
