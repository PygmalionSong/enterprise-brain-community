// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Operator-configured local child, no shell, inherited secrets or source-selected code.
// 运维显式配置的本机子进程：不用shell、不继承秘密、不执行源端选定代码。
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {isAbsolute,dirname} from 'node:path';
import {z} from 'zod';
import type {ProcessRpcTransport} from './mcp-process-reader.ts';
export const stdioProcessConfig=z.object({command:z.string().min(1).max(1024).refine(isAbsolute),args:z.array(z.string().max(2048)).max(24),cwd:z.string().min(1).max(1024).refine(isAbsolute).optional(),timeoutMs:z.number().int().min(100).max(30000).default(5000)}).strict();
const resourceMethods=new Set(['initialize','resources/list','resources/read']),graphMethods=new Set(['initialize','tools/list','tools/call']);
export class StdioProcessTransport implements ProcessRpcTransport {
 private child:ChildProcessWithoutNullStreams;private closed=false;private terminated=false;private termination:Promise<void>;private closing:Promise<void>|undefined;private serial=0;private pending:{id:string;resolve:(r:unknown)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}|null=null;private buffer=Buffer.alloc(0);private timeout:number;private received=0;private methods:Set<string>;private requestLimit:number;
 constructor(config:unknown,profile:'resources'|'graph-tools'='resources'){if(!['resources','graph-tools'].includes(profile))throw Error('mcp_profile_denied');const c=stdioProcessConfig.parse(config);this.methods=profile==='resources'?resourceMethods:graphMethods;this.requestLimit=profile==='resources'?8192:32768;this.timeout=c.timeoutMs;const env:NodeJS.ProcessEnv={};for(const k of ['SystemRoot','WINDIR','TEMP','TMP'])if(process.env[k])env[k]=process.env[k];this.child=spawn(c.command,c.args,{cwd:c.cwd??dirname(c.command),shell:false,windowsHide:true,env,stdio:['pipe','pipe','pipe']});this.termination=new Promise(resolve=>{this.child.once('close',()=>{this.terminated=true;this.fail('mcp_process_closed');resolve();});});this.child.on('error',()=>this.fail('mcp_process_failed'));this.child.stdin.on('error',()=>this.fail('mcp_process_failed'));this.child.stderr.on('data',()=>{});this.child.stdout.on('data',(data:Buffer)=>this.receive(data));}
 private fail(code:string){if(this.closed)return;this.closed=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error(code));this.pending=null;}this.buffer=Buffer.alloc(0);if(!this.terminated)this.child.kill();}
 private receive(data:Buffer){if(this.closed)return;this.received+=data.length;if(this.received>32*1024*1024||this.buffer.length+data.length>1024*1024){this.fail('mcp_wire_limit');return;}this.buffer=Buffer.concat([this.buffer,data]);let at:number;while((at=this.buffer.indexOf(10))>=0){const line=this.buffer.subarray(0,at);this.buffer=this.buffer.subarray(at+1);if(line.length>512*1024){this.fail('mcp_wire_limit');return;}if(line.length===0){this.fail('mcp_message_invalid');return;}let m:any;try{m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line));}catch{this.fail('mcp_message_invalid');return;}if(!m||typeof m!=='object'||Array.isArray(m)||m.jsonrpc!=='2.0'){this.fail('mcp_message_invalid');return;}
   // Deny server-originated requests; never implement sampling, roots or tools here.
   // 拒绝服务端发起的请求；不提供采样、根目录或工具权限。
   if(typeof m.method==='string'){if(Object.hasOwn(m,'id')){if(!['string','number'].includes(typeof m.id)){this.fail('mcp_message_invalid');return;}this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Method not supported'}})+'\n');}continue;}
   if(!this.pending||m.id!==this.pending.id||Object.hasOwn(m,'result')===Object.hasOwn(m,'error')){this.fail('mcp_response_invalid');return;}const p=this.pending;this.pending=null;clearTimeout(p.timer);if(Object.hasOwn(m,'error'))p.reject(Error('mcp_remote_error'));else p.resolve(m.result);
  }if(this.buffer.length>512*1024)this.fail('mcp_wire_limit');
 }
 async request(method:string,params:Record<string,unknown>){if(this.closed)throw Error('mcp_transport_closed');if(!this.methods.has(method))throw Error('mcp_method_denied');if(this.pending)throw Error('mcp_request_busy');const id='eb-process-'+(++this.serial),wire=JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n';if(Buffer.byteLength(wire)>this.requestLimit)throw Error('mcp_request_limit');return new Promise<unknown>((resolve,reject)=>{const timer=setTimeout(()=>this.fail('mcp_timeout'),this.timeout);this.pending={id,resolve,reject,timer};this.child.stdin.write(wire);});}
 async notify(method:string){if(this.closed)throw Error('mcp_transport_closed');if(method!=='notifications/initialized')throw Error('mcp_method_denied');this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method})+'\n');}
 // Killing is not confirmation of exit: resolve only after the owned child closes.
 // 发出终止信号不代表退出，只在自有子进程实际关闭后确认完成。
 private async waitForTermination(ms:number){if(this.terminated)return true;let timer:NodeJS.Timeout|undefined;try{return await Promise.race([this.termination.then(()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]);}finally{clearTimeout(timer);}}
 private async finishClose(){if(!this.closed){this.closed=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('mcp_transport_closed'));this.pending=null;}}this.buffer=Buffer.alloc(0);if(this.terminated)return;if(!this.child.stdin.destroyed)this.child.stdin.end();if(await this.waitForTermination(1000))return;this.child.kill('SIGKILL');if(!await this.waitForTermination(1000))throw Error('mcp_process_shutdown_timeout');}
 async close(){this.closing??=this.finishClose();return this.closing;}
}
