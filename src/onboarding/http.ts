// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Authenticated IT-only onboarding. No HTTP route accepts worker evidence or code.
// 只向已认证IT开放接入；HTTP不接受工作器证据或执行代码。
import type {IncomingMessage,ServerResponse} from 'node:http';
import {z} from 'zod';
import type {Actor,IdentityService} from '../identity/service.ts';
import {DiscoveryStore} from './discovery-store.ts';
import {DiscoveryRunner} from './discovery-runner.ts';
import {MetadataConnections} from './metadata-connections.ts';
import {onboardingEnvironmentSummary} from './environment-summary.ts';
import {planDiscoveryTargets} from './discovery-contracts.ts';

export async function readBody(req:IncomingMessage) {
  if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']??'')))throw Error('json_required');
  const chunks:Buffer[]=[];let bytes=0;
  for await(const piece of req){const chunk=Buffer.from(piece);bytes+=chunk.length;if(bytes>65536)throw Error('input_limit');chunks.push(chunk);}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw Error('invalid_json');}
}
export async function onboardingRoute(req:IncomingMessage,res:ServerResponse,url:URL,actor:Actor,identity:IdentityService,token:string,
  services:{store:DiscoveryStore;runner:DiscoveryRunner;connections:MetadataConnections;origin:string;native:boolean;launch:(actor:Actor,id:string)=>void}) {
  const prefix='/v1/it/onboarding';if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return false;
  const reply=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  try{
    if(actor.role!=='it')throw Error('not_authorized');
    if(!['GET','POST'].includes(req.method??''))throw Error('method_not_allowed');
    if(url.search)throw Error('invalid_input');
    if(req.method==='POST'&&!await identity.validateCsrf(token,String(req.headers['x-csrf-token']??''),String(req.headers.origin??''),services.origin))throw Error('not_authorized');
    const path=url.pathname.slice(prefix.length),input=req.method==='POST'?await readBody(req):undefined;
    const scope=/^\/scopes\/([a-f0-9-]{36})(?:\/(revoke))?$/.exec(path),run=/^\/runs\/([a-f0-9-]{36})(?:\/(start|cancel|recover))?$/.exec(path),binding=/^\/connections\/([a-f0-9-]{36})(?:\/(test|revoke))?$/.exec(path);
    if(req.method==='GET'&&path==='/environment'){
      await services.store.listScopes(actor);
      reply(200,{...onboardingEnvironmentSummary(),deploymentReady:true,storageQualified:true,nativePrerequisitesQualified:services.native,tenantInitialized:true,
        supportedProbe:'explicit_private_ipv4_metadata_get',businessDataAuthorized:false});return true;
    }
    if(req.method==='GET'&&path==='/scopes'){reply(200,await services.store.listScopes(actor));return true;}
    if(req.method==='POST'&&path==='/plans'){
      await services.store.listScopes(actor);const q=z.object({endpoints:z.array(z.string()).min(1).max(256)}).strict().parse(input);
      reply(200,planDiscoveryTargets(actor.enterpriseId,q.endpoints));return true;
    }
    if(req.method==='POST'&&path==='/scopes'){reply(201,await services.store.createScope(actor,input));return true;}
    if(scope&&req.method==='GET'&&!scope[2]){reply(200,await services.store.scope(actor,scope[1]));return true;}
    if(scope&&req.method==='POST'&&scope[2]==='revoke'){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);reply(200,await services.runner.revoke(actor,scope[1],q.expectedVersion));return true;}
    if(req.method==='GET'&&path==='/runs'){reply(200,await services.store.listRuns(actor));return true;}
    if(req.method==='POST'&&path==='/runs'){
      const created=await services.store.createRun(actor,input);if(created.created)services.launch(actor,created.id);reply(202,created);return true;
    }
    if(run&&req.method==='GET'&&!run[2]){reply(200,await services.runner.status(actor,run[1]));return true;}
    if(run&&req.method==='POST'&&run[2]==='start'){
      const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);await services.store.authorizeStart(actor,run[1],q.expectedVersion);services.launch(actor,run[1]);reply(202,{id:run[1],accepted:true});return true;
    }
    if(run&&req.method==='POST'&&run[2]==='cancel'){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);reply(200,await services.runner.cancel(actor,run[1],q.expectedVersion));return true;}
    if(run&&req.method==='POST'&&run[2]==='recover'){reply(200,await services.runner.fence(actor,run[1],input));return true;}
    if(req.method==='POST'&&path==='/reviews'){reply(201,await services.connections.review(actor,input));return true;}
    if(req.method==='GET'&&path==='/connections'){reply(200,await services.connections.list(actor));return true;}
    if(binding&&req.method==='GET'&&!binding[2]){reply(200,await services.connections.view(actor,binding[1]));return true;}
    if(binding&&req.method==='POST'&&binding[2]==='test'){reply(200,await services.connections.testRead(actor,binding[1],input));return true;}
    if(binding&&req.method==='POST'&&binding[2]==='revoke'){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);reply(200,await services.connections.revoke(actor,binding[1],q.expectedVersion));return true;}
    reply(404,{code:'not_found'});
  }catch(error){
    const code=error instanceof z.ZodError?'invalid_input':error instanceof Error?error.message:'';
    const forbidden=['not_authorized','discovery_authority_unavailable','discovery_actor_changed'];
    const conflict=['scope_conflict','idempotency_conflict','discovery_run_conflict','discovery_worker_changed','discovery_claim_stale','discovery_review_stale','discovery_read_test_pending','discovery_read_test_stale','discovery_read_test_expired','discovery_run_expired'];
    const invalid=['invalid_input','invalid_json','discovery_endpoint_invalid','discovery_target_limit','discovery_adapter_unavailable'];
    const status=forbidden.includes(code)?403:conflict.includes(code)?409:invalid.includes(code)?422:code==='not_found'?404:code==='input_limit'?413:code==='json_required'?415:code==='method_not_allowed'?405:code==='discovery_run_capacity'?429:503;
    reply(status,{code:status===503?'onboarding_unavailable':code});
  }
  return true;
}
