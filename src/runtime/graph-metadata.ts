import {requireEnterpriseLock} from '../db/enterprise-lock.ts';
// Passive current-authority lists only;cursor positions grant no content or execution authority.
// 仅当前授权的被动元数据列表；游标位置不授正文或执行权限。
import {z} from 'zod';import type {Database,Sql} from '../db/adapter.ts';import type {Actor} from '../identity/service.ts';
type Row=Record<string,any>;export const graphMetadataKindSchema=z.enum(['planning_candidates','business_analyses','business_observations','graph_runs']);export type GraphMetadataKind=z.infer<typeof graphMetadataKindSchema>;
const uuid=z.uuid(),version=z.number().int().positive().max(2147483647),sha=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/).refine(value=>!value.startsWith('0000-'));
const optionsSchema=z.object({limit:z.number().int().min(1).max(20).default(20),cursor:z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional()}).strict();
const cursorSchema=z.object({format:z.literal('enterprise-brain.metadata-cursor/1'),kind:graphMetadataKindSchema,enterpriseId:uuid,principalId:uuid,role:z.enum(['it','executive','operations']),authorizationVersion:version,position:z.object({createdAt:time,id:uuid}).strict()}).strict();
const base={id:uuid,version,principalId:uuid,createdAt:time},modelState=z.enum(['reserved','completed','refused','invalid','unknown','cancelled']);
const itemSchemas={
 planning_candidates:z.object({...base,state:modelState,configurationVersion:version,reservedOutputTokens:z.number().int().min(64).max(8192),leaseExpired:z.boolean(),compiled:z.boolean(),planId:uuid.nullable()}).strict(),
 business_analyses:z.object({...base,state:modelState,policyVersion:version,reservedOutputTokens:z.number().int().min(64).max(8192),leaseExpired:z.boolean()}).strict(),
 business_observations:z.object({...base,runId:uuid,actionId:uuid,resultHash:sha,payloadHash:sha,active:z.boolean(),expired:z.boolean(),reason:z.enum(['explicit_revoke','restored_unreviewed','expired','unavailable']).nullable(),currentReadAuthorized:z.literal(false)}).strict(),
 graph_runs:z.object({...base,state:z.enum(['ready','running','waiting_external','waiting_input','succeeded','failed','cancelled']),planId:uuid,approvalId:uuid,cancelRequested:z.boolean(),steps:z.number().int().min(0).max(2147483647),deadlinePassed:z.boolean(),leaseExpired:z.boolean()}).strict()
};
const stamp=(column:string)=>"to_char("+column+" AT TIME ZONE 'UTC','YYYY-MM-DD"+'"T"'+"HH24:MI:SS.US"+'"Z"'+ "')";
const specs={
 planning_candidates:{table:'planning_candidate',fields:"r.state,r.configuration_version,r.reserved_output_tokens,r.lease_until,(SELECT plan_id FROM planning_candidate_adoption a WHERE a.candidate_id=r.id AND a.enterprise_id=r.enterprise_id) plan_id"},
 business_analyses:{table:'business_analysis_request',fields:'r.state,r.policy_version,r.reserved_output_tokens,r.lease_until'},
 business_observations:{table:'business_observation',fields:'r.run_id,r.action_id,r.result_hash,r.payload_hash,r.active,r.reason,r.expires_at'},
 graph_runs:{table:'process_graph_run',fields:'r.state,r.plan_id,r.approval_id,r.cancel_requested,r.steps,r.deadline,r.lease_until'}
};
export class GraphMetadata {
 private db:Database;private now:()=>Date;
 constructor(db:Database,now=()=>new Date()){this.db=db;this.now=now;}
 private async scope<T>(actor:Actor,roles:string[],fn:(tx:Sql)=>Promise<T>){return this.db.transaction(async tx=>{
  const p=(await tx.query<Row>('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,actor.id])).rows[0];if(!roles.includes(actor.role)||!p||p.disabled||p.role!==actor.role||Number(p.authorization_version)!==actor.authorizationVersion)throw Error('not_authorized');
  await requireEnterpriseLock(tx,actor.enterpriseId,'share');await tx.exec('SET LOCAL ROLE eb_app');await tx.query("SELECT set_config('app.enterprise_id',$1,true)",[actor.enterpriseId]);return fn(tx);
 });}
 private decode(value:string,actor:Actor,kind:GraphMetadataKind){let q:z.infer<typeof cursorSchema>;try{const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)throw Error();q=cursorSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch{throw Error('metadata_cursor_invalid');}
  if(q.kind!==kind||q.enterpriseId!==actor.enterpriseId||q.principalId!==actor.id||q.role!==actor.role||q.authorizationVersion!==actor.authorizationVersion)throw Error('metadata_cursor_not_authorized');return q.position;
 }
 private encode(actor:Actor,kind:GraphMetadataKind,row:Row){return Buffer.from(JSON.stringify(cursorSchema.parse({format:'enterprise-brain.metadata-cursor/1',kind,enterpriseId:actor.enterpriseId,principalId:actor.id,role:actor.role,authorizationVersion:actor.authorizationVersion,position:{createdAt:row.created_at_exact,id:row.id}}))).toString('base64url');}
 private item(kind:GraphMetadataKind,r:Row){const base={id:r.id,version:Number(r.version),principalId:r.principal_id,createdAt:r.created_at_exact},leaseExpired=r.lease_until!==null&&r.lease_until!==undefined&&new Date(r.lease_until)<=this.now();let item:unknown;
  if(kind==='planning_candidates')item={...base,state:r.state,configurationVersion:Number(r.configuration_version),reservedOutputTokens:Number(r.reserved_output_tokens),leaseExpired:r.state==='reserved'&&leaseExpired,compiled:!!r.plan_id,planId:r.plan_id??null};
  else if(kind==='business_analyses')item={...base,state:r.state,policyVersion:Number(r.policy_version),reservedOutputTokens:Number(r.reserved_output_tokens),leaseExpired:r.state==='reserved'&&leaseExpired};
  else if(kind==='business_observations'){const expired=new Date(r.expires_at)<=this.now(),reason=!r.active?['explicit_revoke','restored_unreviewed'].includes(r.reason)?r.reason:'unavailable':expired?'expired':null;item={...base,runId:r.run_id,actionId:r.action_id,resultHash:r.result_hash,payloadHash:r.payload_hash,active:r.active,expired,reason,currentReadAuthorized:false};}
  else item={...base,state:r.state,planId:r.plan_id,approvalId:r.approval_id,cancelRequested:r.cancel_requested,steps:Number(r.steps),deadlinePassed:new Date(r.deadline)<=this.now(),leaseExpired};
  const result=itemSchemas[kind].safeParse(item);if(!result.success)throw Error('metadata_projection_unavailable');return result.data;
 }
 async list(actor:Actor,kind:GraphMetadataKind,input:unknown={}){
  graphMetadataKindSchema.parse(kind);return this.scope(actor,kind==='planning_candidates'?['it']:['executive','operations'],async tx=>{
   const q=optionsSchema.parse(input),position=q.cursor?this.decode(q.cursor,actor,kind):null,spec=specs[kind],params:unknown[]=[],where:string[]=[];
   if(actor.role==='operations'){params.push(actor.id);where.push('r.principal_id=$'+params.length);}
   if(position){params.push(position.createdAt);const at='$'+params.length;params.push(position.id);where.push('(r.created_at<'+at+'::timestamptz OR (r.created_at='+at+'::timestamptz AND r.id<$'+params.length+'::uuid))');}
   params.push(q.limit+1);const rows=(await tx.query<Row>('SELECT r.id,r.version,r.principal_id,'+stamp('r.created_at')+' created_at_exact,'+spec.fields+' FROM '+spec.table+' r'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY r.created_at DESC,r.id DESC LIMIT $'+params.length,params)).rows;
   const page=rows.slice(0,q.limit),items=page.map(row=>this.item(kind,row)),nextCursor=rows.length>q.limit?this.encode(actor,kind,page.at(-1)!):null;
   return {format:'enterprise-brain.graph-metadata-list/1',kind,items,nextCursor,limit:q.limit,sourcePayloadRedacted:true,currentSourceAuthorityChecked:false,modelCalled:false,sourceCalled:false,budgetReserved:false,executed:false};
  });
 }
}
