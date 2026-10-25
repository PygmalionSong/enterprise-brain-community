// Trusted read-proof composition only;no public history route or new model/write grant.
// 仅受信只读证明组合，没有公开历史入口或新的模型/写授权。
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {businessObservationFixture} from './fixtures/business-observation.ts';import {fixture as graphFixture} from './fixtures/graph-runtime.ts';
import {GraphService} from '../src/runtime/graph-service.ts';import {GraphToolCatalog} from '../src/runtime/graph-contracts.ts';import {hash} from '../src/runtime/contracts.ts';
async function setup(){const f=await businessObservationFixture(),request=[{runId:f.run.runId,actionId:f.action.id,resultHash:hash(f.action.result)}];return {...f,request};}
const commit=async(_tx:any,evidence:any[])=>evidence;
async function waitFor(check:()=>boolean){const end=Date.now()+2000;while(!check()){if(Date.now()>end)throw Error('owned_history_gate_timeout');await new Promise(ok=>setTimeout(ok,1));}}
async function unchanged(f:Awaited<ReturnType<typeof setup>>){assert.equal(f.stateRead.reads,1);assert.equal(f.stateRead.lookups,0);assert.equal((await f.db.query('SELECT * FROM planning_candidate')).rows.length,0);assert.equal((await f.db.query('SELECT * FROM planning_configuration')).rows.length,0);}

test('history proof: completed original read is available after the old IT reviewer leaves,without renewing that authority',async()=>{const f=await setup();try{
 const before=(await f.db.query('SELECT * FROM process_graph_action')).rows;await f.db.query('UPDATE principal SET disabled=true,authorization_version=2 WHERE id=$1',[f.actors.it.id]);await assert.rejects(f.graph.observeCompletedReads(f.actors.operations,f.request,{commit}),/graph_authority_changed/);const values=await f.graph.reviewCompletedReads(f.actors.operations,f.request,{commit});assert.equal(values[0].data.rows[0].amount,'1234567890123456.1234');assert.equal(values[0].sourceObservedAt,null);assert.deepEqual((await f.db.query('SELECT * FROM process_graph_action')).rows,before);await unchanged(f);
 }finally{await f.close();}});

test('history proof: revoked or expired write-plan approval is not revived by reading the original completed receipt',async()=>{const f=await setup();try{
 await f.graph.revokePlan(f.actors.it,f.plan.id,1);await f.graph.revokeApproval(f.actors.executive,f.approval.id);f.state.now=new Date(f.state.now.getTime()+700000);const before=(await f.db.query('SELECT * FROM process_graph_run')).rows;await assert.rejects(f.graph.observeCompletedReads(f.actors.operations,f.request,{commit}),/graph_plan_revoked/);const values=await f.graph.reviewCompletedReads(f.actors.operations,f.request,{commit});assert.equal(values[0].planHash,f.plan.planHash);assert.equal((await f.db.query<any>('SELECT revoked FROM process_graph_plan')).rows[0].revoked,true);assert.equal((await f.db.query<any>('SELECT revoked FROM process_graph_approval')).rows[0].revoked,true);assert.deepEqual((await f.db.query('SELECT * FROM process_graph_run')).rows,before);await unchanged(f);
 }finally{await f.close();}});

test('history proof: a current executive can review a departed owner only with the executive own source permission',async()=>{const f=await setup();try{
 await f.db.query('UPDATE principal SET disabled=true,authorization_version=2 WHERE id=$1',[f.actors.operations.id]);await assert.rejects(f.graph.reviewCompletedReads(f.actors.operations,f.request,{commit}),/not_authorized/);assert.equal((await f.graph.reviewCompletedReads(f.actors.executive,f.request,{commit}))[0].actionId,f.action.id);await f.source.query('UPDATE permissions SET allowed=false WHERE principal_id=$1',[f.actors.executive.id]);await assert.rejects(f.graph.reviewCompletedReads(f.actors.executive,f.request,{commit}),/observation_read_unavailable/);await unchanged(f);
 }finally{await f.close();}});

test('history proof: a changed source fact never refreshes the stored historical receipt',async()=>{const f=await setup();try{
 await f.source.query('UPDATE facts SET amount=999');const result=await f.graph.reviewCompletedReads(f.actors.operations,f.request,{commit});assert.equal(result[0].data.rows[0].amount,'1234567890123456.1234');assert.equal(result[0].resultHash,hash(f.action.result));await unchanged(f);
 }finally{await f.close();}});

test('history proof: IT,auditor,forged roles,foreign actors and unrelated operations cannot read the raw original result',async()=>{const f=await setup();try{
 for(const actor of [f.actors.it,f.actors.auditor,{...f.actors.operations,role:'executive'},{...f.actors.operations,enterpriseId:randomUUID()}])await assert.rejects(f.graph.reviewCompletedReads(actor,f.request,{commit}),/not_authorized/);const id=randomUUID();await f.db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,'other-history-operator','operations')",[id,f.actors.operations.enterpriseId]);await assert.rejects(f.graph.reviewCompletedReads({id,enterpriseId:f.actors.operations.enterpriseId,role:'operations',authorizationVersion:1},f.request,{commit}),/not_authorized/);await unchanged(f);
 }finally{await f.close();}});

