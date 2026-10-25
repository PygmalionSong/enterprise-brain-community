// Bounded field projection only; source access and model authority are separate checks.
// 仅做有界字段投影；源访问和模型权限必须另行核对。
import {z} from 'zod';
import {graphArgsSchema} from './graph-contracts.ts';
import {hash} from './contracts.ts';

// Independently implemented restricted RFC6901 string form; no URI fragments or wildcards.
// 自行实现RFC6901字符串形式的受限子集，不支持URI片段或通配符。
function tokens(path:string){
 if(!path.startsWith('/')||/[\x00-\x1f\x7f*\uD800-\uDFFF]/u.test(path)||/~(?:[^01]|$)/u.test(path))throw Error('analysis_path_invalid');
 const parts=path.slice(1).split('/').map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~'));
 if(parts.length>16||parts.some(p=>p.length>100||['__proto__','prototype','constructor'].includes(p)))throw Error('analysis_path_invalid');
 if('/'+parts.map(p=>p.replace(/~/g,'~0').replace(/\//g,'~1')).join('/')!==path)throw Error('analysis_path_invalid');
 return parts;
}
export const analysisFieldPathSchema=z.string().min(1).max(512).superRefine((path,ctx)=>{try{tokens(path);}catch{ctx.addIssue({code:'custom',message:'analysis_path_invalid'});}});
const paths=(max:number)=>z.array(analysisFieldPathSchema).min(1).max(max).refine(p=>new Set(p).size===p.length,'analysis_path_duplicate');
export const analysisFieldValueSchema=z.union([z.string().max(8192),z.number().finite(),z.boolean(),z.null()]);
function field(data:Record<string,unknown>,path:string){
 let value:unknown=data;
 for(const token of tokens(path)){
  if(Array.isArray(value)){if(!/^(?:0|[1-9][0-9]*)$/.test(token)||!Number.isSafeInteger(Number(token))||!Object.hasOwn(value,token))throw Error('analysis_field_missing');value=value[Number(token)];}
  else{if(value===null||typeof value!=='object'||!Object.hasOwn(value,token))throw Error('analysis_field_missing');value=(value as Record<string,unknown>)[token];}
 }
 const parsed=analysisFieldValueSchema.safeParse(value);if(!parsed.success)throw Error('analysis_scalar_required');return parsed.data;
}
export function readAnalysisField(input:unknown,path:unknown){const valid=analysisFieldPathSchema.parse(path),data=graphArgsSchema.parse(input);return field(data,valid);}
export function projectAnalysisFields(input:unknown,requested:unknown,approved:unknown,maxBytes=32768){
 const selected=paths(32).parse(requested),allowed=paths(64).parse(approved),limit=z.number().int().min(128).max(65536).parse(maxBytes);
 if(selected.some(path=>!allowed.includes(path)))throw Error('analysis_field_not_approved');
 const data=graphArgsSchema.parse(input),fields=selected.map(path=>{const value=field(data,path);return {path,value,valueHash:hash(value)};}),bytes=Buffer.byteLength(JSON.stringify(fields));
 if(bytes>limit)throw Error('analysis_projection_limit');
 return {fields,fieldsHash:hash(fields),bytes,projectedOnly:true,analysisAuthorized:false,modelCalled:false,executed:false};
}
