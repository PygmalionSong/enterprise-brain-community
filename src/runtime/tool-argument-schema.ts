// Deliberately bounded JSON Schema subset; unknown keywords never disappear silently.
// 明确有界的JSON Schema子集，未知关键词绝不静默忽略。
import {graphArgsSchema} from './graph-contracts.ts';
type Schema=Record<string,any>;
const record=(value:unknown):value is Schema=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const unsafe=(name:string)=>['__proto__','constructor','prototype'].includes(name);
export function compileToolArguments(input:unknown):(value:unknown)=>Record<string,unknown>{
 const pending:{value:unknown;depth:number}[]=[{value:input,depth:0}];let size=0;while(pending.length){const item=pending.pop()!;if(++size>2048||item.depth>12)throw Error('tool_schema_unsupported');if(item.value!==null&&typeof item.value==='object')for(const child of Object.values(item.value))pending.push({value:child,depth:item.depth+1});}
 if(!record(input)||input.type!=='object'||Buffer.byteLength(JSON.stringify(input))>16384)throw Error('tool_schema_unsupported');const schema=JSON.parse(JSON.stringify(input));let nodes=0;
 const reject=()=>{throw Error('tool_schema_unsupported');},bounded=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
 function validate(s:Schema,value:unknown):boolean{if(s.enum&&!s.enum.some((v:unknown)=>Object.is(v,value)))return false;
  if(s.type==='null')return value===null;if(s.type==='boolean')return typeof value==='boolean';
  if(s.type==='string')return typeof value==='string'&&Array.from(value).length>=(s.minLength??0)&&Array.from(value).length<=s.maxLength;
  if(s.type==='number'||s.type==='integer')return typeof value==='number'&&Number.isFinite(value)&&(s.type!=='integer'||Number.isSafeInteger(value))&&value>=s.minimum&&value<=s.maximum;
  if(s.type==='array')return Array.isArray(value)&&value.length>=(s.minItems??0)&&value.length<=s.maxItems&&value.every(v=>validate(s.items,v));
  return record(value)&&Object.keys(value).every(k=>!unsafe(k)&&Object.hasOwn(s.properties??{},k))&&(s.required??[]).every((k:string)=>Object.hasOwn(value,k))&&Object.entries(value).every(([k,v])=>validate(s.properties[k],v));
 }
 function visit(s:unknown,depth:number){if(!record(s)||++nodes>128||depth>4||!['object','array','string','number','integer','boolean','null'].includes(s.type))return reject();const allowed=new Set(['type','description','title',...(['string','number','integer','boolean','null'].includes(s.type)?['enum']:[]),...(s.type==='object'?['properties','required','additionalProperties']:s.type==='array'?['items','minItems','maxItems']:s.type==='string'?['minLength','maxLength']:['number','integer'].includes(s.type)?['minimum','maximum']:[])]);if(depth===0)allowed.add('$schema');if(Object.keys(s).some(k=>!allowed.has(k)))return reject();if(s.$schema!==undefined&&s.$schema!=='https://json-schema.org/draft/2020-12/schema')return reject();for(const k of ['description','title'])if(s[k]!==undefined&&(typeof s[k]!=='string'||s[k].length>512))return reject();
  if(s.type==='object'){if(s.additionalProperties!==false||s.properties!==undefined&&!record(s.properties)||Object.keys(s.properties??{}).length>32||Object.keys(s.properties??{}).some(k=>unsafe(k)||!k||k.length>100))return reject();const required=s.required??[];if(!Array.isArray(required)||required.length>32||new Set(required).size!==required.length||required.some(k=>typeof k!=='string'||!Object.hasOwn(s.properties??{},k)))return reject();for(const child of Object.values(s.properties??{}))visit(child,depth+1);}
  if(s.type==='array'){if(!bounded(s.maxItems,0,64)||!bounded(s.minItems??0,0,s.maxItems))return reject();visit(s.items,depth+1);}
  if(s.type==='string'&&(!bounded(s.maxLength,0,8192)||!bounded(s.minLength??0,0,s.maxLength)))return reject();
  if(['number','integer'].includes(s.type)&&(!Number.isFinite(s.minimum)||!Number.isFinite(s.maximum)||s.minimum>s.maximum||Math.max(Math.abs(s.minimum),Math.abs(s.maximum))>Number.MAX_SAFE_INTEGER||s.type==='integer'&&(!Number.isSafeInteger(s.minimum)||!Number.isSafeInteger(s.maximum))))return reject();
  if(s.enum!==undefined){if(!Array.isArray(s.enum)||s.enum.length<1||s.enum.length>32||s.enum.some((v:unknown)=>v!==null&&!['string','number','boolean'].includes(typeof v))||new Set(s.enum.map((v:unknown)=>JSON.stringify(v))).size!==s.enum.length||s.enum.some((v:unknown)=>!validate({...s,enum:undefined},v)))return reject();}
 }
 visit(schema,0);return value=>{try{const args=graphArgsSchema.parse(value);if(!validate(schema,args))throw Error('tool_args_invalid');return JSON.parse(JSON.stringify(args));}catch{throw Error('tool_args_invalid');}};
}
