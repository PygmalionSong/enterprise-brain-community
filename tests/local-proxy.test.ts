// Owned fixtures verify source/preflight/stop routing independently of model code.
// 自有构造服务独立验证源、预检和停服路由，不接触工作台数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import type {Socket} from 'node:net';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ownsReadyPort} from '../scripts/preflight.mjs';
const sourceUrl=new URL('../src/connectors/local-source.ts',import.meta.url).href,preflightUrl=new URL('../scripts/preflight.mjs',import.meta.url).href,controlUrl=new URL('../scripts/local-control.mjs',import.meta.url).href;
const instanceId='11111111-1111-1111-1111-111111111111';
for(const mode of ['environment','flag','dynamic'] as const)test('E6 local controls: '+mode+' proxy observes no source, health or stop request',async()=>{
 const root=await mkdtemp(join(tmpdir(),'eb-proxy-control-'));await mkdir(join(root,'.runtime'));const token='b'.repeat(43),sockets=new Set<Socket>();let targetRequests=0,proxyRequests=0;
 const target=createServer((req,res)=>{targetRequests++;req.resume();void(async()=>{if(req.url?.startsWith('/requests/')){assert.equal(req.headers.authorization,'Bearer fixture-source-token');res.writeHead(404,{'Content-Type':'application/json'});res.end('{"code":"not_found"}');}else if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({application:'enterprise-brain',status:'ready',instanceId}));}else if(req.url==='/_dev/stop'){assert.equal(req.headers['x-local-control'],token);await unlink(join(root,'.runtime/instance.lock'));await unlink(join(root,'.runtime/control.json'));res.writeHead(200,{'Content-Type':'application/json'});res.end('{"stopped":true}');}else{res.writeHead(404);res.end();}})().catch(()=>res.destroy());});
 const proxy=createServer((_req,res)=>{proxyRequests++;res.writeHead(403);res.end();});proxy.on('connect',(_req,s)=>{proxyRequests++;s.end('HTTP/1.1 403 Forbidden\r\n\r\n');});for(const server of [target,proxy])server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
 await new Promise<void>(ok=>target.listen(0,'127.0.0.1',ok));await new Promise<void>(ok=>proxy.listen(0,'127.0.0.1',ok));
 try{const port=(target.address() as {port:number}).port,proxyPort=(proxy.address() as {port:number}).port;await writeFile(join(root,'.runtime/instance.lock'),JSON.stringify({pid:process.pid,port,instanceId}));await writeFile(join(root,'.runtime/control.json'),JSON.stringify({port,token}));
 const code=`import {setGlobalProxyFromEnv} from 'node:http';import {LocalSource} from ${JSON.stringify(sourceUrl)};import {ownsReadyPort} from ${JSON.stringify(preflightUrl)};import {stopOwnedLocal} from ${JSON.stringify(controlUrl)};${mode==='dynamic'?'setGlobalProxyFromEnv();':''}const source=new LocalSource('http://127.0.0.1:${port}','fixture-source-token',{});if(await source.lookup('fixture')!==null)throw Error('lookup');if(!await ownsReadyPort(${JSON.stringify(root)},${port},1000))throw Error('preflight');const stopped=await stopOwnedLocal(${JSON.stringify(root)},{healthTimeoutMs:1000,shutdownTimeoutMs:1000});if(!stopped.requested)throw Error('stop');`;
 const proxyUrl='http://127.0.0.1:'+proxyPort,env={...process.env,NODE_OPTIONS:'',NODE_USE_ENV_PROXY:mode==='environment'?'1':'0',HTTP_PROXY:proxyUrl,HTTPS_PROXY:proxyUrl,http_proxy:proxyUrl,https_proxy:proxyUrl,NO_PROXY:'',no_proxy:''};const child=spawn(process.execPath,[...(mode==='flag'?['--use-env-proxy']:[]),'--input-type=module','--eval',code],{env,windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>child.kill(),8000);const [exitCode]=await once(child,'exit');clearTimeout(timer);assert.equal(exitCode,0);assert.equal(targetRequests,4);assert.equal(proxyRequests,0);
 }finally{for(const s of sockets)s.destroy();await Promise.all([new Promise<void>(ok=>target.close(()=>ok())),new Promise<void>(ok=>proxy.close(()=>ok()))]);}
});
test('E6 preflight: an excessive health body is rejected without waiting for its end',async()=>{
 const root=await mkdtemp(join(tmpdir(),'eb-health-body-'));await mkdir(join(root,'.runtime'));const sockets=new Set<Socket>();const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.write(JSON.stringify({application:'enterprise-brain',status:'ready',instanceId,padding:'x'.repeat(20000)}));});server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 try{const port=(server.address() as {port:number}).port;await writeFile(join(root,'.runtime/instance.lock'),JSON.stringify({pid:process.pid,port,instanceId}));const timeout=Symbol('timeout');let timer:ReturnType<typeof setTimeout>|undefined;const result=await Promise.race([ownsReadyPort(root,port,2000),new Promise<symbol>(ok=>{timer=setTimeout(()=>ok(timeout),800);})]);if(timer)clearTimeout(timer);assert.notEqual(result,timeout);assert.equal(result,false);
 }finally{for(const s of sockets)s.destroy();await new Promise<void>(ok=>server.close(()=>ok()));}
});
