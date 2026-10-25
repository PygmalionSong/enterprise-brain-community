// Read-only snapshot guard retained for backup and restore. / 保留备份恢复的只读快照守卫。
import type pg from 'pg';
import {readNativeDatabaseInventoryCore} from './native-database-inventory-core.ts';
export type {NativeDatabaseInventory} from './native-database-inventory-core.ts';
export async function nativeDatabaseInventory(client:pg.Client,maxRows=1000000):Promise<import('./native-database-inventory-core.ts').NativeDatabaseInventory>{
 if(!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>10000000)throw Error('native_inventory_limit_invalid');const flags=(await client.query("SELECT current_setting('transaction_read_only')='on' readonly,current_setting('transaction_isolation')='repeatable read' isolation,EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper)) bypass")).rows[0];if(!flags||flags.readonly!==true||flags.isolation!==true||flags.bypass!==true)throw Error('native_inventory_readonly_snapshot_required');return readNativeDatabaseInventoryCore(client,maxRows);
}
