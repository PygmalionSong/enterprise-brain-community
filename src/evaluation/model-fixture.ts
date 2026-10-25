// Deterministic HTTP fixture ONLY; no inference, provider credentials or cloud calls.
// 仅为确定性HTTP协议替身，无模型推理、供应商凭证或云调用。
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {LocalStructuredModel,type Dialect} from '../runtime/model-transport.ts';
export async function createModelProtocolFixture(dialect:Dialect,fault?:'refusal'|'invented'|'unsafe-work'){
 const contexts:any[]=[],token=randomBytes(24).toString('base64url'),route=dialect==='responses'?'/v1/responses':'/v1/chat/completions';
 const server=createServer(async(req,res)=>{try{
  if(req.method!=='POST'||req.url!==route||req.headers.authorization!=='Bearer '+token){res.writeHead(403);res.end();return;}
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>262144){res.writeHead(413);res.end();return;}}
  const body=JSON.parse(text),context=JSON.parse(dialect==='responses'?body.input[0].content:body.messages[1].content);if(Object.hasOwn(context,'expected'))throw Error('fixture_expected_leak');contexts.push(context);
  const name=dialect==='responses'?body.text.format.name:body.response_format.json_schema.name;let proposal:any;
  if(name==='supply_proposal_v1'){const refs=context.evidenceRefs;proposal={kind:refs.length?'plan':'query',evidence_refs:fault==='invented'&&refs.length?['fake-reference']:refs,assumptions:[],counterevidence:[],next_tools:refs.length?['allocation.evaluate']:['source.resources','source.finance'],expected_outcome:'Verify coverage'};}
  else if(name==='operating_review_v1'){const quality=context.selection.kind==='quality',facts=context.evidence.source.facts,shortage=Number(facts.stockoutMinutes)>0,broken=facts.deviceOnline===false||Number(facts.temperatureC)>12;proposal={assessment:quality?(context.evidence.trace.length===3?'quality_investigation':'trace_missing'):shortage&&broken?'stockout_and_equipment':shortage?'replenishment_priority':broken?'equipment_priority':'trial_review',evidence_refs:context.evidenceRefs,actions:quality?[{owner:'quality',operation:'investigate',quantity:null},{owner:'product',operation:'review_pack',quantity:null}]:[...(shortage?[{owner:'distribution',operation:'replenish',quantity:24}]:[]),...(broken?[{owner:'store_assets',operation:'repair',quantity:null}]:[]),...(!shortage&&!broken?[{owner:'marketing',operation:'trial_review',quantity:null}]:[])],rationale:'Deterministic HTTP fixture, not an inference result.',assumptions:[],counterevidence:[]};if(fault==='unsafe-work')proposal.actions=[{owner:'distribution',operation:'replenish',quantity:999}];}
  else throw Error('fixture_request_invalid');
  const result=dialect==='responses'?{model:body.model,status:'completed',output:[{type:'message',role:'assistant',content:fault==='refusal'?[{type:'refusal',refusal:'Fixture refusal'}]:[{type:'output_text',text:JSON.stringify(proposal)}]}],usage:{input_tokens:100,output_tokens:40,total_tokens:140}}:{model:body.model,choices:[{finish_reason:'stop',message:{role:'assistant',refusal:fault==='refusal'?'Fixture refusal':null,content:JSON.stringify(proposal)}}],usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140}};res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
 }catch{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'fixture_request_invalid'}));}});
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));const endpoint='http://127.0.0.1:'+(server.address() as any).port+route;
 return {mode:'deterministic-http-protocol-fixture' as const,model:new LocalStructuredModel({endpoint,dialect,model:'fixture-'+dialect,token,maxCalls:3,maxOutputTokens:512,totalOutputTokenBudget:1536,timeoutMs:1500}),contexts,async close(){server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}};
}
