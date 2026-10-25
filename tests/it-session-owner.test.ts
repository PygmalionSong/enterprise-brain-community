// The administrative CLI must prove the live instance before disclosing its control key.
// 管理CLI发送控制密钥前须确认实例身份，所有服务/锁/令牌为构造。
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,cp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {once} from 'node:events';
test('E6 IT CLI: a foreign same-name service never receives the bootstrap control token',async()=>{
 const root=await mkdtemp(join(tmpdir(),'eb-it-owner-'));await mkdir(join(root,'scripts'));await mkdir(join(root,'.runtime'));for(const f of ['check-connections.mjs','preflight.mjs','local-http.mjs'])await cp(join(process.cwd(),'scripts',f),join(root,'scripts',f));let bootstrapCalls=0;
 const server=createServer((req,res)=>{req.resume();res.setHeader('Content-Type','application/json');if(req.url==='/health')res.end(JSON.stringify({application:'enterprise-brain',status:'ready',instanceId:'22222222-2222-2222-2222-222222222222'}));else if(req.url==='/_dev/it-session'){bootstrapCalls++;res.writeHead(403);res.end('{"code":"not_authorized"}');}else{res.writeHead(404);res.end('{}');}});await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 try{const port=(server.address() as {port:number}).port;await writeFile(join(root,'.runtime/instance.lock'),JSON.stringify({pid:process.pid,port,instanceId:'11111111-1111-1111-1111-111111111111'}));await writeFile(join(root,'.runtime/control.json'),JSON.stringify({port,token:'c'.repeat(43)}));const child=spawn(process.execPath,['scripts/check-connections.mjs'],{cwd:root,windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>child.kill(),5000);const [code]=await once(child,'exit');clearTimeout(timer);assert.notEqual(code,0);assert.equal(bootstrapCalls,0);
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
