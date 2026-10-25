// Frozen routes and installed tool contracts; source conditions never become code.
// 冻结选路与已安装工具合同；源端条件文字不会成为代码。
import {z} from 'zod';
import type {Actor} from '../identity/service.ts';
import type {ProcessDefinition} from '../connectors/process-definition.ts';
import {hash} from './contracts.ts';
const code=z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/);
const jsonValue:z.ZodType<unknown>=z.lazy(()=>z.union([z.null(),z.boolean(),z.number().finite(),z.string().max(8192),z.array(jsonValue).max(128),z.record(z.string().max(100),jsonValue)]));
// Bound depth before recursive validation, including trusted in-process callers.
// 递归校验前限制深度，也保护进程内调用方。
const boundedJson=z.unknown().superRefine((value,ctx)=>{const pending:{value:unknown;depth:number}[]=[{value,depth:0}];let count=0;while(pending.length){const item=pending.pop()!;if(++count>2048||item.depth>16){ctx.addIssue({code:'custom',message:'graph_json_complexity_limit'});return;}if(item.value!==null&&typeof item.value==='object')for(const child of Object.values(item.value))pending.push({value:child,depth:item.depth+1});}});
export const graphArgsSchema=boundedJson.pipe(z.record(z.string().max(100),jsonValue)).refine(v=>Buffer.byteLength(JSON.stringify(v))<=16384,'graph_args_limit');
export const graphCompileSchema=z.object({processes:z.array(z.object({id:z.uuid(),expectedVersion:z.number().int().positive()}).strict()).min(1).max(20),links:z.array(z.object({id:z.uuid(),expectedVersion:z.number().int().positive()}).strict()).max(19),routes:z.array(z.object({processId:z.uuid(),nodeId:code,edgeId:code}).strict()).max(128),bindings:z.array(z.object({processId:z.uuid(),nodeId:code,toolId:code,toolVersion:code,args:graphArgsSchema}).strict()).min(1).max(256)}).strict().refine(q=>Buffer.byteLength(JSON.stringify(q))<=524288,'graph_plan_limit');
export type GraphCompileInput=z.infer<typeof graphCompileSchema>;
export const graphPlanningScopeSchema=z.object({processes:z.array(z.object({id:z.uuid(),expectedVersion:z.number().int().positive()}).strict()).min(1).max(20),links:z.array(z.object({id:z.uuid(),expectedVersion:z.number().int().positive()}).strict()).max(19),tools:z.array(z.object({id:code,version:code}).strict()).min(1).max(64)}).strict().superRefine((q,ctx)=>{for(const list of [q.processes,q.links,q.tools])if(new Set(list.map(v=>v.id)).size!==list.length)ctx.addIssue({code:'custom',message:'planning_scope_duplicate'});if(q.links.length!==q.processes.length-1)ctx.addIssue({code:'custom',message:'planning_itinerary_invalid'});});
export interface GraphTool {
 id:string;version:string;effect:'read'|'delegated';
 inputSchema?:Record<string,unknown>;
 validate(args:unknown):Record<string,unknown>;
 authorize(actor:Actor,args:Record<string,unknown>):Promise<void>;
 submit(actor:Actor,args:Record<string,unknown>,reference:string,signal:AbortSignal):Promise<unknown>;
 lookup(actor:Actor,args:Record<string,unknown>,reference:string,signal:AbortSignal):Promise<unknown>;
}
export class GraphToolCatalog {
 private tools:Map<string,GraphTool>;
 private descriptions:{id:string;version:string;effect:'read'|'delegated';inputSchema?:Record<string,unknown>;inputSchemaSha256?:string}[]=[];
 constructor(tools:GraphTool[]){this.tools=new Map();for(const t of tools){code.parse(t.id);code.parse(t.version);if(!['read','delegated'].includes(t.effect)||this.tools.has(t.id))throw Error('graph_tool_duplicate_or_invalid');let schema:Record<string,unknown>|undefined;if(t.inputSchema!==undefined){try{schema=graphArgsSchema.parse(t.inputSchema);if(schema.type!=='object')throw Error('invalid');const queue:unknown[]=[schema];while(queue.length){const item=queue.pop();if(item&&typeof item==='object'){if(Object.keys(item).some(k=>['$ref','$dynamicRef'].includes(k)))throw Error('invalid');queue.push(...Object.values(item));}}}catch{throw Error('graph_tool_schema_invalid');}}this.tools.set(t.id,t);this.descriptions.push({id:t.id,version:t.version,effect:t.effect,...(schema?{inputSchema:structuredClone(schema),inputSchemaSha256:hash(schema)}:{})});}}
 describe(){return this.descriptions.map(d=>{if(this.get(d.id,d.version).effect!==d.effect)throw Error('graph_tool_version_changed');return structuredClone(d);});}
 get(id:string,version:string){const t=this.tools.get(id);if(!t||t.id!==id||t.version!==version||!['read','delegated'].includes(t.effect))throw Error('graph_tool_version_changed');return t;}
}
export interface GraphSource {id:string;version:number;rawSha256:string;definitionSha256:string;mappingHash:string;confirmedBy:string;authorizationVersion:number;definition:ProcessDefinition;}
export interface GraphLink {id:string;version:number;fromId:string;toId:string;fromHash:string;toHash:string;fromNode:string;toNode:string;reviewedBy:string;authorizationVersion:number;objectRelation:string;}
export interface GraphNode {key:string;processId:string;nodeId:string;kind:string;ownerRole:string;predecessors:string[];tool?:{id:string;version:string;effect:'read'|'delegated';args:Record<string,unknown>};}
export interface GraphPlan {format:'enterprise-brain.graph-plan/1';policy:'frozen-acyclic-v1';sources:GraphSource[];links:GraphLink[];routes:GraphCompileInput['routes'];nodes:GraphNode[];order:string[];}
export function compileGraph(input:GraphCompileInput,sources:GraphSource[],links:GraphLink[],catalog:GraphToolCatalog):GraphPlan {
 graphCompileSchema.parse(input);
 if(sources.length!==input.processes.length||links.length!==input.links.length||input.links.length!==sources.length-1)throw Error('graph_itinerary_invalid');
 if(new Set(input.processes.map(p=>p.id)).size!==sources.length||new Set(input.links.map(p=>p.id)).size!==links.length)throw Error('graph_itinerary_invalid');
 const bySource=new Map(sources.map(s=>[s.id,s]));const all:GraphNode[]=[],selectedRoutes=new Set<string>(),selectedBindings=new Set<string>();
 const key=(p:string,n:string)=>p+'/'+n;
 for(const ref of input.processes){const s=bySource.get(ref.id);if(!s||s.version!==ref.expectedVersion)throw Error('graph_source_changed');const p=s.definition;
  if(p.kind!=='workflow_definition'||p.nodes.some(n=>n.kind==='subprocess')||p.nodes.filter(n=>n.kind==='end').length!==1)throw Error('graph_structure_unsupported');
  const incoming=(n:string)=>p.edges.filter(e=>e.to===n),outgoing=(n:string)=>p.edges.filter(e=>e.from===n);
  // Reject cycles even when a frozen route could hide them.
  // 即使冻结选路可能绕过循环，也拒绝含循环的原始图。
  const topological=(ids:string[],edges:{from:string;to:string}[])=>{const indegree=new Map(ids.map(id=>[id,edges.filter(e=>e.to===id).length])),queue=ids.filter(id=>!indegree.get(id)),order:string[]=[];while(queue.length){const n=queue.shift()!;order.push(n);for(const e of edges.filter(e=>e.from===n)){const left=indegree.get(e.to)!-1;indegree.set(e.to,left);if(left===0)queue.push(e.to);}}if(order.length!==ids.length)throw Error('graph_cycle_unsupported');return order;};
  topological(p.nodes.map(n=>n.id),p.edges);
  let edges=[...p.edges];
  for(const n of p.nodes){const inc=incoming(n.id),out=outgoing(n.id);if(['start','task'].includes(n.kind)&&out.length!==1||['task','end'].includes(n.kind)&&inc.length!==1)throw Error('graph_explicit_gateway_required');
   if(['decision','parallel'].includes(n.kind)&&!(inc.length===1&&out.length>=2||inc.length>=2&&out.length===1))throw Error('graph_gateway_unsupported');
   if(n.kind==='decision'&&out.length>1){const routes=input.routes.filter(r=>r.processId===s.id&&r.nodeId===n.id);if(routes.length!==1||!out.some(e=>e.id===routes[0].edgeId))throw Error('graph_route_required');selectedRoutes.add(key(s.id,n.id));edges=edges.filter(e=>e.from!==n.id||e.id===routes[0].edgeId);}
  }
  const active=new Set([p.nodes.find(n=>n.kind==='start')!.id]);for(let i=0;i<p.nodes.length;i++)for(const e of edges)if(active.has(e.from))active.add(e.to);
  const usedEdges=edges.filter(e=>active.has(e.from)&&active.has(e.to)),nodes=p.nodes.filter(n=>active.has(n.id));
  if(!nodes.some(n=>n.kind==='end'))throw Error('graph_route_no_end');
  for(const n of nodes){const inc=usedEdges.filter(e=>e.to===n.id);if(n.kind==='parallel'&&incoming(n.id).length>1&&inc.length!==incoming(n.id).length||n.kind==='decision'&&incoming(n.id).length>1&&inc.length!==1)throw Error('graph_join_unsupported');
   const found=input.bindings.filter(b=>b.processId===s.id&&b.nodeId===n.id);let tool:GraphNode['tool'];if(n.kind==='task'){if(found.length!==1)throw Error('graph_task_binding_required');const b=found[0],t=catalog.get(b.toolId,b.toolVersion),args=t.validate(b.args);graphArgsSchema.parse(args);tool={id:t.id,version:t.version,effect:t.effect,args};selectedBindings.add(key(s.id,n.id));}else if(found.length)throw Error('graph_control_binding_denied');
   all.push({key:key(s.id,n.id),processId:s.id,nodeId:n.id,kind:n.kind,ownerRole:n.ownerRole,predecessors:inc.map(e=>key(s.id,e.from)),...(tool?{tool}:{})});
  }
 }
 if(input.routes.length!==selectedRoutes.size||input.routes.some(r=>!selectedRoutes.has(key(r.processId,r.nodeId)))||input.bindings.length!==selectedBindings.size||input.bindings.some(b=>!selectedBindings.has(key(b.processId,b.nodeId))))throw Error('graph_unused_binding_or_route');
 for(let i=1;i<input.processes.length;i++){const a=bySource.get(input.processes[i-1].id)!,b=bySource.get(input.processes[i].id)!,ref=input.links[i-1],l=links.find(l=>l.id===ref.id);if(!l||l.version!==ref.expectedVersion||l.fromId!==a.id||l.toId!==b.id||l.fromHash!==a.definitionSha256||l.toHash!==b.definitionSha256||a.definition.nodes.find(n=>n.id===l.fromNode)?.kind!=='end'||b.definition.nodes.find(n=>n.id===l.toNode)?.kind!=='start')throw Error('graph_link_not_executable');all.find(n=>n.key===key(b.id,l.toNode))!.predecessors.push(key(a.id,l.fromNode));}
 if(all.length>1024)throw Error('graph_node_limit');const order:string[]=[],remaining=new Set(all.map(n=>n.key));while(remaining.size){const ready=all.filter(n=>remaining.has(n.key)&&n.predecessors.every(p=>order.includes(p)));if(!ready.length)throw Error('graph_cycle_unsupported');for(const n of ready){remaining.delete(n.key);order.push(n.key);}}
 const plan:GraphPlan={format:'enterprise-brain.graph-plan/1',policy:'frozen-acyclic-v1',sources:input.processes.map(r=>bySource.get(r.id)!),links:input.links.map(r=>links.find(l=>l.id===r.id)!),routes:input.routes,nodes:all,order};if(Buffer.byteLength(JSON.stringify(plan))>1024*1024)throw Error('graph_plan_limit');return plan;
}
export const graphPlanHash=(plan:GraphPlan)=>hash(plan);
export const graphResultSchema=z.object({reference:z.uuid(),state:z.enum(['missing','accepted','completed','failed','partial','unknown']),receiptRef:z.string().min(1).max(160).nullable(),sourceRevision:z.string().min(1).max(160).nullable(),data:graphArgsSchema}).strict().superRefine((v,ctx)=>{if(['accepted','completed','failed','partial'].includes(v.state)&&(!v.receiptRef||!v.sourceRevision))ctx.addIssue({code:'custom',message:'graph_receipt_required'});});
