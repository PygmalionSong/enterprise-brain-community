// Explicit local model endpoints only. No automatic cloud routing or retries.
// 仅使用显式本机模型端点，不自动路由到云服务或重试。
import {createHash} from 'node:crypto';
import {localFetch} from '../../scripts/local-http.mjs';
export type Dialect='responses'|'chat-completions';
export type TokenUsage={inputTokens:number;outputTokens:number;totalTokens:number};
export type ModelAccounting={profile:string;inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;costCny:null;durationMs:number;status:string};
export type StructuredRequest={name:string;schema:Record<string,unknown>;instructions:string;context:unknown};
export type StructuredReply={status:'completed'|'refused'|'incomplete';proposal:unknown;accounting:ModelAccounting};
export interface StructuredModel {profile:string;complete(request:StructuredRequest,signal?:AbortSignal):Promise<StructuredReply>;}
export type LocalModelConfig={endpoint:string;dialect:Dialect;model:string;token?:string;maxCalls:number;maxOutputTokens:number;totalOutputTokenBudget:number;timeoutMs:number;maxInputBytes?:number;maxResponseBytes?:number};
export class ModelBoundaryError extends Error {accounting?:ModelAccounting;constructor(code:string,accounting?:ModelAccounting){super(code);this.accounting=accounting;}}
const count=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
function usage(raw:any,dialect:Dialect):TokenUsage|null{const i=raw?.[dialect==='responses'?'input_tokens':'prompt_tokens'],o=raw?.[dialect==='responses'?'output_tokens':'completion_tokens'],t=raw?.total_tokens;return count(i)&&count(o)&&count(t)&&i+o===t?{inputTokens:i,outputTokens:o,totalTokens:t}:null;}
export class LocalStructuredModel implements StructuredModel {
 readonly profile:string;#config:LocalModelConfig;#calls=0;#reservedOutput=0;#blocked=false;
 constructor(config:LocalModelConfig){
  let url:URL;try{url=new URL(config.endpoint);}catch{throw new ModelBoundaryError('model_endpoint_invalid');}
  const expected=config.dialect==='responses'?'/v1/responses':config.dialect==='chat-completions'?'/v1/chat/completions':null;
  if(!expected||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||Number(url.port)<1024||url.username||url.password||url.search||url.hash||url.pathname!==expected)throw new ModelBoundaryError('model_route_not_verified');
  if(!/^[\w.:/-]{1,120}$/.test(config.model)||config.token!==undefined&&(!config.token||config.token.length>8192||/[\x00-\x20\x7f]/.test(config.token)))throw new ModelBoundaryError('model_config_invalid');
  for(const [n,lo,hi]of [[config.maxCalls,1,180],[config.maxOutputTokens,64,8192],[config.totalOutputTokenBudget,64,1474560],[config.timeoutMs,20,60000],[config.maxInputBytes??65536,1024,262144],[config.maxResponseBytes??262144,1024,1048576]])if(!Number.isInteger(n)||n<lo||n>hi)throw new ModelBoundaryError('model_config_invalid');
  if(config.totalOutputTokenBudget<config.maxOutputTokens)throw new ModelBoundaryError('model_config_invalid');
  this.#config={...config};this.profile='local-'+config.dialect+'/'+config.model+'/'+createHash('sha256').update(url.href).digest('hex').slice(0,12);
 }
 budget(){return {calls:this.#calls,reservedOutputTokens:this.#reservedOutput,blocked:this.#blocked,costCny:null};}
 async complete(request:StructuredRequest,signal?:AbortSignal):Promise<StructuredReply>{
  const c=this.#config,begin=performance.now();if(!/^[\w-]{1,64}$/.test(request.name))throw new ModelBoundaryError('model_request_invalid');
  let context:string;try{context=JSON.stringify(request.context);}catch{throw new ModelBoundaryError('model_request_invalid');}
  const format={type:'json_schema',name:request.name,strict:true,schema:request.schema};
  const body=c.dialect==='responses'?{model:c.model,store:false,stream:false,max_output_tokens:c.maxOutputTokens,instructions:request.instructions,input:[{role:'user',content:context}],text:{format}}:{model:c.model,store:false,stream:false,max_completion_tokens:c.maxOutputTokens,messages:[{role:'developer',content:request.instructions},{role:'user',content:context}],response_format:{type:'json_schema',json_schema:{name:request.name,strict:true,schema:request.schema}}};
  const encoded=JSON.stringify(body);if(Buffer.byteLength(encoded)>(c.maxInputBytes??65536))throw new ModelBoundaryError('model_input_limit');
  if(this.#blocked||this.#calls>=c.maxCalls||this.#reservedOutput+c.maxOutputTokens>c.totalOutputTokenBudget)throw new ModelBoundaryError('model_budget_exhausted');
  // Reserve synchronously before any await, including overlapping requests.
  // 在首次等待前同步占用额度，覆盖并发调用；用量未知不释放额度。
  if(signal?.aborted)throw new ModelBoundaryError('model_cancelled');
  this.#calls++;this.#reservedOutput+=c.maxOutputTokens;
  const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(()=>controller.abort(),c.timeoutMs);signal?.addEventListener('abort',cancel,{once:true});let measured:TokenUsage|null=null;
  const accounting=(status:string):ModelAccounting=>({profile:this.profile,inputTokens:measured?.inputTokens??null,outputTokens:measured?.outputTokens??null,totalTokens:measured?.totalTokens??null,costCny:null,durationMs:performance.now()-begin,status});
  try{
   const response=await localFetch(c.endpoint,{method:'POST',body:encoded,headers:{'Content-Type':'application/json',...(c.token?{Authorization:'Bearer '+c.token}:{})},signal:controller.signal,redirect:'error'});
   if(!response.ok){await response.body?.cancel();throw new ModelBoundaryError(response.status===429?'model_rate_limited':[401,403].includes(response.status)?'model_not_authorized':'model_service_unavailable');}
   if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw new ModelBoundaryError('model_response_invalid');}
   const chunks:Uint8Array[]=[],reader=response.body?.getReader();if(!reader)throw new ModelBoundaryError('model_response_invalid');let bytes=0;
   try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>(c.maxResponseBytes??262144))throw new ModelBoundaryError('model_response_limit');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   let raw:any;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ModelBoundaryError('model_response_invalid');}
   measured=usage(raw.usage,c.dialect);if(!measured){this.#blocked=true;throw new ModelBoundaryError('model_usage_unknown');}
   if(measured.outputTokens>c.maxOutputTokens){this.#blocked=true;throw new ModelBoundaryError('model_output_budget_exceeded');}
   this.#reservedOutput-=c.maxOutputTokens-measured.outputTokens;
   if(raw.model!==c.model)throw new ModelBoundaryError('model_identity_mismatch');
   let texts:string[]=[],status:StructuredReply['status']='completed';
   if(c.dialect==='responses'){
    if(!Array.isArray(raw.output))throw new ModelBoundaryError('model_response_invalid');
    const content=raw.output.flatMap((item:any)=>item.type==='message'&&item.role==='assistant'&&Array.isArray(item.content)?item.content:[]);
    if(content.some((p:any)=>p.type==='refusal'))status='refused';else if(raw.status!=='completed')status='incomplete';
    texts=content.filter((p:any)=>p.type==='output_text'&&typeof p.text==='string').map((p:any)=>p.text);
   }else{
    if(!Array.isArray(raw.choices)||raw.choices.length!==1)throw new ModelBoundaryError('model_response_invalid');const choice=raw.choices[0];
    if(choice.message?.refusal)status='refused';else if(choice.finish_reason!=='stop')status='incomplete';
    if(choice.message?.role==='assistant'&&typeof choice.message.content==='string')texts=[choice.message.content];
   }
   if(status!=='completed')return {status,proposal:null,accounting:accounting(status)};
   if(texts.length!==1)throw new ModelBoundaryError('model_response_invalid');let proposal:unknown;try{proposal=JSON.parse(texts[0]);}catch{throw new ModelBoundaryError('model_proposal_invalid');}
   return {status,proposal,accounting:accounting(status)};
  }catch(e){if(!measured)this.#blocked=true;throw new ModelBoundaryError(controller.signal.aborted?(signal?.aborted?'model_cancelled':'model_timeout'):e instanceof ModelBoundaryError?e.message:'model_transport_failed',accounting('error'));}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
}
