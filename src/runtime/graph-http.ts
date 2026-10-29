// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import type {GraphMetadata} from './graph-metadata.ts';import {graphMetadataRequest,graphMetadataQuery} from './graph-metadata-http.ts';
import type {BusinessHistory} from './business-history.ts';
import {publicGraphRun} from './graph-public.ts';
import type {DurableBusinessAnalyzer} from './business-analyzer.ts';
// Separate IT plan compilation and business approval/run APIs; all writes require CSRF.
// IT编译与业务批准/运行接口分离，所有写请求均需CSRF。
import type {IncomingMessage,ServerResponse} from 'node:http';
import {z} from 'zod';
import type {Actor,IdentityService} from '../identity/service.ts';
import type {GraphService} from './graph-service.ts';
import type {GraphSupervisor} from './graph-supervision.ts';
import {PlanningContext} from './planning-context.ts';
import type {DurableGraphPlanner} from './graph-planner.ts';
import type {CandidateAdoption} from './candidate-adoption.ts';
import type {BusinessObservations} from './business-observations.ts';
import type {AnalysisPolicyService} from './analysis-policy.ts';
export async function graphRoute(req:IncomingMessage,res:ServerResponse,url:URL,actor:Actor,identity:IdentityService,token:string,graph:GraphService,supervisor?:GraphSupervisor,planner?:DurableGraphPlanner,adoption?:CandidateAdoption,observations?:BusinessObservations,analysis?:AnalysisPolicyService,analyzer?:DurableBusinessAnalyzer,history?:BusinessHistory,metadata?:GraphMetadata){
 if(!url.pathname.startsWith('/v1/graph/')&&!url.pathname.startsWith('/v1/it/graph/'))return false;
 const json=(status:number,data:unknown)=>{const output=data&&typeof data==='object'&&'actions' in data&&/^\/v1\/graph\/runs\//.test(url.pathname)?publicGraphRun(data):data,encoded=JSON.stringify(output);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(encoded);};
 try{if(!['GET','POST'].includes(req.method??'')){json(405,{code:'method_not_allowed'});return true;}const listKind=metadata?graphMetadataRequest(req.method,url.pathname):null;if(url.search&&!listKind)throw Error('invalid_input');let input:any={};if(req.method==='POST'){if(!await identity.validateCsrf(token,String(req.headers['x-csrf-token']??''),String(req.headers.origin??''),url.origin))throw Error('not_authorized');if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']??'')))throw Error('invalid_input');const chunks:Buffer[]=[];let count=0;for await(const chunk of req){const b=Buffer.from(chunk);count+=b.length;if(count>600*1024)throw Error('graph_input_limit');chunks.push(b);}try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw Error('invalid_json');}}
  if(metadata&&listKind){json(200,await metadata.list(actor,listKind,graphMetadataQuery(url)));return true;}
  if(req.method==='GET'&&url.pathname==='/v1/it/graph/tools'){json(200,await graph.tools(actor));return true;}
  if(req.method==='POST'&&url.pathname==='/v1/it/graph/tools/validate'){json(200,await graph.validateTool(actor,input));return true;}
  if(req.method==='POST'&&url.pathname==='/v1/it/graph/planning/context'){json(200,await new PlanningContext(graph).build(actor,input));return true;}
  if(req.method==='POST'&&url.pathname==='/v1/it/graph/planning/validate'){json(200,await new PlanningContext(graph).validate(actor,input));return true;}
  if(planner&&req.method==='POST'&&url.pathname==='/v1/it/graph/planning/candidates'){json(200,await planner.generate(actor,input));return true;}
  const requestKey=/^\/v1\/it\/graph\/planning\/requests\/([A-Za-z0-9_.-]{1,100})$/.exec(url.pathname);
  if(planner&&requestKey&&req.method==='GET'){json(200,await planner.lookup(actor,requestKey[1]));return true;}
  const candidate=/^\/v1\/it\/graph\/planning\/candidates\/([a-f0-9-]{36})(?:\/(cancel|adopt))?$/.exec(url.pathname);
  if(planner&&candidate&&req.method==='GET'&&!candidate[2]){json(200,await planner.view(actor,candidate[1]));return true;}
  if(planner&&candidate&&req.method==='POST'&&candidate[2]==='cancel'){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);json(200,await planner.cancel(actor,candidate[1],q.expectedVersion));return true;}
  if(adoption&&candidate&&req.method==='POST'&&candidate[2]==='adopt'){json(200,await adoption.adopt(actor,candidate[1],input));return true;}
  if(observations&&req.method==='POST'&&url.pathname==='/v1/graph/observations'){json(200,await observations.create(actor,input));return true;}
  const observation=/^\/v1\/graph\/observations\/([a-f0-9-]{36})(?:\/(revoke))?$/.exec(url.pathname);
  if(observations&&observation&&req.method==='GET'&&!observation[2]){json(200,await observations.view(actor,observation[1]));return true;}
  if(observations&&observation&&req.method==='POST'&&observation[2]==='revoke'){json(200,await observations.revoke(actor,observation[1],input));return true;}
  if(history&&url.pathname==='/v1/it/graph/history-policy'){json(200,req.method==='GET'?await history.policy(actor):await history.configure(actor,input));return true;}
  const historyRequest=/^\/v1\/graph\/analysis\/requests\/([a-f0-9-]{36})\/history$/.exec(url.pathname);
  if(history&&historyRequest&&req.method==='POST'){json(200,await history.review(actor,historyRequest[1],input));return true;}
  if(analysis&&url.pathname==='/v1/it/graph/analysis-policy'){json(200,req.method==='GET'?await analysis.policy(actor):await analysis.configure(actor,input));return true;}
  if(analysis&&req.method==='POST'&&url.pathname==='/v1/graph/analysis/context'){json(200,await analysis.build(actor,input));return true;}
  if(analysis&&req.method==='POST'&&url.pathname==='/v1/graph/analysis/validate'){json(200,await analysis.validate(actor,input));return true;}
  if(analyzer&&req.method==='POST'&&url.pathname==='/v1/graph/analysis/requests'){json(200,await analyzer.generate(actor,input));return true;}
  const analysisKey=/^\/v1\/graph\/analysis\/requests\/by-key\/([A-Za-z0-9_.-]{1,100})$/.exec(url.pathname),analysisRequest=/^\/v1\/graph\/analysis\/requests\/([a-f0-9-]{36})(?:\/(cancel))?$/.exec(url.pathname);
  if(analyzer&&analysisKey&&req.method==='GET'){json(200,await analyzer.lookup(actor,analysisKey[1]));return true;}
  if(analyzer&&analysisRequest&&req.method==='GET'&&!analysisRequest[2]){json(200,await analyzer.view(actor,analysisRequest[1]));return true;}
  if(analyzer&&analysisRequest&&req.method==='POST'&&analysisRequest[2]==='cancel'){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);json(200,await analyzer.cancel(actor,analysisRequest[1],q.expectedVersion));return true;}
  if(req.method==='POST'&&url.pathname==='/v1/it/graph/plans'){json(201,await graph.compile(actor,input));return true;}
  if(req.method==='GET'&&url.pathname==='/v1/graph/plans'){json(200,await graph.plans(actor));return true;}
  const supervision=/^\/v1\/graph\/runs\/([a-f0-9-]{36})\/supervision$/.exec(url.pathname);
  if(supervision&&supervisor){json(200,req.method==='GET'?await supervisor.status(actor,supervision[1]):await supervisor.configure(actor,supervision[1],input));return true;}
  const plan=/^\/v1\/graph\/plans\/([a-f0-9-]{36})(?:\/(approvals|runs))?$/.exec(url.pathname),revoke=/^\/v1\/it\/graph\/plans\/([a-f0-9-]{36})\/revoke$/.exec(url.pathname),approval=/^\/v1\/graph\/approvals\/([a-f0-9-]{36})\/revoke$/.exec(url.pathname),run=/^\/v1\/graph\/runs\/([a-f0-9-]{36})(?:\/(step|cancel|reconcile|recover-receipt))?$/.exec(url.pathname);
  if(plan&&req.method==='GET'&&!plan[2]){json(200,await graph.plan(actor,plan[1]));return true;}
  if(plan&&req.method==='POST'&&plan[2]==='approvals'){json(201,await graph.approve(actor,plan[1],input));return true;}
  if(plan&&req.method==='POST'&&plan[2]==='runs'){json(201,await graph.create(actor,plan[1],input));return true;}
  if(revoke&&req.method==='POST'){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);json(200,await graph.revokePlan(actor,revoke[1],q.expectedVersion));return true;}
  if(approval&&req.method==='POST'){z.object({}).strict().parse(input);json(200,await graph.revokeApproval(actor,approval[1]));return true;}
  if(run&&req.method==='GET'&&!run[2]){json(200,await graph.view(actor,run[1]));return true;}
  if(run&&req.method==='POST'&&run[2]==='step'){z.object({}).strict().parse(input);json(200,await graph.step(actor,run[1]));return true;}
  if(run&&req.method==='POST'&&run[2]==='recover-receipt'){json(200,await graph.recoverReceipt(actor,run[1],input));return true;}
  if(run&&req.method==='POST'&&['cancel','reconcile'].includes(run[2])){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);json(200,run[2]==='cancel'?await graph.cancel(actor,run[1],q.expectedVersion):await graph.reconcile(actor,run[1],q.expectedVersion));return true;}
  json(404,{code:'not_found'});
 }catch(e){const raw=e instanceof Error?e.message:'',known=/^(?:graph|planning|observation|analysis|history|metadata)_[a-z_]+$/.test(raw),conflict=['history_policy_disabled','history_policy_conflict','history_policy_expired','history_request_conflict','history_not_completed','history_observation_withdrawn','history_source_changed','history_tool_contract_changed','analysis_idempotency_conflict','analysis_request_conflict','analysis_not_cancellable','analysis_stale_lease','analysis_lease_expired','analysis_policy_disabled','analysis_policy_conflict','analysis_policy_expired','analysis_context_changed','analysis_tool_contract_changed','analysis_model_not_current','observation_not_current','observation_conflict','observation_idempotency_conflict','observation_result_changed','observation_not_completed','observation_read_required','observation_receipt_missing','planning_adoption_conflict','planning_candidate_changed','planning_candidate_not_adoptable','planning_already_adopted','planning_conflict','planning_idempotency_conflict','planning_configuration_expired','planning_restore_reconciliation_required','planning_stale_lease','planning_not_cancellable','planning_context_changed','graph_conflict','graph_source_changed','graph_link_changed','graph_authority_changed','graph_approval_invalid','graph_plan_revoked','graph_tool_version_changed','graph_idempotency_conflict','graph_recovery_not_pending','graph_supervision_conflict','graph_supervision_expired'].includes(raw);json(e instanceof z.ZodError||raw==='tool_args_invalid'?422:['not_authorized','metadata_cursor_not_authorized','analysis_field_not_approved'].includes(raw)?403:raw==='not_found'?404:['history_context_limit','history_policy_limit','graph_input_limit','analysis_projection_limit'].includes(raw)?413:raw==='invalid_json'?400:['analysis_capacity','observation_capacity','graph_capacity','graph_recovery_lookup_limit','planning_budget_exhausted','planning_capacity'].includes(raw)?429:conflict?409:['metadata_projection_unavailable','history_policy_corrupt','history_request_corrupt','history_observation_corrupt','history_observation_unavailable','graph_public_view_unavailable','analysis_model_not_installed','analysis_policy_corrupt','analysis_model_unavailable','observation_corrupt','observation_read_unavailable','observation_read_timeout','planning_adoption_corrupt','graph_action_corrupt','graph_authorization_timeout','planning_model_not_installed','planning_not_configured'].includes(raw)?503:known||raw==='invalid_input'?422:503,{code:e instanceof z.ZodError||raw==='tool_args_invalid'?'invalid_input':known||['not_authorized','not_found','invalid_json','invalid_input'].includes(raw)?raw:'graph_unavailable'});}
 return true;
}

