// A generic process read has no beverage facts, fixture source or model fallback.
// 通用流程读取没有饮料事实、构造源或模型回退。
import {z} from 'zod';
import type {Database} from '../db/adapter.ts';
import type {Actor} from '../identity/service.ts';
import {GraphToolCatalog} from './graph-contracts.ts';
const args=z.object({registryId:z.uuid(),definitionSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function enterpriseGraphTools(db:Database){
 const read=async(actor:Actor,input:unknown)=>{const q=args.parse(input),p=(await db.query<any>('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2',[actor.enterpriseId,actor.id])).rows[0];if(!p||p.disabled||p.role!==actor.role||!['executive','operations'].includes(p.role)||Number(p.authorization_version)!==actor.authorizationVersion)throw Error('not_authorized');const row=(await db.query<any>("SELECT version,definition,definition_sha256 FROM process_registry WHERE enterprise_id=$1 AND id=$2 AND state='confirmed'",[actor.enterpriseId,q.registryId])).rows[0];if(!row||row.definition_sha256!==q.definitionSha256)throw Error('graph_source_changed');return row;};
 const result=async(actor:Actor,input:unknown,reference:string)=>{const r=await read(actor,input);return {reference,state:'completed',receiptRef:'process-read-'+reference,sourceRevision:'registry-'+r.version,data:{definitionSha256:r.definition_sha256,nodes:r.definition.nodes.length,edges:r.definition.edges.length}};};
 return new GraphToolCatalog([{id:'process.definition.read',version:'v1',effect:'read',inputSchema:z.toJSONSchema(args),validate:value=>args.parse(value),authorize:async(actor,input)=>{await read(actor,input);},submit:result,lookup:result}]);
}
