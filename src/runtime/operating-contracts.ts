// Domain work commands remain finite and do not grant quality release/payment.
// 领域指令保持有限，不能授予质量放行或付款。
import {z} from 'zod';
export const selectionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('quality'),code:z.enum(['CAP-IN-001','CAP-OUT-001']),at:z.iso.datetime({offset:true})}).strict(),
 z.object({kind:z.literal('store'),store:z.literal('GZ-018'),shelf:z.union([z.literal(8),z.literal(9),z.literal(10)]),period:z.enum(['morning','evening'])}).strict()
]);
export type Selection=z.infer<typeof selectionSchema>;
export const workSchema=z.object({operation:z.enum(['investigate','review_pack','replenish','repair','trial_review']),selection:selectionSchema,evidenceHash:z.string().regex(/^[a-f0-9]{64}$/),quantity:z.number().int().positive().max(1000).optional()}).strict();
export type WorkCommand=z.infer<typeof workSchema>;
export const workReceiptSchema=z.object({reference:z.uuid(),externalRef:z.string(),sourceVersion:z.number().int().positive(),state:z.enum(['accepted','received']),command:workSchema,result:z.object({assignmentVerified:z.boolean(),qualityReleased:z.literal(false),paymentVerified:z.literal(false),causalityVerified:z.literal(false),availabilityAfter:z.number().min(0).max(1).nullable(),followupRequired:z.boolean()}).strict()}).strict();
export type WorkReceipt=z.infer<typeof workReceiptSchema>;
export const evidenceSchema=z.object({version:z.literal(1),selection:selectionSchema,reference:z.string(),facts:z.record(z.string(),z.unknown())}).strict();
