// Explicit fixture confirmation, not evidence of a human approval.
// 明确的夹具确认，不作为真实人工批准的证据。
import type {ConnectionService} from '../src/connectors/discovery.ts';
import type {Actor} from '../src/identity/service.ts';
export async function confirmFixture(service:ConnectionService,actor:Actor,id:string,version:number,mapping?:unknown){
 const c=(await service.list(actor)).find(c=>c.id===id);if(!c)throw Error('fixture_connection_missing');
 const allowWrite=c.report?.capabilities?.write===true;
 return service.confirm(actor,id,version,{systemName:'Owned fixture '+id,businessPurpose:'Constructed integration acceptance',businessOwnerRole:'Fixture business owner',mapping:mapping??c.mapping,readAcknowledged:true,processAcknowledged:true,allowWrite,sandboxWriteAcknowledged:allowWrite});
}
