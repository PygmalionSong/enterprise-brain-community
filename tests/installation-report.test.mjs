// Verify honest test outcomes and a bounded public report. / 核对真实测试口径与公开字段边界。
import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTap,minimalReport} from '../scripts/installation-report.mjs';
const valid='# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test('requires a complete unambiguous TAP summary / 要求完整且唯一的摘要',()=>{
 assert.equal(summarizeTap('all passed'),null);assert.equal(summarizeTap(valid+valid),null);
 assert.equal(summarizeTap(valid.replace('# cancelled 0\n','')),null);
 assert.deepEqual(summarizeTap(valid),{tests:3,pass:3,fail:0,cancelled:0,skipped:0,todo:0});
 assert.deepEqual(summarizeTap(valid.replaceAll('# ','ℹ ')),summarizeTap(valid));
});
test('report does not copy logs, secrets or user paths / 不复制日志、秘密或用户路径',()=>{
 const report=minimalReport({manifestSha256:'a'.repeat(64),runId:'sample',checks:[{name:'build',status:'failed',log:'secret path token'}],tests:null,password:'never'});
 assert.ok(!JSON.stringify(report).includes('secret'));assert.ok(!JSON.stringify(report).includes('never'));
 assert.equal(report.uploaded,false);assert.equal(report.cleanHostVerified,false);assert.equal(report.independentUserVerified,false);
 assert.deepEqual(report.checks,[{name:'build',status:'failed'}]);
});
