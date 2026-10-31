// Owned CLI + HTTP onboarding lab; no browser TLS or vendor integration claim.
// 自有CLI和HTTP上手示例；不冒称浏览器TLS或厂商系统接入。
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {validateOutput} from '../../scripts/first-task.mjs';
import {localFetch} from '../../scripts/local-http.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),exec=promisify(execFile);
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
export async function runOnboarding(out){
 validateOutput(out);fs.mkdirSync(out,{mode:0o700});
 const config=path.join(out,'deployment','config.json'),input=path.join(out,'input.private.json');
 let child,closed,fd,stage='configuration';
 const report={format:'enterprise-brain.onboarding-example/1',status:'failed',ownedFixturesOnly:true,
  realSystemConnected:false,liveModelUsed:false,browserTlsVerified:false,httpProxyContractExercised:false,
  uploaded:false,checks:{}};
 const cli=async(command,...extra)=>{
  const r=await exec(process.execPath,['scripts/enterprise.mjs',command,'--config',config,...extra],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:100000});
  return JSON.parse(r.stdout.trim());
 };
 async function start(){
  fd=fs.openSync(path.join(out,'host-'+randomUUID()+'.private.log'),'wx',0o600);
  child=spawn(process.execPath,['scripts/enterprise.mjs','start','--config',config],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});
  closed=new Promise((ok,no)=>{child.once('error',no);child.once('close',code=>ok(code));});
  for(let i=0;i<30;i++){
   if(child.exitCode!==null)throw Error('owned_host_start_failed');
   try{const s=await cli('status');if(s.status==='ready')return s;}catch{}
   await pause(100);
  }
  throw Error('owned_host_not_ready');
 }
 async function stop(){
  if(!child)return;
  await cli('stop');
  let timer;try{assert.equal(await Promise.race([closed,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('owned_host_not_stopped')),10000);})]),0);}
  finally{clearTimeout(timer);if(fd!==undefined){fs.closeSync(fd);fd=undefined;}}
  child=undefined;
 }
 try{
  const probe=createServer();await new Promise(ok=>probe.listen(0,'127.0.0.1',ok));const port=probe.address().port;await new Promise(ok=>probe.close(ok));
  const origin='https://owned-example.invalid',password=randomBytes(24).toString('base64url');
  fs.writeFileSync(input,JSON.stringify({name:'Owned onboarding example',timezone:'UTC',origin,port,username:'sample-admin',password}),{flag:'wx',mode:0o600});
  const init=await cli('init','--input',input);assert.equal(init.demoSeedLoaded,false);
  assert.equal((await cli('status')).status,'not_running');
  const before=await start(),deployment=JSON.parse(fs.readFileSync(config,'utf8'));
  const token=fs.readFileSync(deployment.proxyTokenFile,'utf8');
  // Act as the installation's trusted local proxy client; never expose this secret.
  // 仅作为此安装的受信本机代理客户端；密钥不进入报告。
  const call=async(route,body,session)=>localFetch('http://127.0.0.1:'+port+route,{method:body===undefined?'GET':'POST',headers:{'X-EB-Proxy':token,Origin:origin,'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=async(route,body,session,status=200)=>{const r=await call(route,body,session);if(r.status!==status){let code;try{code=(await r.json()).code;}catch{}report.failedHttp={route,status:r.status,expected:status,...(typeof code==='string'&&/^[a-z_]+$/.test(code)?{code}:{})};throw Error('owned_http_status');}return r.json();};
  const login=async username=>{const r=await call('/v1/identity/session',{username,password});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf};};
  stage='accounts';const it=await login('sample-admin');report.httpProxyContractExercised=true;
  await json('/v1/identity/operators',{username:'sample-owner',password,role:'executive'},it,201);
  const owner=await login('sample-owner');
  stage='sample-process';
  const name={zh:'样例流程核对',en:'Sample process review',ja:'サンプルプロセスの確認'};
  const definition={format:'enterprise-brain.process/1',id:'owned-review',revision:'one',name,kind:'workflow_definition',roles:[{id:'owner',name}],objects:[{id:'record',name}],nodes:[{id:'start',kind:'start',name,ownerRole:'owner',objectRefs:['record']},{id:'review',kind:'task',name,ownerRole:'owner',objectRefs:['record']},{id:'end',kind:'end',name,ownerRole:'owner',objectRefs:['record']}],edges:[{id:'a',from:'start',to:'review'},{id:'b',from:'review',to:'end'}]};
  const p=await json('/v1/it/process-registry/import',{sourceId:'owned-example',expectedVersion:0,origin:'operator_import',content:JSON.stringify(definition)},it,201);
  // The operator explicitly chooses an existing reference stage; no inferred mapping.
  // 操作人显式选择既有参考节点，不推断业务映射。
  const confirmed=await json('/v1/it/process-registry/'+p.id+'/confirm',{expectedVersion:1,rawSha256:p.rawSha256,definitionSha256:p.definitionSha256,mapping:[{stageId:'channel-1',nodeId:'review'}],semanticsAcknowledged:true},it);
  const compile={processes:[{id:confirmed.id,expectedVersion:confirmed.version}],links:[],routes:[],bindings:[{processId:confirmed.id,nodeId:'review',toolId:'process.definition.read',toolVersion:'v1',args:{registryId:confirmed.id,definitionSha256:confirmed.definitionSha256}}]};
  stage='approval';const plan=await json('/v1/it/graph/plans',compile,it,201);assert.equal(plan.taskCount,1);
  assert.equal((await call('/v1/graph/plans/'+plan.id+'/approvals',{planHash:plan.planHash,executionAcknowledged:true},it)).status,403);
  assert.equal((await call('/v1/graph/plans/'+plan.id+'/runs',{approvalId:randomUUID(),idempotencyKey:'not-approved'},owner)).status,409);
  const approval=await json('/v1/graph/plans/'+plan.id+'/approvals',{planHash:plan.planHash,executionAcknowledged:true},owner,201);
  const run=await json('/v1/graph/plans/'+plan.id+'/runs',{approvalId:approval.id,idempotencyKey:'owned-approved-task'},owner,201);
  stage='execution';for(let i=0;i<2;i++)await json('/v1/graph/runs/'+run.runId+'/step',{},owner);
  const view=await json('/v1/graph/runs/'+run.runId,undefined,owner);assert.equal(view.state,'succeeded');assert.equal(view.actions.length,1);
  assert.equal(view.actions[0].result,null);
  const observation=await json('/v1/graph/observations',{runId:run.runId,actionId:view.actions[0].id,resultHash:view.actions[0].resultHash,idempotencyKey:'owned-result',observationAcknowledged:true},owner);
  assert.equal(observation.evidence.contentKind,'process_metadata');assert.equal(observation.evidence.data.nodes,3);
  stage='restart';await stop();const after=await start();assert.notEqual(after.instanceId,before.instanceId);
  const fresh=await login('sample-owner'),resumed=await json('/v1/graph/runs/'+run.runId,undefined,fresh);
  assert.equal(resumed.state,'succeeded');assert.equal(resumed.actions[0].id,view.actions[0].id);
  report.checks={privateInitialization:true,demoSeedLoaded:false,accountsCreated:2,processesConfirmed:1,itApprovalRefused:true,missingApprovalRefused:true,actions:1,resultNodes:3,resultKind:'process_metadata',sourcePayloadRedacted:true,freshHostProcess:true,originalActionRetained:true};
  report.status='passed';
 }catch(e){report.failedStage=stage;throw e;}
 finally{
  try{await stop();report.hostStopped=true;}catch(e){report.status='failed';report.failedStage='shutdown';report.hostStopped=false;throw e;}
  finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});}
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const a=process.argv.slice(2);
 if(a.length!==3||a[0]!=='--out'||a[2]!=='--acknowledge-owned-fixture'){console.error('Use --out NEW_ABSOLUTE_PRIVATE_DIRECTORY --acknowledge-owned-fixture / 请指定全新私人目录并确认自有示例');process.exitCode=1;}
 else runOnboarding(a[1]).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Owned onboarding failed; keep its private report and logs / 上手示例失败，请保留私人报告和日志');process.exitCode=1;});
}
