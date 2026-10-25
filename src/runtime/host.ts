// Local host owns worker lifetime and two independent source databases.
// 本机宿主管理worker生命周期及两个独立源数据库。
import {fork} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {openDatabase,type Database} from '../db/adapter.ts';
import {DEMO_ENTERPRISE,readCase} from '../industry/seed.ts';
import {LocalSource,initializeFinance} from '../connectors/local-source.ts';
import {RuntimeService} from './service.ts';
import {ConnectionService} from '../connectors/discovery.ts';
import {HttpFixtureDriver,SqlFixtureDriver} from '../connectors/fixture-drivers.ts';
import {initializeCrmFixture,SqlCrmFixtureDriver} from '../connectors/crm-source.ts';
import {OperatingService} from '../core/operating-service.ts';
import {initializeLocalConnections} from '../connectors/bootstrap.ts';
import {SynchronizationScheduler} from '../connectors/scheduling.ts';
import {EventIngress} from '../ingress/events.ts';
import {ownedEventProfiles} from '../ingress/owned.ts';
export async function startRuntime(db:Database,root:string){
 const secret=randomBytes(32).toString('base64url'),child=fork(resolve(root,'dist/demo-source.js'),[],{cwd:root,env:{...process.env,EB_SOURCE_SECRET:secret},stdio:['ignore','ignore','inherit','ipc']});
 let finance:Database|undefined;
 const stopChild=async()=>{if(child.exitCode!==null||child.signalCode!==null)return;await new Promise<void>(done=>{const timer=setTimeout(()=>child.kill(),3000);child.once('exit',()=>{clearTimeout(timer);done();});if(child.connected)child.send('stop');else child.kill();});};
 try{
 const port=await new Promise<number>((ok,fail)=>{const timer=setTimeout(()=>{child.kill();fail(Error('source_start_timeout'));},15000);child.once('error',e=>{clearTimeout(timer);fail(e);});child.once('exit',()=>{clearTimeout(timer);fail(Error('source_start_failed'));});child.once('message',message=>{const p=(message as {port?:number}).port;clearTimeout(timer);Number.isInteger(p)?ok(p!):fail(Error('source_start_failed'));});});
 finance=await openDatabase(resolve(root,'.data/source-sql'));await initializeFinance(finance,DEMO_ENTERPRISE);await initializeCrmFixture(finance,DEMO_ENTERPRISE);const scenario=(await readCase(root)).scenario;
 // Keep the finance binding; CRM is an additional owned read-only fixture.
 // 保留资金绑定；CRM新增为自有只读案例，不替换原账本。
 const endpoint='http://127.0.0.1:'+port,raw=new LocalSource(endpoint,secret,finance),connections=new ConnectionService(db,[new HttpFixtureDriver(endpoint,raw,scenario.skus,finance),new SqlFixtureDriver(finance,raw,DEMO_ENTERPRISE),new SqlCrmFixtureDriver(finance,{enterpriseId:DEMO_ENTERPRISE,assetId:'CON-09'})]);
 await initializeLocalConnections(db,connections);
 const client=new LocalSource(endpoint,secret,finance,1500,(id,operation)=>connections.assertActive(DEMO_ENTERPRISE,id,operation)),operating=new OperatingService(db,client);
 const runtime=new RuntimeService(db,client,scenario,undefined,undefined,()=>child.exitCode===null&&child.signalCode===null&&child.connected),synchronization=new SynchronizationScheduler(db,connections),events=new EventIngress(db,connections,await ownedEventProfiles(root));
 let stopped=false,busy:Promise<unknown>|null=null,timer:ReturnType<typeof setInterval>|undefined,reportedError=false;
 return {runtime,connections,operating,events,start(){if(timer||stopped)return;timer=setInterval(()=>{if(stopped||busy)return;busy=(runtime.healthy()?runtime.drain(DEMO_ENTERPRISE).then(()=>operating.drain(DEMO_ENTERPRISE)):Promise.resolve()).then(()=>synchronization.drain(DEMO_ENTERPRISE)).then(()=>reportedError=false).catch(()=>{if(!reportedError)console.error('运行调度暂不可用 / Runtime scheduling unavailable');reportedError=true;}).finally(()=>busy=null);},1000);},async stop(){stopped=true;clearInterval(timer);await busy;await stopChild();await finance!.close();}};
 }catch(e){await stopChild();await finance?.close();throw e;}
}
