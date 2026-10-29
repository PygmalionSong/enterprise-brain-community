// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Deliberately bounded CSDL JSON subset. Metadata is not a workflow or execution grant.
// 明确有界的CSDL JSON子集；实体元数据不是流程，也不授予执行权。
import {createHash} from 'node:crypto';
import {z} from 'zod';
const object=z.record(z.string(),z.unknown()),simple=/^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const qualified=/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const typeName=z.string().max(512).refine(v=>qualified.test(v));
export function readODataCsdl(raw:string){
 if(typeof raw!=='string'||!raw.length||Buffer.byteLength(raw)>256*1024)throw Error('csdl_size_limit');let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw Error('csdl_json_invalid');}const doc=object.parse(parsed);if(doc.$Version!=='4.01')throw Error('csdl_version_unsupported');
 // No reference resolution, inheritance, annotations or operation invocation is inferred.
 // 不解析外部引用，不推断继承/注解含义，不调用操作。
 if(Object.hasOwn(doc,'$Reference'))throw Error('csdl_external_reference_unsupported');
 const entities:{id:string;keys:string[];properties:{name:string;type:string;collection:boolean;nullable:boolean}[];navigation:{name:string;type:string;collection:boolean}[]}[]=[],sets:{name:string;type:string;collection:boolean}[]=[],operations:{id:string;kind:'Action'|'Function';overloads:number}[]=[];let unsupported=0,declaredContainer=typeof doc.$EntityContainer==='string'?doc.$EntityContainer:undefined;const containers=new Set<string>();
 for(const [ns,value] of Object.entries(doc)){if(ns.startsWith('$')||ns.startsWith('@'))continue;if(!/^[A-Za-z_][A-Za-z0-9_.]{0,255}$/.test(ns))throw Error('csdl_namespace_invalid');const schema=object.parse(value);if(Object.hasOwn(schema,'$Alias'))throw Error('csdl_alias_unsupported');for(const [name,value] of Object.entries(schema)){if(name.startsWith('$')||name.startsWith('@'))continue;if(!simple.test(name))throw Error('csdl_name_invalid');const id=ns+'.'+name;
   if(Array.isArray(value)){if(value.length<1||value.length>32)throw Error('csdl_operation_limit');const overloads=value.map(v=>object.parse(v));if(overloads.every(v=>v.$Kind==='Action')||overloads.every(v=>v.$Kind==='Function'))operations.push({id,kind:overloads[0].$Kind as 'Action'|'Function',overloads:overloads.length});else throw Error('csdl_operation_invalid');continue;}
   const item=object.parse(value);
   if(item.$Kind==='EntityType'){if(Object.hasOwn(item,'$BaseType'))throw Error('csdl_inheritance_unsupported');const keys=z.array(z.string().regex(simple)).min(1).max(32).parse(item.$Key),properties:{name:string;type:string;collection:boolean;nullable:boolean}[]=[],navigation:{name:string;type:string;collection:boolean}[]=[];for(const [field,metadata] of Object.entries(item)){if(field.startsWith('$')||field.startsWith('@'))continue;if(!simple.test(field))throw Error('csdl_name_invalid');const property=object.parse(metadata),type=typeName.parse(property.$Type??'Edm.String'),collection=property.$Collection===undefined?false:z.boolean().parse(property.$Collection),nullable=property.$Nullable===undefined?true:z.boolean().parse(property.$Nullable);if(property.$Kind==='NavigationProperty')navigation.push({name:field,type,collection});else if(property.$Kind===undefined||property.$Kind==='Property')properties.push({name:field,type,collection,nullable});else throw Error('csdl_property_unsupported');}
    if(properties.length>100||navigation.length>100||new Set(keys).size!==keys.length||keys.some(k=>!properties.some(p=>p.name===k&&!p.nullable&&!p.collection)))throw Error('csdl_key_or_property_invalid');entities.push({id,keys,properties,navigation});
   }else if(item.$Kind==='EntityContainer'){containers.add(id);for(const [field,metadata] of Object.entries(item)){if(field.startsWith('$')||field.startsWith('@'))continue;if(!simple.test(field))throw Error('csdl_name_invalid');const set=object.parse(metadata);if(Object.hasOwn(set,'$Action')||Object.hasOwn(set,'$Function')){unsupported++;continue;}sets.push({name:id+'.'+field,type:typeName.parse(set.$Type),collection:set.$Collection===undefined?false:z.boolean().parse(set.$Collection)});}}
   else unsupported++;
 }}
 if(entities.length>100||sets.length>200||operations.length>100||!entities.length)throw Error('csdl_entity_limit');if(declaredContainer!==undefined&&!containers.has(declaredContainer))throw Error('csdl_container_unresolved');const ids=new Set(entities.map(e=>e.id));if(sets.some(s=>!ids.has(s.type))||entities.some(e=>e.navigation.some(n=>!ids.has(n.type))))throw Error('csdl_type_unresolved');
 return {format:'enterprise-brain.odata-metadata/1',version:'4.01',rawSha256:createHash('sha256').update(raw).digest('hex'),entities,sets,operations,unsupportedElements:unsupported,workflowDefinitionAvailable:false,executable:false,limitations:['json_csdl_subset','no_external_references','no_alias_or_inheritance_resolution','no_workflow_definition','no_permission_inference']};
}
