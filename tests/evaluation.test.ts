// Independent scoring and truthful separation of controls from model quality.
// 独立评分及控制正确性与真实模型质量的明确区分。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadSuite,score,controlReport,type Observation} from '../src/evaluation/control-suite.ts';
const base={state:'waiting_external',writes:1,mockModelCalls:0,modelProfile:'finite-rules-no-model',durationMs:1,faultInjection:null,events:[]} satisfies Observation;
test('E6: accepted work cannot satisfy fulfillment or fabricated quality/causality claims',()=>{assert.equal(score({state:'succeeded',writes:1},base).pass,false);assert.equal(score({state:'waiting_external',writes:1},base).pass,true);for(const field of ['qualityReleased','paymentVerified','causalityVerified'])assert.equal(score({state:'waiting_external'},{...base,[field]:true}).pass,false);});
test('E6: negative cases count as control correctness, never as actual model business success',()=>{const r=controlReport([{id:'S1-02',repeat:1,observed:{...base,state:'waiting_input',writes:0},pass:true,mismatches:[]}],'hash');assert.equal(r.controlGatePasses,1);assert.equal(r.actualModelCalls,0);assert.equal(r.modelsCompared,0);assert.equal(r.realModelBusinessSuccess,null);assert.equal(r.realModelCostCny,null);assert.equal(r.fullProductAcceptance,false);});
test('E6: frozen suite rejects modified input bytes before executing a fixture',async()=>{const root=await mkdtemp(join(tmpdir(),'eb-evaluation-')),dir=join(root,'data/evaluation');await mkdir(dir,{recursive:true});for(const file of ['tasks-v1.json','frozen-v1.json'])await writeFile(join(dir,file),await readFile(join(process.cwd(),'data/evaluation',file)));const suite=await loadSuite(root,1);assert.equal(suite.suite.tasks.length,30);await writeFile(join(dir,'tasks-v1.json'),JSON.stringify({...suite.suite,clock:'2026-12-01T00:00:00Z'}));await assert.rejects(loadSuite(root,1),/evaluation_freeze_mismatch/);});
