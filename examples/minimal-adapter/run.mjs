// An owned local contract lab; GraphService approval is demonstrated by FIRST_TASK. / 自有本地合同实验；完整批准链见FIRST_TASK。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { GraphToolCatalog } from '../../src/runtime/graph-contracts.ts';
import { validateOutput } from '../../scripts/first-task.mjs';
import { inventoryTool } from './inventory-tool.ts';
import { ownedInventory } from './owned-inventory.mjs';

export async function runAdapterExample(out) {
  validateOutput(out);
  fs.mkdirSync(out, { mode: 0o700 });
  const file = path.join(out, 'owned-inventory.sqlite');
  const actor = { id: randomUUID(), enterpriseId: randomUUID(), role: 'operations', authorizationVersion: 1 };
  const reference = randomUUID();
  let fixture = ownedInventory(file, actor.enterpriseId, actor.id);
  let report = { format: 'enterprise-brain.adapter-example/1', status: 'failed', ownedFixturesOnly: true, uploaded: false };
  try {
    let catalog = new GraphToolCatalog([inventoryTool(fixture.source, fixture.authorize)]);
    let tool = catalog.get('inventory.snapshot.read', 'v1');
    const args = tool.validate({ sku: 'TEA-500-24' });
    const first = await tool.submit(actor, args, reference, new AbortController().signal);
    assert.equal(first.data.onHandCases, 2400);
    fixture.setConstructedCases(1700);
    fixture.close();
    fixture = ownedInventory(file, actor.enterpriseId, actor.id);
    catalog = new GraphToolCatalog([inventoryTool(fixture.source, fixture.authorize)]);
    tool = catalog.get('inventory.snapshot.read', 'v1');
    const original = await tool.lookup(actor, args, reference, new AbortController().signal);
    assert.deepEqual(original, first);
    const current = await tool.submit(actor, args, randomUUID(), new AbortController().signal);
    assert.equal(current.data.onHandCases, 1700);
    await assert.rejects(tool.lookup({ ...actor, enterpriseId: randomUUID() }, args, reference, new AbortController().signal), /authority_denied/);
    await assert.rejects(tool.lookup(actor, { sku: 'OTHER-SKU' }, reference, new AbortController().signal), /reference_conflict/);
    assert.equal(fixture.snapshotCount(), 2);
    report = {
      ...report, status: 'passed',
      checks: { originalCases: 2400, newObservationCases: 1700, sourceReopened: true,
        originalReceiptRetained: true, sourceSnapshots: 2, crossEnterpriseRefused: true, conflictingArgumentsRefused: true },
      fullGraphApprovalExercised: false, realSystemConnected: false, liveModelUsed: false,
    };
    return report;
  } finally {
    fixture.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--out' || args[2] !== '--acknowledge-owned-fixture') {
    console.error('Use --out NEW_ABSOLUTE_PRIVATE_DIRECTORY --acknowledge-owned-fixture / 需新绝对私人目录并确认自有示例');
    process.exitCode = 1;
  } else {
    runAdapterExample(args[1]).then(r => console.log(JSON.stringify(r))).catch(() => {
      console.error('Adapter example failed; keep the private output for review. / 示例失败，保留私人输出以供检查。');
      process.exitCode = 1;
    });
  }
}
