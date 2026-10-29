// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Read a declared structural BPMN subset without evaluating scripts or conditions.
// 读取明确的BPMN结构子集，不执行脚本或条件表达式。
import {createHash} from 'node:crypto';
import {BpmnModdle} from 'bpmn-moddle';
import {z} from 'zod';
import {readProcessDefinition} from './process-definition.ts';
const kinds:Record<string,string>={'bpmn:StartEvent':'start','bpmn:EndEvent':'end','bpmn:Task':'task','bpmn:UserTask':'task','bpmn:ManualTask':'task','bpmn:ServiceTask':'task','bpmn:SendTask':'task','bpmn:ReceiveTask':'task','bpmn:BusinessRuleTask':'task','bpmn:ExclusiveGateway':'decision','bpmn:ParallelGateway':'parallel'};
const label=(s:string)=>({zh:s,en:s,ja:s});
export async function readBpmnDefinition(xml:string,revision:string){
 z.string().min(1).max(160).parse(revision);
 if(typeof xml!=='string'||!xml.length||Buffer.byteLength(xml)>256*1024||(xml.match(/</g)?.length??0)>6000)throw Error('bpmn_size_limit');
 if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))throw Error('bpmn_external_entity_denied');
 let parsed;try{parsed=await new BpmnModdle().fromXML(xml,'bpmn:Definitions');}catch{throw Error('bpmn_xml_invalid');}
 if(parsed.warnings?.length)throw Error('bpmn_parse_warning');
 const root=parsed.rootElement,processes=(root.rootElements??[]).filter((r:any)=>r.$type==='bpmn:Process');if(processes.length!==1||(root.rootElements??[]).length!==1)throw Error('bpmn_single_process_required');const p=processes[0];
 const elements=p.flowElements??[];if(elements.length>1000||p.extensionElements||p.$attrs&&Object.keys(p.$attrs).length)throw Error('bpmn_extension_unsupported');
 const objects:any[]=[],nodes:any[]=[],edges:any[]=[],roles:any[]=[],owners=new Map<string,string>();
 for(const laneSet of p.laneSets??[]){if(laneSet.extensionElements||laneSet.childLaneSet)throw Error('bpmn_extension_unsupported');for(const lane of laneSet.lanes??[]){if(lane.childLaneSet||lane.extensionElements)throw Error('bpmn_nested_lane_unsupported');roles.push({id:lane.id,name:label(lane.name??lane.id)});for(const ref of lane.flowNodeRef??[]){if(owners.has(ref.id))throw Error('bpmn_ambiguous_role');owners.set(ref.id,lane.id);}}}
 let unassigned=false;
 for(const e of elements){if(e.extensionElements||e.$attrs&&Object.keys(e.$attrs).length||e.eventDefinitions?.length||e.loopCharacteristics)throw Error('bpmn_execution_extension_unsupported');
  if(e.$type==='bpmn:SequenceFlow'){if(!e.sourceRef?.id||!e.targetRef?.id)throw Error('bpmn_reference_invalid');edges.push({id:e.id,from:e.sourceRef.id,to:e.targetRef.id,...(e.name?{label:label(e.name)}:{}),...(e.conditionExpression?.body?{conditionText:e.conditionExpression.body}:{})});}
  else if(kinds[e.$type]){const ownerRole=owners.get(e.id)??'unassigned';if(ownerRole==='unassigned')unassigned=true;nodes.push({id:e.id,name:label(e.name??e.id),kind:kinds[e.$type],ownerRole,objectRefs:[]});}
  else if(['bpmn:DataObject','bpmn:DataObjectReference'].includes(e.$type))objects.push({id:e.id,name:label(e.name??e.id)});
  else throw Error('bpmn_element_unsupported');
 }
 if(unassigned){if(roles.some(r=>r.id==='unassigned'))throw Error('bpmn_ambiguous_role');roles.push({id:'unassigned',name:{zh:'责任待映射',en:'Owner unmapped',ja:'責任者未対応'}});}
 for(const ref of owners.keys())if(!nodes.some(n=>n.id===ref))throw Error('bpmn_reference_invalid');
 if(!objects.length)objects.push({id:'process_context',name:{zh:'流程上下文（待映射）',en:'Process context (unmapped)',ja:'プロセス文脈（未対応）'}});
 const evidence=readProcessDefinition(JSON.stringify({format:'enterprise-brain.process/1',id:p.id,revision,name:label(p.name??p.id),kind:'workflow_definition',objects,roles,nodes,edges}));
 return {...evidence,rawSha256:createHash('sha256').update(xml).digest('hex'),bytes:Buffer.byteLength(xml),sourceFormat:'bpmn-2.0-xml-subset',revisionProvidedBy:'operator',limitations:['structural_subset_only','source_labels_not_translated','object_associations_unmapped','no_execution_semantics',...(unassigned?['roles_unmapped']:[])]};
}
