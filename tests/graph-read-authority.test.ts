// Installed guards execute in Graph's transaction, not a second connection.
// 安装的守卫运行于Graph事务，不另开连接。
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {fixture} from './fixtures/graph-runtime.ts';import {GraphService} from '../src/runtime/graph-service.ts';import {GraphToolCatalog} from '../src/runtime/graph-contracts.ts';
test('installed read-authority callbacks cannot be replaced after catalog construction',()=>{
 const authority={delegates:()=>[],check:async()=>{}},tool={id:'guard.identity',version:'v1',effect:'read' as const,readAuthority:authority,validate:()=>({}),authorize:async()=>{},submit:async()=>({}),lookup:async()=>({})};
 const catalog=new GraphToolCatalog([tool]);assert.equal(catalog.describe()[0].readAuthority,'same-sql-read-authority/1');authority.check=async()=>{};assert.throws(()=>catalog.get(tool.id,tool.version),/graph_tool_version_changed/);
});
for(const phase of ['before','during','approval','allowed'] as const)test('installed read guard: '+phase,async()=>{
 const f=await fixture();try{
  f.state.now=new Date();let approvalId='';let live=phase!=='before',calls=0,checks=0;const it=f.actors.it;
  const tool={id:'owned.guarded.read',version:'v1',effect:'read' as const,validate:()=>({}),authorize:async()=>{},
   readAuthority:{delegates:()=>[{id:it.id,version:1,role:'it' as const}],check:async(tx:any,_actor:any,_args:any,principals:any)=>{checks++;assert.equal(principals.get(it.id).role,'it');assert.equal((await tx.query('SELECT id FROM onboarding_scope')).rows.length,0);if(!live)throw Error('business_read_grant_changed');}},
   submit:async(_actor:any,_args:any,reference:string)=>{calls++;if(phase==='during')live=false;if(phase==='approval')await service.revokeApproval(f.actors.executive,approvalId);return {reference,state:'completed',receiptRef:'owned-'+reference,sourceRevision:'owned',data:{value:123}};},lookup:async()=>{throw Error('no_reprobe');}};
  const service=new GraphService(f.db,new GraphToolCatalog([tool]),()=>f.state.now),s=await f.add(),p=await service.compile(it,{processes:[{id:s.id,expectedVersion:s.version}],links:[],routes:[],bindings:[{processId:s.id,nodeId:'work',toolId:tool.id,toolVersion:'v1',args:{}}]}),a=await service.approve(f.actors.executive,p.id,{planHash:p.planHash,executionAcknowledged:true}),r=await service.create(f.actors.operations,p.id,{approvalId:a.id,idempotencyKey:randomUUID()});
  approvalId=a.id;await service.step(f.actors.operations,r.runId);const v=await service.view(f.actors.operations,r.runId);assert.ok(checks>0);
  if(phase==='before'){assert.equal(calls,0);assert.equal(v.actions.length,0);}
  else if(phase==='during'||phase==='approval'){assert.equal(calls,1);assert.equal(v.actions[0].result,null);assert.equal(v.actions[0].state,'unknown');assert.equal(v.state,'waiting_input');}
  else{assert.equal(calls,1);assert.equal(v.actions[0].state,'completed');live=false;const hidden=await service.view(f.actors.operations,r.runId);assert.equal(hidden.actions[0].result,null);assert.equal(hidden.actions[0].args,null);assert.equal(hidden.sourcePayloadRedacted,true);}
 }finally{await f.close();}
});
