// Direct loopback HTTP only: no proxy environment, shared dispatcher or redirect.
// 仅显式直连本机HTTP：不使用环境代理/全局调度器，不跟随重定向。
import {Agent,request} from 'node:http';
import {Readable} from 'node:stream';
export function localFetch(endpoint,{method='GET',headers={},body,signal,redirect='error'}={}){
 let url;try{url=new URL(endpoint);}catch{return Promise.reject(Error('local_http_target_denied'));}
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.hash||!['GET','POST'].includes(method)||!['error','manual'].includes(redirect)||body!==undefined&&typeof body!=='string')return Promise.reject(Error('local_http_target_denied'));
 return new Promise((resolve,reject)=>{
  const agent=new Agent({keepAlive:false});let req;
  const fail=(incoming,code)=>{incoming?.destroy();agent.destroy();reject(Error(code));};
  try{req=request(url,{method,agent,headers:{...headers,...(body!==undefined?{'Content-Length':String(Buffer.byteLength(body))}:{})},signal},incoming=>{
   const status=incoming.statusCode??0;if(status<200||status>599){fail(incoming,'local_http_response_invalid');return;}
   if(redirect==='error'&&status>=300&&status<400){fail(incoming,'local_http_redirect_denied');return;}
   incoming.once('close',()=>agent.destroy());
   try{const responseHeaders=new Headers();for(const [name,value]of Object.entries(incoming.headers))if(value!==undefined)for(const item of Array.isArray(value)?value:[value])responseHeaders.append(name,item);
    const noBody=[204,205,304].includes(status);const stream=noBody?null:Readable.toWeb(incoming,{strategy:{highWaterMark:65536,size:chunk=>chunk.byteLength}});if(noBody)incoming.resume();
    resolve(new Response(stream,{status,headers:responseHeaders}));
   }catch{fail(incoming,'local_http_response_invalid');}
  });req.once('error',()=>fail(null,'local_http_request_failed'));req.once('upgrade',(_incoming,socket)=>{socket.destroy();fail(null,'local_http_response_invalid');});req.end(body);
  }catch{fail(null,'local_http_request_failed');}
 });
}
export async function readLocalJSON(response,maxBytes=16384){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1048576)throw Error('local_http_limit_invalid');
 if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')||!response.body){await response.body?.cancel().catch(()=>{});throw Error('local_http_json_invalid');}
 const reader=response.body.getReader(),parts=[];let bytes=0;
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>maxBytes)throw Error('local_http_response_limit');parts.push(part.value);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
