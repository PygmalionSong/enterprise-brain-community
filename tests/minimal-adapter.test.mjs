// Observe contract boundaries, not mirror implementation. / 检查合同边界，而非复写实现。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { GraphToolCatalog } from '../src/runtime/graph-contracts.ts';
import { inventoryTool } from '../examples/minimal-adapter/inventory-tool.ts';
import { ownedInventory } from '../examples/minimal-adapter/owned-inventory.mjs';
import { runAdapterExample } from '../examples/minimal-adapter/run.mjs';

const parent = fs.mkdtempSync(path.resolve('..', 'eb-adapter-'));
const actor = { id: randomUUID(), enterpriseId: randomUUID(), role: 'operations', authorizationVersion: 1 };
const signal = () => new AbortController().signal;

test('actual source reopen keeps original observation while a new action sees the changed stock / 重开保留原观察，新动作见新库存', async () => {
  const report = await runAdapterExample(path.join(parent, 'walkthrough'));
  assert.equal(report.status, 'passed');
  assert.equal(report.checks.sourceSnapshots, 2);
  assert.equal(report.fullGraphApprovalExercised, false);
});

test('authority revoked between submit and lookup refuses original receipt access / 撤权后不能查询原回执', async () => {
  const file = path.join(parent, 'authority.sqlite');
  let f = ownedInventory(file, actor.enterpriseId, actor.id);
  try {
    const tool = inventoryTool(f.source, f.authorize), ref = randomUUID();
    await tool.submit(actor, { sku: 'TEA-500-24' }, ref, signal());
    f.revokeConstructedAuthority();
    await assert.rejects(tool.lookup(actor, { sku: 'TEA-500-24' }, ref, signal()), /authority_denied/);
    f.close();
    f = ownedInventory(file, actor.enterpriseId, actor.id);
    const reopened = inventoryTool(f.source, f.authorize);
    await assert.rejects(reopened.lookup(actor, { sku: 'TEA-500-24' }, ref, signal()), /authority_denied/);
    await assert.rejects(reopened.lookup({ ...actor, authorizationVersion: 2 }, { sku: 'TEA-500-24' }, ref, signal()), /authority_denied/);
    assert.equal(f.snapshotCount(), 1);
  } finally { f.close(); }
});

test('lookup missing receipt does not create a snapshot / 查询不存在的动作不产生新观察', async () => {
  const f = ownedInventory(path.join(parent, 'missing.sqlite'), actor.enterpriseId, actor.id);
  try {
    const r = await inventoryTool(f.source, f.authorize).lookup(actor, { sku: 'TEA-500-24' }, randomUUID(), signal());
    assert.equal(r.state, 'missing'); assert.equal(f.snapshotCount(), 0);
  } finally { f.close(); }
});

test('invalid source facts and cancelled work are not published as business evidence / 非法源数据和已取消工作不发布为事实', async () => {
  let calls = 0;
  const source = { capture: async () => { calls++; return { onHandCases: -1, observedAt: new Date().toISOString(), documentId: 'invalid' }; }, original: async () => null };
  const tool = inventoryTool(source, async () => {});
  await assert.rejects(tool.submit(actor, { sku: 'TEA-500-24' }, randomUUID(), signal()));
  const c = new AbortController(); c.abort();
  await assert.rejects(tool.submit(actor, { sku: 'TEA-500-24' }, randomUUID(), c.signal));
  assert.equal(calls, 1);
});

test('catalog isolates published schema and refuses changed tool version / 目录隔离返回模式并拒绝错版本', () => {
  const c = new GraphToolCatalog([inventoryTool({ capture: async () => null, original: async () => null }, async () => {})]);
  c.describe()[0].inputSchema.properties.sku.type = 'number';
  assert.equal(c.describe()[0].inputSchema.properties.sku.type, 'string');
  assert.throws(() => c.get('inventory.snapshot.read', 'v2'), /version_changed/);
  assert.throws(() => c.get('inventory.snapshot.read', 'v1').validate({ sku: 'TEA-500-24', endpoint: 'http://unused' }));
});

test('CLI needs acknowledgement and never overwrites an existing directory / 命令需确认且不覆盖旧目录', () => {
  const entry = 'examples/minimal-adapter/run.mjs', out = path.join(parent, 'untouched');
  let r = spawnSync(process.execPath, [entry, '--out', out], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 1); assert.equal(fs.existsSync(out), false);
  fs.mkdirSync(out); fs.writeFileSync(path.join(out, 'sentinel'), 'keep');
  r = spawnSync(process.execPath, [entry, '--out', out, '--acknowledge-owned-fixture'], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 1); assert.deepEqual(fs.readdirSync(out), ['sentinel']);
});
