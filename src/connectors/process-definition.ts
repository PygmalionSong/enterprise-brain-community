// Normalized process evidence, never an executable permission or workflow engine.
// 统一流程证据，不授予执行权限，也不冒充工作流执行引擎。
import {createHash} from 'node:crypto';
import {z} from 'zod';

const id=z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/);
const text=z.string().min(1).max(160).refine(s=>!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s));
const label=z.object({zh:text,en:text,ja:text}).strict();
const refs=z.array(id).max(32);
export const processDefinitionSchema=z.object({
 format:z.literal('enterprise-brain.process/1'),id,revision:text,name:label,
 kind:z.enum(['workflow_definition','state_model']),
 objects:z.array(z.object({id,name:label}).strict()).min(1).max(32),
 roles:z.array(z.object({id,name:label}).strict()).min(1).max(32),
 nodes:z.array(z.object({id,name:label,kind:z.enum(['start','end','task','decision','parallel','subprocess']),ownerRole:id,objectRefs:refs}).strict()).min(2).max(256),
 edges:z.array(z.object({id,from:id,to:id,label:label.optional(),conditionText:text.optional()}).strict()).min(1).max(512)
}).strict().superRefine((p,ctx)=>{
 const add=(s:string)=>ctx.addIssue({code:'custom',message:s});
 for(const list of [p.objects,p.roles,p.nodes,p.edges])if(new Set(list.map(v=>v.id)).size!==list.length)add('duplicate_process_id');
 const nodes=new Map(p.nodes.map(n=>[n.id,n])),objects=new Set(p.objects.map(o=>o.id)),roles=new Set(p.roles.map(r=>r.id));
 if(p.nodes.filter(n=>n.kind==='start').length!==1||!p.nodes.some(n=>n.kind==='end'))add('process_terminals_required');
 for(const n of p.nodes)if(!roles.has(n.ownerRole)||n.objectRefs.some(o=>!objects.has(o))||new Set(n.objectRefs).size!==n.objectRefs.length)add('process_reference_invalid');
 const pairs=new Set<string>();
 for(const e of p.edges){const pair=e.from+'\0'+e.to;if(!nodes.has(e.from)||!nodes.has(e.to)||pairs.has(pair))add('process_reference_invalid');pairs.add(pair);}
 const starts=p.nodes.filter(n=>n.kind==='start').map(n=>n.id),ends=p.nodes.filter(n=>n.kind==='end').map(n=>n.id);
 for(const n of p.nodes){if(n.kind==='start'&&p.edges.some(e=>e.to===n.id))add('start_has_incoming');if(n.kind==='end'&&p.edges.some(e=>e.from===n.id))add('end_has_outgoing');}
 const traverse=(initial:string[],reverse:boolean)=>{const reached=new Set(initial);for(let i=0;i<p.nodes.length;i++)for(const e of p.edges)if(reached.has(reverse?e.to:e.from))reached.add(reverse?e.from:e.to);return reached;};
 const reached=traverse(starts,false),ending=traverse(ends,true);
 if(p.nodes.some(n=>!reached.has(n.id)))add('process_unreachable');
 if(p.nodes.some(n=>!ending.has(n.id)))add('process_no_terminal_path');
});
export type ProcessDefinition=z.infer<typeof processDefinitionSchema>;
export interface ProcessEvidence {definition:ProcessDefinition;rawSha256:string;definitionSha256:string;bytes:number;authority:'source_definition_only';executable:false;}
export function readProcessDefinition(raw:string):ProcessEvidence {
 if(typeof raw!=='string'||Buffer.byteLength(raw)>256*1024||raw.length===0)throw Error('process_size_limit');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw Error('process_json_invalid');}
 const definition=processDefinitionSchema.parse(value);
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 return {definition,rawSha256:sha(raw),definitionSha256:sha(JSON.stringify(definition)),bytes:Buffer.byteLength(raw),authority:'source_definition_only',executable:false};
}

const stageSchema=z.object({domainId:id,stageId:id,title:label,domainTitle:label});
const mappingSchema=z.object({stageId:id,processId:id,nodeId:id,definitionSha256:z.string().regex(/^[a-f0-9]{64}$/),review:z.enum(['pending','confirmed']),reviewedBy:z.string().min(1).max(100).regex(/^[^\x00-\x1f\x7f]+$/).optional()}).strict().superRefine((m,ctx)=>{if(m.review==='confirmed'&&!m.reviewedBy)ctx.addIssue({code:'custom',message:'mapping_reviewer_required'});});
export type ProcessMapping=z.infer<typeof mappingSchema>;
// Caller review is evidence attribution only. Runtime authorization is still separate.
// 核对人只是映射证据归属；运行时权限仍由独立控制链检查。
export function processCoverage(stageInput:unknown,evidence:ProcessEvidence[],mappingInput:unknown=[]){
 const stages=z.array(stageSchema).min(1).max(1000).parse(stageInput),mappings=z.array(mappingSchema).max(2000).parse(mappingInput);
 if(new Set(stages.map(s=>s.stageId)).size!==stages.length)throw Error('duplicate_stage');
 const byStage=new Set(stages.map(s=>s.stageId)),byProcess=new Map<string,ProcessEvidence>();
 for(const e of evidence){const verified=readProcessDefinition(JSON.stringify(e.definition));if(verified.definitionSha256!==e.definitionSha256)throw Error('process_evidence_changed');if(byProcess.has(e.definition.id))throw Error('duplicate_process');byProcess.set(e.definition.id,e);}
 const seen=new Set<string>();for(const m of mappings){const p=byProcess.get(m.processId),key=m.stageId+'\0'+m.processId+'\0'+m.nodeId;if(seen.has(key)||!byStage.has(m.stageId)||!p||!p.definition.nodes.some(n=>n.id===m.nodeId))throw Error('mapping_reference_invalid');seen.add(key);}
 const rows=stages.map(s=>{const links=mappings.filter(m=>m.stageId===s.stageId).map(m=>({...m,current:m.definitionSha256===byProcess.get(m.processId)!.definitionSha256}));return {...s,modeled:true,sourceRead:links.length>0,mapped:links.some(m=>m.current&&m.review==='confirmed'),executable:false,links};});
 return {schemaVersion:1,domains:new Set(stages.map(s=>s.domainId)).size,stages:rows.length,sourceReadStages:rows.filter(r=>r.sourceRead).length,mappedStages:rows.filter(r=>r.mapped).length,executableStages:0,rows};
}
