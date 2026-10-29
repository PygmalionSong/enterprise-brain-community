// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Same SQL boundary for embedded development and native PostgreSQL. / 开发与原生PG共用SQL边界。
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
export interface Sql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}
export interface Database extends Sql { transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>; close(): Promise<void>; profile: 'pglite' | 'postgres' }
export async function openDatabase(location: string): Promise<Database> {
  if (location.startsWith('postgres://') || location.startsWith('postgresql://')) {
    const pool = new pg.Pool({ connectionString: location, max: 5 });
    return {
      profile: 'postgres',
      query: async (sql, params) => ({ rows: (await pool.query(sql, params)).rows }),
      exec: sql => pool.query(sql),
      async transaction(fn) {
        const client = await pool.connect();
        try { await client.query('BEGIN'); const out = await fn({ query: async (s,p) => ({ rows: (await client.query(s,p)).rows }), exec: s => client.query(s) }); await client.query('COMMIT'); return out; }
        catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      }, close: () => pool.end()
    };
  }
  const local = await PGlite.create(location === ':memory:' ? undefined : location);
  return { profile:'pglite', query: (s,p) => local.query(s,p), exec: s => local.exec(s), transaction: fn => local.transaction(tx => fn(tx)), close: () => local.close() };
}
export async function withEnterprise<T>(db: Database, enterprise: string, fn: (tx: Sql) => Promise<T>) {
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE eb_app');
    await tx.query("SELECT set_config('app.enterprise_id',$1,true)", [enterprise]);
    return fn(tx);
  });
}
