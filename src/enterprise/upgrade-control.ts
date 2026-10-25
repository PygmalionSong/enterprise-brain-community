// Durable local intent journal, not proof that an external upgrade operation succeeded.
// 持久本机意图日志；日志本身不证明外部升级步骤已经成功。
import {readFile,lstat,realpath,open,rename,unlink} from 'node:fs/promises';
import {dirname,resolve,isAbsolute,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hash} from '../runtime/contracts.ts';

const sha=z.string().regex(/^[a-f0-9]{64}$/),version=z.number().int().min(1).max(1000);
const stageSchema=z.enum(['created','quiesced','backed_up','rehearsed','candidate_ready','committed_parked','active','failed_before_commit','forward_repair_required']);
type Stage=z.infer<typeof stageSchema>;
const nextStage:Partial<Record<Stage,Stage>>={created:'quiesced',quiesced:'backed_up',backed_up:'rehearsed',rehearsed:'candidate_ready',candidate_ready:'committed_parked',committed_parked:'active'};
export const upgradeBindingSchema=z.object({enterpriseId:z.uuid(),deploymentId:z.uuid(),configurationSha256:sha,planSha256:sha,currentManifestSha256:sha,candidateManifestSha256:sha,publisherFingerprint:sha}).strict().refine(v=>v.currentManifestSha256!==v.candidateManifestSha256,'upgrade_identical_installation');
const pendingSchema=z.object({operationId:z.uuid(),fromStage:stageSchema,targetStage:stageSchema,intentSha256:sha,createdAt:z.iso.datetime()}).strict();
const eventSchema=z.object({sequence:z.number().int().positive().max(8),operationId:z.uuid(),fromStage:stageSchema,targetStage:stageSchema,toStage:stageSchema,intentSha256:sha,evidenceSha256:sha.nullable(),at:z.iso.datetime(),outcome:z.enum(['completed','failed']),code:z.string().regex(/^upgrade_[a-z_]{1,80}$/).nullable()}).strict();
const controlSchema=z.object({format:z.literal('enterprise-brain.upgrade-control/1'),id:z.uuid(),version,createdAt:z.iso.datetime(),binding:upgradeBindingSchema,bindingSha256:sha,stage:stageSchema,activeInstallation:z.enum(['current','candidate']),pending:pendingSchema.nullable(),events:z.array(eventSchema).max(8)}).strict().superRefine((v,ctx)=>{
 let stage:Stage='created',pointer='current';const ids=new Set<string>();
 for(let i=0;i<v.events.length;i++){const e=v.events[i],completed=e.outcome==='completed',target=nextStage[stage],result=completed?e.targetStage:pointer==='candidate'?'forward_repair_required':'failed_before_commit';
  if(e.sequence!==i+1||e.fromStage!==stage||target!==e.targetStage||e.toStage!==result||ids.has(e.operationId)||completed&&(e.evidenceSha256===null||e.code!==null)||!completed&&(e.evidenceSha256!==null||e.code===null)){ctx.addIssue({code:'custom',message:'upgrade_history_invalid'});return;}
  ids.add(e.operationId);stage=e.toStage;if(stage==='committed_parked'||stage==='active')pointer='candidate';
 }
 if(v.pending&&(v.pending.fromStage!==stage||v.pending.targetStage!==nextStage[stage]||ids.has(v.pending.operationId)))ctx.addIssue({code:'custom',message:'upgrade_pending_invalid'});
 if(v.stage!==stage||v.activeInstallation!==pointer||v.version!==1+2*v.events.length+(v.pending?1:0)||v.bindingSha256!==hash(v.binding))ctx.addIssue({code:'custom',message:'upgrade_control_invalid'});
});
export type UpgradeControl=z.infer<typeof controlSchema>;
export function parseUpgradeControl(value:unknown):UpgradeControl{return controlSchema.parse(value);}
export function initialUpgradeControl(binding:unknown,now=()=>new Date()):UpgradeControl{const b=upgradeBindingSchema.parse(binding);return parseUpgradeControl({format:'enterprise-brain.upgrade-control/1',id:randomUUID(),version:1,createdAt:now().toISOString(),binding:b,bindingSha256:hash(b),stage:'created',activeInstallation:'current',pending:null,events:[]});}
const beginSchema=z.object({action:z.literal('begin'),expectedVersion:version,operationId:z.uuid(),targetStage:stageSchema,intentSha256:sha}).strict();
const finishSchema=z.object({action:z.literal('complete'),expectedVersion:version,operationId:z.uuid(),evidenceSha256:sha}).strict();
const failSchema=z.object({action:z.literal('fail'),expectedVersion:version,operationId:z.uuid(),code:z.string().regex(/^upgrade_[a-z_]{1,80}$/)}).strict();
export const upgradeChangeSchema=z.discriminatedUnion('action',[beginSchema,finishSchema,failSchema]);
export function changeUpgradeControl(value:unknown,input:unknown,now=()=>new Date()):UpgradeControl{
 const state=parseUpgradeControl(value),q=upgradeChangeSchema.parse(input);
 if(q.expectedVersion!==state.version)throw Error('upgrade_control_conflict');
 if(q.action==='begin'){
  if(state.pending)throw Error('upgrade_needs_inspection');if(nextStage[state.stage]!==q.targetStage)throw Error('upgrade_stage_denied');if(state.events.some(e=>e.operationId===q.operationId))throw Error('upgrade_operation_reused');
  return parseUpgradeControl({...state,version:state.version+1,pending:{operationId:q.operationId,fromStage:state.stage,targetStage:q.targetStage,intentSha256:q.intentSha256,createdAt:now().toISOString()}});
 }
 const p=state.pending;if(!p||p.operationId!==q.operationId)throw Error('upgrade_operation_mismatch');
 const completed=q.action==='complete',stage:Stage=completed?p.targetStage:state.activeInstallation==='candidate'?'forward_repair_required':'failed_before_commit';
 return parseUpgradeControl({...state,version:state.version+1,stage,activeInstallation:completed&&stage==='committed_parked'?'candidate':state.activeInstallation,pending:null,events:[...state.events,{sequence:state.events.length+1,operationId:p.operationId,fromStage:p.fromStage,targetStage:p.targetStage,toStage:stage,intentSha256:p.intentSha256,evidenceSha256:completed?q.evidenceSha256:null,at:now().toISOString(),outcome:completed?'completed':'failed',code:completed?null:q.code}]});
}
export function inspectUpgradeControl(value:unknown){const state=parseUpgradeControl(value);return {id:state.id,version:state.version,stage:state.stage,status:state.pending?'needs_inspection':state.stage,activeInstallation:state.activeInstallation,pendingOperationId:state.pending?.operationId??null,bindingSha256:state.bindingSha256,automaticReplayAllowed:false,automaticRollbackAllowed:false,externalEffectsVerified:false};}

