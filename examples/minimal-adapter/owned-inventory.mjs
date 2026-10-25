// Constructed local source, never a production connector. / 构造本地源，绝非生产连接器。
import { DatabaseSync } from 'node:sqlite';

export function ownedInventory(file, enterpriseId, principalId) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory(sku TEXT PRIMARY KEY, cases_count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshots(
      enterprise_id TEXT, reference TEXT, sku TEXT, cases_count INTEGER,
      observed_at TEXT, document_id TEXT, PRIMARY KEY(enterprise_id,reference)
    );
    CREATE TABLE IF NOT EXISTS authority(enterprise_id TEXT, principal_id TEXT, version INTEGER, disabled INTEGER, PRIMARY KEY(enterprise_id,principal_id));
    INSERT OR IGNORE INTO inventory VALUES('TEA-500-24',2400);
  `);

  db.prepare('INSERT OR IGNORE INTO authority VALUES(?,?,1,0)').run(enterpriseId, principalId);

  async function authorize(actor) {
    const current = db.prepare('SELECT version,disabled FROM authority WHERE enterprise_id=? AND principal_id=?').get(enterpriseId, principalId);
    if (actor.enterpriseId !== enterpriseId || actor.id !== principalId ||
        actor.role !== 'operations' || !current || current.disabled || actor.authorizationVersion !== current.version) {
      throw Error('fixture_authority_denied');
    }
  }

  function original(actor, sku, reference) {
    const row = db.prepare('SELECT * FROM snapshots WHERE enterprise_id=? AND reference=?')
      .get(actor.enterpriseId, reference);
    if (!row) return null;
    if (row.sku !== sku) throw Error('source_reference_conflict');
    return { onHandCases: row.cases_count, observedAt: row.observed_at, documentId: row.document_id };
  }

  return {
    authorize,
    source: {
      async original(actor, sku, reference) { return original(actor, sku, reference); },
      async capture(actor, sku, reference) {
        const previous = original(actor, sku, reference);
        if (previous) return previous;
        const row = db.prepare('SELECT cases_count FROM inventory WHERE sku=?').get(sku);
        if (!row) throw Error('fixture_sku_missing');
        const time = new Date().toISOString();
        db.prepare('INSERT INTO snapshots VALUES(?,?,?,?,?,?)')
          .run(actor.enterpriseId, reference, sku, row.cases_count, time, 'snapshot-' + reference);
        return original(actor, sku, reference);
      },
    },
    setConstructedCases(value) {
      if (!Number.isInteger(value) || value < 0) throw Error('fixture_quantity_invalid');
      db.prepare("UPDATE inventory SET cases_count=? WHERE sku='TEA-500-24'").run(value);
    },
    revokeConstructedAuthority() {
      db.prepare('UPDATE authority SET disabled=1,version=version+1 WHERE enterprise_id=? AND principal_id=?').run(enterpriseId, principalId);
    },
    snapshotCount: () => db.prepare('SELECT COUNT(*) AS n FROM snapshots').get().n,
    close: () => db.close(),
  };
}
