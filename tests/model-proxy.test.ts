// Loopback model routing remains direct despite process/global proxy configuration.
// 进程/全局代理设置不能改变本机模型路由；所有服务和凭证均为构造。
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import type {Socket} from 'node:net';
import {once} from 'node:events';
const moduleUrl=new URL('../src/runtime/model-transport.ts',import.meta.url).href;
for(const mode of ['environment','flag','dynamic'] as const)test('E6 model: '+mode+' proxy cannot observe loopback model requests',async()=>{
 const sockets=new Set<Socket>();let proxied=0,targetRequests=0;
 const target=createServer((req,res)=>{targetRequests++;req.resume();assert.equal(req.headers.authorization,'Bearer fixture-proxy-token');const chat=req.url==='/v1/chat/completions';res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(chat?{model:'fixture-model',usage:{prompt_tokens:100,completion_tokens:10,total_tokens:110},choices:[{finish_reason:'stop',message:{role:'assistant',content:'{"ok":true}'}}]}:{model:'fixture-model',status:'completed',usage:{input_tokens:100,output_tokens:10,total_tokens:110},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"ok":true}'}]}]}));});
 const proxy=createServer((_req,res)=>{proxied++;res.writeHead(403);res.end();});proxy.on('connect',(_req,socket)=>{proxied++;socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');});
 for(const s of [target,proxy])s.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 await new Promise<void>(ok=>target.listen(0,'127.0.0.1',ok));await new Promise<void>(ok=>proxy.listen(0,'127.0.0.1',ok));
 try{
  const targetPort=(target.address() as {port:number}).port,proxyPort=(proxy.address() as {port:number}).port;
  const code=`import {setGlobalProxyFromEnv} from 'node:http'; import {LocalStructuredModel} from ${JSON.stringify(moduleUrl)};${mode==='dynamic'?'setGlobalProxyFromEnv();':''} for(const dialect of ['responses','chat-completions']) { const model=new LocalStructuredModel({endpoint:'http://127.0.0.1:${targetPort}/v1/'+(dialect==='responses'?'responses':'chat/completions'),dialect,model:'fixture-model',token:'fixture-proxy-token',maxCalls:1,maxOutputTokens:64,totalOutputTokenBudget:64,timeoutMs:1500});const result=await model.complete({name:'fixture',schema:{type:'object'},instructions:'fixture only',context:{fixture:true}});if(result.status!=='completed'||!result.proposal.ok)process.exitCode=1; }`;
  const env={...process.env,NODE_OPTIONS:'',NODE_USE_ENV_PROXY:mode==='environment'?'1':'0',HTTP_PROXY:'http://127.0.0.1:'+proxyPort,HTTPS_PROXY:'http://127.0.0.1:'+proxyPort,http_proxy:'http://127.0.0.1:'+proxyPort,https_proxy:'http://127.0.0.1:'+proxyPort,NO_PROXY:'',no_proxy:''};
  const child=spawn(process.execPath,[...(mode==='flag'?['--use-env-proxy']:[]),'--input-type=module','--eval',code],{env,windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>child.kill(),8000);const [exitCode]=await once(child,'exit');clearTimeout(timer);assert.equal(exitCode,0);assert.equal(targetRequests,2);assert.equal(proxied,0);
 }finally{for(const s of sockets)s.destroy();await Promise.all([new Promise<void>(ok=>target.close(()=>ok())),new Promise<void>(ok=>proxy.close(()=>ok()))]);}
});
