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

test('version2 retains declared skip counts without private fields / 新版保留真实跳过且不携私有字段',()=>{const name='native Linux foreground processes do not acquire a managed capability',report=minimalReport({manifestSha256:'a'.repeat(64),checks:[{name:'sdk-tests',status:'passed'}],tests:{tests:4,pass:3,fail:0,cancelled:0,skipped:1,todo:0},platformContractSkips:[name],secret:'never'});assert.equal(report.format,'enterprise-brain.installation-report/2');assert.equal(report.tests.skipped,1);assert.deepEqual(report.platformContractSkips,[name]);assert.equal(report.uploaded,false);assert.ok(!JSON.stringify(report).includes('never'));});
test('report refuses arbitrary skip text / 拒绝任意跳过文字进入报告',()=>{assert.throws(()=>minimalReport({manifestSha256:'a'.repeat(64),checks:[],tests:null,platformContractSkips:['private path token']}),/Invalid declared platform skips/);});
