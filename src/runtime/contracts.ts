// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Typed, versioned runtime proposals; arithmetic and permission remain code-owned.
// 类型化版本提案；算术和权限由程序控制。
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {ModelAccounting} from './model-transport.ts';
export const POLICY='controlled-demo-v1';
export const goalSchema=z.object({kind:z.literal('supply'),cashBudgetCny:z.number().int().min(0).max(60_000_000),planVariant:z.enum(['balanced','fast','internal']).optional(),copackAllowed:z.boolean().optional()}).strict();
export type Goal=z.infer<typeof goalSchema>;
export const lineSchema=z.object({sku:z.string().regex(/^HC-[A-Z0-9]+$/),quantity:z.number().int().positive()}).strict();
export const commandSchema=z.object({origin:z.enum(['own','transfer','copack']),lines:z.array(lineSchema).min(1).max(4),expectedVersion:z.number().int().positive()}).strict();
export type Command=z.infer<typeof commandSchema>;
export const sourceSchema=z.object({version:z.literal(1),atomicGuard:z.boolean(),lookupComplete:z.boolean(),idempotencyRetentionSeconds:z.number().int().positive(),resources:z.array(z.object({origin:z.enum(['own','transfer','copack']),sku:z.string(),available:z.number().int().nonnegative(),version:z.number().int().positive(),qualified:z.boolean(),proof:z.object({reference:z.string().min(1),availableBy:z.iso.date(),expiresOn:z.iso.date(),releaseRequired:z.literal(true)}).strict().nullable()}).strict())}).strict();
export type SourceSnapshot=z.infer<typeof sourceSchema>;
export const receiptSchema=z.object({reference:z.string(),externalRef:z.string(),sourceVersion:z.number().int().positive(),state:z.enum(['accepted','received']),lines:z.array(lineSchema),origin:z.enum(['own','transfer','copack'])}).strict();
export type Receipt=z.infer<typeof receiptSchema>;
export const proposalSchema=z.object({kind:z.enum(['query','plan','answer','need_input']),evidence_refs:z.array(z.string()),assumptions:z.array(z.string()),counterevidence:z.array(z.string()),next_tools:z.array(z.enum(['source.resources','source.finance','allocation.evaluate'])),expected_outcome:z.string().max(500)}).strict();
export type Proposal=z.infer<typeof proposalSchema>;
export const DEFINITION={id:'supply-coordinator',version:1,tools:['source.resources','source.finance','allocation.evaluate'],maxSteps:24,maxModelCalls:3,maxModelUnits:6,callReservation:2,leaseMs:15_000,approvalTtlMs:5*60_000,maxAttempts:3,policyVersion:POLICY};
export function canonical(v:unknown):string {if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}';}
export const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
export const terminal=(s:string)=>['succeeded','partially_succeeded','failed','cancelled'].includes(s);
export interface ModelAdapter {profile:string;propose(context:{evidenceRefs:string[];observations?:{warehouse:SourceSnapshot;finance:{version:number;availableCashCny:number};goal:Goal};untrustedText?:string},repair?:string,signal?:AbortSignal):Promise<{proposal:unknown;usage:number|null;accounting?:ModelAccounting}>;}
export class ReplayModel implements ModelAdapter {
 profile='mock-replay-v1';
 async propose(context:{evidenceRefs:string[]}){return {proposal:{kind:context.evidenceRefs.length?'plan':'query',evidence_refs:context.evidenceRefs,assumptions:['Known candidate only; no global optimality claim'],counterevidence:[],next_tools:context.evidenceRefs.length?['allocation.evaluate']:['source.resources','source.finance'],expected_outcome:'Verify supply coverage against cash, qualification and capacity'},usage:1};}
}