test('history proof: pending or delegated source work never becomes a historical business read',async()=>{const f=await graphFixture();try{
 const p=await f.plan(),r=await f.start(p.p);await f.service.step(f.actors.operations,r.r.runId);const a=(await f.service.view(f.actors.operations,r.r.runId)).actions[0];await assert.rejects(f.service.reviewCompletedReads(f.actors.operations,[{runId:r.r.runId,actionId:a.id,resultHash:hash(a.result)}],{commit}),/observation_not_completed/);await f.fulfill(a.id);await f.service.step(f.actors.operations,r.r.runId);const done=(await f.service.view(f.actors.operations,r.r.runId)).actions[0];assert.equal(done.state,'completed');await assert.rejects(f.service.reviewCompletedReads(f.actors.operations,[{runId:r.r.runId,actionId:done.id,resultHash:hash(done.result)}],{commit}),/observation_read_required/);assert.equal(f.state.calls,1);
 }finally{await f.close();}});

test('history proof: wrong original hash,caller data and duplicate action references fail before source authorization',async()=>{const f=await setup();try{
 const calls=f.stateRead.authorizations;for(const input of [[{...f.request[0],resultHash:'0'.repeat(64)}],[{...f.request[0],data:{invented:1}}],[f.request[0],f.request[0]]])await assert.rejects(f.graph.reviewCompletedReads(f.actors.operations,input,{commit}));assert.equal(f.stateRead.authorizations,calls);await unchanged(f);
 }finally{await f.close();}});

test('history proof: changed current tool contract/version refuses the old receipt without guessing compatibility',async()=>{const f=await setup();try{
 const graph=new GraphService(f.db,new GraphToolCatalog([{...f.tool,version:'v2'}]),()=>f.state.now);await assert.rejects(graph.reviewCompletedReads(f.actors.operations,f.request,{commit}),/graph_tool_version_changed/);await unchanged(f);
 }finally{await f.close();}});

test('history proof: actor epoch or required new IT grant changes while a source waits cannot commit',async()=>{for(const role of ['operations','it']){const f=await setup();let release!:()=>void,commits=0;try{
 f.stateRead.gate=new Promise<void>(ok=>{release=ok;});const before=f.stateRead.authorizations,pending=f.graph.reviewCompletedReads(f.actors.operations,f.request,{delegates:[{id:f.actors.it.id,version:1,role:'it'}],commit:async()=>{commits++;return true;}});await waitFor(()=>f.stateRead.authorizations>before);await f.db.query('UPDATE principal SET authorization_version=2 WHERE id=$1',[f.actors[role].id]);release();await assert.rejects(pending,/not_authorized|graph_authority_changed/);assert.equal(commits,0);await unchanged(f);
 }finally{release?.();await f.close();}}});

test('history proof: bounded source authorization never commits after a delayed response eventually arrives',async()=>{const f=await setup();let release!:()=>void,commits=0;try{
 f.stateRead.gate=new Promise<void>(ok=>{release=ok;});await assert.rejects(f.graph.reviewCompletedReads(f.actors.operations,f.request,{commit:async()=>{commits++;return true;}}),/observation_read_timeout/);release();await new Promise(ok=>setTimeout(ok,20));assert.equal(commits,0);await unchanged(f);
 }finally{release?.();await f.close();}});

test('history proof: second source check detects withdrawn permission before final local proof composition',async()=>{const f=await setup();let authorizations=0,commits=0;try{
 const original=f.tool.authorize.bind(f.tool);f.tool.authorize=async(actor:any)=>{authorizations++;if(authorizations===2)await f.source.query('UPDATE permissions SET allowed=false WHERE principal_id=$1',[actor.id]);await original(actor);};await assert.rejects(f.graph.reviewCompletedReads(f.actors.operations,f.request,{commit:async()=>{commits++;return true;}}),/observation_read_unavailable/);assert.equal(authorizations,2);assert.equal(commits,0);await unchanged(f);
 }finally{await f.close();}});

test('history proof: hooks are trusted transactions only and a failed composition leaves all original graph state intact',async()=>{const f=await setup();try{
 const before=(await f.db.query('SELECT * FROM process_graph_run')).rows;await assert.rejects(f.graph.reviewCompletedReads(f.actors.operations,f.request,{commit:async tx=>{await tx.query("UPDATE process_graph_run SET reason='owned-history-abort' WHERE id=$1",[f.run.runId]);throw Error('owned_history_composition_abort');}}),/owned_history_composition_abort/);assert.deepEqual((await f.db.query('SELECT * FROM process_graph_run')).rows,before);await unchanged(f);
 }finally{await f.close();}});
