// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Actual isolated control execution; expected answers never reach the executor/model.
// 实际隔离控制执行：预期答案只给评分器，不进入执行器或模型上下文。
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openDatabase} from '../db/adapter.ts';
import {migrate} from '../db/migrate.ts';
import {seed,readCase,DEMO_ENTERPRISE,DEMO_EXECUTIVE} from '../industry/seed.ts';
import {initializeFinance,LocalSource} from '../connectors/local-source.ts';
import {createSyntheticSource} from '../demo/source.ts';
import {ReplayModel,type ModelAdapter} from '../runtime/contracts.ts';
import {RuntimeService} from '../runtime/service.ts';
import {OperatingService} from '../core/operating-service.ts';
import {SupplyModelAdapter,OperatingModelAdapter} from '../runtime/model-adapters.ts';
import type {StructuredModel} from '../runtime/model-transport.ts';
const actor={id:DEMO_EXECUTIVE,enterpriseId:DEMO_ENTERPRISE,role:'executive',authorizationVersion:1};
export type TaskInput={story:'S1'|'S2'|'S3';goal?:any;selection?:any;flow?:string;fault?:string};
export type Observation={state:string;writes:number;reason?:unknown;error?:string;assessment?:string;traceLength?:number;operations?:string[];sameId?:boolean;manual?:boolean;coverageCases?:number;qualityReleased?:boolean;paymentVerified?:boolean;causalityVerified?:boolean;availabilityAfter?:number|null;mockModelCalls:number;protocolFixtureCalls?:number;modelProfile:string;durationMs:number;faultInjection:string|null;events:unknown[]};
export type Suite={version:number;clock:string;repeats:number;tasks:{id:string;label:{zh:string;en:string};input:TaskInput;expected:Record<string,unknown>}[]};
export async function loadSuite(root:string,version=2):Promise<{suite:Suite;sha256:string}>{
 const dir=resolve(root,'data/evaluation'),bytes=await readFile(resolve(dir,'tasks-v'+version+'.json')),freeze=JSON.parse(await readFile(resolve(dir,'frozen-v'+version+'.json'),'utf8')),sha256=createHash('sha256').update(bytes).digest('hex');
 if(sha256!==freeze.sha256)throw Error('evaluation_freeze_mismatch');const suite=JSON.parse(bytes.toString()) as Suite;
 if(suite.version!==version||suite.tasks.length!==30||new Set(suite.tasks.map(t=>t.id)).size!==30||!['S1','S2','S3'].every(s=>suite.tasks.filter(t=>t.input.story===s).length===10))throw Error('evaluation_suite_invalid');return {suite,sha256};
}
export function score(expected:Record<string,unknown>,observed:Observation){
 const mismatches:string[]=[];for(const [key,value]of Object.entries(expected)){
  if(key==='errorPresent'){if(Boolean(observed.error)!==value)mismatches.push(key);}
  else if(JSON.stringify((observed as any)[key])!==JSON.stringify(value))mismatches.push(key);
 }
 if(observed.qualityReleased===true||observed.paymentVerified===true||observed.causalityVerified===true)mismatches.push('forbidden-authority-or-causality-claim');
 return {pass:mismatches.length===0,mismatches};
}
async function fixture(root:string,clock:string,model:ModelAdapter,protocol?:StructuredModel){
 const db=await openDatabase(':memory:'),warehouse=await openDatabase(':memory:'),finance=await openDatabase(':memory:');
 await migrate(db,resolve(root,'migrations'));await seed(db,root);await initializeFinance(finance,DEMO_ENTERPRISE);const {scenario}=await readCase(root),source=await createSyntheticSource(warehouse,'evaluation-fixture-only',scenario.skus);
 await new Promise<void>(ok=>source.server.listen(0,'127.0.0.1',ok));const client=new LocalSource('http://127.0.0.1:'+(source.server.address() as any).port,'evaluation-fixture-only',finance,1500);
 let now=new Date(clock);return {db,warehouse,finance,source,client,runtime:new RuntimeService(db,client,scenario,model,()=>now),operating:new OperatingService(db,client,()=>now,protocol?new OperatingModelAdapter(protocol):undefined),advance(ms:number){now=new Date(now.getTime()+ms);},async close(){source.server.closeAllConnections();await new Promise<void>(ok=>source.server.close(()=>ok()));await source.operating.stop();await finance.close();await warehouse.close();await db.close();}};
}
export async function executeControl(input:TaskInput,root:string,clock:string,protocolFixture?:StructuredModel):Promise<Observation>{
 const begin=performance.now(),replay:ModelAdapter=protocolFixture?new SupplyModelAdapter(protocolFixture):new ReplayModel();let modelCalls=0,wireCalls=0;
 const protocol:StructuredModel|undefined=protocolFixture?{profile:protocolFixture.profile,async complete(request,signal){wireCalls++;return protocolFixture.complete(request,signal);}}:undefined;
 const model:ModelAdapter={profile:replay.profile,async propose(context,repair,signal){modelCalls++;const response=await (protocol?new SupplyModelAdapter(protocol):replay).propose(context,repair,signal);if(input.fault==='invented-reference'&&context.evidenceRefs.length)(response.proposal as any).evidence_refs=['invented-source'];return response;}};
 const f=await fixture(root,clock,model,protocol);let state='rejected',reason:unknown,error:string|undefined,id:string|undefined,view:any,sameId:boolean|undefined;
 try{
  if(input.fault==='finance-low')await f.finance.query('UPDATE finance_snapshot SET available_cash_cny=45000000,version=version+1');
  if(input.fault==='unqualified')await f.warehouse.query("UPDATE source_resource SET qualified=false WHERE origin='copack'");
  if(input.fault==='no-guard')f.source.fault.atomicGuard=false;
  if(input.fault==='missing-proof'){const original=f.client.snapshot.bind(f.client);f.client.snapshot=async()=>{const snapshot=await original();snapshot.resources[0].proof=null;return snapshot;};}
  if(input.fault==='equipment-offline'){const original=f.client.operatingEvidence.bind(f.client);f.client.operatingEvidence=async selection=>{const evidence=await original(selection);evidence.facts.deviceOnline=false;return evidence;};}
  if(input.story==='S1'){
   const run=await f.runtime.create(actor,'SUPPLY-20261012',input.goal,randomUUID());id=run.runId;await f.runtime.step(DEMO_ENTERPRISE,id);view=await f.runtime.get(actor,id);
   if(input.flow==='fulfilled'){await f.runtime.approve(actor,view.plans[0].id,1,'approve');await f.runtime.step(DEMO_ENTERPRISE,id);await f.runtime.fulfillDemo(actor,id);await f.runtime.step(DEMO_ENTERPRISE,id);}
   view=await f.runtime.get(actor,id);state=view.state;reason=view.reason;
  }else{
   const key=randomUUID(),businessActor=input.flow==='it-identity'?{...actor,role:'it'}:actor;
   view=await f.operating.create(businessActor,input.selection,key);id=view.id;
   if(input.flow==='duplicate')sameId=(await f.operating.create(actor,input.selection,key)).id===id;
   if(input.flow==='conflicting-key')await f.operating.create(actor,{...input.selection,code:'CAP-OUT-001'},key);
   if(input.flow==='expire-approval'){f.advance(300001);await f.operating.approve(actor,id!,view.version);}
   if(input.flow==='unapproved')await f.operating.reconcile(actor,id!);
   if(['fulfilled','accepted','revoke','corrupt-receipt'].includes(input.flow??'')){
    await f.operating.approve(actor,id!,view.version);
    if(input.flow==='revoke'){await f.db.query('UPDATE principal SET authorization_version=2 WHERE id=$1',[actor.id]);await f.operating.reconcile({...actor,authorizationVersion:2},id!);}
    await f.operating.reconcile(actor,id!);view=await f.operating.get(actor,id!);
    if(input.flow==='corrupt-receipt'){const receipt=structuredClone(view.tasks[0].receipt);receipt.result.qualityReleased=true;f.client.lookupOperating=async()=>receipt;f.advance(5001);await f.operating.reconcile(actor,id!);}
    if(input.flow==='fulfilled'){for(const task of view.tasks)await f.source.operating.fulfill(task.id);f.advance(5001);await f.operating.reconcile(actor,id!);}
   }
   view=await f.operating.get(actor,id!);state=view.state;
  }
 }catch(e){error=e instanceof Error?e.message:'execution_error';
  if(id){view=input.story==='S1'?await f.runtime.get(actor,id):await f.operating.get(input.flow==='revoke'?{...actor,authorizationVersion:2}:actor,id);state=view.state;reason=view.reason;}
 }
 try{
  const writes=Number((await f.warehouse.query('SELECT (SELECT count(*) FROM source_request)+(SELECT count(*) FROM source_operating_request) n')).rows[0].n);
  const plan=view?.plan,summary=view?.summary,events=id?(input.story==='S1'?(await f.runtime.events(actor,id)).events:view.events):[];
  return {state,writes,reason,...error?{error}:{},...plan?{assessment:plan.assessment,traceLength:plan.evidence.trace.length,operations:plan.actions.map((a:any)=>a.command.operation),qualityReleased:plan.qualityReleased,paymentVerified:plan.paymentVerified,causalityVerified:plan.causalityVerified,manual:view.tasks.length>0&&view.tasks.every((t:any)=>t.manual),availabilityAfter:view.tasks.find((t:any)=>t.receipt?.result.availabilityAfter!==null)?.receipt?.result.availabilityAfter??null}:{},...summary?.coverageCases!==undefined?{coverageCases:summary.coverageCases,paymentVerified:summary.paymentVerified}:{},...sameId!==undefined?{sameId}:{},mockModelCalls:protocol?0:modelCalls,...protocol?{protocolFixtureCalls:wireCalls}:{},modelProfile:protocol?.profile??(input.story==='S1'?model.profile:'finite-rules-no-model'),durationMs:performance.now()-begin,faultInjection:input.fault??input.flow??null,events};
 }finally{await f.close();}
}
export function controlReport(rows:{id:string;repeat:number;observed:Observation;pass:boolean;mismatches:string[]}[],suiteHash:string){
 const passed=rows.filter(r=>r.pass).length;return {mode:'constructed-control-dry-run',suiteHash,trials:rows.length,controlGatePasses:passed,controlGateFailures:rows.length-passed,actualModelCalls:0,realModelBusinessSuccess:null,realModelCostCny:null,realModelLatencyMs:null,modelsCompared:0,actualModelEvaluation:'NOT_RUN',manualBaseline:'NOT_RUN',fullProductAcceptance:false,rows};
}
