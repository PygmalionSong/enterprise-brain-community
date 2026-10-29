// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Strict import of pseudonymous timings; self-report is not verified business evidence.
// 严格导入匿名耗时；自报记录不等于已验证业务证据。
import {z} from 'zod';
import {score,type Suite,type Observation} from './control-suite.ts';
const instant=z.iso.datetime({offset:true}),interval=z.object({kind:z.enum(['active','waiting']),start:instant,end:instant}).strict();
const observed=z.object({state:z.string().min(1).max(40).regex(/^[a-z_]+$/),writes:z.number().int().nonnegative().max(100),error:z.boolean().optional(),reason:z.string().regex(/^[a-z_]{1,80}$/).optional(),assessment:z.string().regex(/^[a-z_]{1,80}$/).optional(),traceLength:z.number().int().min(0).max(10).optional(),operations:z.array(z.enum(['investigate','review_pack','replenish','repair','trial_review'])).max(3).optional(),sameId:z.boolean().optional(),manual:z.boolean().optional(),coverageCases:z.number().int().nonnegative().optional(),availabilityAfter:z.number().min(0).max(1).nullable().optional(),qualityReleased:z.literal(false).optional(),paymentVerified:z.literal(false).optional(),causalityVerified:z.literal(false).optional()}).strict();
const record=z.object({participantId:z.string().regex(/^P-[A-Z0-9]{4,16}$/),taskId:z.string().regex(/^S[123]-\d{2}$/),repeat:z.number().int().min(1).max(3),startedAt:instant,endedAt:instant,timeline:z.array(interval).min(1).max(100),observed,evidenceHashes:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(20)}).strict();
const envelope=z.object({version:z.literal(1),suiteHash:z.string().regex(/^[a-f0-9]{64}$/),provenance:z.enum(['test-fixture','human-self-report']),records:z.array(record).max(2700)}).strict();
export function validateManualBaseline(input:unknown,suite:Suite,suiteHash:string){
 const q=envelope.parse(input);if(q.suiteHash!==suiteHash)throw Error('manual_suite_mismatch');const seen=new Set<string>();
 const rows=q.records.map(r=>{const task=suite.tasks.find(t=>t.id===r.taskId);if(!task)throw Error('manual_task_unknown');const key=r.participantId+'/'+r.taskId+'/'+r.repeat;if(seen.has(key))throw Error('manual_record_duplicate');seen.add(key);
  const start=Date.parse(r.startedAt),end=Date.parse(r.endedAt);if(end<=start)throw Error('manual_time_invalid');const timeline=[...r.timeline].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));let cursor=start,active=0,waiting=0;
  for(const interval of timeline){const from=Date.parse(interval.start),to=Date.parse(interval.end);if(from!==cursor||to<=from||to>end)throw Error('manual_timeline_invalid');if(interval.kind==='active')active+=to-from;else waiting+=to-from;cursor=to;}if(cursor!==end)throw Error('manual_timeline_incomplete');
  const {error,...rest}=r.observed,observation:Observation={...rest,...error?{error:'manual_reported_error'}:{},mockModelCalls:0,modelProfile:'manual-self-report',durationMs:end-start,faultInjection:null,events:[]};const judgment=score(task.expected,observation);
  return {participantId:r.participantId,taskId:r.taskId,repeat:r.repeat,elapsedMs:end-start,activeMs:active,waitingMs:waiting,...judgment,evidenceHashes:r.evidenceHashes,sourceEvidenceValidated:false};
 });
 return {version:1,suiteHash,provenance:q.provenance,status:rows.length?(q.provenance==='test-fixture'?'SYNTHETIC_IMPORT_CONTROL_ONLY':'INGESTED_SELF_REPORTED_UNVERIFIED'):'NOT_RUN',records:rows.length,participants:new Set(rows.map(r=>r.participantId)).size,taskCoverage:new Set(rows.map(r=>r.taskId)).size,controlMatches:rows.filter(r=>r.pass).length,controlMismatches:rows.filter(r=>!r.pass).length,independentlyVerified:false,aiEfficiencyImprovement:null,actualHumanBaseline:q.provenance==='test-fixture'?'NOT_RUN_SYNTHETIC':rows.length?'SELF_REPORTED_UNVERIFIED':'NOT_RUN',fullProductAcceptance:false,rows};
}
