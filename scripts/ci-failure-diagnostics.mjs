// Report assertion states from known test titles; never publish raw errors or stacks.
// 仅报告源码内已知测试标题及状态断言；不公开原始错误、堆栈或业务值。
const states = new Set(['reserved', 'completed', 'unknown', 'cancelled', 'invalid', 'refused', 'ready', 'failed', 'succeeded']);
const codes = new Set(['ERR_ASSERTION', 'ERR_TEST_FAILURE', 'ETIMEDOUT', 'ENOENT', 'EACCES', 'EPERM']);
const failureTypes = new Set(['testCodeFailure', 'subtestsFailed', 'cancelledByParent', 'testTimeoutFailure']);

export function summarizeFailureDiagnostics(output, source) {
  const text = String(output).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
  const titles = new Set([...String(source).matchAll(/\btest\(\s*(['"])([^'"\r\n]{1,240})\1/g)].map(m => m[2]));
  const matches = [...text.matchAll(/^\s*not ok\s+(\d+)\s+-\s+([^\r\n]+)$/gm)];
  const failures = [];
  for (const [index, item] of matches.slice(0, 12).entries()) {
    const next = text.indexOf('\n  ...', item.index);
    const nextCase = text.indexOf('\n# Subtest:', item.index);
    const boundaries = [text.length, item.index + 8192, matches[index + 1]?.index, next >= 0 ? next : undefined, nextCase >= 0 ? nextCase : undefined].filter(Number.isFinite);
    const end = Math.min(...boundaries);
    const block = text.slice(item.index, end);
    // Incomplete TAP may identify a failure, but cannot borrow the next test's assertion.
    // 不完整TAP仅保留失败身份，不借用下一个测试的断言值。
    const detail = /^\s*not ok[^\r\n]*\r?\n\s+---\s*\r?\n/.test(block) ? block : '';
    const entry = {ordinal: Number(item[1]), name: titles.has(item[2]) ? item[2] : '[unrecognized test title]'};
    for (const field of ['expected', 'actual']) {
      const value = detail.match(new RegExp('^\\s+' + field + ': [\'\"]?([a-z]+)[\'\"]?\\s*$', 'm'))?.[1];
      if (states.has(value)) entry[field] = value;
    }
    const code = detail.match(/^\s+code: ['"]?([A-Z_]+)['"]?\s*$/m)?.[1];
    if (codes.has(code)) entry.code = code;
    const type = detail.match(/^\s+failureType: ['"]?([a-zA-Z]+)['"]?\s*$/m)?.[1];
    if (failureTypes.has(type)) entry.failureType = type;
    const duration = Number(detail.match(/^\s+duration_ms: ([0-9.]+)\s*$/m)?.[1]);
    if (Number.isFinite(duration) && duration >= 0 && duration < 1e9) entry.durationMs = duration;
    failures.push(entry);
  }
  return {format: 'enterprise-brain.ci-failure-diagnostics/1', failures, omittedFailures: Math.max(0, matches.length - failures.length), rawErrorIncluded: false, stackIncluded: false, sourceValuesIncluded: false};
}
