// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Owned in-process worker for an explicitly requested durable discovery run.
// 已明确请求的持久发现任务使用本进程自有工作器，不创建调度或自动重扫。
import type {Actor} from '../identity/service.ts';
import {DiscoveryStore,type IssuedDiscoveryClaim} from './discovery-store.ts';
import {probeHttpMetadata} from './http-metadata-probe.ts';
import {discoveryLimits} from './discovery-contracts.ts';

interface ActiveRun {scopeId:string;abort:AbortController;done:Promise<void>;}
export class DiscoveryRunner {
  private active=new Map<string,ActiveRun>();
  private stopping=false;
  private store:DiscoveryStore;
  private eligible:()=>boolean;
  constructor(store:DiscoveryStore,eligible:()=>boolean=()=>true) {this.store=store;this.eligible=eligible;}
  async start(actor:Actor,runId:string) {
    if(this.stopping)throw Error('discovery_worker_stopping');
    const prior=this.active.get(runId);if(prior)return prior.done;
    const status=await this.store.run(actor,runId);
    if(!['authorized','running'].includes(status.state))return;
    if(status.needsRecovery)throw Error('discovery_worker_changed');
    // Recheck after the asynchronous read so simultaneous starts share one owner.
    // 异步读取后重查，避免同时启动产生两个本地拥有者。
    const existing=this.active.get(runId);if(existing)return existing.done;
    if(this.stopping)throw Error('discovery_worker_stopping');
    const abort=new AbortController();
    const done=this.work(actor,runId,abort.signal).finally(()=>this.active.delete(runId));
    this.active.set(runId,{scopeId:status.scopeId,abort,done});
    return done;
  }
  private async work(actor:Actor,runId:string,signal:AbortSignal) {
    const worker=async()=>{
      while(!signal.aborted&&this.eligible()){
        let claim:IssuedDiscoveryClaim|null;
        try{claim=await this.store.claimNext(actor,runId);}
        catch(error){
          if(['discovery_run_expired','discovery_authority_unavailable'].includes((error as Error).message))await this.store.expire(actor,runId).catch(()=>{});
          return;
        }
        if(!claim)return;
        const deadline=new AbortController();
        const cancel=()=>deadline.abort();signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
        const timer=setTimeout(()=>deadline.abort(),Math.max(0,Math.min(discoveryLimits.requestTimeoutMs,new Date(claim.deadline).getTime()-Date.now())));
        try{
          const result=await probeHttpMetadata(claim.endpoint,{check:async()=>{if(!this.eligible())throw Error('discovery_authority_unavailable');await this.store.assertClaim(actor,claim!);}},deadline.signal);
          if(result.status==='observed'){
            if(!this.eligible())throw Error('discovery_authority_unavailable');
            await this.store.accept(actor,claim,result.observation);
          }else await this.store.unavailable(actor,claim,result.code==='discovery_authority_unavailable'?'discovery_transport_unavailable':result.code);
        }catch{
          // Only a safe operational failure may be recorded. No response body is
          // accepted after cancellation, revocation or a failed commit.
          // 只尝试记录安全运维失败，不在取消、撤权或提交失败后保存响应正文。
          await this.store.unavailable(actor,claim,'discovery_transport_unavailable').catch(()=>{});
        }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
      }
    };
    await Promise.all(Array.from({length:discoveryLimits.concurrency},worker));
  }
  async status(actor:Actor,id:string) {
    const status=await this.store.run(actor,id);
    return {...status,requestsStopping:['cancelled','unknown','expired'].includes(status.state)&&this.active.has(id),
      needsRecovery:status.needsRecovery||status.state==='running'&&!this.active.has(id)};
  }
  async cancel(actor:Actor,id:string,expectedVersion:number) {
    const result=await this.store.cancel(actor,id,expectedVersion);this.active.get(id)?.abort.abort();return result;
  }
  async revoke(actor:Actor,id:string,expectedVersion:number) {
    const result=await this.store.revoke(actor,id,expectedVersion);
    for(const active of this.active.values())if(active.scopeId===id)active.abort.abort();return result;
  }
  async fence(actor:Actor,id:string,input:unknown) {
    const result=await this.store.fence(actor,id,input);this.active.get(id)?.abort.abort();return result;
  }
  async close() {
    this.stopping=true;const tasks=[...this.active.values()];for(const task of tasks)task.abort.abort();
    await Promise.allSettled(tasks.map(task=>task.done));
  }
}
