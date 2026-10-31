// Exercise the actual CLI/HTTP sample and refusal before private-state creation.
// 验证实际CLI/HTTP样例，以及创建私人状态前的拒绝。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {runOnboarding} from '../examples/enterprise-onboarding/run.mjs';

test('onboarding example refuses missing consent, existing output and output inside source',async()=>{
 const dir=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'eb-onboarding-guard-')),out=path.join(dir,'private-run');
 const r=spawnSync(process.execPath,['examples/enterprise-onboarding/run.mjs','--out',out],{encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(r.status,1);assert.equal(fs.existsSync(out),false);
 fs.writeFileSync(path.join(dir,'sentinel'),'retain');await assert.rejects(runOnboarding(dir));
 assert.equal(fs.readFileSync(path.join(dir,'sentinel'),'utf8'),'retain');
 const inside=path.resolve('never-create-owned-onboarding-output');assert.equal(fs.existsSync(inside),false);
 await assert.rejects(runOnboarding(inside));assert.equal(fs.existsSync(inside),false);
});

test('onboarding example initializes separate host, refuses unapproved execution, checks results across restart and stops',async()=>{
 const parent=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'eb-onboarding-live-')),out=path.join(parent,'run');
 const r=await runOnboarding(out);assert.equal(r.status,'passed');assert.equal(r.hostStopped,true);
 assert.equal(r.checks.itApprovalRefused,true);assert.equal(r.checks.missingApprovalRefused,true);
 assert.equal(r.checks.originalActionRetained,true);assert.equal(r.checks.resultKind,'process_metadata');
 const q=spawnSync(process.execPath,['scripts/enterprise.mjs','status','--config',path.join(out,'deployment','config.json')],{encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(q.status,0);assert.equal(JSON.parse(q.stdout).status,'not_running');
 const text=fs.readFileSync(path.join(out,'report.json'),'utf8'),input=JSON.parse(fs.readFileSync(path.join(out,'input.private.json')));
 assert.equal(text.includes(input.password),false);assert.equal(text.includes(parent),false);
});
