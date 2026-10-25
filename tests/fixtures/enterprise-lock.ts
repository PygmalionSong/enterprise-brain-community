// Simulate the exact zero-row native RLS result while keeping the real transaction/identity checks.
// 保留真实事务和身份校验，只模拟原生RLS已经复现的父行零行结果。
import type {Database,Sql} from '../../src/db/adapter.ts';
export function hiddenEnterprise(db:Database){
 const trace={parentAttempts:0,roleChanges:0,contextChanges:0};
 const wrapped:Database={profile:db.profile,query:(sql,params)=>db.query(sql,params),exec:sql=>db.exec(sql),close:async()=>{},transaction:fn=>db.transaction(async tx=>{
  const scoped:Sql={async query<T extends Record<string,unknown>>(sql:string,params?:unknown[]){
   if(/^SELECT id FROM enterprise WHERE id=\$1 FOR (UPDATE|SHARE)$/.test(sql)){trace.parentAttempts++;return {rows:[] as T[]};}
   if(/set_config\('app.enterprise_id'/.test(sql))trace.contextChanges++;
   return tx.query<T>(sql,params);
  },exec:sql=>{if(/SET LOCAL ROLE eb_app/.test(sql))trace.roleChanges++;return tx.exec(sql);}};
  return fn(scoped);
 })};
 return {db:wrapped,trace};
}
