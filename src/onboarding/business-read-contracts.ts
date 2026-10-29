// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Frozen business-read boundaries; metadata discovery never implies this grant.
// 冻结业务读取边界；元数据发现不自动授予本合同权限。
import {z} from 'zod';
import {hash} from '../runtime/contracts.ts';
import {planDiscoveryTargets} from './discovery-contracts.ts';
const uuid=z.uuid().transform(v=>v.toLowerCase()),version=z.number().int().positive().max(2147483646);
export const principalReference=z.object({id:uuid,version,role:z.enum(['it','business'])}).strict();
const identifier=z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,79}$/);
export const businessReadPolicySchema=z.object({
 format:z.literal('enterprise-brain.business-read-policy/1'),enterpriseId:uuid,scopeId:uuid,scopeVersion:version,
 discoveryRunId:uuid,reviewId:uuid,reviewVersion:version,bindingId:uuid,bindingVersion:version,
 owner:principalReference,reviewer:principalReference,policyReviewer:principalReference,
 metadataSha256:z.string().regex(/^[a-f0-9]{64}$/),adapter:z.literal('odata.projected-read.v1'),
 endpoint:z.string().max(2048),entity:identifier,fields:z.array(identifier).min(1).max(32),
 maxRows:z.number().int().min(1).max(100),maxBytes:z.number().int().min(256).max(262144),
 timeoutMs:z.number().int().min(100).max(5000),purpose:z.string().trim().min(1).max(400).regex(/^[^\x00-\x1f\x7f]+$/)
}).strict().superRefine((q,c)=>{
 if([q.owner,q.reviewer,q.policyReviewer].some(p=>p.role!=='it'))c.addIssue({code:'custom',message:'business_read_it_reference_required'});
 if(new Set(q.fields).size!==q.fields.length)c.addIssue({code:'custom',message:'business_read_duplicate_field'});
});
export type BusinessReadPolicy=z.infer<typeof businessReadPolicySchema>;
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export function businessReadPolicy(input:unknown){
 const q=businessReadPolicySchema.parse(input),target=planDiscoveryTargets(q.enterpriseId,[q.endpoint]).targets[0];
 if(!target.probeSupported||new URL(target.endpoint).search)throw Error('business_read_target_unsupported');
 q.endpoint=target.endpoint;q.fields.sort();businessReadDelegates(q);return freeze({policy:q,sha256:hash(q)});
}
// Pure pre-lock list: no SQL or network, called before the enterprise parent lock.
// 纯身份预锁列表，无SQL/网络，必须在企业父行之前使用。
export function businessReadDelegates(policy:BusinessReadPolicy,approver?:z.infer<typeof principalReference>){
 const refs=[policy.owner,policy.reviewer,policy.policyReviewer,...(approver?[principalReference.parse(approver)]:[])];
 if(approver&&approver.role!=='business')throw Error('business_read_approver_required');
 const unique=new Map<string,typeof refs[number]>();for(const ref of refs){const old=unique.get(ref.id);if(old&&(old.version!==ref.version||old.role!==ref.role))throw Error('business_read_identity_conflict');unique.set(ref.id,ref);}
 return [...unique.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(p=>({...p}));
}
// Projection is local and strict; never spread unapproved source fields into output.
// 严格本地投影，禁止把未批准源字段展开到返回数据。
export function projectBusinessRows(policy:BusinessReadPolicy,input:unknown){
 const checked=businessReadPolicy(policy).policy;
 if(Buffer.byteLength(JSON.stringify(input)??'','utf8')>checked.maxBytes)throw Error('business_read_byte_limit');
 const body=z.object({value:z.array(z.record(z.string(),z.unknown())).max(checked.maxRows)}).strict().parse(input);
 return body.value.map(row=>Object.fromEntries(checked.fields.map(field=>{
  if(!Object.hasOwn(row,field))throw Error('business_read_field_missing');const value=row[field];
  if(value!==null&&!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw Error('business_read_value_invalid');
  return [field,value];
 })));
}
