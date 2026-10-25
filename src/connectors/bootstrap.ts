// Only the owned demo catalog is initialized; no enterprise scan is authorized.
// 只初始化自有案例目录，不授权扫描企业真实网络。
import type {Database} from '../db/adapter.ts';
import {DEMO_ENTERPRISE,uuid} from '../industry/seed.ts';
import type {Actor} from '../identity/service.ts';
import {ConnectionService} from './discovery.ts';
export const DEMO_IT=uuid('local-demo-it');
export async function initializeLocalConnections(db:Database,service:ConnectionService){
 await db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,'local-demo-it','it') ON CONFLICT(id) DO NOTHING",[DEMO_IT,DEMO_ENTERPRISE]);
 const p=(await db.query('SELECT role,authorization_version,disabled FROM principal WHERE id=$1',[DEMO_IT])).rows[0];if(p.disabled||p.role!=='it')throw Error('local_it_disabled');
 const actor:Actor={id:DEMO_IT,enterpriseId:DEMO_ENTERPRISE,role:'it',authorizationVersion:Number(p.authorization_version)},targets=service.catalog(DEMO_ENTERPRISE).map(({secretRef,...target})=>target);
 for(const target of targets){
  const prior=(await db.query('SELECT c.state,c.confirmation,g.revoked,g.expires_at,g.authorization_version FROM connector_connection c JOIN discovery_grant g ON g.enterprise_id=c.enterprise_id AND g.id=c.grant_id WHERE c.enterprise_id=$1 AND c.id=$2',[DEMO_ENTERPRISE,target.assetId])).rows[0];
  // Restart may rotate an ephemeral owned endpoint, but cannot undo revocation.
  // 重启可以轮换自有临时端口，不可撤销管理员的禁用决定。
  if(prior&&(prior.state!=='active'||prior.revoked||new Date(String(prior.expires_at))<=new Date()||Number(prior.authorization_version)!==actor.authorizationVersion)){await service.assertActive(DEMO_ENTERPRISE,target.assetId,'read').catch(()=>{});continue;}
  // Human confirmations and legacy active connections are never silently renewed.
  // 人工确认或历史无确认连接，重启不得代替操作人重新授权。
  if(prior&&(prior.confirmation as {mode?:string}|null)?.mode!=='constructed_bootstrap'){await service.assertActive(DEMO_ENTERPRISE,target.assetId,'read').catch(()=>{});continue;}
  const {grantId}=await service.grant(actor,{kind:'endpoint',allowlist:[target],expiresAt:new Date(Date.now()+86400000).toISOString(),rateLimit:60});
  const request=await service.request(actor,target.assetId,grantId),diagnosed=await service.diagnose(actor,target.assetId,request.version),allowWrite=diagnosed.report.capabilities.write===true;
  const confirmed=await service.confirm(actor,target.assetId,diagnosed.version,{systemName:target.assetId,businessPurpose:'Owned constructed deployment fixture',businessOwnerRole:'Demo fixture owner',mapping:diagnosed.mapping,readAcknowledged:true,processAcknowledged:true,allowWrite,sandboxWriteAcknowledged:allowWrite},'constructed_bootstrap');await service.test(actor,target.assetId,confirmed.version);
 }
}
