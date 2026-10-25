// Reference architecture generated from the approved stage inventory, not customer workflows.
// 由已批准环节清单生成的参考架构，不是客户实际工作流。
import {z} from 'zod';
import {processDefinitionSchema,readProcessDefinition,processCoverage} from './process-definition.ts';
const label=z.object({zh:z.string(),en:z.string(),ja:z.string()});
const stagesSchema=z.array(z.object({domainId:z.string(),stageId:z.string(),ordinal:z.number().int().nonnegative(),title:label,domainTitle:label})).min(1).max(1000);
export function referenceProcessBlueprint(input:unknown){
 const stages=stagesSchema.parse(input),domains=[...new Set(stages.map(s=>s.domainId))];
 processCoverage(stages,[]);
 const entries=domains.map(domain=>{const items=stages.filter(s=>s.domainId===domain).sort((a,b)=>a.ordinal-b.ordinal);if(new Set(items.map(s=>s.ordinal)).size!==items.length)throw Error('duplicate_stage_ordinal');const owner=domain+'_owner',object=domain+'_object',ids=['start',...items.map(s=>s.stageId),'end'];
  const definition=processDefinitionSchema.parse({format:'enterprise-brain.process/1',id:domain,revision:'reference-1',name:items[0].domainTitle,kind:'workflow_definition',objects:[{id:object,name:items[0].domainTitle}],roles:[{id:owner,name:{zh:'业务责任人',en:'Business owner',ja:'業務責任者'}}],nodes:[{id:'start',name:{zh:'流程开始',en:'Process start',ja:'プロセス開始'},kind:'start',ownerRole:owner,objectRefs:[object]},...items.map(s=>({id:s.stageId,name:s.title,kind:'task',ownerRole:owner,objectRefs:[object]})),{id:'end',name:{zh:'流程结束',en:'Process end',ja:'プロセス終了'},kind:'end',ownerRole:owner,objectRefs:[object]}],edges:ids.slice(1).map((to,i)=>({id:'edge_'+i,from:ids[i],to}))});
  return {uri:'process://reference/'+domain,text:JSON.stringify(definition),stageIds:items.map(s=>s.stageId)};
 });
 const evidence=entries.map(e=>readProcessDefinition(e.text)),suggestedMappings=entries.flatMap((entry,i)=>entry.stageIds.map(stageId=>({stageId,processId:evidence[i].definition.id,nodeId:stageId,definitionSha256:evidence[i].definitionSha256,review:'pending' as const})));
 return {origin:'constructed_reference_blueprint' as const,entries,suggestedMappings,coverage:processCoverage(stages,evidence,suggestedMappings)};
}
