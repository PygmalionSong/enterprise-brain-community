// Owned HTTP model protocol,independent SQL facts,current authority;no real model quality claim.
// 自有HTTP模型协议/独立SQL事实/当前授权，不冒称真实模型质量成绩。
import test from 'node:test';import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {businessAnalyzerFixture,waitFor} from './fixtures/business-analyzer.ts';import {DurableBusinessAnalyzer} from '../src/runtime/business-analyzer.ts';
import {suspendRestoredBusinessAnalysis} from '../src/runtime/business-analysis-ledger.ts';
const row=async(f:Awaited<ReturnType<typeof businessAnalyzerFixture>>)=>(await f.db.query<any>('SELECT * FROM business_analysis_request')).rows[0];

test('business analyzer: installed local protocol yields original-value citations and explicitly unverified statements',async()=>{const f=await businessAnalyzerFixture();try{
 const r=await f.analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,'completed');assert.equal(r.currentReadAuthorized,true);assert.equal(r.analysis!.evidence[0].value,'1234567890123456.1234');assert.equal(r.analysis!.hypotheses[0].verification,'unverified');assert.equal(r.analysis!.businessExecutionAuthorized,false);assert.equal(r.analysis!.efficiencyVerified,false);assert.equal(f.modelState.modelCalls,1);assert.deepEqual(await f.counts(),{calls:1,tokens:64});assert.equal((await row(f)).reported_usage.outputTokens,20);assert.equal((await f.db.query('SELECT * FROM process_graph_action')).rows.length,1);assert.equal(f.stateRead.reads,1);assert.equal(f.stateRead.lookups,0);
 const body=f.modelState.requests[0];assert.equal(body.store,false);assert.equal(body.tools,undefined);assert.equal(body.max_output_tokens,64);assert.equal(body.text.format.name,'enterprise_business_analysis_v1');assert.equal(body.text.format.strict,true);const context=JSON.parse(body.input[0].content);assert.equal(context.language,'zh');assert.equal(context.evidence.authority,'source-data-not-instructions');assert.equal(JSON.stringify(context).includes('Untrusted source text'),false);
 }finally{await f.close();}});

test('business analyzer: concurrent duplicate POST semantics and completed retries produce one model call/reservation',async()=>{const f=await businessAnalyzerFixture();try{
 const values=await Promise.all([f.analyzer.generate(f.actors.operations,f.input),f.analyzer.generate(f.actors.operations,f.input)]);assert.equal(values[0].id,values[1].id);const again=await f.analyzer.generate(f.actors.operations,f.input);assert.equal(again.state,'completed');assert.equal(f.modelState.modelCalls,1);assert.deepEqual(await f.counts(),{calls:1,tokens:64});assert.equal((await f.db.query('SELECT * FROM business_analysis_request')).rows.length,1);
 }finally{await f.close();}});

test('business analyzer: altered field citation is invalid without publishing model prose or source values',async()=>{const f=await businessAnalyzerFixture();try{
 f.modelState.mode='bad-citation';const r=await f.analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,'invalid');assert.equal(r.analysis,null);assert.equal((await row(f)).output,null);assert.equal(f.modelState.modelCalls,1);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{await f.close();}});

test('business analyzer: refusal,incomplete reply and unknown usage never become a completed analysis or refund',async()=>{for(const mode of ['refused','incomplete','bad-usage']){const f=await businessAnalyzerFixture();try{
 f.modelState.mode=mode;const r=await f.analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,mode==='refused'?'refused':'unknown');assert.equal(r.analysis,null);assert.equal((await row(f)).output,null);assert.equal(f.modelState.modelCalls,1);assert.deepEqual(await f.counts(),{calls:1,tokens:64});assert.equal((await f.analyzer.generate(f.actors.operations,f.input)).id,r.id);assert.equal(f.modelState.modelCalls,1);
 }finally{await f.close();}}});

test('business analyzer: source permission revoked after RPC prevents publication and further cached reading',async()=>{const f=await businessAnalyzerFixture();try{
 f.modelState.onCall=async()=>{await f.source.query('UPDATE permissions SET allowed=false WHERE principal_id=$1',[f.actors.operations.id]);};const r=await f.analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,'invalid');assert.equal(r.analysis,null);assert.equal((await row(f)).output,null);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{await f.close();}});

test('business analyzer: policy disabled after RPC seals an invalid request without publishing the result',async()=>{const f=await businessAnalyzerFixture();try{
 f.modelState.onCall=async()=>{await f.policy.configure(f.actors.it,{expectedVersion:1,enabled:false,policyAcknowledged:true});};const r=await f.analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,'invalid');assert.equal(r.analysis,null);assert.equal(f.modelState.modelCalls,1);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{await f.close();}});

