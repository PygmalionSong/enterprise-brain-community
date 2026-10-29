// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Explicit installed Graph tool factory. Importing it does not enable an HTTP tool.
// 显式安装Graph工具工厂；仅导入本模块不开放HTTP工具。
import {z} from 'zod';import type {GraphTool} from '../runtime/graph-contracts.ts';
import {businessReadPolicySchema,businessReadPolicy,businessReadDelegates,principalReference} from './business-read-contracts.ts';
import {checkBusinessReadInTransaction,type BusinessReadProof} from './business-read-guard.ts';
import {BusinessReadGrants} from './business-read-grants.ts';import {BusinessReadService} from './business-read-service.ts';
const proofSchema=z.object({grantId:z.uuid(),grantVersion:z.number().int().positive(),policyId:z.uuid(),policyVersion:z.number().int().positive(),policySha256:z.string().regex(/^[a-f0-9]{64}$/),policy:businessReadPolicySchema,approver:principalReference}).strict();
const argsSchema=z.object({proof:proofSchema}).strict();
function parse(input:unknown):BusinessReadProof{
 const q=argsSchema.parse(input),f=businessReadPolicy(q.proof.policy);if(q.proof.approver.role!=='business'||q.proof.policySha256!==f.sha256)throw Error('business_read_proof_changed');businessReadDelegates(f.policy,q.proof.approver);return {...q.proof,policy:f.policy};
}
export function businessReadGraphTool(grants:BusinessReadGrants):GraphTool{
 const service=new BusinessReadService(grants);
 return {id:'enterprise.business.read',version:'v1',effect:'read',inputSchema:z.toJSONSchema(argsSchema,{io:'input'}),
  validate:input=>({proof:parse(input)}),authorize:async(actor,input)=>{await grants.withReadGrant(actor,parse(input),async()=>{});},
  readAuthority:{delegates:input=>{const p=parse(input);return businessReadDelegates(p.policy,p.approver);},check:async(tx,actor,input,principals)=>{await checkBusinessReadInTransaction(tx,actor,parse(input),principals);}},
  submit:(actor,input,reference,signal)=>service.submit(actor,parse(input),reference,signal),
  lookup:(actor,input,reference)=>service.lookup(actor,parse(input),reference),
 };
}
