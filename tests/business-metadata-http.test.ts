import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {randomUUID,createHash} from 'node:crypto';
import {businessReadPolicy} from '../src/onboarding/business-read-contracts.ts';import {readBusinessPolicyMetadata} from '../src/onboarding/business-metadata-http.ts';
import {setup} from './fixtures/business-read.ts';import {BusinessReadGrants} from '../src/onboarding/business-read-grants.ts';
import {businessReadGraphTool} from '../src/onboarding/business-read-tool.ts';import {GraphToolCatalog} from '../src/runtime/graph-contracts.ts';import {GraphService} from '../src/runtime/graph-service.ts';import {hash} from '../src/runtime/contracts.ts';
// Real concurrent requests prove capacity before I/O and release after completion.
// 真实并发请求核对发出前容量限制与完成后释放，不替换产品校验函数。
test('source review admits four owned requests, refuses a fifth before I/O, and releases capacity',async()=>{
 const body=JSON.stringify({$Version:'4.01',$EntityContainer:'Owned.Container',Owned:{Order:{$Kind:'EntityType',$Key:['Id'],Id:{$Type:'Edm.String',$Nullable:false}},Container:{$Kind:'EntityContainer',Orders:{$Collection:true,$Type:'Owned.Order'}}}});
 let hits=0,release!:()=>void,arrived!:()=>void;const gate=new Promise<void>(ok=>release=ok),allArrived=new Promise<void>(ok=>arrived=ok);
 const server=createServer(async(_req,res)=>{if(++hits===4)arrived();await gate;res.setHeader('Content-Type','application/json');res.end(body);});
 let f:Awaited<ReturnType<typeof setup>>|undefined,pending:ReturnType<BusinessReadGrants['reviewPolicyFromSource']>[]=[];
 try{await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+(server.address() as any).port;f=await setup(false,':memory:',base+'/$metadata',body);
  const grants=new BusinessReadGrants(f.db),input={policy:{...f.proof.policy,endpoint:base+'/Orders',timeoutMs:5000},endpointAndFieldsAcknowledged:true};
  pending=Array.from({length:4},()=>grants.reviewPolicyFromSource(f!.actors.it,input));const results=Promise.all(pending);void results.catch(()=>{});
  let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([allArrived,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('owned_four_requests_not_observed')),4000);})]);}finally{clearTimeout(timer);}
  await assert.rejects(grants.reviewPolicyFromSource(f.actors.it,input),/business_read_review_capacity/);assert.equal(hits,4);
  await assert.rejects(grants.reviewPolicyFromSource(f.actors.executive,input),/not_authorized/);assert.equal(hits,4);
  release();assert.ok((await results).every(r=>r.metadataValidated));assert.equal((await grants.reviewPolicyFromSource(f.actors.it,input)).metadataValidated,true);assert.equal(hits,5);
 }finally{release();await Promise.allSettled(pending);await f?.close();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
test('owned metadata GET validates exact digest, collection/fields and current authority',async()=>{
 const body=JSON.stringify({$Version:'4.01',$EntityContainer:'Owned.Container',Owned:{Order:{$Kind:'EntityType',$Key:['Id'],Id:{$Type:'Edm.String',$Nullable:false}},Container:{$Kind:'EntityContainer',Orders:{$Collection:true,$Type:'Owned.Order'}}}});let hits=0,path='';
 const server=createServer((req,res)=>{hits++;path=req.url!;res.setHeader('Content-Type','application/json');res.end(req.url?.startsWith('/Orders')?JSON.stringify({value:[{Id:'owned-graph-row',Secret:'unapproved'}]}):body);});
 try{await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+(server.address() as any).port,person={id:randomUUID(),version:1,role:'it'};
 const p=businessReadPolicy({format:'enterprise-brain.business-read-policy/1',enterpriseId:randomUUID(),scopeId:randomUUID(),scopeVersion:1,discoveryRunId:randomUUID(),reviewId:randomUUID(),reviewVersion:1,bindingId:randomUUID(),bindingVersion:2,owner:person,reviewer:person,policyReviewer:person,metadataSha256:createHash('sha256').update(body).digest('hex'),adapter:'odata.projected-read.v1',endpoint:base+'/Orders',entity:'Orders',fields:['Id'],maxRows:10,maxBytes:4096,timeoutMs:1000,purpose:'Read approved orders'}).policy;
 const result=await readBusinessPolicyMetadata(p,base+'/$metadata',{check:async()=>{}});assert.equal(result.status,'validated');assert.equal(path,'/$metadata');assert.equal(result.evidenceCommitted,false);assert.equal(JSON.stringify(result).includes('$EntityContainer'),false);
 for(const change of [{...p,fields:['Secret']},{...p,metadataSha256:'f'.repeat(64)}])assert.equal((await readBusinessPolicyMetadata(change,base+'/$metadata',{check:async()=>{}})).status,'unavailable');
 let checks=0;const count=hits,denied=await readBusinessPolicyMetadata(p,base+'/$metadata',{check:async()=>{if(++checks===2)throw Error('revoked');}});assert.equal(denied.status,'unavailable');assert.equal(hits,count+1);
 const f=await setup(false,':memory:',base+'/$metadata',body);try{
  const grants=new BusinessReadGrants(f.db),input={policy:{...f.proof.policy,endpoint:base+'/Orders'},endpointAndFieldsAcknowledged:true};
  const review=await grants.reviewPolicyFromSource(f.actors.it,input);assert.equal(review.metadataValidated,true);
  const approved=await grants.approve(f.actors.executive,review.id,{expectedVersion:1,policySha256:review.sha256,businessReadAcknowledged:true});assert.equal(approved.version,1);
  const tool=businessReadGraphTool(grants),graph=new GraphService(f.db,new GraphToolCatalog([tool])),process=await f.add(),proof=await grants.proof(f.actors.operations,approved.id);
  const plan=await graph.compile(f.actors.it,{processes:[{id:process.id,expectedVersion:process.version}],links:[],routes:[],bindings:[{processId:process.id,nodeId:'work',toolId:tool.id,toolVersion:tool.version,args:{proof}}]});
  const execution=await graph.approve(f.actors.executive,plan.id,{planHash:plan.planHash,executionAcknowledged:true}),run=await graph.create(f.actors.operations,plan.id,{approvalId:execution.id,idempotencyKey:randomUUID()}),before=hits;
  await graph.step(f.actors.operations,run.runId);await graph.step(f.actors.operations,run.runId);const view=await graph.view(f.actors.operations,run.runId);assert.equal(view.state,'succeeded');assert.equal(hits,before+1);assert.deepEqual(view.actions[0].result.data,{rows:[{Id:'owned-graph-row'}]});
  const observation={actionId:view.actions[0].id,resultHash:hash(view.actions[0].result)};assert.equal((await graph.observeCompletedRead(f.actors.operations,run.runId,observation,{commit:async(_tx,evidence)=>evidence})).toolId,tool.id);
  await grants.revoke(f.actors.executive,approved.id,1);assert.equal((await graph.view(f.actors.operations,run.runId)).actions[0].result,null);
  await assert.rejects(graph.observeCompletedRead(f.actors.operations,run.runId,observation,{commit:async()=>true}));assert.equal(hits,before+1);
  await assert.rejects(grants.reviewPolicyFromSource(f.actors.it,{...input,policy:{...input.policy,fields:['Secret']}}),/metadata_validation_failed/);
 }finally{await f.close();}
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