const limit=65536;
async function parent(file:string){if(!isAbsolute(file)||resolve(file)!==file)throw Error('upgrade_control_absolute_path_required');const p=dirname(file),info=await lstat(p);if(!info.isDirectory()||info.isSymbolicLink()||(await realpath(p)).toLowerCase()!==p.toLowerCase())throw Error('upgrade_control_indirect_path');return p;}
function encode(state:UpgradeControl){const text=JSON.stringify(parseUpgradeControl(state),null,2)+'\n';if(Buffer.byteLength(text)>limit)throw Error('upgrade_control_limit');return text;}
export async function readUpgradeControl(file:string){await parent(file);const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>limit||(await realpath(file)).toLowerCase()!==file.toLowerCase())throw Error('upgrade_control_file_invalid');const bytes=await readFile(file);if(bytes.length>limit)throw Error('upgrade_control_limit');let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('upgrade_control_json_invalid');}return parseUpgradeControl(data);}
export async function createUpgradeControl(file:string,binding:unknown){await parent(file);const state=initialUpgradeControl(binding),handle=await open(file,'wx',0o600);try{await handle.writeFile(encode(state));await handle.sync();}finally{await handle.close();}return state;}
export async function updateUpgradeControl(file:string,input:unknown){
 const p=await parent(file),q=upgradeChangeSchema.parse(input),lockFile=file+'.operation',claim={format:1,id:randomUUID(),pid:process.pid};let lock;
 try{lock=await open(lockFile,'wx',0o600);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw Error('upgrade_control_busy');throw e;}
 const temporary=join(p,'.upgrade-'+claim.id+'.tmp');let output,committed=false;
 try{await lock.writeFile(JSON.stringify(claim));await lock.sync();await lock.close();lock=undefined;
  const before=await readUpgradeControl(file),after=changeUpgradeControl(before,q);
  output=await open(temporary,'wx',0o600);await output.writeFile(encode(after));await output.sync();await output.close();output=undefined;
  // Cooperative callers hold this claim; detect accidental independent file changes too.
  // 规范调用持有声明，同时检测不经过规范入口的意外文件变化。
  if(hash(await readUpgradeControl(file))!==hash(before))throw Error('upgrade_control_changed');
  await rename(temporary,file);committed=true;return after;
 }finally{
  await output?.close();await lock?.close();if(!committed)await unlink(temporary).catch(e=>{if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;});
  let saved;try{saved=JSON.parse(await readFile(lockFile,'utf8'));}catch{throw Error('upgrade_control_claim_changed');}if(saved.id!==claim.id||saved.pid!==claim.pid)throw Error('upgrade_control_claim_changed');await unlink(lockFile);
 }
}
