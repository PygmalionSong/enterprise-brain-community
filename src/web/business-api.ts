// Same-origin business client: server identity and reusable idempotency keys.
// 同源业务客户端：服务端身份与可复用幂等键。
export class BusinessError extends Error {status:number;code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
let csrf:string|undefined;
export async function readBusiness(path:string){const r=await fetch(path,{credentials:'same-origin'});if(!r.ok){const q=await r.json().catch(()=>({}));throw new BusinessError(r.status,q.code??'unavailable');}return r.json();}
export async function writeBusiness(path:string,input:unknown,key?:string){if(!csrf)csrf=(await readBusiness('/v1/context')).csrf;const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf!,'Idempotency-Key':key??crypto.randomUUID()},body:JSON.stringify(input)});if(!r.ok){const q=await r.json().catch(()=>({}));if(r.status===403)csrf=undefined;throw new BusinessError(r.status,q.code??'unavailable');}return r.json();}
export function durableRequestKey(operation:string){const key='business-request-'+operation;let current=sessionStorage.getItem(key);if(!current){current=crypto.randomUUID();sessionStorage.setItem(key,current);}return current;}
export function completeRequestKey(operation:string){sessionStorage.removeItem('business-request-'+operation);}
