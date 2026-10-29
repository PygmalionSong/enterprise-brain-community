// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Explicitly reviewed metadata-only connections; no business records/tools or secrets.
// 经过明确核对的仅元数据连接，不读取业务记录、不调用工具、不接收秘密。
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../identity/service.ts';
import type {Database,Sql} from '../db/adapter.ts';
import {withEnterprise} from '../db/adapter.ts';
import {hash} from '../runtime/contracts.ts';
import {DiscoveryStore,type DiscoveryScopeContext} from './discovery-store.ts';
import {observationSchema} from './observation-schema.ts';
import {probeHttpMetadata} from './http-metadata-probe.ts';
type Row=Record<string,any>;
const uuid=z.uuid().transform(v=>v.toLowerCase()),version=z.number().int().positive().safe();
const key=z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),text=(max:number)=>z.string().trim().min(1).max(max).regex(/^[^\x00-\x1f\x7f]+$/);
export class MetadataConnections {
  private db:Database;private store:DiscoveryStore;
  constructor(db:Database,store:DiscoveryStore){this.db=db;this.store=store;}
  private async lookup(actor:Actor,id:string) {
    if(actor.role!=='it')throw Error('not_authorized');uuid.parse(actor.enterpriseId);uuid.parse(actor.id);uuid.parse(id);
    const row=await withEnterprise(this.db,actor.enterpriseId,async tx=>(await tx.query<Row>(`SELECT b.id,b.review_id,v.reviewed_by,r.scope_id,e.run_id
      FROM onboarding_binding b JOIN onboarding_review v ON v.enterprise_id=b.enterprise_id AND v.id=b.review_id
      JOIN onboarding_evidence e ON e.enterprise_id=v.enterprise_id AND e.id=v.evidence_id
      JOIN onboarding_run r ON r.enterprise_id=e.enterprise_id AND r.id=e.run_id WHERE b.id=$1`,[id])).rows[0]);
    if(!row)throw Error('not_found');return row;
  }
  private async transaction<T>(actor:Actor,id:string,fn:(tx:Sql,a:Actor,c:DiscoveryScopeContext,row:Row,current:boolean)=>Promise<T>) {
    const initial=await this.lookup(actor,id);
    return this.store.transactionScope(actor,initial.scope_id,[initial.reviewed_by],async(tx,a,c)=>{
      await tx.query('SELECT id FROM onboarding_run WHERE id=$1 FOR SHARE',[initial.run_id]);
      const row=(await tx.query<Row>(`SELECT b.*,v.version review_actual_version,v.revoked review_revoked,v.reviewed_by,v.reviewer_version,v.purpose,v.evidence_id,
        e.observation,e.observation_sha,e.asset_id,e.run_id source_run_id,a.endpoint FROM onboarding_binding b
        JOIN onboarding_review v ON v.enterprise_id=b.enterprise_id AND v.id=b.review_id
        JOIN onboarding_evidence e ON e.enterprise_id=v.enterprise_id AND e.id=v.evidence_id
        JOIN onboarding_asset a ON a.enterprise_id=e.enterprise_id AND a.id=e.asset_id
        WHERE b.id=$1 FOR UPDATE OF v,b`,[id])).rows[0];
      if(!row||row.review_id!==initial.review_id||row.reviewed_by!==initial.reviewed_by)throw Error('discovery_review_stale');
      const reviewer=c.principals.get(row.reviewed_by);
      const current=c.active&&!row.review_revoked&&row.state!=='revoked'&&Number(row.review_version)===Number(row.review_actual_version)&&
        !!reviewer&&!reviewer.disabled&&reviewer.role==='it'&&Number(reviewer.authorization_version)===Number(row.reviewer_version);
      return fn(tx,a,c,row,current);
    });
  }
  async review(actor:Actor,input:unknown) {
    const q=z.object({evidenceId:uuid,expectedObservationSha256:z.string().regex(/^[a-f0-9]{64}$/),systemName:text(160),businessPurpose:text(400),businessOwnerRole:text(160),
      identityAcknowledged:z.literal(true),metadataReadAcknowledged:z.literal(true),idempotencyKey:key}).strict().parse(input);
    const initial=await withEnterprise(this.db,actor.enterpriseId,async tx=>(await tx.query<Row>('SELECT r.scope_id,e.run_id,e.asset_id FROM onboarding_evidence e JOIN onboarding_run r ON r.enterprise_id=e.enterprise_id AND r.id=e.run_id WHERE e.id=$1',[q.evidenceId])).rows[0]);
    if(!initial)throw Error('not_found');
    return this.store.transactionScope(actor,initial.scope_id,[],async(tx,a,c)=>{
      if(!c.active)throw Error('discovery_authority_unavailable');
      await tx.query('SELECT id FROM onboarding_run WHERE id=$1 FOR SHARE',[initial.run_id]);
      const evidence=(await tx.query<Row>('SELECT * FROM onboarding_evidence WHERE id=$1',[q.evidenceId])).rows[0];
      if(!evidence||evidence.asset_id!==initial.asset_id||evidence.observation_sha!==q.expectedObservationSha256)throw Error('discovery_review_stale');
      const observation=observationSchema.parse(evidence.observation);
      if(observation.protocol!=='odata-json-csdl'||!observation.metadataReadableCandidate)throw Error('discovery_adapter_unavailable');
      const requestSha=hash(q),prior=(await tx.query<Row>('SELECT v.id,v.purpose,b.id binding_id,b.version,b.state FROM onboarding_review v JOIN onboarding_binding b ON b.enterprise_id=v.enterprise_id AND b.review_id=v.id WHERE v.reviewed_by=$1 AND v.idempotency_key=$2',[a.id,q.idempotencyKey])).rows[0];
      if(prior){if(prior.purpose.requestSha!==requestSha)throw Error('idempotency_conflict');return {id:prior.binding_id,version:Number(prior.version),state:prior.state,created:false};}
      const id=randomUUID(),binding=randomUUID(),purpose={systemName:q.systemName,businessPurpose:q.businessPurpose,businessOwnerRole:q.businessOwnerRole,requestSha,metadataOnly:true};
      await tx.query('INSERT INTO onboarding_review(enterprise_id,id,asset_id,evidence_id,version,reviewed_by,reviewer_version,purpose,created_at,idempotency_key) VALUES($1,$2,$3,$4,1,$5,$6,$7,clock_timestamp(),$8)',[a.enterpriseId,id,evidence.asset_id,q.evidenceId,a.id,a.authorizationVersion,JSON.stringify(purpose),q.idempotencyKey]);
      await tx.query("INSERT INTO onboarding_binding(enterprise_id,id,review_id,review_version,adapter_id,adapter_version,version,state,created_at) VALUES($1,$2,$3,1,'odata.metadata','1',1,'pending',clock_timestamp())",[a.enterpriseId,binding,id]);
      await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',[a.enterpriseId,randomUUID(),'onboarding_identity_reviewed',JSON.stringify({bindingId:binding,evidenceId:q.evidenceId,observationSha256:evidence.observation_sha})]);
      return {id:binding,version:1,state:'pending',created:true};
    });
  }
  async view(actor:Actor,id:string) {
    return this.transaction(actor,id,async(_tx,_a,c,row,current)=>({id:row.id,version:Number(row.version),state:row.state==='revoked'?'revoked':current?row.state:'needs_review',
      ...(current?{systemName:row.purpose.systemName,businessPurpose:row.purpose.businessPurpose,businessOwnerRole:row.purpose.businessOwnerRole,endpoint:row.endpoint}:{}),
      ...(current&&row.state==='read_tested'?{policyContext:{enterpriseId:actor.enterpriseId,scopeId:c.scope.id,scopeVersion:Number(c.scope.version),discoveryRunId:row.source_run_id,reviewId:row.review_id,reviewVersion:Number(row.review_actual_version),bindingId:row.id,bindingVersion:Number(row.version),owner:{id:c.scope.owner_id,version:Number(c.scope.owner_version),role:'it'},reviewer:{id:row.reviewed_by,version:Number(row.reviewer_version),role:'it'},metadataSha256:row.observation.rawSha256}}:{}),
      metadataReady:current&&row.state==='read_tested',businessDataAuthorized:false,processDefinitionAvailable:false,executable:false}));
  }
  async list(actor:Actor) {
    if(actor.role!=='it')throw Error('not_authorized');
    const ids=await withEnterprise(this.db,actor.enterpriseId,async tx=>(await tx.query<Row>('SELECT b.id FROM onboarding_binding b JOIN onboarding_review v ON v.enterprise_id=b.enterprise_id AND v.id=b.review_id WHERE v.reviewed_by=$1 ORDER BY b.created_at DESC,b.id DESC LIMIT 50',[actor.id])).rows);
    // Validate current actor even when the list is empty.
    // 空列表也要核验当前身份，不用“没有数据”绕过身份检查。
    await this.store.listScopes(actor);const result=[];for(const row of ids)result.push(await this.view(actor,row.id));return result;
  }
  async testRead(actor:Actor,id:string,input:unknown) {
    const q=z.object({expectedVersion:version,idempotencyKey:key,readTestAcknowledged:z.literal(true)}).strict().parse(input);
    const task=await this.transaction(actor,id,async(tx,a,c,row,current)=>{
      if(!current)throw Error('discovery_review_stale');
      const old=(await tx.query<Row>('SELECT * FROM onboarding_read_test WHERE requested_by=$1 AND idempotency_key=$2',[a.id,q.idempotencyKey])).rows[0];
      if(old){if(old.binding_id!==id||Number(old.binding_version)!==q.expectedVersion)throw Error('idempotency_conflict');return {id:old.id,state:old.state,dispatch:false,endpoint:'',rawSha:''};}
      if(Number(row.version)!==q.expectedVersion)throw Error('discovery_review_stale');
      await tx.query("UPDATE onboarding_read_test SET state='unavailable',completed_at=clock_timestamp(),code='discovery_request_deadline' WHERE binding_id=$1 AND state='issued' AND deadline<=clock_timestamp()",[id]);
      if((await tx.query("SELECT id FROM onboarding_read_test WHERE binding_id=$1 AND state='issued'",[id])).rows.length)throw Error('discovery_read_test_pending');
      const testId=randomUUID();
      const created=(await tx.query<Row>(`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() at)
        INSERT INTO onboarding_read_test(enterprise_id,id,binding_id,binding_version,review_version,requested_by,requester_version,idempotency_key,state,deadline)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,'issued',LEAST($9::timestamptz,at+interval '5 seconds') FROM stamp WHERE at<$9::timestamptz RETURNING id`,
        [a.enterpriseId,testId,id,row.version,row.review_actual_version,a.id,a.authorizationVersion,q.idempotencyKey,c.scope.expires_at])).rows[0];
      if(!created)throw Error('discovery_authority_unavailable');
      return {id:testId,state:'issued',dispatch:true,endpoint:String(row.endpoint),rawSha:String(row.observation.rawSha256)};
    });
    if(!task.dispatch)return {id:task.id,state:task.state,recovered:true};
    const check=()=>this.transaction(actor,id,async(tx,a,_c,row,current)=>{
      const test=(await tx.query<Row>('SELECT *,deadline>clock_timestamp() time_live FROM onboarding_read_test WHERE id=$1 FOR UPDATE',[task.id])).rows[0];
      if(!current||!test||test.state!=='issued'||!test.time_live||Number(row.version)!==q.expectedVersion||test.requested_by!==a.id||Number(test.requester_version)!==a.authorizationVersion)throw Error('discovery_read_test_stale');
    });
    const response=await probeHttpMetadata(task.endpoint,{check:async()=>{await check();}});
    return this.transaction(actor,id,async(tx,a,_c,row,current)=>{
      if(!current||Number(row.version)!==q.expectedVersion)throw Error('discovery_review_stale');
      const test=(await tx.query<Row>('SELECT * FROM onboarding_read_test WHERE id=$1 FOR UPDATE',[task.id])).rows[0];
      if(!test||test.state!=='issued'||test.requested_by!==a.id||Number(test.requester_version)!==a.authorizationVersion)throw Error('discovery_read_test_stale');
      const passed=response.status==='observed'&&response.observation.protocol==='odata-json-csdl'&&response.observation.rawSha256===task.rawSha;
      const state=passed?'passed':response.status==='observed'?'changed':'unavailable',code=passed?'metadata_read_confirmed':response.status==='observed'?'discovery_metadata_changed':'discovery_transport_unavailable';
      const saved=(await tx.query<Row>(`UPDATE onboarding_read_test SET state=$2,completed_at=clock_timestamp(),code=$3
        WHERE id=$1 AND (NOT $4::boolean OR deadline>clock_timestamp()) RETURNING id`,[task.id,state,code,passed])).rows[0];
      if(!saved)throw Error('discovery_read_test_expired');
      if(passed&&row.state==='pending')await tx.query("UPDATE onboarding_binding SET state='read_tested',version=version+1 WHERE id=$1",[id]);
      if(!passed&&(state==='changed'||row.state==='read_tested')){
        await tx.query("UPDATE onboarding_binding SET state='revoked',version=version+1 WHERE id=$1",[id]);
        await tx.query('UPDATE onboarding_review SET revoked=true,version=version+1 WHERE id=$1',[row.review_id]);
      }
      await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',[a.enterpriseId,randomUUID(),'onboarding_metadata_read_test',JSON.stringify({testId:task.id,bindingId:id,state})]);
      return {id:task.id,state,recovered:false};
    });
  }
  async revoke(actor:Actor,id:string,expectedVersion:number) {
    version.parse(expectedVersion);
    return this.transaction(actor,id,async(tx,a,_c,row,_current)=>{
      if(Number(row.version)!==expectedVersion)throw Error('discovery_review_stale');
      if(row.state==='revoked')return {id,version:expectedVersion,state:'revoked'};
      await tx.query("UPDATE onboarding_binding SET state='revoked',version=version+1 WHERE id=$1",[id]);
      if(!row.review_revoked)await tx.query('UPDATE onboarding_review SET revoked=true,version=version+1 WHERE id=$1',[row.review_id]);
      await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',[a.enterpriseId,randomUUID(),'onboarding_metadata_connection_revoked',JSON.stringify({bindingId:id})]);
      return {id,version:expectedVersion+1,state:'revoked'};
    });
  }
}
