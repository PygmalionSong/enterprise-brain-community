// Commit projection and checkpoint together after a fresh, locked permission check.
// 权限复核后，投影与断点同事务提交；不是业务源账本。
import {randomUUID} from 'node:crypto';
import type {Actor} from '../identity/service.ts';
import type {ConnectionService} from './discovery.ts';
import {changeBatchSchema} from './change-contract.ts';
import type {Sql} from '../db/adapter.ts';
type Row=Record<string,any>;
export type SyncLease={id:string;version:number};
export class SynchronizationService {
 private connections:ConnectionService;private now:()=>Date;
 constructor(connections:ConnectionService,now=()=>new Date()){this.connections=connections;this.now=now;}
 private async scheduled(tx:Sql,actor:Actor,id:string,lease?:SyncLease){if(!lease)return;const q=(await tx.query<Row>('SELECT * FROM connector_sync_schedule WHERE connection_id=$1 FOR UPDATE',[id])).rows[0];if(!q||!q.enabled||Number(q.version)!==lease.version||q.lease_id!==lease.id||new Date(q.lease_until)<=this.now()||q.principal_id!==actor.id||Number(q.authorization_version)!==actor.authorizationVersion)throw Error('schedule_stale');}
 async sync(actor:Actor,id:string,version:number,reset=false,lease?:SyncLease){
  const before=await this.connections.commitRead(actor,id,version,async(tx,c)=>{await this.scheduled(tx,actor,id,lease);const state=(await tx.query<Row>('SELECT * FROM connector_sync_state WHERE connection_id=$1',[id])).rows[0];if(state&&state.binding!==c.confirmation.binding&&!reset)throw Error('sync_reset_required');return state;});
  const batch=changeBatchSchema.parse(await this.connections.readChanges(actor,id,reset?undefined:before?.checkpoint));
  if(!before&&!batch.complete||reset&&!batch.complete)throw Error('sync_incomplete');if(before&&!reset&&(batch.sourceId!==before.source_id||batch.sourceVersion<Number(before.source_version)))throw Error('cursor_stale');
  if(before&&!reset&&batch.sourceVersion===Number(before.source_version)){if(batch.checkpoint!==before.checkpoint)throw Error('invalid_cursor');batch.changes=[];}
  const recordKeys=new Set<string>();for(const group of batch.changes)for(const row of group.rows){if(typeof row.source_key!=='string'||row.source_key.length>500||!row.source_key||recordKeys.has(row.source_key))throw Error('invalid_change_batch');recordKeys.add(row.source_key);}
  return this.connections.commitRead(actor,id,version,async(tx,c)=>{
   await this.scheduled(tx,actor,id,lease);
   const current=(await tx.query<Row>('SELECT * FROM connector_sync_state WHERE connection_id=$1 FOR UPDATE',[id])).rows[0];if((current?.checkpoint??null)!==(before?.checkpoint??null)||(current?.binding??null)!==(before?.binding??null))throw Error('sync_conflict');
   if(reset||!before)await tx.query('DELETE FROM connector_projection WHERE connection_id=$1',[id]);
   for(const group of batch.changes){await tx.query('DELETE FROM connector_projection WHERE connection_id=$1 AND group_key=$2',[id,group.key]);for(const row of group.rows){const collision=(await tx.query<Row>('SELECT group_key FROM connector_projection WHERE connection_id=$1 AND record_key=$2',[id,row.source_key])).rows[0];if(collision)throw Error('invalid_change_batch');await tx.query('INSERT INTO connector_projection VALUES($1,$2,$3,$4,$5,$6)',[actor.enterpriseId,id,group.key,row.source_key,JSON.stringify(row),batch.sourceVersion]);}}
   await tx.query('INSERT INTO connector_sync_state(enterprise_id,connection_id,binding,source_id,source_version,checkpoint,as_of) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(enterprise_id,connection_id) DO UPDATE SET binding=$3,source_id=$4,source_version=$5,checkpoint=$6,as_of=$7,updated_at=now()',[actor.enterpriseId,id,c.confirmation.binding,batch.sourceId,batch.sourceVersion,batch.checkpoint,batch.asOf]);
   const total=Number((await tx.query<Row>('SELECT count(*) n FROM connector_projection WHERE connection_id=$1',[id])).rows[0].n);await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',[actor.enterpriseId,randomUUID(),'connector_synchronized',JSON.stringify({connectionId:id,connectionVersion:version,sourceVersion:batch.sourceVersion,groups:batch.changes.length,totalRows:total,reset,asOf:batch.asOf})]);return {connectionId:id,sourceVersion:batch.sourceVersion,changedGroups:batch.changes.length,rows:total,asOf:batch.asOf,reset};
  });
 }
 async view(actor:Actor,id:string,version:number){await this.connections.assertActive(actor.enterpriseId,id,'read');return this.connections.commitRead(actor,id,version,async(tx,c)=>{const state=(await tx.query<Row>('SELECT * FROM connector_sync_state WHERE connection_id=$1',[id])).rows[0];if(!state)return {state:null,rows:[],truncated:false};if(state.binding!==c.confirmation.binding)throw Error('sync_reset_required');const rows=(await tx.query<Row>('SELECT payload FROM connector_projection WHERE connection_id=$1 ORDER BY group_key,record_key LIMIT 129',[id])).rows.map(r=>r.payload);return {state:{sourceId:state.source_id,sourceVersion:Number(state.source_version),asOf:state.as_of,updatedAt:state.updated_at},rows:rows.slice(0,128),truncated:rows.length>128};});}
}
