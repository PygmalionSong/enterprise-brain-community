// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Local operations serialize against start/stop/backup and never expose authority to browsers.
// 本机操作与启动/停服/备份互斥，不向浏览器暴露控制权限。
import {readDeployment,readPrivateJson,readSecret} from './configuration.ts';
import {withDeploymentOperation,readInstanceLock,processExists,requireDeploymentOperation} from './operation-guard.ts';
import {readEnterpriseHealth} from './service.ts';
import {TrafficAdmission,trafficChangeSchema} from './traffic-policy.ts';
import {localFetch,readLocalJSON} from '../../scripts/local-http.mjs';

export async function enterpriseTraffic(configFile:string,action:'status'|'active'|'parked',inputFile?:string){
 const config=await readDeployment(configFile);return withDeploymentOperation(config,'traffic',()=>enterpriseTrafficUnderClaim(configFile,action,inputFile));
}
// Only a trusted controller already holding the deployment claim calls this variant.
// 仅已持有部署运维声明的受信控制器调用此入口。
export async function enterpriseTrafficUnderClaim(configFile:string,action:'status'|'active'|'parked',inputFile?:string){
 const config=await readDeployment(configFile),request=action==='status'?null:trafficChangeSchema.parse(await readPrivateJson(inputFile??''));
 await requireDeploymentOperation(config,['traffic','backup']);
  const lock=await readInstanceLock(config);
  if(!lock){const traffic=await TrafficAdmission.open(config);if(action==='active')throw Error('enterprise_traffic_requires_running');const result=action==='status'?traffic.status():await traffic.change('parked',request);return {deploymentId:config.deploymentId,running:false,...result,stopping:false};}
  if(!processExists(lock.pid))throw Error('enterprise_stale_lock');const health=await readEnterpriseHealth(lock,false);if(!health.traffic)throw Error('enterprise_traffic_unavailable');
  if(action==='status')return {deploymentId:config.deploymentId,instanceId:lock.instanceId,running:true,...health.traffic};
  if(action==='active'&&health.status!=='ready')throw Error('enterprise_not_ready');
  const response=await localFetch('http://127.0.0.1:'+lock.port+'/ops/traffic',{method:'POST',headers:{'X-Local-Control':await readSecret(config.controlTokenFile),'Content-Type':'application/json'},body:JSON.stringify({instanceId:lock.instanceId,mode:action,...request}),signal:AbortSignal.timeout((request?.waitMs??0)+2000)});
  if(![200,202,403,409,422,503].includes(response.status)){await response.body?.cancel();throw Error('enterprise_traffic_unavailable');}
  const value=await readLocalJSON(response.ok?response:new Response(response.body,{status:200,headers:response.headers}),16384);if(!response.ok)throw Error(/^enterprise_(traffic_[a-z_]+|stopping|schema_not_ready|instance_mismatch)$/.test(value.code??'')?value.code:'enterprise_traffic_unavailable');
  if(value.instanceId!==lock.instanceId||value.mode!==action||!Number.isSafeInteger(value.version)||typeof value.drained!=='boolean')throw Error('enterprise_instance_mismatch');return {deploymentId:config.deploymentId,running:true,...value};
}
