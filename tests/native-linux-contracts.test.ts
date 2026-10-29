import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {linuxReadySchema,linuxRuntimeMilliseconds,assertLiveLinuxReady,captureLinuxPrimary} from '../src/platform/linux-systemd.ts';
import {nativeRestoreWorkerRecordSchema} from '../src/enterprise/native-worker-evidence.ts';
const primaryId=randomUUID(),taskId=randomUUID(),unit='enterprise-brain-task-'+randomUUID()+'.service',uid=1000;
const owner={unit:'enterprise-brain-runtime-'+primaryId+'.service',invocationId:'a'.repeat(32),pid:12345,uid,bootId:randomUUID(),controlGroup:'/user.slice/user-1000.slice/user@1000.service/app.slice/enterprise-brain-runtime-'+primaryId+'.service'};
const ready={format:2,platform:'linux-systemd-user-v1',phase:'ready_before_arm',taskId,unit,invocationId:'b'.repeat(32),primary:owner,keeperPid:12346,controlGroup:'/user.slice/user-1000.slice/user@1000.service/app.slice/'+unit,killDevice:'1',killInode:'2'};
test('native Linux identity: parsing a copied journal never grants live execute authority',async()=>{
 const q=linuxReadySchema.parse(ready);await assert.rejects(assertLiveLinuxReady(q),/native_linux_worker_capability_required/);
 for(const change of [{suspendedAssignment:true},{killOnClose:true},{childPid:12347},{unit:'foreign.service'},{invocationId:'invalid'},{phase:'child_suspended'},{keeperPid:owner.pid},{controlGroup:'/foreign/'+unit},{primary:{...owner,uid:1001}}])assert.equal(linuxReadySchema.safeParse({...ready,...change}).success,false);
});
test('native restore evidence: platform versions remain explicit and reject hybrid records',()=>{
 const common={targetId:randomUUID(),backupId:randomUUID(),inputSha256:'c'.repeat(64),readySha256:'d'.repeat(64)};
 const linux={...common,format:2,platform:'linux-systemd-user-v1',identity:ready,state:'worker_ready'};
 const windows={...common,format:1,identity:{format:1,taskId,keeperPid:1,childPid:2,suspendedAssignment:true,killOnClose:true},state:'child_suspended'};
 assert.equal(nativeRestoreWorkerRecordSchema.safeParse(linux).success,true);assert.equal(nativeRestoreWorkerRecordSchema.safeParse(windows).success,true);
 for(const q of [{...linux,format:1},{...windows,format:2},{...linux,state:'child_suspended'},{...linux,identity:windows.identity},{...linux,format:3}])assert.equal(nativeRestoreWorkerRecordSchema.safeParse(q).success,false);
});
test('native Linux runtime budget: manager values are finite, exact and bounded',()=>{
 assert.equal(linuxRuntimeMilliseconds('1min 2s 500ms'),62500);assert.equal(linuxRuntimeMilliseconds('1000us'),1);assert.equal(linuxRuntimeMilliseconds('1min 29.726000s'),89726);assert.equal(linuxRuntimeMilliseconds('0.001000s'),1);
 for(const q of ['infinity','0','0s','1us','301s','1d','NaN','-1s','1ms rubbish','1.000001s','1.0000001s'])assert.throws(()=>linuxRuntimeMilliseconds(q),/native_linux_runtime_invalid/);
});
test('native Linux foreground processes do not acquire a managed capability',{skip:process.platform!=='linux'},async()=>{await assert.rejects(captureLinuxPrimary(),/native_linux_primary_required/);});
