// Ownership and bounded shutdown; no production volumes or credentials.
// 核对实例身份和有界停服，不访问生产卷或凭证。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,cp,access,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
async function exercise(kind:string,command='stop.mjs'){
 const root=await mkdtemp(join(tmpdir(),'eb-shutdown-'));await mkdir(join(root,'scripts'));await mkdir(join(root,'.runtime'));
 for(const file of ['stop.mjs','recovery.mjs','local-control.mjs','local-http.mjs','portable-runtime.mjs'])await cp(join(process.cwd(),'scripts',file),join(root,'scripts',file));
 const id=randomUUID(),token='a'.repeat(43);let stopCalls=0,otherCalls=0;
 const server=createServer(async(req,res)=>{if(req.url==='/health'){if(kind==='hang')return;if(kind==='redirect'){res.writeHead(302,{Location:'/other'});res.end();return;}if(kind==='rotate')await writeFile(join(root,'.runtime/control.json'),JSON.stringify({port,token:'b'.repeat(43)}));res.setHeader('content-type','application/json');if(kind==='oversize'){res.end(JSON.stringify({filler:'x'.repeat(17000)}));return;}res.end(JSON.stringify({application:'enterprise-brain',status:'ready',instanceId:kind==='mismatch'?randomUUID():id}));return;}if(req.url==='/other'){otherCalls++;res.end('unexpected');return;}if(req.url==='/_dev/stop'){stopCalls++;if(kind==='stop-redirect'){res.writeHead(302,{Location:'/other'});res.end();return;}if(kind==='matched'){await unlink(join(root,'.runtime/instance.lock'));await unlink(join(root,'.runtime/control.json'));}res.end('ok');return;}res.writeHead(404);res.end();});
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));const port=(server.address() as {port:number}).port;
 await writeFile(join(root,'.runtime/instance.lock'),JSON.stringify({pid:process.pid,port,instanceId:id}));await writeFile(join(root,'.runtime/control.json'),JSON.stringify({port,token}));
 const started=Date.now();const child=spawn(process.execPath,['scripts/'+command,...(command==='recovery.mjs'?['backup']:[])],{cwd:root,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);
 let deadlineHit=false;const timer=setTimeout(()=>{deadlineHit=true;child.kill();},7000);
 const code=await new Promise<number|null>(ok=>child.once('exit',ok));clearTimeout(timer);server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));
 assert.ok(!text.includes('ERR_MODULE_NOT_FOUND'),'Fixture must load its complete script dependencies');const backupCreated=await access(join(root,'.data/backups')).then(()=>true,()=>false);
 return {code,stopCalls,otherCalls,deadlineHit,elapsedMs:Date.now()-started,secretPrinted:text.includes(token),backupCreated};
}
for(const kind of ['mismatch','redirect','hang'])test('E6 shutdown: '+kind+' health never receives control request',async()=>{const r=await exercise(kind);assert.equal(r.stopCalls,0);assert.equal(r.otherCalls,0);assert.equal(r.deadlineHit,false);assert.notEqual(r.code,0);assert.equal(r.secretPrinted,false);assert.ok(r.elapsedMs<6000);});
test('E6 shutdown: matching owned identity stops once and awaits lock removal',async()=>{const r=await exercise('matched');assert.equal(r.code,0);assert.equal(r.stopCalls,1);assert.equal(r.deadlineHit,false);assert.equal(r.secretPrinted,false);});
for(const kind of ['rotate','oversize'])test('E6 shutdown: '+kind+' refuses before sending the control key',async()=>{const r=await exercise(kind);assert.equal(r.stopCalls,0);assert.notEqual(r.code,0);assert.equal(r.deadlineHit,false);assert.equal(r.secretPrinted,false);});
test('E6 backup: wrong instance cannot stop a service or create an archive',async()=>{const r=await exercise('mismatch','recovery.mjs');assert.equal(r.stopCalls,0);assert.equal(r.backupCreated,false);assert.notEqual(r.code,0);assert.equal(r.secretPrinted,false);});
test('E6 shutdown: POST redirect is not followed',async()=>{const r=await exercise('stop-redirect');assert.equal(r.stopCalls,1);assert.equal(r.otherCalls,0);assert.notEqual(r.code,0);assert.equal(r.secretPrinted,false);});
