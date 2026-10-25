// Trusted program-interface example, not HTTP identity or live-company acceptance.
// 受信程序接口示例，不是HTTP身份或真实企业验收。
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
import {openDatabase} from '../../src/db/adapter.ts';
import {migrate} from '../../src/db/migrate.ts';
import {ProcessRegistry} from '../../src/connectors/process-registry.ts';
import {McpProcessReader} from '../../src/connectors/mcp-process-reader.ts';
import {StdioProcessTransport} from '../../src/connectors/mcp-stdio.ts';
import {GraphService} from '../../src/runtime/graph-service.ts';
import {installedEnterpriseTools} from '../../src/enterprise/installed-tools.ts';
import {hash} from '../../src/runtime/contracts.ts';
import {resources,descriptors,serverInfo,inspectLedger} from './owned-source.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url)),source=fileURLToPath(new URL('owned-source.mjs',import.meta.url));
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
export async function runPhase(phase,out){
 assert.ok(['prepare','reconcile'].includes(phase));assert.ok(path.isAbsolute(out));const control=JSON.parse(fs.readFileSync(path.join(out,'owned-example.json')));assert.equal(control.format,'enterprise-brain.first-task-owner/1');assert.equal(control.sourceSha256,digest(source));assert.equal(control.nodeSha256,digest(process.execPath));
 const database=path.join(out,'enterprise.pglite'),ledger=path.join(out,'source.sqlite'),installation=path.join(out,'trusted-tools.json');let db;
 try{
  if(phase==='prepare'){
   db=await openDatabase(database);await migrate(db,path.join(root,'migrations'));
   const enterpriseId=randomUUID(),actors={};await db.query("INSERT INTO enterprise VALUES($1,'Owned first task','enterprise','CNY','UTC')",[enterpriseId]);
   for(const role of['it','executive','operations']){const id=randomUUID();await db.query('INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,$3,$4)',[id,enterpriseId,'owned-'+role,role]);actors[role]={id,enterpriseId,role,authorizationVersion:1};}
   const server={command:process.execPath,args:[source,'tools',ledger],timeoutMs:1500},manifest={format:1,installationAcknowledged:true,tools:[{id:'first.owned.check',effect:'delegated',roles:['executive','operations'],arguments:{type:'object',properties:{value:{type:'integer',minimum:1,maximum:100}},required:['value'],additionalProperties:false},server,artifacts:[{file:process.execPath,sha256:digest(process.execPath)},{file:source,sha256:digest(source)}],contract:{format:'enterprise-brain.graph-tool/1',serverInfo,submit:{name:descriptors[0].name,descriptorSha256:hash(descriptors[0])},lookup:{name:descriptors[1].name,descriptorSha256:hash(descriptors[1])}}}]};save(installation,manifest);
   const catalog=await installedEnterpriseTools(db,installation),tool=catalog.describe().find(t=>t.id==='first.owned.check');assert.ok(tool);const registry=new ProcessRegistry(db,root),graph=new GraphService(db,catalog);
   const reader=new McpProcessReader(new StdioProcessTransport({command:process.execPath,args:[source,'resources'],timeoutMs:1500}),resources.map(r=>r.uri)),evidence=[];
   try{await reader.initialize();const listed=await reader.list();assert.equal(listed.length,2);for(const r of listed)evidence.push(await reader.read(r.uri));}finally{await reader.close();}
   const imports=[];for(const [i,e] of evidence.entries()){const p=await registry.import(actors.it,{sourceId:'owned_first_task',expectedVersion:0,origin:'mcp_read',content:JSON.stringify(e.definition)});imports.push(await registry.confirm(actors.it,p.id,{expectedVersion:p.version,rawSha256:p.rawSha256,definitionSha256:p.definitionSha256,mapping:[{stageId:i===0?'market-1':'procure-1',nodeId:'check'}],semanticsAcknowledged:true}));}
   const [a,b]=imports,link=await registry.link(actors.it,{fromId:a.id,toId:b.id,fromVersion:a.version,toVersion:b.version,fromHash:a.definitionSha256,toHash:b.definitionSha256,fromNode:'end',toNode:'start',objectRelation:'owned_record_handover',semanticsAcknowledged:true});
   const plan=await graph.compile(actors.it,{processes:imports.map(p=>({id:p.id,expectedVersion:p.version})),links:[{id:link.id,expectedVersion:link.version}],routes:[],bindings:imports.map((p,i)=>({processId:p.id,nodeId:'check',toolId:tool.id,toolVersion:tool.version,args:{value:10+i}}))});assert.equal(plan.taskCount,2);
   await assert.rejects(graph.approve(actors.it,plan.id,{planHash:plan.planHash,executionAcknowledged:true}),/not_authorized/);
   await assert.rejects(graph.create(actors.operations,plan.id,{approvalId:randomUUID(),idempotencyKey:'unapproved'}),/graph_approval_invalid/);
   assert.equal(fs.existsSync(ledger),false);
   const approval=await graph.approve(actors.executive,plan.id,{planHash:plan.planHash,executionAcknowledged:true,ttlSeconds:600}),run=await graph.create(actors.operations,plan.id,{approvalId:approval.id,idempotencyKey:control.runId});
   await graph.step(actors.operations,run.runId);const view=await graph.view(actors.operations,run.runId);assert.equal(view.actions.length,1);assert.equal(view.actions[0].state,'unknown');const originalAction=view.actions[0].id,owned=inspectLedger(ledger);assert.equal(owned.jobs.length,1);assert.equal(owned.calls.filter(c=>c.method==='first.submit').length,1);assert.equal(owned.jobs[0].reference,originalAction);assert.equal(owned.jobs[0].state,'completed');
   save(path.join(out,'checkpoint.json'),{format:'enterprise-brain.first-task-checkpoint/1',runId:run.runId,planId:plan.id,planHash:plan.planHash,approvalId:approval.id,actors,originalAction,toolVersion:tool.version,idempotencyKey:control.runId});
   save(path.join(out,'prepare-result.json'),{phase,pid:process.pid,processInstanceId:randomUUID(),processesRead:2,processesConfirmed:2,crossLinks:1,taskCount:2,originalAction,actionState:'unknown',sourceRows:1,submitCalls:1,itApprovalRefused:true,missingApprovalRefused:true});
  }else{
   const cp=JSON.parse(fs.readFileSync(path.join(out,'checkpoint.json')));assert.equal(cp.format,'enterprise-brain.first-task-checkpoint/1');assert.equal(cp.idempotencyKey,control.runId);db=await openDatabase(database);
   const catalog=await installedEnterpriseTools(db,installation),tool=catalog.describe().find(t=>t.id==='first.owned.check');assert.equal(tool.version,cp.toolVersion);const graph=new GraphService(db,catalog),before=await graph.view(cp.actors.operations,cp.runId);assert.equal(before.actions[0].id,cp.originalAction);assert.equal(before.actions[0].state,'unknown');assert.equal((await graph.plan(cp.actors.it,cp.planId)).planHash,cp.planHash);
   const duplicate=await graph.create(cp.actors.operations,cp.planId,{approvalId:cp.approvalId,idempotencyKey:cp.idempotencyKey});assert.equal(duplicate.runId,cp.runId);
   for(let i=0;i<12;i++){const current=await graph.view(cp.actors.operations,cp.runId);if(current.state==='succeeded')break;await graph.step(cp.actors.operations,cp.runId);}
   const after=await graph.view(cp.actors.operations,cp.runId);assert.equal(after.state,'succeeded');assert.equal(after.actions.length,2);assert.ok(after.actions.every(a=>a.state==='completed'));assert.ok(after.actions.some(a=>a.id===cp.originalAction));const owned=inspectLedger(ledger);assert.equal(owned.jobs.length,2);assert.equal(owned.calls.filter(c=>c.method==='first.submit').length,2);assert.equal(owned.calls.filter(c=>c.method==='first.lookup').length,2);
   for(const action of after.actions){assert.equal(owned.calls.filter(c=>c.reference===action.id&&c.method==='first.submit').length,1);assert.equal(owned.calls.filter(c=>c.reference===action.id&&c.method==='first.lookup').length,1);assert.equal(owned.jobs.filter(j=>j.reference===action.id).length,1);}
   save(path.join(out,'reconcile-result.json'),{phase,pid:process.pid,processInstanceId:randomUUID(),state:after.state,runId:after.id,originalActionRetained:true,planHashRetained:true,idempotentRunReused:true,actions:2,sourceRows:2,submitCalls:2,lookupCalls:2,duplicateSubmissions:0,receiptCount:after.actions.filter(a=>a.receipt_ref).length});
  }
 }finally{await db?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await runPhase(process.argv[2],process.argv[3]);}catch(e){console.error(e);process.exitCode=1;}}
