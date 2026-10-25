// Owned read-only MCP reference server. Run only when explicitly selected by the operator.
// 自有只读MCP参考服务；仅在运维明确选择时启动。
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {referenceProcessBlueprint} from '../src/connectors/process-blueprint.ts';
const blueprint=referenceProcessBlueprint(JSON.parse(await readFile(fileURLToPath(new URL('../data/stages.json',import.meta.url)),'utf8'))),entries=new Map(blueprint.entries.map(e=>[e.uri,e]));let initialized=false;
const input=createInterface({input:process.stdin});input.on('line',line=>{if(Buffer.byteLength(line)>8192){process.exitCode=1;input.close();return;}let q;try{q=JSON.parse(line);}catch{return;}if(!q||q.jsonrpc!=='2.0'||Array.isArray(q))return;if(q.method==='notifications/initialized'){initialized=true;return;}if(typeof q.id!=='string'&&typeof q.id!=='number')return;let result,error;
 if(q.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{resources:{}},serverInfo:{name:'enterprise-brain-reference-processes',version:'0.1.0'}};
 else if(!initialized)error={code:-32000,message:'Initialize first'};
 else if(q.method==='resources/list')result={resources:blueprint.entries.map(e=>({uri:e.uri,name:e.uri.split('/').at(-1),mimeType:'application/vnd.enterprise-brain.process+json'}))};
 else if(q.method==='resources/read'&&entries.has(q.params?.uri)){const e=entries.get(q.params.uri);result={contents:[{uri:e.uri,mimeType:'application/vnd.enterprise-brain.process+json',text:e.text}]};}
 else error={code:-32601,message:'Unsupported request'};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,...(error?{error}:{result})})+'\n');
});input.on('close',()=>process.exit());
