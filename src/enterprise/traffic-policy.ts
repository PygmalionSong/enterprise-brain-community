// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import{canonicalPathEqual}from'../platform/canonical-path.ts';
// Private, deployment-bound admission policy; parked handlers drain without cancelling source work.
// 与部署绑定的私人受理策略；停放仅排空本机处理，不冒称已撤销源端动作。
import {readFile,writeFile,lstat,realpath,open,rename,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {OperationalDeployment} from './configuration.ts';

const version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1),mode=z.enum(['active','parked']);
const event=z.object({id:z.uuid(),at:z.iso.datetime(),version:version.refine(v=>v>0),mode,authority:z.literal('local-control')}).strict();
export const trafficPolicySchema=z.object({format:z.literal(1),deploymentId:z.uuid(),version,mode,events:z.array(event).max(64)}).strict().refine(p=>p.version===0?p.events.length===0:p.events.length>0&&p.events.every((e,i)=>e.version===p.version-p.events.length+i+1)&&p.events.at(-1)?.mode===p.mode&&new Set(p.events.map(e=>e.id)).size===p.events.length,'enterprise_traffic_history_invalid');
export type TrafficPolicy=z.infer<typeof trafficPolicySchema>;
export const trafficChangeSchema=z.object({expectedVersion:version,waitMs:z.number().int().min(0).max(5000).default(1000)}).strict();
const policyFile=(config:OperationalDeployment)=>join(config.stateDirectory,'traffic.json');
export const defaultTrafficPolicy=(config:OperationalDeployment,initial:'active'|'parked'='parked'):TrafficPolicy=>({format:1,deploymentId:config.deploymentId,version:0,mode:initial,events:[]});
async function realState(config:OperationalDeployment){const state=await lstat(config.stateDirectory);if(!state.isDirectory()||state.isSymbolicLink()||!canonicalPathEqual((await realpath(config.stateDirectory)),resolve(config.stateDirectory)))throw Error('enterprise_traffic_path_invalid');}
export async function readTrafficPolicy(config:OperationalDeployment):Promise<TrafficPolicy>{
 await realState(config);const file=policyFile(config);try{const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)throw Error('enterprise_traffic_policy_invalid');const bytes=await readFile(file);if(bytes.length>16384)throw Error('enterprise_traffic_policy_invalid');let value;try{value=trafficPolicySchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch{throw Error('enterprise_traffic_policy_invalid');}if(value.deploymentId!==config.deploymentId)throw Error('enterprise_traffic_deployment_mismatch');return value;}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return defaultTrafficPolicy(config);throw e;}
}
export async function initializeTrafficPolicy(config:OperationalDeployment,input:unknown=defaultTrafficPolicy(config,'active')){
 await realState(config);const policy=trafficPolicySchema.parse(input);if(policy.deploymentId!==config.deploymentId)throw Error('enterprise_traffic_deployment_mismatch');await writeFile(policyFile(config),JSON.stringify(policy),{flag:'wx',mode:0o600});
}
async function persist(config:OperationalDeployment,next:TrafficPolicy,previous:TrafficPolicy){
 await realState(config);if(JSON.stringify(await readTrafficPolicy(config))!==JSON.stringify(previous))throw Error('enterprise_traffic_conflict');const file=policyFile(config),temporary=join(config.stateDirectory,'traffic-'+randomUUID()+'.tmp');let handle,committed=false;
 try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(next));await handle.sync();await handle.close();handle=undefined;if(JSON.stringify(await readTrafficPolicy(config))!==JSON.stringify(previous))throw Error('enterprise_traffic_conflict');await rename(temporary,file);committed=true;}
 finally{await handle?.close();if(!committed)await unlink(temporary).catch(e=>{if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;});}
}
export class TrafficAdmission {
 private policy:TrafficPolicy;private inFlight=0;private queue:Promise<void>=Promise.resolve();private waiters=new Set<()=>void>();private save:(next:TrafficPolicy,previous:TrafficPolicy)=>Promise<void>;private now:()=>Date;private stopping=false;
 constructor(policy:TrafficPolicy,save:(next:TrafficPolicy,previous:TrafficPolicy)=>Promise<void>,now=()=>new Date()){this.policy=trafficPolicySchema.parse(policy);this.save=save;this.now=now;}
 static async open(config:OperationalDeployment){return new TrafficAdmission(await readTrafficPolicy(config),(next,previous)=>persist(config,next,previous));}
 status(){return {mode:this.policy.mode,version:this.policy.version,inFlight:this.inFlight};}
 isStopping(){return this.stopping;}
 shutdown(){this.stopping=true;}
 waitForIdle(waitMs=5000){return this.drain(z.number().int().min(0).max(5000).parse(waitMs));}
 admit(){if(this.stopping||this.policy.mode!=='active')return null;this.inFlight++;let released=false;return ()=>{if(released)return;released=true;this.inFlight--;if(this.inFlight===0)for(const wake of [...this.waiters])wake();};}
 private async drain(waitMs:number){if(this.inFlight===0)return true;if(waitMs===0)return false;return new Promise<boolean>(ok=>{let done=false;const finish=(drained:boolean)=>{if(done)return;done=true;clearTimeout(timer);this.waiters.delete(wake);ok(drained);},wake=()=>{if(this.inFlight===0)finish(true);},timer=setTimeout(()=>finish(false),waitMs);this.waiters.add(wake);});}
 async change(nextMode:'active'|'parked',input:unknown){
  const request=trafficChangeSchema.parse(input),selected=mode.parse(nextMode),previous=this.queue;let unlock!:()=>void;this.queue=new Promise<void>(ok=>{unlock=ok;});await previous;let committed;
  try{if(this.stopping)throw Error('enterprise_stopping');if(request.expectedVersion!==this.policy.version)throw Error('enterprise_traffic_conflict');if(selected==='active'&&this.inFlight!==0)throw Error('enterprise_traffic_not_drained');if(this.policy.mode!==selected){const next=trafficPolicySchema.parse({...this.policy,version:this.policy.version+1,mode:selected,events:[...this.policy.events,{id:randomUUID(),at:this.now().toISOString(),version:this.policy.version+1,mode:selected,authority:'local-control'}].slice(-64)});await this.save(next,this.policy);this.policy=next;}committed={mode:this.policy.mode,version:this.policy.version};}finally{unlock();}
  const drained=selected==='parked'?await this.drain(request.waitMs):this.inFlight===0;return {...committed,inFlight:this.inFlight,drained};
 }
}
