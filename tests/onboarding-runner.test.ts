// Real owned HTTP services and independent-process persistence.
// 真实自有HTTP服务与独立进程持久化验收。
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Server,type RequestListener} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openDatabase,type Database} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {DiscoveryStore} from '../src/onboarding/discovery-store.ts';
import {DiscoveryRunner} from '../src/onboarding/discovery-runner.ts';
import type {Actor} from '../src/identity/service.ts';
let db:Database,store:DiscoveryStore,runner:DiscoveryRunner;
const actor:Actor={id:randomUUID(),enterpriseId:randomUUID(),role:'it',authorizationVersion:1};
const metadata=JSON.stringify({$Version:'4.01',Owned:{Row:{$Kind:'EntityType',$Key:['Id'],Id:{$Type:'Edm.String',$Nullable:false}}}});
before(async()=>{
 db=await openDatabase(':memory:');await migrate(db,join(process.cwd(),'migrations'));
 await db.query("INSERT INTO enterprise VALUES($1,'Owned runner','enterprise','CNY','UTC')",[actor.enterpriseId]);
 await db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,'owned-it','it')",[actor.id,actor.enterpriseId]);
 store=new DiscoveryStore(db);runner=new DiscoveryRunner(store);
});
after(async()=>{await runner?.close();await db?.close();});
async function owned(handler:RequestListener){const server=createServer(handler);await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));const a=server.address();assert.ok(a&&typeof a!=='string');return {server,url:'http://127.0.0.1:'+a.port};}
async function stop(server:Server){server.closeAllConnections();await new Promise<void>((ok,bad)=>server.close(e=>e?bad(e):ok()));}
async function setup(endpoints:string[]){const scope=await store.createScope(actor,{endpoints,idempotencyKey:randomUUID(),scopeAcknowledged:true});const run=await store.createRun(actor,{scopeId:scope.id,expectedScopeVersion:1,idempotencyKey:randomUUID()});return {scope,run};}
test('multiple real systems yield separate evidence without business authority / 多实际服务形成独立证据不授业务权',async()=>{
 let hits=0;const x=await owned((req,res)=>{hits++;if(req.url==='/auth'){res.writeHead(401);res.end();}else{res.writeHead(200,{'Content-Type':'application/json'});res.end(req.url==='/unknown'?'{}':metadata);}});
 try{
  const {run}=await setup([x.url+'/metadata',x.url+'/metadata',x.url+'/unknown',x.url+'/auth','http://owned.invalid/metadata']);
  await Promise.all([runner.start(actor,run.id),runner.start(actor,run.id)]);
  const status=await runner.status(actor,run.id);assert.equal(status.state,'completed');assert.equal(hits,3);
  assert.equal(status.targets.length,4);assert.equal(status.targets.filter(t=>t.observation?.outcome==='protocol_identified').length,1);
  assert.equal(status.targets.filter(t=>t.observation?.outcome==='needs_authorization').length,1);
  assert.equal(status.targets.filter(t=>t.state==='unsupported').length,1);assert.equal(status.connected,false);
  await runner.start(actor,run.id);assert.equal(hits,3);
 }finally{await stop(x.server);}
});
test('cancel interrupts owned requests and commits no late evidence / 取消中断自有请求且无迟到证据',async()=>{
 let reached!:()=>void;const ready=new Promise<void>(ok=>{reached=ok;});
 const x=await owned((_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.write('{');reached();});
 let timer:NodeJS.Timeout|undefined;
 try{
  const {run}=await setup([x.url+'/slow']);const pending=runner.start(actor,run.id);
  await Promise.race([ready,new Promise<never>((_ok,bad)=>{timer=setTimeout(()=>bad(Error('owned_request_missing')),3000);})]);
  await runner.cancel(actor,run.id,1);await pending;const status=await runner.status(actor,run.id);
  assert.equal(status.state,'cancelled');assert.equal(status.requestsStopping,false);assert.equal(status.targets[0].observation,null);
 }finally{if(timer)clearTimeout(timer);await stop(x.server);}
});
test('scope revoke fences in-flight data and removes read visibility / 范围撤销隔离在途数据并收回可见性',async()=>{
 let reached!:()=>void;const ready=new Promise<void>(ok=>{reached=ok;});const x=await owned((_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.write('{');reached();});let timer:NodeJS.Timeout|undefined;
 try{
  const {scope,run}=await setup([x.url+'/slow']);const pending=runner.start(actor,run.id);
  await Promise.race([ready,new Promise<never>((_ok,bad)=>{timer=setTimeout(()=>bad(Error('owned_request_missing')),3000);})]);
  await runner.revoke(actor,scope.id,1);await pending;const status=await runner.status(actor,run.id);
  assert.equal(status.scopeActive,false);assert.equal(status.targets[0].endpoint,undefined);assert.equal(status.targets[0].observation,undefined);
 }finally{if(timer)clearTimeout(timer);await stop(x.server);}
});
test('explicit recovery fences the exact worker without rescanning / 明确恢复隔离精确工作器且不重扫',async()=>{
 const {run}=await setup(['http://127.0.0.1:19001/metadata']),claim=await store.claimNext(actor,run.id);assert.ok(claim);
 const restarted=new DiscoveryRunner(new DiscoveryStore(db)),status=await restarted.status(actor,run.id);
 try{
  assert.equal(status.needsRecovery,true);await assert.rejects(restarted.start(actor,run.id),/discovery_worker_changed/);
  await assert.rejects(restarted.fence(actor,run.id,{expectedVersion:1,expectedWorkerInstance:randomUUID(),recoveryAcknowledged:true}),/discovery_run_conflict/);
  await restarted.fence(actor,run.id,{expectedVersion:1,expectedWorkerInstance:status.workerInstance,recoveryAcknowledged:true});
  assert.equal((await restarted.status(actor,run.id)).state,'unknown');await assert.rejects(store.assertClaim(actor,claim));
 }finally{await restarted.close();}
});
for(const mode of ['claim','commit'])test('independent process reopens original '+mode+' without replay / 独立进程重开不重放 '+mode,async()=>{
 const parent=join(process.cwd(),'.evidence');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'onboarding-restart-'));
 const call=(action:string)=>{const child=spawnSync(process.execPath,['tests/fixtures/onboarding-restart.mjs',action,directory],{cwd:process.cwd(),encoding:'utf8',timeout:20000,maxBuffer:1024*1024,windowsHide:true});assert.equal(child.status,0,child.stderr);return JSON.parse(child.stdout.trim().split('\n').at(-1)!);};
 const first=call(mode),second=call('inspect');assert.equal(second.runId,first.runId);assert.equal(second.newHttpRequests,0);
 if(mode==='claim'){assert.equal(second.needsRecovery,true);assert.equal(second.evidenceCount,0);assert.equal(second.nextClaim,'discovery_worker_changed');}
 else{assert.equal(second.state,'completed');assert.equal(second.evidenceCount,1);assert.equal(second.evidenceId,first.evidenceId);assert.equal(second.nextClaim,null);}
});
