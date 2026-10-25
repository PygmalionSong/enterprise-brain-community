// Immutable local intent/evidence chain. Its hashes never prove external SQL or service effects.
// 不可改写的本机意图/证据链；日志摘要本身不证明外部SQL或服务效果。
import {readFile,lstat,realpath,mkdir,open} from 'node:fs/promises';import {join,isAbsolute,resolve} from 'node:path';
import {hostname} from 'node:os';import {createHash,randomUUID} from 'node:crypto';import {z} from 'zod';
import {processExists} from './operation-guard.ts';
const sha=z.string().regex(/^[a-f0-9]{64}$/),stage=z.enum(['created','backed_up','source_stopped','target_authenticated','database_committed','candidate_ready','committed_parked','active']),pid=z.number().int().positive(),hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const following={created:'backed_up',backed_up:'source_stopped',source_stopped:'target_authenticated',target_authenticated:'database_committed',database_committed:'candidate_ready',candidate_ready:'committed_parked',committed_parked:'active'} as const;
type Stage=z.infer<typeof stage>;
export const nativeUpgradeJournalBindingSchema=z.object({enterpriseId:z.uuid(),sourceDeploymentId:z.uuid(),configurationSha256:sha,planSha256:sha,currentManifestSha256:sha,candidateManifestSha256:sha,publisherFingerprint:sha}).strict().refine(q=>q.currentManifestSha256!==q.candidateManifestSha256);
const header=z.object({format:z.enum(['enterprise-brain.native-upgrade-journal/1','enterprise-brain.native-upgrade-journal/2']),id:z.uuid(),host:z.string().min(1).max(255),createdAt:z.iso.datetime(),binding:nativeUpgradeJournalBindingSchema}).strict();
const event=z.object({format:z.literal(1),sequence:z.number().int().min(1).max(64),previousSha256:sha,operationId:z.uuid(),actorPid:pid,at:z.iso.datetime(),action:z.enum(['begin','checkpoint','complete','fail','reconcile']),fromStage:stage,targetStage:stage,intentSha256:sha,evidenceSha256:sha.nullable(),code:z.string().regex(/^native_upgrade_[a-z_]{1,80}$/).nullable()}).strict();
type Event=z.infer<typeof event>;
type Pending=Readonly<{operationId:string;actorPid:number;fromStage:Stage;targetStage:Stage;intentSha256:string;checkpointSha256:string|null}>;
export type NativeUpgradeJournalView=Readonly<{header:z.infer<typeof header>;headSha256:string;sequence:number;stage:Stage;operationIds:readonly string[];receipts:Readonly<Partial<Record<Stage,string>>>;pending:Pending|null;failed:boolean;databaseMayHaveCommitted:boolean;pointerMayHaveCommitted:boolean;automaticReplayAllowed:false;automaticRollbackAllowed:false;externalEffectsVerified:false}>;
function transition(state:NativeUpgradeJournalView,e:Event):NativeUpgradeJournalView{
 if(state.failed||state.stage==='active'||e.sequence!==state.sequence+1||e.previousSha256!==state.headSha256)throw Error('native_upgrade_journal_history_invalid');
 const next=following[state.stage as keyof typeof following];
 if(e.action==='begin'){
  if(state.pending||state.operationIds.includes(e.operationId)||e.fromStage!==state.stage||e.targetStage!==next||e.evidenceSha256!==null||e.code!==null)throw Error('native_upgrade_journal_transition_invalid');
  return {...state,sequence:e.sequence,operationIds:[...state.operationIds,e.operationId],pending:{operationId:e.operationId,actorPid:e.actorPid,fromStage:e.fromStage,targetStage:e.targetStage,intentSha256:e.intentSha256,checkpointSha256:null},databaseMayHaveCommitted:state.databaseMayHaveCommitted||e.targetStage==='database_committed',pointerMayHaveCommitted:state.pointerMayHaveCommitted||e.targetStage==='committed_parked'};
 }
 const p=state.pending;if(!p||e.operationId!==p.operationId||e.fromStage!==p.fromStage||e.targetStage!==p.targetStage||e.intentSha256!==p.intentSha256||(e.action==='reconcile'?e.actorPid===p.actorPid:e.actorPid!==p.actorPid))throw Error('native_upgrade_journal_operation_mismatch');
 if(['checkpoint','reconcile'].includes(e.action)&&state.header.format!=='enterprise-brain.native-upgrade-journal/2')throw Error('native_upgrade_journal_legacy_policy');
 if(e.action==='checkpoint'){
  if(!['target_authenticated','database_committed','committed_parked'].includes(e.targetStage)||p.checkpointSha256!==null||e.evidenceSha256===null||e.code!==null)throw Error('native_upgrade_journal_checkpoint_invalid');
  return {...state,sequence:e.sequence,pending:{...p,checkpointSha256:e.evidenceSha256}};
 }
 const success=e.action==='complete'||e.action==='reconcile';if(success?(e.evidenceSha256===null||e.code!==null):(e.evidenceSha256!==null||e.code===null))throw Error('native_upgrade_journal_evidence_invalid');
 if(success&&state.header.format==='enterprise-brain.native-upgrade-journal/2'&&['database_committed','committed_parked'].includes(e.targetStage)&&p.checkpointSha256===null)throw Error('native_upgrade_journal_commit_checkpoint_required');
 return {...state,sequence:e.sequence,stage:success?e.targetStage:state.stage,receipts:success?{...state.receipts,[e.targetStage]:e.evidenceSha256!}:state.receipts,pending:null,failed:e.action==='fail'};
}
async function directory(dir:string){if(!isAbsolute(dir)||resolve(dir)!==dir)throw Error('native_upgrade_journal_absolute_path_required');const s=await lstat(dir);if(!s.isDirectory()||s.isSymbolicLink()||(await realpath(dir)).toLowerCase()!==dir.toLowerCase())throw Error('native_upgrade_journal_indirect_path');}
async function read(file:string,max:number){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>max||(await realpath(file)).toLowerCase()!==file.toLowerCase())throw Error('native_upgrade_journal_file_invalid');const b=await readFile(file);if(b.length<1||b.length>max)throw Error('native_upgrade_journal_file_invalid');return b;}
const parse=(b:Buffer)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
async function fresh(file:string,value:unknown){const b=Buffer.from(JSON.stringify(value)),f=await open(file,'wx',0o600);try{await f.writeFile(b);await f.sync();}finally{await f.close();}return hash(b);}
export async function readNativeUpgradeJournal(dir:string):Promise<NativeUpgradeJournalView>{
 await directory(dir);await directory(join(dir,'events'));const hBytes=await read(join(dir,'header.json'),16384),h=header.parse(parse(hBytes));if(JSON.stringify(h)!==hBytes.toString('utf8')||h.host!==hostname().toLowerCase())throw Error('native_upgrade_journal_header_changed');
 let state:NativeUpgradeJournalView={header:h,headSha256:hash(hBytes),sequence:0,stage:'created',operationIds:[],receipts:{},pending:null,failed:false,databaseMayHaveCommitted:false,pointerMayHaveCommitted:false,automaticReplayAllowed:false,automaticRollbackAllowed:false,externalEffectsVerified:false};
 for(let i=0;i<=64;i++){
  let b:Buffer;try{b=await read(join(dir,'events',state.headSha256+'.json'),16384);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return state;throw e;}
  if(i===64)throw Error('native_upgrade_journal_limit');const e=event.parse(parse(b));if(JSON.stringify(e)!==b.toString('utf8'))throw Error('native_upgrade_journal_event_changed');state={...transition(state,e),headSha256:hash(b)};
 }
 throw Error('native_upgrade_journal_limit');
}
export async function createNativeUpgradeJournal(dir:string,binding:unknown){const b=nativeUpgradeJournalBindingSchema.parse(binding);if(!isAbsolute(dir)||resolve(dir)!==dir)throw Error('native_upgrade_journal_absolute_path_required');await directory(join(dir,'..'));await mkdir(dir,{mode:0o700});await directory(dir);await mkdir(join(dir,'events'),{mode:0o700});await fresh(join(dir,'header.json'),header.parse({format:'enterprise-brain.native-upgrade-journal/2',id:randomUUID(),host:hostname().toLowerCase(),createdAt:new Date().toISOString(),binding:b}));return readNativeUpgradeJournal(dir);}
const change=z.discriminatedUnion('action',[
 z.object({action:z.literal('begin'),expectedHeadSha256:sha,operationId:z.uuid(),targetStage:stage,intentSha256:sha}).strict(),
 z.object({action:z.literal('checkpoint'),expectedHeadSha256:sha,operationId:z.uuid(),evidenceSha256:sha}).strict(),
 z.object({action:z.literal('complete'),expectedHeadSha256:sha,operationId:z.uuid(),evidenceSha256:sha}).strict(),
 z.object({action:z.literal('reconcile'),expectedHeadSha256:sha,operationId:z.uuid(),expectedPendingActorPid:pid,evidenceSha256:sha,reconciliationAcknowledged:z.literal(true)}).strict(),
 z.object({action:z.literal('fail'),expectedHeadSha256:sha,operationId:z.uuid(),code:z.string().regex(/^native_upgrade_[a-z_]{1,80}$/)}).strict()
]);
export async function appendNativeUpgradeJournal(dir:string,input:unknown){
 const q=change.parse(input),state=await readNativeUpgradeJournal(dir);if(state.headSha256!==q.expectedHeadSha256)throw Error('native_upgrade_journal_conflict');
 const p=state.pending;if(q.action==='reconcile'){
  if(!p||p.actorPid!==q.expectedPendingActorPid)throw Error('native_upgrade_journal_reconciliation_changed');if(processExists(p.actorPid))throw Error('native_upgrade_journal_controller_alive');
 }else if(q.action!=='begin'&&p?.actorPid!==process.pid)throw Error('native_upgrade_journal_original_controller_required');
 const e=event.parse({format:1,sequence:state.sequence+1,previousSha256:state.headSha256,operationId:q.operationId,actorPid:process.pid,at:new Date().toISOString(),action:q.action,fromStage:state.stage,targetStage:q.action==='begin'?q.targetStage:p?.targetStage,intentSha256:q.action==='begin'?q.intentSha256:p?.intentSha256,evidenceSha256:['checkpoint','complete','reconcile'].includes(q.action)?(q as {evidenceSha256:string}).evidenceSha256:null,code:q.action==='fail'?q.code:null});
 transition(state,e);
 // One predecessor has exactly one immutable successor; concurrent writers cannot both win.
 // 一个前驱仅有一个不可改写后继，规范并发写入不可能同时成功。
 let written:string;try{written=await fresh(join(dir,'events',state.headSha256+'.json'),e);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw Error('native_upgrade_journal_conflict');throw e;}const after=await readNativeUpgradeJournal(dir);if(after.headSha256!==written||after.header.id!==state.header.id)throw Error('native_upgrade_journal_conflict');return after;
}
