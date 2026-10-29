// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Trusted local model configuration reuses the existing durable budget and installation.
// 受信本机模型配置复用既有持久额度和安装合同。
import {z} from 'zod';
import {digest} from '../identity/service.ts';
import {readNativeDeployment} from './native-configuration.ts';
import {readPrivateJson,readSecret} from './configuration.ts';
import {readInstanceLock,processExists} from './operation-guard.ts';
import {readNativeEnterpriseHealth} from './native-service.ts';
import {withStoppedNativeConfiguration} from './native-configuration-operation.ts';
import {enterpriseModelChangeSchema} from './model-operations.ts';
import {installPlanningModel,uninstallPlanningModel,planningModelSummary,loadInstalledPlanningModel} from './installed-model.ts';
import {localFetch,readLocalJSON} from '../../scripts/local-http.mjs';

const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const statusSchema=z.object({instanceId:z.uuid(),hostModel:z.enum(['not_configured','unavailable','disabled','configured_local_contract']),state:z.enum(['not_configured','unavailable','disabled','configured_local_contract']),configured:z.boolean(),configurationVersion:count,identitySha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),callsReserved:count,outputTokensReserved:count,reconciliationRequired:z.boolean(),modelReachabilityVerified:z.literal(false)}).strict();
export async function nativeEnterpriseModelStatus(root:string,configFile:string){
 const config=await readNativeDeployment(configFile),configurationSha256=digest(JSON.stringify(config)),lock=await readInstanceLock(config);
 if(lock){
  if(!processExists(lock.pid))throw Error('enterprise_stale_lock');await readNativeEnterpriseHealth(lock,false);
  if(JSON.stringify(await readInstanceLock(config))!==JSON.stringify(lock))throw Error('enterprise_instance_changed');
  const response=await localFetch('http://127.0.0.1:'+lock.port+'/ops/model-status',{headers:{'X-Local-Control':await readSecret(config.controlTokenFile)},signal:AbortSignal.timeout(5000)}),parsed=statusSchema.safeParse(await readLocalJSON(response,16384));
  if(!parsed.success||parsed.data.instanceId!==lock.instanceId)throw Error('enterprise_instance_mismatch');return {...parsed.data,configurationSha256,running:true};
 }
 return withStoppedNativeConfiguration(root,configFile,config,'models',async db=>({...await planningModelSummary(db,config.enterpriseId),state:(await loadInstalledPlanningModel(db,root,config.enterpriseId)).state,configurationSha256,running:false}));
}
export async function configureNativeEnterpriseModel(root:string,configFile:string,inputFile:string){
 const input=enterpriseModelChangeSchema.parse(await readPrivateJson(inputFile)),config=await readNativeDeployment(configFile),configurationSha256=digest(JSON.stringify(config));
 if(configurationSha256!==input.expectedConfigurationSha256)throw Error('enterprise_models_configuration_conflict');
 return withStoppedNativeConfiguration(root,configFile,config,'models',async db=>{
  const p=(await db.query('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2',[config.enterpriseId,input.principalId])).rows[0];
  if(!p||p.disabled||p.role!=='it')throw Error('enterprise_models_operator_invalid');
  const actor={id:input.principalId,enterpriseId:config.enterpriseId,role:'it',authorizationVersion:Number(p.authorization_version)};
  let result;try{result=input.action==='install'?await installPlanningModel(db,root,actor,input.installation):await uninstallPlanningModel(db,actor,{expectedVersion:input.expectedVersion,uninstallAcknowledged:true});}catch(e){const known:Record<string,string>={planning_conflict:'native_models_version_conflict',planning_restore_reconciliation_required:'native_models_reconciliation_required',planning_budget_below_reserved:'native_models_budget_below_reserved',not_authorized:'native_models_operator_invalid'};const code=e instanceof Error?known[e.message]:undefined;if(code)throw Error(code);throw e;}
  return {...result,configurationSha256,started:false};
 });
}
