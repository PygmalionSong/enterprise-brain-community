import {requireEnterpriseLock} from '../db/enterprise-lock.ts';
// Trusted result capability with fresh evidence;no model I/O or business tool execution here.
// 当前证据约束的受信结果能力；此处不调用模型或执行业务工具。
import {randomUUID} from 'node:crypto';import {z} from 'zod';
import type {Database,Sql} from '../db/adapter.ts';import type {Actor} from '../identity/service.ts';
import {AnalysisPolicyService,type AnalysisPreparedContext} from './analysis-policy.ts';
import {BusinessAnalysisLedger} from './business-analysis-ledger.ts';import {businessAnalysisWireSchema,decodeBusinessAnalysisOutput} from './business-analysis-model-wire.ts';
import {hash} from './contracts.ts';
type Row=Record<string,any>;
export const businessAnalysisUsageSchema=z.object({inputTokens:z.number().int().min(0).max(10000000),outputTokens:z.number().int().min(0).max(10000000),totalTokens:z.number().int().min(0).max(20000000)}).strict().refine(v=>v.inputTokens+v.outputTokens===v.totalTokens);
type Usage=z.infer<typeof businessAnalysisUsageSchema>;
export class BusinessAnalysisResults {
 private db:Database;private policy:AnalysisPolicyService;private ledger:BusinessAnalysisLedger;private now:()=>Date;
 constructor(db:Database,policy:AnalysisPolicyService,ledger:BusinessAnalysisLedger,now=()=>new Date()){this.db=db;this.policy=policy;this.ledger=ledger;this.now=now;}
 private async scoped<T>(actor:Actor,fn:(tx:Sql)=>Promise<T>){return this.db.transaction(async tx=>{
  const p=(await tx.query<Row>('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,actor.id])).rows[0];
  if(!['operations','executive'].includes(actor.role)||!p||p.disabled||p.role!==actor.role||Number(p.authorization_version)!==actor.authorizationVersion)throw Error('not_authorized');
  await requireEnterpriseLock(tx,actor.enterpriseId,'update');await tx.exec('SET LOCAL ROLE eb_app');await tx.query("SELECT set_config('app.enterprise_id',$1,true)",[actor.enterpriseId]);return fn(tx);
 });}
 async authorize(actor:Actor){await this.scoped(actor,async()=>{});}
 private async row(tx:Sql,id:string){const r=(await tx.query<Row>('SELECT * FROM business_analysis_request WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)throw Error('not_found');return r;}
 private owner(actor:Actor,r:Row){if(actor.id!==r.principal_id&&actor.role!=='executive')throw Error('not_authorized');}
 private pending(actor:Actor,r:Row,leaseId:string,prepared:AnalysisPreparedContext){
  if(r.state!=='reserved'||r.lease_id!==leaseId)throw Error('analysis_stale_lease');
  if(r.principal_id!==actor.id||r.principal_role!==actor.role||Number(r.authorization_version)!==actor.authorizationVersion)throw Error('not_authorized');
  if(new Date(r.lease_until)<=this.now())throw Error('analysis_lease_expired');
  if(r.context_hash!==prepared.contextHash||hash(r.context)!==hash(prepared.context)||r.configuration_id!==prepared.context.configurationId||Number(r.configuration_version)!==prepared.context.configurationVersion||r.model_identity_sha256!==prepared.context.modelIdentitySha256||r.policy_id!==prepared.context.policyId||Number(r.policy_version)!==prepared.context.policyVersion)throw Error('analysis_context_changed');
 }
 private async withPending<T>(actor:Actor,id:string,leaseId:string,selection:unknown,commit:(tx:Sql,r:Row,prepared:AnalysisPreparedContext)=>Promise<T>){z.uuid().parse(id);z.uuid().parse(leaseId);return this.policy.withContext(actor,selection,async(tx,prepared)=>{const r=await this.row(tx,id);this.pending(actor,r,leaseId,prepared);return commit(tx,r,prepared);});}
 async check(actor:Actor,id:string,leaseId:string,selection:unknown){return this.withPending(actor,id,leaseId,selection,async(_tx,r,prepared)=>({contextHash:prepared.contextHash,configurationVersion:Number(r.configuration_version),identitySha256:r.model_identity_sha256,deadline:new Date(r.lease_until).toISOString()}));}
 private async terminal(tx:Sql,r:Row,state:string,code:string,usage:Usage|null,output:unknown=null){
  const q=(await tx.query<Row>('UPDATE business_analysis_request SET state=$2,code=$3,lease_id=NULL,version=version+1,finished_at=$4,reported_usage=$5,output=$6,output_hash=$7 WHERE id=$1 RETURNING id,version,state',[r.id,state,code,this.now(),usage===null?null:JSON.stringify(usage),output===null?null:JSON.stringify(output),output===null?null:hash(output)])).rows[0];
  await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',[r.enterprise_id,randomUUID(),'business_analysis_'+state,JSON.stringify({id:r.id})]);return {id:q.id,version:Number(q.version),state:q.state};
 }
 async publish(actor:Actor,id:string,leaseId:string,selection:unknown,output:unknown,reportedUsage:unknown,isCurrent=()=>true){const usage=businessAnalysisUsageSchema.parse(reportedUsage);return this.withPending(actor,id,leaseId,selection,async(tx,r,prepared)=>{
  if(!isCurrent())throw Error('analysis_interrupted');if(usage.outputTokens>Number(r.reserved_output_tokens))throw Error('analysis_usage_exceeded');const closed=businessAnalysisWireSchema.parse(output);decodeBusinessAnalysisOutput(closed,prepared);const result=await this.terminal(tx,r,'completed','completed',usage,closed);if(!isCurrent())throw Error('analysis_interrupted');return result;
 });}
 // Internal original-lease failure sealing never publishes content or restores authority.
 // 内部原租约失败封存不发布内容，也不恢复权限。
 async fail(enterpriseId:string,id:string,leaseId:string,input:unknown,isCurrent=()=>true){z.uuid().parse(enterpriseId);z.uuid().parse(id);z.uuid().parse(leaseId);const q=z.object({state:z.enum(['invalid','unknown','refused']),code:z.enum(['before_call_invalid','model_unknown','response_invalid','source_or_authority_changed','model_refused','deadline_expired']),usage:businessAnalysisUsageSchema.nullable()}).strict().parse(input);return this.db.transaction(async tx=>{
  await requireEnterpriseLock(tx,enterpriseId,'update');await tx.exec('SET LOCAL ROLE eb_app');await tx.query("SELECT set_config('app.enterprise_id',$1,true)",[enterpriseId]);const r=await this.row(tx,id);if(r.state!=='reserved'||r.lease_id!==leaseId)return {id:r.id,version:Number(r.version),state:r.state};
  const expired=new Date(r.lease_until)<=this.now()||!isCurrent();return this.terminal(tx,r,expired?'unknown':q.state,expired?'deadline_expired':q.code,q.usage);
 });}
 async read(actor:Actor,id:string){z.uuid().parse(id);const metadata=await this.ledger.view(actor,id),prior=await this.scoped(actor,async tx=>{const r=await this.row(tx,id);this.owner(actor,r);return r;});if(prior.state!=='completed')return {...metadata,currentReadAuthorized:false,analysis:null};
  try{return await this.policy.withContext(actor,prior.input.selection,async(tx,prepared)=>{const r=await this.row(tx,id);this.owner(actor,r);if(r.state!=='completed'||r.principal_id!==actor.id||Number(r.authorization_version)!==actor.authorizationVersion||r.context_hash!==prepared.contextHash||hash(r.context)!==hash(prepared.context)||!r.output||hash(r.output)!==r.output_hash)throw Error('analysis_result_unavailable');const analysis=decodeBusinessAnalysisOutput(r.output,prepared);return {...metadata,currentReadAuthorized:true,analysis,reportedUsage:r.reported_usage,usageIsProviderReported:true,actualInvoiceVerified:false};});}
  catch{return {...await this.ledger.view(actor,id),currentReadAuthorized:false,analysis:null};}
 }
}
