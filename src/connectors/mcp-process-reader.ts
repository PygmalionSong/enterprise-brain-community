// Pinned read-only MCP resource subset. Source text cannot trigger tools or URLs.
// 明确版本的MCP只读资源子集；源端文字不能触发工具或跳转URL。
import {z} from 'zod';
import {readProcessDefinition} from './process-definition.ts';
import {readBpmnDefinition} from './bpmn-process.ts';
export const MCP_PROCESS_VERSION='2025-11-25';
export interface ProcessRpcTransport {request(method:string,params:Record<string,unknown>):Promise<unknown>;notify(method:string):Promise<void>;close():Promise<void>;}
const uri=z.string().min(1).max(512).refine(v=>/^[A-Za-z][A-Za-z0-9+.-]*:/.test(v)&&!/[\s\x00-\x1f]/.test(v));
export const processResourceAllowlist=z.array(uri).min(1).max(100).refine(v=>new Set(v).size===v.length,'duplicate_resource_allowlist');
const resource=z.object({uri,name:z.string().min(1).max(160),mimeType:z.string().max(160).optional()}).passthrough();
const mimeTypes=new Set(['application/json','application/vnd.enterprise-brain.process+json']);
const bpmnTypes=new Set(['application/bpmn+xml','application/xml','text/xml']);
export const bpmnRevisionSchema=z.record(uri,z.string().min(1).max(160));
export class McpProcessReader {
 private ready=false;private closed=false;private allowed:Set<string>;private transport:ProcessRpcTransport;private revisions:Record<string,string>;
 constructor(transport:ProcessRpcTransport,allowedUris:string[],bpmnRevisions:Record<string,string>={}){this.transport=transport;this.allowed=new Set(processResourceAllowlist.parse(allowedUris));this.revisions=bpmnRevisionSchema.parse(bpmnRevisions);if(Object.keys(this.revisions).some(uri=>!this.allowed.has(uri)))throw Error('mcp_resource_denied');}
 async initialize(){if(this.closed||this.ready)throw Error('mcp_reader_state');const reply=z.object({protocolVersion:z.string(),capabilities:z.object({resources:z.object({}).passthrough()}).passthrough(),serverInfo:z.object({name:z.string().min(1).max(160),version:z.string().min(1).max(80)}).passthrough()}).passthrough().parse(await this.transport.request('initialize',{protocolVersion:MCP_PROCESS_VERSION,capabilities:{},clientInfo:{name:'enterprise-brain-process-reader',version:'0.1.0'}}));if(reply.protocolVersion!==MCP_PROCESS_VERSION)throw Error('mcp_version_unsupported');await this.transport.notify('notifications/initialized');this.ready=true;return {protocolVersion:MCP_PROCESS_VERSION,serverInfo:{name:reply.serverInfo.name,version:reply.serverInfo.version}};}
 private check(){if(!this.ready||this.closed)throw Error('mcp_reader_state');}
 async list(){this.check();let cursor:string|undefined;const cursors=new Set<string>(),found=new Set<string>(),results:{uri:string;name:string;mimeType?:string}[]=[];let count=0;
  for(let page=0;page<10;page++){const r=z.object({resources:z.array(resource).max(100),nextCursor:z.string().min(1).max(512).optional()}).passthrough().parse(await this.transport.request('resources/list',cursor?{cursor}:{}));count+=r.resources.length;if(count>200)throw Error('mcp_resource_limit');for(const entry of r.resources){if(found.has(entry.uri))throw Error('mcp_duplicate_resource');found.add(entry.uri);if(this.allowed.has(entry.uri)&&(mimeTypes.has(entry.mimeType??'')||bpmnTypes.has(entry.mimeType??'')&&Object.hasOwn(this.revisions,entry.uri)))results.push({uri:entry.uri,name:entry.name,mimeType:entry.mimeType});}if(!r.nextCursor)return results;if(cursors.has(r.nextCursor))throw Error('mcp_cursor_repeated');cursor=r.nextCursor;cursors.add(cursor);}
  throw Error('mcp_page_limit');
 }
 async read(resourceUri:string){this.check();if(!this.allowed.has(uri.parse(resourceUri)))throw Error('mcp_resource_denied');const r=z.object({contents:z.array(z.object({uri,mimeType:z.string(),text:z.string().max(256*1024)}).strict()).length(1)}).passthrough().parse(await this.transport.request('resources/read',{uri:resourceUri}));const c=r.contents[0];if(c.uri!==resourceUri)throw Error('mcp_resource_mismatch');const evidence=mimeTypes.has(c.mimeType)?readProcessDefinition(c.text):bpmnTypes.has(c.mimeType)&&Object.hasOwn(this.revisions,resourceUri)?await readBpmnDefinition(c.text,this.revisions[resourceUri]):null;if(!evidence)throw Error('mcp_resource_mismatch');return {resourceUri,protocolVersion:MCP_PROCESS_VERSION,...evidence};}
 async close(){if(this.closed)return;this.closed=true;this.ready=false;await this.transport.close();}
}
