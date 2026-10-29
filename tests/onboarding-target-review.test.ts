// Security-review counterexamples. No network access is needed for these cases.
// 安全审查反例；这些输入检查不需要网络访问。
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalDiscoveryEndpoint, discoveryAssetId, planDiscoveryTargets} from '../src/onboarding/discovery-contracts.ts';
const enterprise = '11c88506-c330-4b35-b09a-3d66bb1c5019';
for (const input of [
  'http:127.0.0.1', 'http:/127.0.0.1', 'http://2130706433/metadata',
  'http://0x7f000001/metadata', 'http://0177.0.0.1/metadata', 'http://127.1/metadata',
  'http://127.0.0.1./metadata', 'http://owned.invalid/a/../metadata',
  'http://owned.invalid/a/%2e%2e/metadata', 'http://owned.invalid/%00metadata',
  'http://owned.invalid/a%2fmetadata', 'http://owned.invalid/a%5cmetadata',
  'http://owned.invalid/%zz',
]) {
  test('scope rejects ambiguous target / 范围拒绝歧义目标 ' + JSON.stringify(input), () => {
    assert.throws(() => canonicalDiscoveryEndpoint(input), /discovery_endpoint_invalid/);
  });
}
test('UUID spelling cannot create another tenant asset identity / UUID大小写不产生新企业身份', () => {
  assert.equal(discoveryAssetId(enterprise, 'http://owned.invalid/metadata'),
    discoveryAssetId(enterprise.toUpperCase(), 'http://owned.invalid/metadata'));
});
test('planned targets explicitly disclose unsupported transport / 计划明确尚不支持的传输', () => {
  const plan = planDiscoveryTargets(enterprise, ['http://owned.invalid/metadata', 'http://127.0.0.1/metadata']);
  const named = plan.targets.find(x => x.endpoint.includes('owned.invalid')) as unknown as {probeSupported: boolean; probeCode: string};
  const literal = plan.targets.find(x => x.endpoint.includes('127.0.0.1')) as unknown as {probeSupported: boolean};
  assert.equal(named.probeSupported, false); assert.equal(named.probeCode, 'discovery_literal_ipv4_required');
  assert.equal(literal.probeSupported, true);
});
test('authorization plan freezes its policy and resource limits / 授权计划固定策略与资源边界', () => {
  const plan = planDiscoveryTargets(enterprise, ['http://127.0.0.1/metadata']);
  assert.equal((plan as unknown as {policyVersion: string}).policyVersion, 'explicit-private-ipv4-metadata/1');
  assert.equal(Object.isFrozen(plan), true); assert.equal(Object.isFrozen(plan.targets), true);
  assert.equal(Object.isFrozen(plan.targets[0]), true); assert.equal(Object.isFrozen(plan.limits), true);
  assert.throws(() => {(plan.limits as {concurrency: number}).concurrency = 100;});
});
