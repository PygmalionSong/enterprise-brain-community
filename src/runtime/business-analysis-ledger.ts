import {requireEnterpriseLock} from '../db/enterprise-lock.ts';
// Trusted programmatic reservations only: no RPC,output,graph compilation or execution.
// 仅受信程序预留：不调用RPC、不生成结论、不编译或执行业务图。
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Database,Sql} from '../db/adapter.ts';
import type {Actor} from '../identity/service.ts';
import {AnalysisPolicyService,analysisContextSelectionSchema} from './analysis-policy.ts';
import {hash} from './contracts.ts';

type Row=Record<string,any>;
const key=z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),positiveVersion=z.number().int().min(1).max(2147483646);
const requestSchema=z.object({
 idempotencyKey:key,goal:z.string().min(1).max(4000).refine(v=>v.trim().length>0),language:z.enum(['zh','en','ja']),
 selection:analysisContextSelectionSchema,contextHash:z.string().regex(/^[a-f0-9]{64}$/),analysisAcknowledged:z.literal(true)
}).strict();

export class BusinessAnalysisLedger {
 private db:Database;private policy:AnalysisPolicyService;private now:()=>Date;
 constructor(db:Database,policy:AnalysisPolicyService,now=()=>new Date()){this.db=db;this.policy=policy;this.now=now;}

