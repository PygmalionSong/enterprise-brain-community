// Isolated synthetic HTTP benchmark; does not read the running installation.
// 隔离合成HTTP基准，不读取正在运行的安装数据。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
(async()=>{
 const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),output='performance-'+randomUUID()+'.json';
 if(process.argv.slice(2).some(v=>v!=='--snapshot-first'))throw Error('usage: benchmark-performance.mjs [--snapshot-first]');
 const {openDatabase}=await import('../src/db/adapter.ts'),{migrate}=await import('../src/db/migrate.ts'),{seed,readCase,DEMO_ENTERPRISE,DEMO_EXECUTIVE}=await import('../src/industry/seed.ts');
 const {initializeWorkbench,operatingAggregate}=await import('../src/core/workbench.ts'),{hash}=await import('../src/runtime/contracts.ts'),{createApplication}=await import('../src/http/server.ts');
 const {RuntimeService}=await import('../src/runtime/service.ts'),{OperatingService}=await import('../src/core/operating-service.ts'),{LocalSource}=await import('../src/connectors/local-source.ts'),{localFetch}=await import('../scripts/local-http.mjs');
 const target=path.join(root,'.evidence','performance',randomUUID());await fs.mkdir(target,{recursive:true});
 let db=await openDatabase(path.join(target,'database'));const actor={id:DEMO_EXECUTIVE,enterpriseId:DEMO_ENTERPRISE,role:'executive',authorizationVersion:1};let app;
 const record={scope:'ISOLATED_CONSTRUCTED_HTTP_PGLITE_ONLY',date:new Date().toISOString(),machine:{os:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryGiB:os.totalmem()/2**30,node:process.version},concurrency:20,facts:100000,actualModels:0,externalCalls:0,cache:'cold application then warm; OS/WASM cache not reset',runs:[],fullProductAcceptance:false};
 const summarise=values=>{const v=[...values].sort((a,b)=>a-b);return {count:v.length,minMs:v[0],p50Ms:v[Math.ceil(v.length*.5)-1],p95Ms:v[Math.ceil(v.length*.95)-1],maxMs:v.at(-1)}};
 try{
 await migrate(db,path.join(root,'migrations'));await seed(db,root);await initializeWorkbench(db,root);
 const baseline=await operatingAggregate(db,actor,{year:2025,period:'year'}),payload=JSON.parse(await fs.readFile(path.join(root,'data/operating-snapshot.json'),'utf8'));
 const original=payload.operatingCube,cube=[];
 for(let i=0;i<original.length;i++){const row=original[i],n=7+(i<208?1:0);for(let j=0;j<n;j++){const r={...row};for(const k of ['revenue','cases','liters','grossProfit','opProfit','target','demand','supply','ka'])r[k]=row[k]/n;r.due=Math.floor(row.due/n)+(j<row.due%n?1:0);cube.push(r);}}
 assert.equal(cube.length,100000);payload.operatingCube=cube;await db.query('UPDATE operating_snapshot SET payload=$1,checksum=$2 WHERE enterprise_id=$3 AND id=$4',[JSON.stringify(payload),hash(payload),DEMO_ENTERPRISE,payload.version]);
 // Decomposition retains amounts; this is test-only, never the released business model.
 // 拆分保留金额，只修改隔离测试库，不修改发行经营数据。
 const expanded=await operatingAggregate(db,actor,{year:2025,period:'year'});for(const [k,v]of Object.entries(baseline.sums))assert.ok(Math.abs(expanded.sums[k]-v)<Math.max(.01,Math.abs(v)*1e-9));
 await db.close();db=await openDatabase(path.join(target,'database'));
 record.cache='Fresh reopened database/application at first aggregate wave; subsequent endpoints share warmed snapshot cache. OS/WASM cache not reset.';
 const scenario=(await readCase(root)).scenario,source=new LocalSource('http://127.0.0.1:1','never-called',db),runtime=new RuntimeService(db,source,scenario),operating=new OperatingService(db,source);
 app=createApplication(db,root,'demo',undefined,{},runtime,undefined,operating);await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+app.server.address().port;
 const sessions=[];for(let i=0;i<20;i++)sessions.push(await app.identity.createSession(DEMO_EXECUTIVE));
 const requests=[['aggregate','/v1/operating/aggregate?year=2025&period=year'],['overview','/v1/overview'],['stage','/v1/processes/warehouse/stages/warehouse-1'],['snapshot','/v1/operating/snapshot']];
 if(process.argv.includes('--snapshot-first')){requests.unshift(requests.pop());record.cache='Fresh reopened database/application at first snapshot wave; subsequent endpoints share warmed snapshot cache. OS/WASM cache not reset.';}
 for(const [name,url]of requests)for(const phase of ['first-wave','warm-wave']){
 let snapshotBytes;
 const values=await Promise.all(sessions.map(async(s,i)=>{const t=performance.now(),res=await localFetch(origin+url,{headers:{cookie:'eb_session='+s.token}});assert.equal(res.status,200);const bytes=await res.arrayBuffer(),ms=performance.now()-t;assert.ok(bytes.byteLength>0);if(name==='snapshot'&&i===0)snapshotBytes=Buffer.from(bytes);if(name==='aggregate'){const result=JSON.parse(Buffer.from(bytes));assert.equal(result.rows,expanded.rows);for(const [k,v]of Object.entries(expanded.sums))assert.ok(Math.abs(result.sums[k]-v)<.01);}return ms;}));
 if(snapshotBytes){assert.equal(JSON.parse(snapshotBytes).snapshot.operatingCube.length,100000);record.snapshotBytes=snapshotBytes.length;}
 const summary=summarise(values);record.runs.push({name,phase,...summary,thresholdMs:2000,passed:summary.p95Ms<=2000});await fs.writeFile(path.join(root,'.evidence',output),JSON.stringify(record,null,2));console.log(name,phase,JSON.stringify(summary));
 }
 const values=await Promise.all(sessions.map(async s=>{const t=performance.now(),res=await localFetch(origin+'/v1/cases/SUPPLY-20261012/runs',{method:'POST',headers:{cookie:'eb_session='+s.token,origin,'x-csrf-token':s.csrf,'idempotency-key':randomUUID(),'content-type':'application/json'},body:JSON.stringify({kind:'supply',cashBudgetCny:60000000})});assert.equal(res.status,202);const r=await res.json();assert.ok(r.runId);return performance.now()-t;}));
 const summary=summarise(values);record.runs.push({name:'task-create',phase:'no worker/model/external wait',...summary,thresholdMs:1000,passed:summary.p95Ms<=1000});
 assert.equal(Number((await db.query('SELECT count(*) n FROM agent_run')).rows[0].n),20);
 record.passed=record.runs.every(r=>r.passed);record.memory=process.memoryUsage();record.evidenceDatabase=target;record.measurement='HTTP full-body receipt, includes authentication and SQL queue, excludes browser JSON parse/render. Twenty unique sessions, same executive principal. No model/worker/external execution.';
 }catch(e){record.error=String(e);record.passed=false;throw e;}finally{if(app)await new Promise(ok=>app.server.close(ok));await db.close();await fs.writeFile(path.join(root,'.evidence',output),JSON.stringify(record,null,2));console.log(JSON.stringify({passed:record.passed,output}));if(!record.passed)process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1});
