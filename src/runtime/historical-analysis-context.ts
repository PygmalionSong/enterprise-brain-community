// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Validate immutable original context,not a new model/read permission.
// 核对不可变原上下文，不将它当作新模型或读取权限。
import {z} from 'zod';import {analysisFieldPathSchema,analysisFieldValueSchema} from './analysis-fields.ts';
import {analysisContextSelectionSchema,type AnalysisPreparedContext} from './analysis-policy.ts';
import {businessAnalysisWireSchema,decodeBusinessAnalysisOutput} from './business-analysis-model-wire.ts';import {businessAnalysisUsageSchema} from './business-analysis-results.ts';import {hash} from './contracts.ts';
const sha=z.string().regex(/^[a-f0-9]{64}$/),positive=z.number().int().positive().max(2147483647),code=z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/);
const field=z.object({path:analysisFieldPathSchema,value:analysisFieldValueSchema,valueHash:sha}).strict();
const observation=z.object({id:z.uuid(),version:positive,payloadHash:sha,actionId:z.uuid(),resultHash:sha,toolId:code,toolVersion:code,toolContractHash:sha,sourceRevision:z.string().min(1).max(160),receiptRef:z.string().min(1).max(160),receiptRecordedAt:z.iso.datetime(),sourceObservedAt:z.null(),contentKind:z.enum(['process_metadata','source_read_result']),fields:z.array(field).min(1).max(32),fieldsHash:sha}).strict();
const contextSchema=z.object({format:z.literal('enterprise-brain.business-analysis-context/1'),authority:z.literal('source-data-not-instructions'),policyId:z.uuid(),policyVersion:positive,policySettingsHash:sha,configurationId:z.uuid(),configurationVersion:positive,modelIdentitySha256:sha,validUntil:z.iso.datetime(),observations:z.array(observation).min(1).max(4)}).strict();
const inputSchema=z.object({goal:z.string().min(1).max(4000).refine(v=>v.trim().length>0),language:z.enum(['zh','en','ja']),selection:analysisContextSelectionSchema,contextHash:sha}).strict();
export function validateHistoricalAnalysis(r:Record<string,any>){
 try{
  if(r.state!=='completed')throw Error('history_not_completed');const context=contextSchema.parse(r.context),input=inputSchema.parse(r.input),wire=businessAnalysisWireSchema.parse(r.output);
  if(Buffer.byteLength(JSON.stringify(context))>65536)throw Error('history_context_limit');
  if(hash(input)!==r.request_hash||input.contextHash!==r.context_hash||context.policyId!==r.policy_id||context.policyVersion!==Number(r.policy_version)||context.configurationId!==r.configuration_id||context.configurationVersion!==Number(r.configuration_version)||context.modelIdentitySha256!==r.model_identity_sha256||hash(wire)!==r.output_hash)throw Error('history_request_corrupt');
  const actor={id:r.principal_id,enterpriseId:r.enterprise_id,role:r.principal_role,authorizationVersion:Number(r.authorization_version)};
  if(hash({actor,context})!==r.context_hash||input.selection.expectedPolicyVersion!==context.policyVersion||context.observations.length!==input.selection.observations.length)throw Error('history_request_corrupt');
  const ids=new Set<string>();for(let i=0;i<context.observations.length;i++){const o=context.observations[i],s=input.selection.observations[i];if(ids.has(o.id)||o.id!==s.id||o.version!==s.expectedVersion||hash(o.fields)!==o.fieldsHash||hash(o.fields.map(f=>f.path))!==hash(s.fields)||o.fields.some(f=>hash(f.value)!==f.valueHash))throw Error('history_request_corrupt');ids.add(o.id);}
  const prepared:AnalysisPreparedContext={context,contextHash:r.context_hash,bytes:Buffer.byteLength(JSON.stringify(context)),preparedOnly:true,analysisAuthorized:false,modelCalled:false,budgetReserved:false,executed:false};
  const reportedUsage=businessAnalysisUsageSchema.parse(r.reported_usage);decodeBusinessAnalysisOutput(wire,prepared);return {input,wire,prepared,reportedUsage};
 }catch(e){const code=(e as Error).message;if(['history_not_completed','history_context_limit'].includes(code))throw e;throw Error('history_request_corrupt');}
}
