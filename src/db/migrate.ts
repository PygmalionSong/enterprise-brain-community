// Immutable migration checksums; transaction failure preserves the prior schema. / 迁移哈希固定，失败保留前版。
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Database } from './adapter.ts';
export async function migrate(db: Database, directory: string) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migration (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied: string[] = [];
  for (const id of (await readdir(directory)).filter(x => /^\d+.*\.sql$/.test(x)).sort()) {
    const sql = await readFile(`${directory}/${id}`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    await db.transaction(async tx => {
      if (db.profile === 'postgres') await tx.query('SELECT pg_advisory_xact_lock(71245119)');
      const prior = await tx.query('SELECT checksum FROM schema_migration WHERE id=$1', [id]);
      if (prior.rows.length) { if (prior.rows[0].checksum !== checksum) throw new Error(`migration_checksum_mismatch:${id}`); return; }
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migration(id,checksum) VALUES($1,$2)', [id,checksum]);
      applied.push(id);
    });
  }
  return applied;
}