 private async scoped<T>(actor:Actor,fn:(tx:Sql)=>Promise<T>){
  return this.db.transaction(async tx=>{
   const p=(await tx.query<Row>('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,actor.id])).rows[0];
   if(!['operations','executive'].includes(actor.role)||!p||p.disabled||p.role!==actor.role||Number(p.authorization_version)!==actor.authorizationVersion)throw Error('not_authorized');
   await requireEnterpriseLock(tx,actor.enterpriseId,'update');
   await tx.exec('SET LOCAL ROLE eb_app');await tx.query("SELECT set_config('app.enterprise_id',$1,true)",[actor.enterpriseId]);return fn(tx);
  });
 }
 private owner(actor:Actor,r:Row){if(actor.id!==r.principal_id&&actor.role!=='executive')throw Error('not_authorized');}
 private summary(r:Row){return {id:r.id,version:Number(r.version),state:r.state,code:r.code??null,
  policyId:r.policy_id,policyVersion:Number(r.policy_version),configurationId:r.configuration_id,configurationVersion:Number(r.configuration_version),
  contextHash:r.context_hash,reservedOutputTokens:Number(r.reserved_output_tokens),leaseUntil:new Date(r.lease_until).toISOString(),
  metadataOnly:true,modelDispatchImplemented:false,modelCalled:false,businessExecutionAuthorized:false,executed:false};}
 private async event(tx:Sql,enterpriseId:string,kind:string,id:string){await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',[enterpriseId,randomUUID(),'business_analysis_'+kind,JSON.stringify({id})]);}
 private async terminal(tx:Sql,r:Row,state:'unknown'|'cancelled',code:string){const row=(await tx.query<Row>('UPDATE business_analysis_request SET state=$2,code=$3,lease_id=NULL,version=version+1,finished_at=$4 WHERE id=$1 RETURNING *',[r.id,state,code,this.now()])).rows[0];await this.event(tx,r.enterprise_id,state,r.id);return row;}
 private async expired(tx:Sql,r:Row){return r.state==='reserved'&&new Date(r.lease_until)<=this.now()?this.terminal(tx,r,'unknown','lease_expired'):r;}
 private async existing(tx:Sql,actor:Actor,idempotencyKey:string,requestHash:string){
  let r=(await tx.query<Row>('SELECT * FROM business_analysis_request WHERE idempotency_key=$1 FOR UPDATE',[idempotencyKey])).rows[0];if(!r)return null;
  if(r.principal_id!==actor.id||r.principal_role!==actor.role||Number(r.authorization_version)!==actor.authorizationVersion||r.request_hash!==requestHash)throw Error('analysis_idempotency_conflict');
  r=await this.expired(tx,r);return {...this.summary(r),reused:true,dispatch:null};
 }

 async reserve(actor:Actor,input:unknown){
  const q=requestSchema.parse(input),snapshot={goal:q.goal,language:q.language,selection:q.selection,contextHash:q.contextHash},requestHash=hash(snapshot);
  // Metadata-only retries do not reacquire source data,extend a lease or reserve again.
  // 元数据重试不重新取源值、不延长租约、不再次扣额度。
  const old=await this.scoped(actor,tx=>this.existing(tx,actor,q.idempotencyKey,requestHash));if(old)return old;
  return this.policy.withContext(actor,q.selection,async(tx,prepared)=>{
   const raced=await this.existing(tx,actor,q.idempotencyKey,requestHash);if(raced)return raced;
   if(prepared.contextHash!==q.contextHash)throw Error('analysis_context_changed');
   const c=(await tx.query<Row>('SELECT * FROM planning_configuration FOR UPDATE')).rows[0],context=prepared.context,now=this.now();
   if(!c?.enabled||c.reconciliation_required||c.id!==context.configurationId||Number(c.version)!==context.configurationVersion||c.identity_sha256!==context.modelIdentitySha256||new Date(c.expires_at)<=now)throw Error('analysis_model_not_current');
   if(Number(c.calls_reserved)>=Number(c.max_calls)||Number(c.output_tokens_reserved)+Number(c.max_output_tokens)>Number(c.output_token_budget))throw Error('planning_budget_exhausted');
   if(Number((await tx.query<Row>('SELECT count(*) n FROM business_analysis_request')).rows[0].n)>=500)throw Error('analysis_capacity');
   const id=randomUUID(),leaseId=randomUUID(),deadline=new Date(Math.min(new Date(c.expires_at).getTime(),new Date(context.validUntil).getTime(),now.getTime()+Number(c.timeout_ms)+5000));
   if(deadline<=now)throw Error('analysis_context_expired');
   await tx.query('UPDATE planning_configuration SET calls_reserved=calls_reserved+1,output_tokens_reserved=output_tokens_reserved+max_output_tokens');
   const r=(await tx.query<Row>(`INSERT INTO business_analysis_request(enterprise_id,id,principal_id,principal_role,authorization_version,idempotency_key,request_hash,input,context_hash,context,policy_id,policy_version,configuration_id,configuration_version,model_identity_sha256,state,reserved_output_tokens,lease_id,lease_until,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'reserved',$16,$17,$18,$19) RETURNING *`,[actor.enterpriseId,id,actor.id,actor.role,actor.authorizationVersion,q.idempotencyKey,requestHash,JSON.stringify(snapshot),prepared.contextHash,JSON.stringify(context),context.policyId,context.policyVersion,c.id,c.version,c.identity_sha256,c.max_output_tokens,leaseId,deadline,now])).rows[0];
   await this.event(tx,actor.enterpriseId,'reserved',id);
   return {...this.summary(r),metadataOnly:false,reused:false,dispatch:{leaseId,context,contextHash:prepared.contextHash,goal:q.goal,language:q.language,maxOutputTokens:Number(c.max_output_tokens),timeoutMs:Number(c.timeout_ms),deadline:deadline.toISOString()}};
  });
 }
 async lookup(actor:Actor,idempotencyKey:string){key.parse(idempotencyKey);return this.scoped(actor,async tx=>{let r=(await tx.query<Row>('SELECT * FROM business_analysis_request WHERE idempotency_key=$1 FOR UPDATE',[idempotencyKey])).rows[0];if(!r)throw Error('not_found');this.owner(actor,r);r=await this.expired(tx,r);return this.summary(r);});}
 async view(actor:Actor,id:string){z.uuid().parse(id);return this.scoped(actor,async tx=>{let r=(await tx.query<Row>('SELECT * FROM business_analysis_request WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)throw Error('not_found');this.owner(actor,r);r=await this.expired(tx,r);return this.summary(r);});}
 async cancel(actor:Actor,id:string,expectedVersion:number){z.uuid().parse(id);positiveVersion.parse(expectedVersion);return this.scoped(actor,async tx=>{let r=(await tx.query<Row>('SELECT * FROM business_analysis_request WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)throw Error('not_found');this.owner(actor,r);r=await this.expired(tx,r);if(Number(r.version)!==expectedVersion)throw Error('analysis_request_conflict');if(r.state==='cancelled')return this.summary(r);if(r.state!=='reserved')throw Error('analysis_not_cancellable');return this.summary(await this.terminal(tx,r,'cancelled','explicit_cancel'));});}
}

// Restore cannot establish external spend after the snapshot:no refund or automatic retry.
// 恢复不能证明快照后的外部费用：不退款、不自动重试。
export async function suspendRestoredBusinessAnalysis(db:Database,enterpriseId:string){z.uuid().parse(enterpriseId);return db.transaction(async tx=>{
 const rows=(await tx.query<Row>("UPDATE business_analysis_request SET state='unknown',code='restored_unknown',lease_id=NULL,version=version+1,finished_at=$2 WHERE enterprise_id=$1 AND state='reserved' RETURNING id",[enterpriseId,new Date()])).rows;
 if(rows.length)await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',[enterpriseId,randomUUID(),'business_analysis_restore_unknown',JSON.stringify({requests:rows.length})]);return rows.length;
});}