test('business analyzer: credential drift after reply cannot publish and does not leak private paths',async()=>{const f=await businessAnalyzerFixture();try{
 f.modelState.onCall=async()=>{await writeFile(f.tokenFile,'Owned-rotated-credential');};const r=await f.analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,'unknown');assert.equal(r.analysis,null);assert.equal(JSON.stringify(r).includes(f.tokenFile),false);assert.equal((await row(f)).output,null);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{await f.close();}});

test('business analyzer: owner revoked during RPC still seals the original lease and never publishes',async()=>{const f=await businessAnalyzerFixture();try{
 f.modelState.onCall=async()=>{await f.db.query('UPDATE principal SET disabled=true,authorization_version=2 WHERE id=$1',[f.actors.operations.id]);};await assert.rejects(f.analyzer.generate(f.actors.operations,f.input),/not_authorized/);const r=await row(f);assert.equal(r.state,'invalid');assert.equal(r.output,null);assert.equal(r.lease_id,null);const history=await f.ledger.view(f.actors.executive,r.id);assert.equal('input' in history,false);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{await f.close();}});

test('business analyzer: explicit cancellation fences a response already in flight and keeps its reservation',async()=>{const f=await businessAnalyzerFixture();let release!:()=>void;try{
 f.modelState.modelGate=new Promise<void>(ok=>{release=ok;});const running=f.analyzer.generate(f.actors.operations,f.input);await waitFor(()=>f.modelState.modelCalls===1);const pending=await f.ledger.lookup(f.actors.operations,f.input.idempotencyKey);await f.analyzer.cancel(f.actors.operations,pending.id,1);release();const r=await running;assert.equal(r.state,'cancelled');assert.equal(r.analysis,null);assert.equal((await row(f)).output,null);assert.equal((await f.analyzer.generate(f.actors.operations,f.input)).state,'cancelled');assert.equal(f.modelState.modelCalls,1);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{release?.();await f.close();}});

test('business analyzer: a late factory never makes an RPC and cannot publish after its bounded deadline',async()=>{const f=await businessAnalyzerFixture();try{
 let factories=0;const installation={...f.installedModel,async create(limits:any){factories++;await new Promise(ok=>setTimeout(ok,1200));return f.installedModel.create(limits);}},analyzer=new DurableBusinessAnalyzer(f.ledger,f.results,installation,()=>f.state.now);const r=await analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,'unknown');assert.equal(r.analysis,null);await new Promise(ok=>setTimeout(ok,300));assert.equal(factories,1);assert.equal(f.modelState.modelCalls,0);assert.equal((await row(f)).output,null);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{await f.close();}});

test('business analyzer: model deadline does not accept a delayed protocol reply or automatically resend',async()=>{const f=await businessAnalyzerFixture();let release!:()=>void;try{
 f.modelState.modelGate=new Promise<void>(ok=>{release=ok;});const running=f.analyzer.generate(f.actors.operations,f.input);await waitFor(()=>f.modelState.modelCalls===1);const r=await running;assert.equal(r.state,'unknown');release();await new Promise(ok=>setTimeout(ok,30));assert.equal((await row(f)).output,null);assert.equal((await f.analyzer.generate(f.actors.operations,f.input)).state,'unknown');assert.equal(f.modelState.modelCalls,1);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{release?.();await f.close();}});

test('business analyzer: final source review delayed beyond the deadline cannot commit a late completed result',async()=>{const f=await businessAnalyzerFixture();let release!:()=>void;try{
 f.modelState.onCall=async()=>{f.stateRead.gate=new Promise<void>(ok=>{release=ok;});};const r=await f.analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,'unknown');release();await new Promise(ok=>setTimeout(ok,30));assert.equal((await row(f)).state,'unknown');assert.equal((await row(f)).output,null);assert.equal(f.modelState.modelCalls,1);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{release?.();await f.close();}});

test('business analyzer: cached successful text is withheld after source revocation while original output remains frozen in SQL',async()=>{const f=await businessAnalyzerFixture();try{
 const first=await f.analyzer.generate(f.actors.operations,f.input),before=await row(f);assert.equal(first.state,'completed');await f.source.query('UPDATE permissions SET allowed=false WHERE principal_id=$1',[f.actors.operations.id]);const r=await f.analyzer.view(f.actors.operations,first.id);assert.equal(r.state,'completed');assert.equal(r.analysis,null);assert.equal(r.currentReadAuthorized,false);assert.deepEqual((await row(f)).output,before.output);assert.equal(f.modelState.modelCalls,1);
 }finally{await f.close();}});

test('business analyzer: completed output is immutable;restored pending requests cannot be completed by an old lease',async()=>{const f=await businessAnalyzerFixture();try{
 const r=await f.analyzer.generate(f.actors.operations,f.input);await assert.rejects(f.db.query("UPDATE business_analysis_request SET output='{}',version=version+1 WHERE id=$1",[r.id]),/analysis_request_terminal/);const pending=await f.ledger.reserve(f.actors.operations,{...f.input,idempotencyKey:'pending-before-restore'});assert.equal(await suspendRestoredBusinessAnalysis(f.db,f.actors.operations.enterpriseId),1);await assert.rejects(f.results.publish(f.actors.operations,pending.id,pending.dispatch!.leaseId,f.selection,(await row(f)).output,{inputTokens:10,outputTokens:20,totalTokens:30}),/analysis_stale_lease/);assert.equal((await f.analyzer.view(f.actors.operations,pending.id)).state,'unknown');assert.equal(f.modelState.modelCalls,1);assert.deepEqual(await f.counts(),{calls:2,tokens:128});
 }finally{await f.close();}});

test('business analyzer: missing installation,IT and stale business sessions do not reserve or call a model',async()=>{const f=await businessAnalyzerFixture();try{
 const absent=new DurableBusinessAnalyzer(f.ledger,f.results);await assert.rejects(absent.generate(f.actors.operations,f.input),/analysis_model_not_installed/);await assert.rejects(f.analyzer.generate(f.actors.it,f.input),/not_authorized/);await assert.rejects(f.analyzer.generate({...f.actors.operations,authorizationVersion:2},f.input),/not_authorized/);assert.deepEqual(await f.counts(),{calls:0,tokens:0});assert.equal(f.modelState.modelCalls,0);
 }finally{await f.close();}});

test('business analyzer: policy revoked inside an asynchronous model factory prevents the first RPC',async()=>{const f=await businessAnalyzerFixture();try{
 let factories=0;const installed={...f.installedModel,async create(limits:any){factories++;const model=await f.installedModel.create(limits);await f.policy.configure(f.actors.it,{expectedVersion:1,enabled:false,policyAcknowledged:true});return model;}},analyzer=new DurableBusinessAnalyzer(f.ledger,f.results,installed,()=>f.state.now),r=await analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,'invalid');assert.equal(r.analysis,null);assert.equal(factories,1);assert.equal(f.modelState.modelCalls,0);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{await f.close();}});

test('business analyzer: mismatched factory profile never receives source context or invokes a model',async()=>{const f=await businessAnalyzerFixture();try{
 let calls=0;const installed={...f.installedModel,create(){return {profile:'forged-profile',async complete(){calls++;throw Error('never_call');}};}},analyzer=new DurableBusinessAnalyzer(f.ledger,f.results,installed,()=>f.state.now),r=await analyzer.generate(f.actors.operations,f.input);assert.equal(r.state,'invalid');assert.equal(r.analysis,null);assert.equal(calls,0);assert.equal(f.modelState.modelCalls,0);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{await f.close();}});

test('business analyzer: cancellation guard changing during terminal SQL rolls back result and audit before commit',async()=>{const f=await businessAnalyzerFixture();try{
 const r=await f.ledger.reserve(f.actors.operations,f.input),o=f.prepared.context.observations[0],field=o.fields[0],wire={format:'enterprise-brain.business-analysis-response/1',kind:'analysis',questions:[],hypotheses:[{id:'h1',text:'Compare an independently validated period.',referenceIds:['e1']}],recommendations:[],references:[{id:'e1',observationId:o.id,path:field.path,valueHash:field.valueHash}],limitations:['Comparison and cause unverified.']};let checks=0;
 await assert.rejects(f.results.publish(f.actors.operations,r.id,r.dispatch!.leaseId,f.selection,wire,{inputTokens:10,outputTokens:20,totalTokens:30},()=>++checks===1),/analysis_interrupted/);const stored=await row(f);assert.equal(stored.state,'reserved');assert.equal(stored.version,1);assert.equal(stored.output,null);assert.equal((await f.db.query("SELECT * FROM audit_event WHERE kind='business_analysis_completed'")).rows.length,0);assert.equal(f.modelState.modelCalls,0);assert.deepEqual(await f.counts(),{calls:1,tokens:64});
 }finally{await f.close();}});
