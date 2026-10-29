// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Server-derived IT identity and durable discovery state. No external I/O in SQL transactions.
// 使用服务端IT身份和持久发现状态；SQL事务内不做外部I/O。
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../identity/service.ts';
import type {Database,Sql} from '../db/adapter.ts';
import {withEnterprise} from '../db/adapter.ts';
import {requireEnterpriseLock} from '../db/enterprise-lock.ts';
import {hash} from '../runtime/contracts.ts';
import {planDiscoveryTargets,discoveryLimits} from './discovery-contracts.ts';
import {observationSchema} from './observation-schema.ts';

type Row = Record<string,any>;
const uuid = z.uuid().transform(v => v.toLowerCase());
const key = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);
const version = z.number().int().positive().safe();
const actorSchema = z.object({id:uuid,enterpriseId:uuid,role:z.literal('it'),authorizationVersion:version}).strict();
const scopeInput = z.object({endpoints:z.array(z.string()).min(1).max(256),ttlSeconds:z.number().int().min(60).max(3600).default(900),idempotencyKey:key,scopeAcknowledged:z.literal(true)}).strict();
const terminal = new Set(['completed','partial','cancelled','expired','unknown']);
export interface IssuedDiscoveryClaim {
  enterpriseId:string;scopeId:string;scopeVersion:number;runId:string;runVersion:number;
  assetId:string;endpoint:string;claimId:string;evidenceId:string;workerInstance:string;deadline:string;
}
export interface DiscoveryScopeContext {scope:Row;active:boolean;ownerValid:boolean;principals:ReadonlyMap<string,Row>;}
type ScopeContext=DiscoveryScopeContext;
export class DiscoveryStore {
  readonly workerInstance = randomUUID();
  private db:Database;
  constructor(db:Database) {this.db=db;}
  private actor(actor:Actor) {return actorSchema.parse(actor);}
  private async audit(tx:Sql,a:Actor,kind:string,details:Record<string,unknown>) {
    await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',
      [a.enterpriseId,randomUUID(),kind,JSON.stringify(details)]);
  }
  private async actorTransaction<T>(input:Actor,fn:(tx:Sql,a:Actor)=>Promise<T>) {
    const a=this.actor(input);
    return this.db.transaction(async tx => {
      const p=(await tx.query<Row>('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[a.enterpriseId,a.id])).rows[0];
      if(!p||p.disabled||p.role!=='it'||Number(p.authorization_version)!==a.authorizationVersion)throw Error('not_authorized');
      // Match existing host permissions: eb_app cannot lock the private parent.
      // 沿用现有宿主权限：eb_app没有企业父表加锁权限，不为新功能扩大它的权限。
      await requireEnterpriseLock(tx,a.enterpriseId);
      await tx.exec('SET LOCAL ROLE eb_app');await tx.query("SELECT set_config('app.enterprise_id',$1,true)",[a.enterpriseId]);
      return fn(tx,a);
    });
  }
  private async scoped<T>(input:Actor,scopeId:string,fn:(tx:Sql,a:Actor,context:ScopeContext)=>Promise<T>,additionalPrincipals:string[] = []) {
    const a=this.actor(input),id=uuid.parse(scopeId);
    const initial=await withEnterprise(this.db,a.enterpriseId,async tx =>
      (await tx.query<Row>('SELECT owner_id,owner_version FROM onboarding_scope WHERE id=$1',[id])).rows[0]);
    if(!initial)throw Error('not_found');
    return this.db.transaction(async tx => {
      const people=new Map<string,Row>();
      for(const principalId of [...new Set([a.id,String(initial.owner_id),...additionalPrincipals.map(id=>uuid.parse(id))])].sort()) {
        const p=(await tx.query<Row>('SELECT id,role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[a.enterpriseId,principalId])).rows[0];
        if(p)people.set(principalId,p);
      }
      const p=people.get(a.id),owner=people.get(String(initial.owner_id));
      if(!p||p.disabled||p.role!=='it'||Number(p.authorization_version)!==a.authorizationVersion)throw Error('not_authorized');
      await requireEnterpriseLock(tx,a.enterpriseId);
      await tx.exec('SET LOCAL ROLE eb_app');await tx.query("SELECT set_config('app.enterprise_id',$1,true)",[a.enterpriseId]);
      const scope=(await tx.query<Row>('SELECT *,expires_at>clock_timestamp() time_live FROM onboarding_scope WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!scope||scope.owner_id!==initial.owner_id||Number(scope.owner_version)!==Number(initial.owner_version))throw Error('scope_conflict');
      const ownerValid=!!owner&&!owner.disabled&&owner.role==='it'&&Number(owner.authorization_version)===Number(scope.owner_version);
      return fn(tx,a,{scope,ownerValid,active:ownerValid&&!scope.revoked&&scope.time_live,principals:people});
    });
  }
  // Trusted compiled services only. The callback is never deserialized from HTTP.
  // 仅供受信编译服务使用；不从HTTP反序列化事务回调。
  transactionScope<T>(actor:Actor,id:string,principals:string[],fn:(tx:Sql,a:Actor,c:DiscoveryScopeContext)=>Promise<T>) {
    return this.scoped(actor,id,fn,principals);
  }
  private live(c:ScopeContext) {if(!c.active)throw Error('discovery_authority_unavailable');}
  private plan(scope:Row) {
    const plan=planDiscoveryTargets(String(scope.enterprise_id),scope.plan.targets.map((v:Row)=>v.endpoint));
    if(plan.planSha256!==scope.plan_sha)throw Error('discovery_plan_changed');return plan;
  }
  private scopeView(c:ScopeContext) {
    return {id:c.scope.id,version:Number(c.scope.version),active:c.active,revoked:!!c.scope.revoked,
      expiresAt:new Date(c.scope.expires_at).toISOString(),planSha256:c.scope.plan_sha,
      targets:c.active?this.plan(c.scope).targets:[],networkScopeOnly:true,readAuthorized:false,executable:false};
  }
  async createScope(actor:Actor,input:unknown) {
    const q=scopeInput.parse(input),a=this.actor(actor),plan=planDiscoveryTargets(a.enterpriseId,q.endpoints);
    const requestSha=hash({planSha256:plan.planSha256,ttlSeconds:q.ttlSeconds});
    return this.actorTransaction(a,async(tx,current)=>{
      const prior=(await tx.query<Row>('SELECT *,expires_at>clock_timestamp() time_live FROM onboarding_scope WHERE owner_id=$1 AND idempotency_key=$2 FOR UPDATE',[current.id,q.idempotencyKey])).rows[0];
      if(prior){if(prior.request_sha!==requestSha)throw Error('idempotency_conflict');
        return {...this.scopeView({scope:prior,ownerValid:Number(prior.owner_version)===current.authorizationVersion,active:Number(prior.owner_version)===current.authorizationVersion&&!prior.revoked&&prior.time_live,principals:new Map()}),created:false};}
      const id=randomUUID();const scope=(await tx.query<Row>(`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() at)
        INSERT INTO onboarding_scope(enterprise_id,id,owner_id,owner_version,idempotency_key,request_sha,plan,plan_sha,created_at,expires_at)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,at,at+$9*interval '1 second' FROM stamp RETURNING *,true time_live`,
        [current.enterpriseId,id,current.id,current.authorizationVersion,q.idempotencyKey,requestSha,JSON.stringify(plan),plan.planSha256,q.ttlSeconds])).rows[0];
      await this.audit(tx,current,'onboarding_scope_created',{scopeId:id,planSha256:plan.planSha256,targetCount:plan.targets.length});
      return {...this.scopeView({scope,active:true,ownerValid:true,principals:new Map()}),created:true};
    });
  }
  async scope(actor:Actor,id:string) {return this.scoped(actor,id,async(_tx,_a,c)=>this.scopeView(c));}
  async listScopes(actor:Actor) {
    return this.actorTransaction(actor,async(tx,a)=>(await tx.query<Row>(
      'SELECT id,version,revoked,expires_at,created_at,jsonb_array_length(plan->\'targets\') target_count FROM onboarding_scope WHERE owner_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[a.id])).rows.map(row=>({id:row.id,version:Number(row.version),revoked:row.revoked,expiresAt:new Date(row.expires_at).toISOString(),targetCount:Number(row.target_count)})));
  }
  async listRuns(actor:Actor) {
    return this.actorTransaction(actor,async(tx,a)=>(await tx.query<Row>(
      'SELECT id,scope_id,version,state,created_at,deadline FROM onboarding_run WHERE requested_by=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[a.id])).rows.map(row=>({id:row.id,scopeId:row.scope_id,version:Number(row.version),state:row.state,createdAt:new Date(row.created_at).toISOString(),deadline:new Date(row.deadline).toISOString()})));
  }
  async authorizeStart(actor:Actor,id:string,expectedVersion:number) {
    version.parse(expectedVersion);const scopeId=await this.runScope(actor,id);
    return this.scoped(actor,scopeId,async(tx,a,c)=>{
      this.live(c);const run=await this.lockedRun(tx,id);
      if(Number(run.version)!==expectedVersion||!['authorized','running'].includes(run.state))throw Error('discovery_run_conflict');
      if(run.requested_by!==a.id||Number(run.requester_version)!==a.authorizationVersion)throw Error('discovery_actor_changed');
      if(run.worker_instance&&run.worker_instance!==this.workerInstance)throw Error('discovery_worker_changed');
      if(!run.time_live)throw Error('discovery_run_expired');return {id,version:expectedVersion};
    });
  }
  async createRun(actor:Actor,input:unknown) {
    const q=z.object({scopeId:uuid,expectedScopeVersion:version,idempotencyKey:key}).strict().parse(input);
    return this.scoped(actor,q.scopeId,async(tx,a,c)=>{
      this.live(c);if(Number(c.scope.version)!==q.expectedScopeVersion)throw Error('scope_conflict');
      const old=(await tx.query<Row>('SELECT * FROM onboarding_run WHERE requested_by=$1 AND idempotency_key=$2 FOR UPDATE',[a.id,q.idempotencyKey])).rows[0];
      if(old){if(old.scope_id!==q.scopeId||Number(old.scope_version)!==q.expectedScopeVersion)throw Error('idempotency_conflict');return {id:old.id,version:Number(old.version),state:old.state,created:false};}
      if(Number((await tx.query<Row>("SELECT count(*) n FROM onboarding_run WHERE scope_id=$1 AND state IN ('authorized','running')",[q.scopeId])).rows[0].n)>=4)throw Error('discovery_run_capacity');
      const id=randomUUID(),plan=this.plan(c.scope);
      await tx.query(`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() at)
        INSERT INTO onboarding_run(enterprise_id,id,scope_id,scope_version,requested_by,requester_version,idempotency_key,state,created_at,deadline)
        SELECT $1,$2,$3,$4,$5,$6,$7,'authorized',at,LEAST($8::timestamptz,at+interval '120 seconds') FROM stamp WHERE at<$8::timestamptz`,
        [a.enterpriseId,id,q.scopeId,q.expectedScopeVersion,a.id,a.authorizationVersion,q.idempotencyKey,c.scope.expires_at]);
      if(!(await tx.query('SELECT id FROM onboarding_run WHERE id=$1',[id])).rows.length)throw Error('discovery_authority_unavailable');
      for(const item of plan.targets){
        await tx.query('INSERT INTO onboarding_asset(enterprise_id,id,endpoint,created_at) VALUES($1,$2,$3,clock_timestamp()) ON CONFLICT DO NOTHING',[a.enterpriseId,item.assetId,item.endpoint]);
        const actual=(await tx.query<Row>('SELECT endpoint FROM onboarding_asset WHERE id=$1',[item.assetId])).rows[0];
        if(actual?.endpoint!==item.endpoint)throw Error('discovery_asset_conflict');
        await tx.query('INSERT INTO onboarding_run_target(enterprise_id,run_id,asset_id,state,failure_code) VALUES($1,$2,$3,$4,$5)',[a.enterpriseId,id,item.assetId,item.probeSupported?'pending':'unsupported',item.probeSupported?null:item.probeCode]);
      }
      await this.audit(tx,a,'onboarding_run_created',{scopeId:q.scopeId,runId:id,targetCount:plan.targets.length});
      return {id,version:1,state:'authorized',created:true};
    });
  }
  private async runScope(actor:Actor,runId:string) {
    const a=this.actor(actor),id=uuid.parse(runId);
    const row=await withEnterprise(this.db,a.enterpriseId,async tx=>(await tx.query<Row>('SELECT scope_id FROM onboarding_run WHERE id=$1',[id])).rows[0]);
    if(!row)throw Error('not_found');return String(row.scope_id);
  }
  private async lockedRun(tx:Sql,id:string) {
    const r=(await tx.query<Row>('SELECT *,deadline>clock_timestamp() time_live FROM onboarding_run WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!r)throw Error('not_found');return r;
  }
  private async settle(tx:Sql,run:Row) {
    if(terminal.has(run.state))return;
    const rows=(await tx.query<Row>('SELECT state,count(*) n FROM onboarding_run_target WHERE run_id=$1 GROUP BY state',[run.id])).rows;
    if(rows.some(x=>['pending','issued'].includes(x.state)))return;
    const state=rows.some(x=>['unknown','unavailable','cancelled'].includes(x.state))?'partial':'completed';
    await tx.query('UPDATE onboarding_run SET state=$2,version=version+1 WHERE id=$1',[run.id,state]);
  }
  async claimNext(actor:Actor,runId:string):Promise<IssuedDiscoveryClaim|null> {
    const scopeId=await this.runScope(actor,runId);
    return this.scoped(actor,scopeId,async(tx,a,c)=>{
      this.live(c);const run=await this.lockedRun(tx,runId);
      if(terminal.has(run.state))return null;
      if(!run.time_live)throw Error('discovery_run_expired');
      if(run.requested_by!==a.id||Number(run.requester_version)!==a.authorizationVersion||Number(run.scope_version)!==Number(c.scope.version))throw Error('discovery_actor_changed');
      if(run.worker_instance&&run.worker_instance!==this.workerInstance)throw Error('discovery_worker_changed');
      if(Number((await tx.query<Row>("SELECT count(*) n FROM onboarding_run_target WHERE run_id=$1 AND state='issued'",[runId])).rows[0].n)>=discoveryLimits.concurrency)return null;
      const target=(await tx.query<Row>("SELECT t.*,a.endpoint FROM onboarding_run_target t JOIN onboarding_asset a ON a.enterprise_id=t.enterprise_id AND a.id=t.asset_id WHERE t.run_id=$1 AND t.state='pending' ORDER BY t.asset_id LIMIT 1 FOR UPDATE OF t",[runId])).rows[0];
      if(!target){await this.settle(tx,run);return null;}
      const item=this.plan(c.scope).targets.find(x=>x.assetId===target.asset_id&&x.endpoint===target.endpoint);
      if(!item?.probeSupported)throw Error('discovery_plan_changed');
      const claimId=randomUUID(),evidenceId=randomUUID();
      const issued=(await tx.query<Row>(`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() at)
        UPDATE onboarding_run_target SET state='issued',claim_id=$3,evidence_id=$4,issued_at=stamp.at,
        claim_deadline=LEAST($5::timestamptz,$6::timestamptz,stamp.at+interval '5 seconds') FROM stamp
        WHERE run_id=$1 AND asset_id=$2 AND state='pending' AND stamp.at<$5::timestamptz AND stamp.at<$6::timestamptz RETURNING claim_deadline`,
        [runId,target.asset_id,claimId,evidenceId,run.deadline,c.scope.expires_at])).rows[0];
      if(!issued)throw Error('discovery_run_expired');
      await tx.query("UPDATE onboarding_run SET state='running',worker_instance=$2 WHERE id=$1",[runId,this.workerInstance]);
      return {enterpriseId:a.enterpriseId,scopeId,scopeVersion:Number(c.scope.version),runId,runVersion:Number(run.version),assetId:target.asset_id,endpoint:target.endpoint,claimId,evidenceId,workerInstance:this.workerInstance,deadline:new Date(issued.claim_deadline).toISOString()};
    });
  }
  private async claim(tx:Sql,a:Actor,c:ScopeContext,handle:IssuedDiscoveryClaim,allowObserved=false) {
    this.live(c);const run=await this.lockedRun(tx,handle.runId);
    const t=(await tx.query<Row>('SELECT t.*,a.endpoint,claim_deadline>clock_timestamp() claim_live FROM onboarding_run_target t JOIN onboarding_asset a ON a.enterprise_id=t.enterprise_id AND a.id=t.asset_id WHERE t.run_id=$1 AND t.asset_id=$2 FOR UPDATE OF t',[handle.runId,handle.assetId])).rows[0];
    const recovering=allowObserved&&t?.state==='observed'&&['running','completed','partial'].includes(run.state);
    const versionMatches=Number(run.version)===handle.runVersion||recovering&&terminal.has(run.state)&&Number(run.version)===handle.runVersion+1;
    if(handle.enterpriseId!==a.enterpriseId||handle.scopeId!==c.scope.id||handle.scopeVersion!==Number(c.scope.version)||
      run.scope_id!==c.scope.id||handle.workerInstance!==this.workerInstance||run.worker_instance!==this.workerInstance||!versionMatches||
      run.requested_by!==a.id||Number(run.requester_version)!==a.authorizationVersion||Number(run.scope_version)!==handle.scopeVersion||
      !recovering&&(!run.time_live||run.state!=='running')||['cancelled','expired','unknown'].includes(run.state))throw Error('discovery_claim_stale');
    if(!t||t.claim_id!==handle.claimId||t.evidence_id!==handle.evidenceId||t.endpoint!==handle.endpoint||
      !['issued',...(allowObserved?['observed']:[])].includes(t.state)||t.state==='issued'&&!t.claim_live)throw Error('discovery_claim_stale');
    return {run,target:t};
  }
  async assertClaim(actor:Actor,handle:IssuedDiscoveryClaim) {
    return this.scoped(actor,handle.scopeId,async(tx,a,c)=>{await this.claim(tx,a,c,handle);});
  }
  async accept(actor:Actor,handle:IssuedDiscoveryClaim,input:unknown) {
    const observation=observationSchema.parse(input),digest=hash(observation);
    return this.scoped(actor,handle.scopeId,async(tx,a,c)=>{
      const {run,target}=await this.claim(tx,a,c,handle,true);
      const old=(await tx.query<Row>('SELECT id,observation_sha,accepted_at FROM onboarding_evidence WHERE id=$1',[handle.evidenceId])).rows[0];
      if(old){if(old.observation_sha!==digest)throw Error('discovery_evidence_conflict');return {id:old.id,acceptedAt:new Date(old.accepted_at).toISOString(),duplicate:false,recovered:true};}
      if(target.state!=='issued')throw Error('discovery_claim_stale');
      const saved=(await tx.query<Row>(`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() at)
        INSERT INTO onboarding_evidence(enterprise_id,id,run_id,asset_id,claim_id,scope_version,run_version,observation,observation_sha,accepted_at)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,stamp.at FROM stamp
        WHERE stamp.at<$10::timestamptz AND stamp.at<$11::timestamptz AND stamp.at<$12::timestamptz RETURNING id,accepted_at`,
        [a.enterpriseId,handle.evidenceId,handle.runId,handle.assetId,handle.claimId,handle.scopeVersion,handle.runVersion,
          JSON.stringify(observation),digest,c.scope.expires_at,run.deadline,target.claim_deadline])).rows[0];
      if(!saved)throw Error('discovery_run_expired');
      await tx.query("UPDATE onboarding_run_target SET state='observed' WHERE run_id=$1 AND asset_id=$2",[handle.runId,handle.assetId]);
      await this.audit(tx,a,'onboarding_evidence_accepted',{runId:handle.runId,evidenceId:saved.id,assetId:handle.assetId,observationSha256:digest});
      await this.settle(tx,run);return {id:saved.id,acceptedAt:new Date(saved.accepted_at).toISOString(),duplicate:false,recovered:false};
    });
  }
  async unavailable(actor:Actor,handle:IssuedDiscoveryClaim,code:string) {
    const safe=z.enum(['discovery_cancelled','discovery_request_deadline','discovery_response_size_limit',
      'discovery_response_encoding_invalid','discovery_content_encoding_unsupported','discovery_transport_unavailable',
      'ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','CERT_HAS_EXPIRED',
      'DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID']).parse(code);
    return this.scoped(actor,handle.scopeId,async(tx,a,c)=>{
      // Safe operational completion may outlive the five-second observation lease.
      // 安全运维状态可在五秒观察期限后收尾，但不能写入任何源端观察内容。
      const run=await this.lockedRun(tx,handle.runId);
      if(handle.enterpriseId!==a.enterpriseId||run.worker_instance!==this.workerInstance||Number(run.version)!==handle.runVersion||run.requested_by!==a.id||!['running'].includes(run.state))throw Error('discovery_claim_stale');
      if(!run.time_live||!c.scope.time_live){
        await tx.query("UPDATE onboarding_run SET state='expired',version=version+1 WHERE id=$1",[run.id]);
        await tx.query("UPDATE onboarding_run_target SET state=CASE WHEN state='issued' THEN 'unknown' ELSE 'cancelled' END WHERE run_id=$1 AND state IN ('issued','pending')",[run.id]);
        await this.audit(tx,a,'onboarding_run_expired',{runId:run.id});return {recorded:true,evidenceCommitted:false};
      }
      const row=(await tx.query<Row>("UPDATE onboarding_run_target SET state='unavailable',failure_code=$4 WHERE run_id=$1 AND asset_id=$2 AND claim_id=$3 AND state='issued' RETURNING asset_id",[handle.runId,handle.assetId,handle.claimId,safe])).rows[0];
      if(!row)throw Error('discovery_claim_stale');await this.settle(tx,run);return {recorded:true,evidenceCommitted:false};
    });
  }
  async run(actor:Actor,id:string) {
    const scopeId=await this.runScope(actor,id);
    return this.scoped(actor,scopeId,async(tx,_a,c)=>{
      const run=await this.lockedRun(tx,id);
      const rows=(await tx.query<Row>('SELECT t.asset_id,t.state,t.failure_code,a.endpoint,e.id evidence_id,e.observation,e.observation_sha FROM onboarding_run_target t JOIN onboarding_asset a ON a.enterprise_id=t.enterprise_id AND a.id=t.asset_id LEFT JOIN onboarding_evidence e ON e.enterprise_id=t.enterprise_id AND e.id=t.evidence_id WHERE t.run_id=$1 ORDER BY t.asset_id',[id])).rows;
      return {id:run.id,version:Number(run.version),state:run.state,deadline:new Date(run.deadline).toISOString(),
        active:c.active&&run.time_live,needsRecovery:run.state==='running'&&run.worker_instance!==this.workerInstance,
        workerInstance:run.worker_instance,
        scopeId,scopeActive:c.active,targets:rows.map(t=>({assetId:t.asset_id,state:t.state,code:t.failure_code,
          ...(c.active?{endpoint:t.endpoint,evidenceId:t.evidence_id,observation:t.observation,observationSha256:t.observation_sha}: {})})),
        connected:false,readAuthorized:false,executable:false};
    });
  }
  async cancel(actor:Actor,id:string,expectedVersion:number,markUnknown=false) {
    version.parse(expectedVersion);const scopeId=await this.runScope(actor,id);
    return this.scoped(actor,scopeId,async(tx,a,_c)=>{
      const run=await this.lockedRun(tx,id);if(Number(run.version)!==expectedVersion)throw Error('discovery_run_conflict');
      if(terminal.has(run.state))return {id,version:Number(run.version),state:run.state};
      const state=markUnknown?'unknown':'cancelled';
      await tx.query('UPDATE onboarding_run SET state=$2,version=version+1 WHERE id=$1',[id,state]);
      await tx.query("UPDATE onboarding_run_target SET state=CASE WHEN state='issued' THEN 'unknown' ELSE 'cancelled' END WHERE run_id=$1 AND state IN ('pending','issued')",[id]);
      await this.audit(tx,a,markUnknown?'onboarding_run_fenced':'onboarding_run_cancelled',{runId:id});
      return {id,version:expectedVersion+1,state};
    });
  }
  async fence(actor:Actor,id:string,input:unknown) {
    const q=z.object({expectedVersion:version,expectedWorkerInstance:uuid,recoveryAcknowledged:z.literal(true)}).strict().parse(input);
    const scopeId=await this.runScope(actor,id);
    return this.scoped(actor,scopeId,async(tx,a,_c)=>{
      const run=await this.lockedRun(tx,id);
      if(Number(run.version)!==q.expectedVersion||run.worker_instance!==q.expectedWorkerInstance)throw Error('discovery_run_conflict');
      if(terminal.has(run.state))return {id,version:Number(run.version),state:run.state};
      await tx.query("UPDATE onboarding_run SET state='unknown',version=version+1 WHERE id=$1",[id]);
      await tx.query("UPDATE onboarding_run_target SET state=CASE WHEN state='issued' THEN 'unknown' ELSE 'cancelled' END WHERE run_id=$1 AND state IN ('issued','pending')",[id]);
      await this.audit(tx,a,'onboarding_run_fenced',{runId:id,previousWorkerInstance:q.expectedWorkerInstance});
      return {id,version:q.expectedVersion+1,state:'unknown'};
    });
  }
  async expire(actor:Actor,id:string) {
    const scopeId=await this.runScope(actor,id);
    return this.scoped(actor,scopeId,async(tx,a,c)=>{
      const run=await this.lockedRun(tx,id);
      if(terminal.has(run.state))return {id,state:run.state};
      const row=(await tx.query<Row>(`UPDATE onboarding_run SET state='expired',version=version+1
        WHERE id=$1 AND (deadline<=clock_timestamp() OR $2::timestamptz<=clock_timestamp()) RETURNING id`,[id,c.scope.expires_at])).rows[0];
      if(!row)throw Error('discovery_run_not_expired');
      await tx.query("UPDATE onboarding_run_target SET state=CASE WHEN state='issued' THEN 'unknown' ELSE 'cancelled' END WHERE run_id=$1 AND state IN ('pending','issued')",[id]);
      await this.audit(tx,a,'onboarding_run_expired',{runId:id});return {id,state:'expired'};
    });
  }
  async revoke(actor:Actor,id:string,expectedVersion:number) {
    version.parse(expectedVersion);
    return this.scoped(actor,id,async(tx,a,c)=>{
      if(Number(c.scope.version)!==expectedVersion)throw Error('scope_conflict');
      if(c.scope.revoked)return {id,version:expectedVersion,revoked:true};
      await tx.query('UPDATE onboarding_scope SET revoked=true,version=version+1 WHERE id=$1',[id]);
      const runs=(await tx.query<Row>("SELECT id FROM onboarding_run WHERE scope_id=$1 AND state IN ('authorized','running') ORDER BY id FOR UPDATE",[id])).rows;
      for(const run of runs){await tx.query("UPDATE onboarding_run SET state='cancelled',version=version+1 WHERE id=$1",[run.id]);
        await tx.query("UPDATE onboarding_run_target SET state=CASE WHEN state='issued' THEN 'unknown' ELSE 'cancelled' END WHERE run_id=$1 AND state IN ('pending','issued')",[run.id]);}
      await this.audit(tx,a,'onboarding_scope_revoked',{scopeId:id,version:expectedVersion+1});return {id,version:expectedVersion+1,revoked:true};
    });
  }
}
