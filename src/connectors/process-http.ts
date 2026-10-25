// Authenticated local IT API; process imports never start a server or grant runtime tools.
// 认证的本机IT接口；导入流程不会启动服务或授权运行工具。
import type {IncomingMessage,ServerResponse} from 'node:http';
import {z} from 'zod';
import type {Actor,IdentityService} from '../identity/service.ts';
import type {ProcessRegistry} from './process-registry.ts';
export async function processItRoute(req:IncomingMessage,res:ServerResponse,url:URL,actor:Actor,identity:IdentityService,token:string,registry:ProcessRegistry){
 const prefix='/v1/it/process-registry';if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return false;
 const json=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 try{if(actor.role!=='it')throw Error('not_authorized');if(!['GET','POST'].includes(req.method??'')){json(405,{code:'method_not_allowed'});return true;}if(url.search)throw Error('invalid_input');let input:any={};if(req.method==='POST'){if(!await identity.validateCsrf(token,String(req.headers['x-csrf-token']??''),String(req.headers.origin??''),url.origin))throw Error('not_authorized');if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']??'')))throw Error('invalid_input');const parts:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>400*1024)throw Error('process_size_limit');parts.push(b);}try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}catch{throw Error('process_json_invalid');}}
  if(req.method==='GET'&&url.pathname===prefix){json(200,await registry.list(actor));return true;}
  if(req.method==='POST'&&url.pathname===prefix+'/import'){json(201,await registry.import(actor,input));return true;}
  if(req.method==='GET'&&url.pathname===prefix+'/coverage'){json(200,await registry.coverage(actor));return true;}
  if(req.method==='GET'&&url.pathname===prefix+'/links'){json(200,await registry.links(actor));return true;}
  if(req.method==='POST'&&url.pathname===prefix+'/links'){json(201,await registry.link(actor,input));return true;}
  const link=/^\/v1\/it\/process-registry\/links\/([a-f0-9-]{36})\/revoke$/.exec(url.pathname);
  if(req.method==='POST'&&link){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);json(200,await registry.revokeLink(actor,link[1],q.expectedVersion));return true;}
  const match=/^\/v1\/it\/process-registry\/([a-f0-9-]{36})(?:\/(confirm|revoke|history))?$/.exec(url.pathname);
  if(match&&req.method==='GET'&&!match[2]){json(200,await registry.view(actor,match[1]));return true;}
  if(match&&req.method==='GET'&&match[2]==='history'){json(200,await registry.history(actor,match[1]));return true;}
  if(match&&req.method==='POST'&&match[2]==='confirm'){json(200,await registry.confirm(actor,match[1],input));return true;}
  if(match&&req.method==='POST'&&match[2]==='revoke'){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);json(200,await registry.revoke(actor,match[1],q.expectedVersion));return true;}
  json(404,{code:'not_found'});
 }catch(e){const code=e instanceof Error?e.message:'',safe=['not_authorized','not_found','invalid_input','process_size_limit','process_json_invalid','process_conflict','process_revoked','process_capacity','process_revision_limit','process_link_invalid','mapping_reference_invalid','process_evidence_changed','bpmn_size_limit','bpmn_external_entity_denied','bpmn_xml_invalid','bpmn_parse_warning','bpmn_single_process_required','bpmn_extension_unsupported','bpmn_nested_lane_unsupported','bpmn_ambiguous_role','bpmn_execution_extension_unsupported','bpmn_reference_invalid','bpmn_element_unsupported'];json(e instanceof z.ZodError?422:code==='not_authorized'?403:code==='not_found'?404:code==='process_size_limit'?413:['process_conflict','process_revoked'].includes(code)?409:code==='process_capacity'?429:safe.includes(code)?422:503,{code:e instanceof z.ZodError?'invalid_input':safe.includes(code)?code:'process_registry_unavailable'});}
 return true;
}
