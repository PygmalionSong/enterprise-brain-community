import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {summarizeFailureDiagnostics} from '../scripts/ci-failure-diagnostics.mjs';

const source="test('analysis completion',()=>{});";
const tap=`not ok 1 - analysis completion
  ---
  duration_ms: 1034.5
  failureType: 'testCodeFailure'
  error: 'private credential and customer record must not escape'
  code: 'ERR_ASSERTION'
  expected: 'completed'
  actual: 'unknown'
  stack: 'C:\\private\\customer\\key.txt'
  ...
`;
test('retains known title, state mismatch, code and duration / 保留可定位断言',()=>{
  const r=summarizeFailureDiagnostics(tap,source);assert.deepEqual(r.failures,[{ordinal:1,name:'analysis completion',expected:'completed',actual:'unknown',code:'ERR_ASSERTION',failureType:'testCodeFailure',durationMs:1034.5}]);
});
test('does not emit raw errors, credentials, paths or stacks / 不输出原始私密内容',()=>{
  const raw=JSON.stringify(summarizeFailureDiagnostics(tap,source));for(const value of['private credential','customer record','key.txt','C:\\private'])assert.equal(raw.includes(value),false);
});
test('unknown emitted titles are redacted / 非源码标题隐去',()=>{
  const r=summarizeFailureDiagnostics(tap.replace('analysis completion','secret-row-123'),source);assert.equal(r.failures[0].name,'[unrecognized test title]');assert.equal(JSON.stringify(r).includes('secret-row-123'),false);
});
test('numeric and business-string assertion values are omitted / 不输出业务断言值',()=>{
  const r=summarizeFailureDiagnostics(tap.replace("expected: 'completed'",'expected: 123456789').replace("actual: 'unknown'","actual: 'Customer-Private-Value'"),source);assert.equal('expected' in r.failures[0],false);assert.equal('actual' in r.failures[0],false);
});
test('unknown codes and failure categories are omitted / 未知错误分类隐去',()=>{
  const r=summarizeFailureDiagnostics(tap.replace('ERR_ASSERTION','PRIVATE_CREDENTIAL_VALUE').replace('testCodeFailure','SecretCategory'),source);assert.equal('code' in r.failures[0],false);assert.equal('failureType' in r.failures[0],false);
});
test('ANSI escapes do not corrupt structured output / 终端转义不污染报告',()=>{
  const r=summarizeFailureDiagnostics('\u001b[31m'+tap+'\u001b[0m',source);assert.equal(r.failures[0].actual,'unknown');
});
test('bounds diagnostic rows without hiding overall failure / 限制条数并保留省略计数',()=>{
  const r=summarizeFailureDiagnostics(Array.from({length:15},(_,i)=>tap.replace('not ok 1','not ok '+(i+1))).join(''),source);assert.equal(r.failures.length,12);assert.equal(r.omittedFailures,3);
});
test('empty and malformed output cannot fabricate a diagnosis / 不伪造诊断',()=>{
  assert.deepEqual(summarizeFailureDiagnostics('raw private data',source).failures,[]);assert.deepEqual(summarizeFailureDiagnostics('',source).failures,[]);
});
test('missing diagnostic block never borrows later assertion values / 无诊断块不借用后续值',()=>{
  const raw="not ok 1 - analysis completion\n# Subtest: following test\n  expected: 'completed'\n  actual: 'unknown'\n";
  assert.deepEqual(summarizeFailureDiagnostics(raw,source).failures,[{ordinal:1,name:'analysis completion'}]);
});
test('truncated failure stops at the next failed case / 截断诊断不串到另一失败',()=>{
  const raw="not ok 1 - analysis completion\n  ---\n  code: 'ERR_ASSERTION'\n"+tap.replace('not ok 1','not ok 2');
  const r=summarizeFailureDiagnostics(raw,source);assert.equal(r.failures.length,2);assert.equal('actual' in r.failures[0],false);assert.equal(r.failures[1].actual,'unknown');
});

// Integration is provided with the candidate worker path through the environment.
// 通过候选工作器实际启动一个失败测试；私有原始日志保留但不进入结构化报告。
test('actual owned failing child remains failed with safe structured diagnostics / 真实子进程失败可定位',async()=>{
  const {runOwnedFile}=await import('../scripts/ci-sdk-tests.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eb-ci-diagnostic-'));
  try{
    fs.writeFileSync(path.join(dir,'owned.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';test('analysis completion',()=>{console.error('Owned-Private-Secret-Do-Not-Print');assert.equal('unknown','completed');});");
    const r=await runOwnedFile(dir,'owned.mjs',path.join(dir,'private.log'),5000);assert.equal(r.status,'failed');assert.equal(r.exit,1);assert.equal(r.counts.fail,1);assert.equal(r.failureDiagnostics.failures[0].actual,'unknown');assert.equal(r.failureDiagnostics.failures[0].expected,'completed');assert.equal(JSON.stringify(r).includes('Owned-Private-Secret-Do-Not-Print'),false);assert.equal(fs.readFileSync(path.join(dir,'private.log'),'utf8').includes('Owned-Private-Secret-Do-Not-Print'),true);
  }finally{
    const target=fs.realpathSync(dir),parent=fs.realpathSync(os.tmpdir());assert.ok(target.toLowerCase().startsWith((parent+path.sep+'eb-ci-diagnostic-').toLowerCase()));fs.rmSync(target,{recursive:true,force:true,maxRetries:10,retryDelay:50});
  }
});
