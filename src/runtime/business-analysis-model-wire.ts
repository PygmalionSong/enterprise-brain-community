// Validate citations,not semantic truth;never accept model-written source values or executable plans.
// 核对引用，不认证语义真伪；不接收模型重写的源值或可执行计划。
import {z} from 'zod';
import {planningDataSchema} from './planning-ledger.ts';
import {analysisFieldPathSchema} from './analysis-fields.ts';
import type {AnalysisPreparedContext} from './analysis-policy.ts';
import {hash} from './contracts.ts';

const id=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/),text=z.string().min(1).max(1500).refine(v=>v.trim().length>0);
const citation=z.object({id,observationId:z.uuid(),path:analysisFieldPathSchema,valueHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const statement=z.object({id,text,referenceIds:z.array(id).min(1).max(8)}).strict();
export const businessAnalysisWireSchema=z.object({
 format:z.literal('enterprise-brain.business-analysis-response/1'),kind:z.enum(['need_input','analysis']),
 questions:z.array(text).max(12),hypotheses:z.array(statement).max(12),recommendations:z.array(statement).max(12),
 references:z.array(citation).max(32),limitations:z.array(text).min(1).max(12)
}).strict();
export function businessAnalysisOutputSchema(){return z.toJSONSchema(businessAnalysisWireSchema);}

export function decodeBusinessAnalysisOutput(input:unknown,prepared:AnalysisPreparedContext){
 planningDataSchema.parse(input);const q=businessAnalysisWireSchema.parse(input),ids=[...q.references,...q.hypotheses,...q.recommendations].map(x=>x.id);
 if(new Set(ids).size!==ids.length)throw Error('analysis_wire_duplicate_id');
 if(q.kind==='need_input'){
  if(!q.questions.length||q.hypotheses.length||q.recommendations.length||q.references.length)throw Error('analysis_wire_branch_invalid');
 }else if(q.questions.length||(!q.hypotheses.length&&!q.recommendations.length))throw Error('analysis_wire_branch_invalid');
 const tuples=new Set<string>(),used=new Set<string>();
 for(const statement of [...q.hypotheses,...q.recommendations]){
  if(new Set(statement.referenceIds).size!==statement.referenceIds.length)throw Error('analysis_wire_duplicate_reference');
  for(const ref of statement.referenceIds){if(!q.references.some(r=>r.id===ref))throw Error('analysis_citation_unknown');used.add(ref);}
 }
 const evidence=q.references.map(ref=>{
  const tuple=ref.observationId+'\n'+ref.path;if(tuples.has(tuple))throw Error('analysis_wire_duplicate_reference');tuples.add(tuple);
  if(!used.has(ref.id))throw Error('analysis_citation_unused');
  const observation=prepared.context.observations.find(o=>o.id===ref.observationId),field=observation?.fields.find(f=>f.path===ref.path);
  if(!observation||!field||field.valueHash!==ref.valueHash||hash(field.value)!==field.valueHash||hash(observation.fields)!==observation.fieldsHash)throw Error('analysis_citation_invalid');
  return {id:ref.id,observationId:observation.id,observationVersion:observation.version,observationPayloadHash:observation.payloadHash,
   actionId:observation.actionId,resultHash:observation.resultHash,toolId:observation.toolId,toolVersion:observation.toolVersion,toolContractHash:observation.toolContractHash,
   sourceRevision:observation.sourceRevision,receiptRef:observation.receiptRef,receiptRecordedAt:observation.receiptRecordedAt,sourceObservedAt:observation.sourceObservedAt,
   contentKind:observation.contentKind,path:field.path,value:field.value,valueHash:field.valueHash};
 });
 const mark=(s:z.infer<typeof statement>)=>({...s,origin:'model-generated' as const,verification:'unverified' as const});
 return {format:'enterprise-brain.business-analysis/1',kind:q.kind,contextHash:prepared.contextHash,
  questions:q.questions,hypotheses:q.hypotheses.map(mark),recommendations:q.recommendations.map(mark),evidence,limitations:q.limitations,
  citationBindingsValidated:true,sourceValuesCopiedByHost:true,semanticCorrectnessVerified:false,calculationsVerified:false,
  causalityVerified:false,efficiencyVerified:false,businessExecutionAuthorized:false,executed:false};
}
